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
    app.dependency_overrides[get_current_user_id] = lambda: "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    yield
    vs._use_local_sqlite = old_flag
    cfg.USE_LOCAL_AUTH = old_auth
    app.dependency_overrides = {}


def test_public_liveness_probe():
    """
    ENG-5: Verify /health and /api/health serve as shallow public liveness probes
    without leaking internal infrastructure topology or database error strings.
    """
    for endpoint in ("/health", "/api/health"):
        res = client.get(endpoint)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "uptime_seconds" in data
        assert "timestamp" in data
        assert data["version"] == "2.0.0"
        # Shallow probe must NOT leak services or db topology to anonymous callers
        assert "services" not in data


def test_authenticated_deep_readiness_probe():
    """
    ENG-5: Verify /api/health/ready provides deep diagnostics to authenticated callers,
    verifying database connectivity, LLM status, and auth mode with redacted error types.
    """
    res = client.get("/api/health/ready")
    assert res.status_code in (200, 503)
    data = res.json()
    assert "status" in data
    assert "services" in data
    services = data["services"]
    assert "database" in services
    assert "llm" in services
    assert "auth" in services
    assert services["database"]["status"] in ("healthy", "unhealthy")
    assert services["llm"]["status"] in ("configured", "unconfigured", "error")


def test_unauthenticated_readiness_probe_requires_auth(monkeypatch):
    """
    ENG-5: Verify deep readiness probe is protected and cannot be accessed anonymously.
    """
    app.dependency_overrides = {}
    import app.core.config as cfg
    old_auth = cfg.USE_LOCAL_AUTH
    try:
        cfg.USE_LOCAL_AUTH = False
        res = client.get("/api/health/ready")
        assert res.status_code in (401, 403)
    finally:
        cfg.USE_LOCAL_AUTH = old_auth
