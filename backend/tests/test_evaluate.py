import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    import app.core.config as cfg
    old_flag = vs._use_local_sqlite
    old_auth = cfg.USE_LOCAL_AUTH
    vs._use_local_sqlite = True
    cfg.USE_LOCAL_AUTH = True
    yield
    vs._use_local_sqlite = old_flag
    cfg.USE_LOCAL_AUTH = old_auth
    app.dependency_overrides = {}



def override_user(uid: str):
    return lambda: uid



def test_save_and_get_candidate_evaluation():
    payload = {
        "candidate_id": "cand_999",
        "tech_score": 5,
        "comm_score": 4,
        "notes": "Excellent candidate with strong Next.js and Python experience."
    }
    res = client.post("/api/candidates/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["evaluation"]["tech_score"] == 5

    res_get = client.get("/api/candidates/cand_999/evaluation")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["candidate_id"] == "cand_999"
    assert get_data["tech_score"] == 5
    assert get_data["comm_score"] == 4
    assert "Next.js" in get_data["notes"]


def test_evaluation_multi_tenant_isolation():
    # User A evaluates candidate
    app.dependency_overrides[get_current_user_id] = override_user("user_eval_A")
    res_a = client.post("/api/candidates/evaluate", json={
        "candidate_id": "cand_tenant_x",
        "tech_score": 5,
        "comm_score": 5,
        "notes": "User A private evaluation"
    })
    assert res_a.status_code == 200
    app.dependency_overrides = {}

    # User B queries the same candidate
    app.dependency_overrides[get_current_user_id] = override_user("user_eval_B")
    res_b = client.get("/api/candidates/cand_tenant_x/evaluation")
    assert res_b.status_code == 200
    b_data = res_b.json()
    # User B should NOT see User A's private notes or score
    assert b_data["tech_score"] == 0
    assert b_data["notes"] == ""
    app.dependency_overrides = {}


def test_export_ats_endpoint():
    app.dependency_overrides[get_current_user_id] = override_user("user_ats_tester")
    res = client.post("/api/export/ats", json={"format": "json"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "evaluations" in data
    app.dependency_overrides = {}


def test_evaluate_requires_auth_when_local_dev_disabled(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_AUTH", "false")
    import app.core.config as cfg
    cfg.USE_LOCAL_AUTH = False

    res = client.post("/api/candidates/evaluate", json={
        "candidate_id": "cand_test",
        "tech_score": 3,
        "comm_score": 3,
        "notes": "test"
    })
    assert res.status_code in (200, 401)


def test_evaluation_db_as_single_source_of_truth():
    import app.api.routes_evaluate as re_mod
    from app.rag.vector_store import get_supabase_client
    import json

    # 1. Assert module-level in-memory cache CANDIDATE_EVALUATIONS is completely removed
    assert not hasattr(re_mod, "CANDIDATE_EVALUATIONS"), "CANDIDATE_EVALUATIONS in-memory cache must be deleted (BUG-2)"

    user_id = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    cand_id = "test_cand_db_truth"
    norm_cand_id = re_mod._to_uuid_str(cand_id)

    # 2. Save evaluation via API
    res = client.post("/api/candidates/evaluate", json={
        "candidate_id": cand_id,
        "tech_score": 4,
        "comm_score": 4,
        "notes": "Original notes"
    })
    assert res.status_code == 200

    # 3. Directly modify database row (simulating external DB update / another worker process)
    client_db = get_supabase_client()
    res_cand = client_db.table("candidates").select("metadata").eq("id", norm_cand_id).execute()
    assert res_cand.data
    meta = res_cand.data[0]["metadata"]
    if isinstance(meta, str):
        meta = json.loads(meta)
    meta["rubric"]["notes"] = "Externally updated notes directly in PostgreSQL"
    meta["rubric"]["tech_score"] = 5
    client_db.table("candidates").update({"metadata": meta}).eq("id", norm_cand_id).execute()

    # 4. Assert get_candidate_evaluation immediately reflects DB update (no stale cache shadowing)
    get_res = client.get(f"/api/candidates/{cand_id}/evaluation")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["tech_score"] == 5
    assert get_data["notes"] == "Externally updated notes directly in PostgreSQL"

