import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.rag.vector_store import get_supabase_client

from app.core.auth import get_current_user_id

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    app.dependency_overrides[get_current_user_id] = lambda: "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    yield
    vs._use_local_sqlite = old_flag
    app.dependency_overrides = {}

def test_session_lifecycle():
    # 1. Create a new session
    create_res = client.post("/api/sessions")
    assert create_res.status_code == 200
    session = create_res.json()
    assert "id" in session
    assert session["title"] == "New Hiring Campaign"
    session_id = session["id"]

    # 2. List sessions and verify it's present
    list_res = client.get("/api/sessions")
    assert list_res.status_code == 200
    sessions_list = list_res.json()
    assert any(s["id"] == session_id for s in sessions_list)

    # 3. Retrieve session details
    get_res = client.get(f"/api/sessions/{session_id}")
    assert get_res.status_code == 200
    session_details = get_res.json()
    assert session_details["id"] == session_id
    assert session_details["title"] == "New Hiring Campaign"

    # 4. Trigger chat and assert it updates/saves context to the database
    chat_payload = {
        "message": "hello agent, load JD for a Senior Python Developer with 5 years experience in FastAPI and Groq.",
        "conversation_history": [],
        "jd_structured": None,
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None,
        "scheduled_interviews": [],
        "session_id": session_id
    }
    from unittest.mock import patch
    with patch("app.api.routes_chat.graph.invoke") as mock_graph:
        mock_graph.return_value = {
            "conversation_history": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "Hello! I can help you with hiring."}
            ],
            "jd_structured": None,
            "resumes": [],
            "last_shortlist": None,
            "pending_confirmation": None,
            "last_intent": "greeting",
            "scheduled_interviews": []
        }
        chat_res = client.post("/api/chat", json=chat_payload)
        assert chat_res.status_code == 200
        chat_data = chat_res.json()
        assert chat_data["session_id"] == session_id
    
    # 5. Fetch details again to assert state persistence and auto-rename (if applicable)
    get_res_2 = client.get(f"/api/sessions/{session_id}")
    assert get_res_2.status_code == 200
    updated_details = get_res_2.json()
    assert len(updated_details["conversation_history"]) > 0
    
    # 5b. Patch session directly
    patch_res = client.patch(f"/api/sessions/{session_id}", json={"title": "Patched Campaign Name"})
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Patched Campaign Name"
    
    # 6. Delete session
    delete_res = client.delete(f"/api/sessions/{session_id}")
    assert delete_res.status_code == 200

    # 7. Assert 404 after deletion
    get_res_3 = client.get(f"/api/sessions/{session_id}")
    assert get_res_3.status_code == 404


