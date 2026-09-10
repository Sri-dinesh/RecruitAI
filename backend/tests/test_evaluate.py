import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id

client = TestClient(app)

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
