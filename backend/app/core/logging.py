"""
backend/app/core/logging.py
---------------------------
Tenant-isolated, structured telemetry and event logging (AI-SEC-5).
Eliminates cross-tenant trace leaks by scoping telemetry with contextvars,
prohibiting raw prompt/PII writes, and masking exception details.
"""

import time
import uuid
import logging
from contextvars import ContextVar
from typing import Optional, Dict, Any, List

logger = logging.getLogger("recruitai.telemetry")

# Scoped context variables for strict multi-tenant isolation
_request_id_ctx: ContextVar[str] = ContextVar("request_id_ctx", default="")
_session_id_ctx: ContextVar[str] = ContextVar("session_id_ctx", default="")
_user_id_ctx: ContextVar[str] = ContextVar("user_id_ctx", default="")
_turn_counter_ctx: ContextVar[int] = ContextVar("turn_counter_ctx", default=0)
_turn_logs_ctx: ContextVar[List[Dict[str, Any]]] = ContextVar("turn_logs_ctx", default=[])

# Strict key whitelist to prohibit raw prompts, resume texts, and model outputs in telemetry
ALLOWED_EXTRA_KEYS = {
    "model",
    "status",
    "error_type",
    "error_code",
    "step",
    "routing_reason",
    "token_count",
    "tokens_in",
    "tokens_out",
    "cost_usd",
    "latency_ms",
    "circuit_state",
}

FORBIDDEN_KEY_SUBSTRINGS = ("prompt", "resume", "completion", "text", "message", "candidate_name", "email", "phone")


def set_telemetry_context(user_id: str, session_id: str, request_id: Optional[str] = None) -> None:
    """Sets tenant and session boundary for the active request lifecycle."""
    _user_id_ctx.set(user_id)
    _session_id_ctx.set(session_id)
    _request_id_ctx.set(request_id or str(uuid.uuid4()))
    _turn_logs_ctx.set([])


def clear_telemetry_context() -> None:
    """Clears tenant context after request execution."""
    _user_id_ctx.set("")
    _session_id_ctx.set("")
    _request_id_ctx.set("")
    _turn_logs_ctx.set([])


def increment_turn() -> int:
    current = _turn_counter_ctx.get() + 1
    _turn_counter_ctx.set(current)
    return current


def get_current_turn() -> int:
    return _turn_counter_ctx.get()


def mask_exception(exc: Exception) -> Dict[str, Any]:
    """
    AI-SEC-5: Masks exception strings to prevent echoing prompt fragments,
    returning only error type and HTTP/provider status code if available.
    """
    error_type = type(exc).__name__
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    return {
        "error_type": error_type,
        "error_code": status_code or 500,
    }


def log_event(
    intent: str,
    confidence: float = 1.0,
    provider: str = "gemini",
    latency_ms: float = 0.0,
    node: str = "system",
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Logs an isolated, structured telemetry event for the current tenant's active turn.
    Guarantees zero raw prompt, resume text, or cross-tenant leaks.
    """
    user_id = _user_id_ctx.get()
    session_id = _session_id_ctx.get()
    request_id = _request_id_ctx.get()
    turn = _turn_counter_ctx.get()

    event: Dict[str, Any] = {
        "request_id": request_id,
        "session_id": session_id,
        "user_id": user_id,
        "turn": turn,
        "intent": intent,
        "confidence": round(float(confidence), 3),
        "provider": provider,
        "latency_ms": int(latency_ms),
        "node": node,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Strict whitelist filtering on extra attributes
    if extra and isinstance(extra, dict):
        sanitized_extra = {}
        for k, v in extra.items():
            k_lower = k.lower()
            if k in ALLOWED_EXTRA_KEYS and not any(sub in k_lower for sub in FORBIDDEN_KEY_SUBSTRINGS):
                sanitized_extra[k] = v
        event.update(sanitized_extra)

    # Append to current turn's isolated logs list
    current_logs = _turn_logs_ctx.get()
    current_logs.append(event)
    _turn_logs_ctx.set(current_logs)

    logger.debug(f"[telemetry] user={user_id} session={session_id} node={node} intent={intent} latency={latency_ms:.1f}ms")
    return event


def get_all_logs() -> List[Dict[str, Any]]:
    """
    Returns telemetry logs scoped strictly to the current request turn.
    Never reads global file traces or leaks other tenants' activity.
    """
    return list(_turn_logs_ctx.get())
