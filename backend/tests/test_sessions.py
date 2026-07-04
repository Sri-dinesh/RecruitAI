import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.rag.vector_store import get_supabase_client

client = TestClient(app)

def test_session_lifecycle():
    # 1. Create a new session
    create_res = client.post("/api/sessions")
    assert create_res.status_code == 200
    session = create_res.json()
    assert "id" in session
    assert session["title"] == "New Chat"
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
    assert session_details["title"] == "New Chat"

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
    
    # 7. Assert deleted session is 404
    get_res_3 = client.get(f"/api/sessions/{session_id}")
    assert get_res_3.status_code == 404
