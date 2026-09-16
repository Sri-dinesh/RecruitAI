import pytest
from fastapi.testclient import TestClient
from app.main import app
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

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert "running" in response.json()["message"]

def test_chat_endpoint_routing():
    # Simulates a chat request.
    # Since API keys are not set in test environment, this should route to
    # the fallback/greeting intent and return the polite clarification message.
    payload = {
        "message": "hello",
        "conversation_history": [],
        "jd_structured": None,
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "response" in data
    assert "conversation_history" in data
    assert len(data["conversation_history"]) == 2
    assert data["conversation_history"][0]["role"] == "user"
    assert data["conversation_history"][1]["role"] == "assistant"
    assert "I can help you with" in data["response"]


def test_interview_persistence_no_fabricated_dates_and_candidate_uuid():
    from unittest.mock import patch
    from app.rag.vector_store import get_supabase_client
    import uuid

    user_id = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    cand_id = str(uuid.uuid4())
    client_db = get_supabase_client()

    # Create candidate
    client_db.table("candidates").insert({
        "id": cand_id,
        "user_id": user_id,
        "full_name": "Bruce Wayne",
        "email": "bruce@wayne.com",
        "raw_resume_text": "Bruce Wayne Executive"
    }).execute()

    chat_payload = {
        "message": "confirm slot for Bruce",
        "conversation_history": [],
        "jd_structured": None,
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": "schedule_interview",
        "scheduled_interviews": []
    }

    mock_result = {
        "conversation_history": [
            {"role": "user", "content": "confirm slot for Bruce"},
            {"role": "assistant", "content": "Interview scheduled."}
        ],
        "jd_structured": None,
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": "schedule_interview",
        "scheduled_interviews": [{
            "candidate_id": cand_id,
            "candidate_name": "Bruce Wayne",
            "slot": None,  # unextracted slot
            "mode": "phone",
            "duration_minutes": 20,
            "booked_at": "2026-09-16T12:00:00Z"
        }]
    }

    with patch("app.api.routes_chat.graph.invoke", return_value=mock_result):
        res = client.post("/api/chat", json=chat_payload)
        assert res.status_code == 200

    # Query interviews table
    int_res = client_db.table("interviews").select("*").eq("candidate_id", cand_id).eq("user_id", user_id).execute()
    assert int_res.data and len(int_res.data) > 0
    row = int_res.data[0]
    # BUG-4 assertions:
    assert row["scheduled_at"] is None, "Must store NULL when slot is unextracted; NEVER fabricate '2026-08-15T10:00:00Z'"
    assert row["mode"] == "phone", "Must propagate mode from interview object instead of hardcoding 'video'"
    assert row["duration_minutes"] == 20, "Must propagate duration_minutes instead of hardcoding 45"
    assert row["candidate_id"] == cand_id, "Must link by candidate_id UUID"

