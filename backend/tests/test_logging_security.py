"""
backend/tests/test_logging_security.py
--------------------------------------
Unit tests for AI-SEC-5: Tenant-isolated telemetry and log leak prevention.
"""

from app.core.logging import (
    set_telemetry_context,
    clear_telemetry_context,
    log_event,
    get_all_logs,
    mask_exception,
)


def test_tenant_isolated_logging():
    # 1. Tenant A turn
    set_telemetry_context(user_id="user_tenant_A", session_id="session_A_123")
    log_event(
        intent="screen",
        confidence=0.95,
        provider="gemini",
        latency_ms=120.0,
        node="screen_node",
        extra={
            "model": "gemini-2.5-flash-lite",
            "raw_prompt": "SECRET PROMPT TEXT",  # Forbidden: must be stripped!
            "candidate_name": "Bruce Wayne",     # Forbidden: must be stripped!
            "step": "retrieval",                 # Allowed
        }
    )

    logs_a = get_all_logs()
    assert len(logs_a) == 1
    event_a = logs_a[0]
    assert event_a["user_id"] == "user_tenant_A"
    assert event_a["session_id"] == "session_A_123"
    assert event_a["model"] == "gemini-2.5-flash-lite"
    assert event_a["step"] == "retrieval"
    # Strict privacy assertions: forbidden keys stripped
    assert "raw_prompt" not in event_a
    assert "candidate_name" not in event_a

    clear_telemetry_context()
    assert len(get_all_logs()) == 0

    # 2. Tenant B turn: verify zero bleed from Tenant A
    set_telemetry_context(user_id="user_tenant_B", session_id="session_B_456")
    logs_b = get_all_logs()
    assert len(logs_b) == 0  # Zero leak!
    clear_telemetry_context()


def test_mask_exception():
    class CustomAPIError(Exception):
        status_code = 429

    exc = CustomAPIError("Detailed provider error with sensitive prompt text: [SECRET]")
    masked = mask_exception(exc)

    assert masked["error_type"] == "CustomAPIError"
    assert masked["error_code"] == 429
    # Ensure sensitive error string is omitted
    assert "SECRET" not in str(masked)
