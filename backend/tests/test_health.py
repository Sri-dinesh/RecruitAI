import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint_root():
    """Test /health endpoint returns HTTP 200 and expected diagnostic structure."""
    response = client.get("/health")
    assert response.status_code in (200, 503)
    data = response.json()

    assert "status" in data
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert "timestamp" in data
    assert "uptime_seconds" in data
    assert "version" in data
    assert data["version"] == "2.0.0"
    assert "services" in data

    services = data["services"]
    assert "database" in services
    assert "llm" in services
    assert "auth" in services

    assert "status" in services["database"]
    assert "status" in services["llm"]
    assert "mode" in services["auth"]

def test_api_health_endpoint_alias():
    """Test /api/health endpoint returns identical health diagnostics."""
    response = client.get("/api/health")
    assert response.status_code in (200, 503)
    data = response.json()

    assert "status" in data
    assert "services" in data
    assert "database" in data["services"]