def test_campaign_isolation_and_reset():
    user_id = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    from app.services.ingestion_service import ingest_candidate_object
    from app.schemas.candidate_schema import Candidate

    # 1. Create two separate campaigns
    res_a = client.post("/api/sessions")
    assert res_a.status_code == 200
    session_a = res_a.json()["id"]

    res_b = client.post("/api/sessions")
    assert res_b.status_code == 200
    session_b = res_b.json()["id"]

    # 2. Ingest Alice into Campaign A
    cand_alice = Candidate(
        name="Alice Python",
        email="alice@tech.com",
        skills=["Python", "FastAPI"],
        raw_text="Alice Python Developer with 5 years in FastAPI"
    )
    ingest_candidate_object(cand_alice, user_id=user_id, session_id=session_a)

    # 3. Ingest Bob into Campaign B
    cand_bob = Candidate(
        name="Bob Rust",
        email="bob@systems.com",
        skills=["Rust", "Wasm"],
        raw_text="Bob Rust Developer with 6 years in systems"
    )
    ingest_candidate_object(cand_bob, user_id=user_id, session_id=session_b)

    # 4. Verify Campaign A contains ONLY Alice
    details_a = client.get(f"/api/sessions/{session_a}").json()
    cands_a = details_a.get("resumes", [])
    names_a = [c["name"] for c in cands_a]
    assert "Alice Python" in names_a
    assert "Bob Rust" not in names_a

    # 5. Verify Campaign B contains ONLY Bob
    details_b = client.get(f"/api/sessions/{session_b}").json()
    cands_b = details_b.get("resumes", [])
    names_b = [c["name"] for c in cands_b]
    assert "Bob Rust" in names_b
    assert "Alice Python" not in names_b

    # 6. Verify /api/sessions returns accurate isolated counts
    sessions = client.get("/api/sessions").json()
    s_a = next(s for s in sessions if s["id"] == session_a)
    s_b = next(s for s in sessions if s["id"] == session_b)
    assert s_a["candidate_count"] == 1
    assert s_b["candidate_count"] == 1

    # 7. Test reset-all data
    from app.api.routes_chat import _LAST_RESET_REQUESTS
    _LAST_RESET_REQUESTS.clear()

    reset_res = client.post("/api/sessions/reset-all")
    assert reset_res.status_code == 200
    assert reset_res.json()["success"] is True

    # 8. Verify rate limit blocks immediate consecutive reset (SEC-3)
    rate_limited_res = client.post("/api/sessions/reset-all")
    assert rate_limited_res.status_code == 429
    assert "Reset rate limit exceeded" in rate_limited_res.json()["detail"]
    assert "Retry-After" in rate_limited_res.headers

    # 9. Verify all campaigns are cleared
    remaining_sessions = client.get("/api/sessions").json()
    assert len(remaining_sessions) == 0


def test_session_candidates_relational_join_and_backfill():
    from app.services.ingestion_service import upsert_candidate_record
    from app.schemas.candidate_schema import Candidate
    from app.rag.vector_store import get_supabase_client
    import uuid

    user_id = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    client_db = get_supabase_client()

    # 1. Create a session
    s_res = client.post("/api/sessions")
    assert s_res.status_code == 200
    session_id = s_res.json()["id"]

    # 2. Ingest candidate directly associated with session_id
    cand = Candidate(
        name="Diana Prince",
        email="diana@amazon.com",
        skills=["Leadership", "Strategy"],
        raw_text="Diana Prince Leader"
    )
    cand_id = upsert_candidate_record(cand, user_id=user_id, session_id=session_id)

    # 3. Assert session_candidates table was populated relationally
    sc_check = client_db.table("session_candidates").select("session_id, candidate_id").eq("session_id", session_id).execute()
    assert any(row["candidate_id"] == cand_id for row in (sc_check.data or []))

    # 4. Simulate a legacy candidate with session_id ONLY in JSON metadata (testing expand/contract backfill)
    legacy_cand_id = str(uuid.uuid4())
    client_db.table("candidates").insert({
        "id": legacy_cand_id,
        "user_id": user_id,
        "full_name": "Legacy Candidate",
        "email": "legacy@recruitai.local",
        "raw_resume_text": "Legacy resume",
        "metadata": {"session_id": session_id, "session_ids": [session_id], "skills": ["Legacy"]}
    }).execute()

    # Verify legacy candidate is not yet in session_candidates
    sc_before = client_db.table("session_candidates").select("candidate_id").eq("session_id", session_id).eq("candidate_id", legacy_cand_id).execute()
    assert len(sc_before.data or []) == 0

    # 5. Call GET /api/sessions - this should count both and opportunistically backfill legacy candidate
    list_res = client.get("/api/sessions")
    assert list_res.status_code == 200
    sess_obj = next(s for s in list_res.json() if s["id"] == session_id)
    assert sess_obj["candidate_count"] == 2

    # 6. Verify backfill occurred into session_candidates table
    sc_after = client_db.table("session_candidates").select("candidate_id").eq("session_id", session_id).eq("candidate_id", legacy_cand_id).execute()
    assert len(sc_after.data or []) == 1

    # 7. Delete session and verify session_candidates entries are cleaned up
    del_res = client.delete(f"/api/sessions/{session_id}")
    assert del_res.status_code == 200
    sc_deleted = client_db.table("session_candidates").select("candidate_id").eq("session_id", session_id).execute()
    assert len(sc_deleted.data or []) == 0


