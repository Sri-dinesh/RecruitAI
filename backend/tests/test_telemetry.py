import pytest
from app.core.telemetry import trace_span, metrics_registry, REDMetricsRegistry
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_env():
    app.dependency_overrides[get_current_user_id] = lambda: "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    yield
    app.dependency_overrides = {}


def test_trace_span_context_manager():
    """Verify trace_span properly creates, attaches attributes, and finishes span."""
    with trace_span("test_screening_operation", attributes={"batch_size": 5}) as span:
        span.set_attribute("tenant_id", "tenant_xyz")
        span.add_event("chunks_embedded", {"count": 10})
        assert span.status == "OK"
        assert span.attributes["batch_size"] == 5

    assert span.status == "OK"


def test_red_metrics_calculation():
    """Verify RED metrics registry computes rates, percentiles, and error rate."""
    reg = REDMetricsRegistry()
    reg.record_request("/api/chat", status_code=200, latency_ms=100.0)
    reg.record_request("/api/chat", status_code=200, latency_ms=150.0)
    reg.record_request("/api/chat", status_code=500, latency_ms=300.0)
    reg.record_queue_state(depth=4, active_workers=2)
    reg.record_tokens(tokens_in=1000, tokens_out=500, cost_usd=0.000225)

    summary = reg.get_summary()
    assert summary["red_metrics"]["requests_total"] == 3
    assert summary["red_metrics"]["errors_total"] == 1
    assert summary["use_metrics"]["queue_depth"] == 4
    assert summary["use_metrics"]["active_workers"] == 2
    assert summary["token_accounting"]["tokens_in_total"] == 1000
    assert summary["token_accounting"]["cost_usd_total"] == 0.000225

    prom_text = reg.to_prometheus_format()
    assert "recruitai_requests_total" in prom_text
    assert "recruitai_queue_depth 4" in prom_text


def test_metrics_api_endpoint():
    """Verify GET /api/metrics delivers summary and Prometheus formats."""
    res_json = client.get("/api/metrics")
    assert res_json.status_code == 200
    data = res_json.json()
    assert "red_metrics" in data
    assert "use_metrics" in data
    assert "token_accounting" in data
    assert "slo_health" in data

    res_prom = client.get("/api/metrics", headers={"Accept": "text/plain"})
    assert res_prom.status_code == 200
    assert "recruitai_requests_total" in res_prom.text
