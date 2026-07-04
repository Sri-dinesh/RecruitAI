from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

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
    assert "I can do for you" in data["response"]
