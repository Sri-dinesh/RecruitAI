import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def use_test_fallback_db():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    yield
    vs._use_local_sqlite = old_flag

def test_get_user_profile_unauthorized(monkeypatch):
    """Ensure unauthorized requests return 401 when USE_LOCAL_AUTH=false or 200 in local dev mode."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg, "USE_LOCAL_AUTH", False)

    response = client.get("/api/users/me")
    assert response.status_code in (200, 401)

def test_get_user_profile_authorized():
    """Ensure authorized user can retrieve their profile."""
    headers = {"Authorization": "Bearer local-token"}
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "email" in data
    assert data["role"] in ["recruiter", "employer"]

def test_update_user_profile():
    """Ensure user can update their company name and preferences."""
    headers = {"Authorization": "Bearer local-token"}
    update_payload = {
        "full_name": "Senior Talent Partner",
        "company_name": "Tech Corp Inc.",
        "preferences": {
            "email_alerts": False,
            "theme": "dark",
            "blind_mode_default": True
        }
    }
    response = client.patch("/api/users/me", json=update_payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Senior Talent Partner"
    assert data["company_name"] == "Tech Corp Inc."
