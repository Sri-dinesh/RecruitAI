import time
import json
import re
import threading
import logging
from typing import Optional, Tuple, Any, List, Dict
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
import app.core.config as config
from app.core.logging import log_event

logger = logging.getLogger(__name__)

# 5 actively verified, available Google Gemini models with distinct quotas
ROTATING_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
]

# Backward compatibility alias
MODELS = ROTATING_MODELS

_model_lock = threading.Lock()
_model_index = 0


class AllProvidersFailedError(Exception):
    pass


class CircuitState:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class ModelCircuitBreaker:
    """
    Tracks consecutive model failures and cooldown periods (ENG-4).
    Prevents cascading outages by failing fast on degrading models and
    probing with canary requests during HALF_OPEN state.
    """
    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 60.0):
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._lock = threading.Lock()
        self._states: Dict[str, str] = {m: CircuitState.CLOSED for m in ROTATING_MODELS}
        self._failure_counts: Dict[str, int] = {m: 0 for m in ROTATING_MODELS}
        self._last_failure_times: Dict[str, float] = {m: 0.0 for m in ROTATING_MODELS}
        self._last_success_times: Dict[str, float] = {m: 0.0 for m in ROTATING_MODELS}

    def can_attempt(self, model: str) -> bool:
        with self._lock:
            state = self._states.get(model, CircuitState.CLOSED)
            if state == CircuitState.CLOSED:
                return True
            now = time.time()
            if state == CircuitState.OPEN:
                if now - self._last_failure_times.get(model, 0.0) >= self.cooldown_seconds:
                    self._states[model] = CircuitState.HALF_OPEN
                    logger.info(f"[circuit_breaker] Model {model} cooldown elapsed; entering HALF_OPEN state.")
                    return True
                return False
            if state == CircuitState.HALF_OPEN:
                return True
            return True

    def record_success(self, model: str) -> None:
        with self._lock:
            self._states[model] = CircuitState.CLOSED
            self._failure_counts[model] = 0
            self._last_success_times[model] = time.time()

    def record_failure(self, model: str, is_rate_limit: bool = False) -> None:
        with self._lock:
            now = time.time()
            self._last_failure_times[model] = now
            if is_rate_limit:
                self._failure_counts[model] = self.failure_threshold
                self._states[model] = CircuitState.OPEN
                logger.warning(
                    f"[circuit_breaker] Model {model} hit rate limit. "
                    f"Circuit tripped to OPEN for {self.cooldown_seconds}s cooldown."
                )
            else:
                current_fails = self._failure_counts.get(model, 0) + 1
                self._failure_counts[model] = current_fails
                if current_fails >= self.failure_threshold:
                    self._states[model] = CircuitState.OPEN
                    logger.warning(
                        f"[circuit_breaker] Model {model} reached {self.failure_threshold} consecutive failures. "
                        f"Circuit tripped to OPEN for {self.cooldown_seconds}s cooldown."
                    )

    def get_circuit_state(self, model: str) -> str:
        with self._lock:
            return self._states.get(model, CircuitState.CLOSED)

    def reset(self) -> None:
        with self._lock:
            for m in ROTATING_MODELS:
                self._states[m] = CircuitState.CLOSED
                self._failure_counts[m] = 0
                self._last_failure_times[m] = 0.0
                self._last_success_times[m] = 0.0


# Global circuit breaker instance
circuit_breaker = ModelCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)


def extract_text(content: Any) -> str:
    """
    Safely extracts plain string text from various response content formats returned
    by LangChain / ChatGoogleGenerativeAI (str, list of dicts/blocks, dict, etc.).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text" and "text" in block:
                    parts.append(str(block["text"]))
                elif "text" in block:
                    parts.append(str(block["text"]))
                elif "content" in block:
                    parts.append(str(block["content"]))
            elif isinstance(block, str):
                parts.append(block)
            elif hasattr(block, "text"):
                parts.append(str(block.text))
            elif hasattr(block, "content"):
                parts.append(str(block.content))
        return "".join(parts) if parts else str(content)
    if isinstance(content, dict):
        if "text" in content:
            return str(content["text"])
        if "content" in content:
            return str(content["content"])
    if hasattr(content, "text"):
        return str(content.text)
    if hasattr(content, "content"):
        return str(content.content)
    return str(content)


def get_next_model_order(provider_override: Optional[str] = None) -> List[str]:
    """
    Thread-safe model selection prioritizing healthy circuits (CLOSED/HALF_OPEN).
    Uses round-robin rotation among healthy models to balance quota.
    If all models are in OPEN state, falls back to all models as a last resort (ENG-4).
    """
    global _model_index
    num_models = len(ROTATING_MODELS)

    if provider_override and provider_override in ROTATING_MODELS:
        base_order = [provider_override] + [m for m in ROTATING_MODELS if m != provider_override]
    else:
        with _model_lock:
            start_idx = _model_index
            _model_index = (_model_index + 1) % num_models
        base_order = [ROTATING_MODELS[(start_idx + i) % num_models] for i in range(num_models)]

    healthy = [m for m in base_order if circuit_breaker.can_attempt(m)]
    tripped = [m for m in base_order if m not in healthy]

    return healthy + tripped if healthy else tripped


def call_llm(
    prompt: str, 
    system_instruction: Optional[str] = None, 
    provider_override: Optional[str] = None, 
    json_mode: bool = False
) -> Tuple[str, str, float]:
    """
    Calls Google Gemini using circuit-breaker-aware rotation across 5 verified models.
    Enforces upstream JSON schema mode when json_mode=True.
    Performs token and cost accounting telemetry on every invocation (ENG-4).

    Returns (response_text, provider_used, latency_ms).
    Raises AllProvidersFailedError if all models in the pool fail.
    """
    if config.LLM_KILL_SWITCH:
        raise AllProvidersFailedError(
            "LLM kill-switch is active: AI model calls disabled. Gracefully degrading to rule-based evaluation."
        )

    if not config.GEMINI_API_KEY or "your_gemini" in config.GEMINI_API_KEY:
        raise ValueError("No valid GEMINI_API_KEY is configured in backend/.env.")

    order = get_next_model_order(provider_override)
    errors = []

    for model_name in order:
        start_time = time.time()
        try:
            # Build messages in LangChain format
            messages = []
            if system_instruction:
                messages.append(SystemMessage(content=system_instruction))
            messages.append(HumanMessage(content=prompt))

            model = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=config.GEMINI_API_KEY,
                temperature=0.0,
                response_mime_type="application/json" if json_mode else None,
                timeout=30.0
            )
            response = model.invoke(messages)
            latency_ms = (time.time() - start_time) * 1000

            response_text = extract_text(response.content)

            # Record healthy call in circuit breaker
            circuit_breaker.record_success(model_name)

            # Token and Cost Accounting (ENG-4)
            usage = getattr(response, "usage_metadata", None) or getattr(response, "response_metadata", {}).get("token_usage") or {}
            tokens_in = usage.get("input_tokens") or usage.get("prompt_token_count") or max(1, len(prompt) // 4)
            tokens_out = usage.get("output_tokens") or usage.get("candidates_token_count") or max(1, len(response_text) // 4)
            # Gemini Flash standard rate: $0.075 / 1M in, $0.30 / 1M out
            cost_usd = round((tokens_in * 0.000000075) + (tokens_out * 0.00000030), 6)

            log_event(
                "llm_call_completed",
                extra={
                    "model": model_name,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "cost_usd": cost_usd,
                    "latency_ms": round(latency_ms, 2),
                    "circuit_state": circuit_breaker.get_circuit_state(model_name),
                    "status": "success",
                }
            )

            logger.info(
                f"[llm_router] Handled by {model_name} in {latency_ms:.1f}ms "
                f"(in={tokens_in}, out={tokens_out}, cost=${cost_usd:.6f})"
            )
            return response_text, "gemini", latency_ms

        except Exception as e:
            err_msg = str(e)
            is_rate_limit = (
                "429" in err_msg
                or "resource_exhausted" in err_msg.lower()
                or "rate_limit" in err_msg.lower()
            )
            circuit_breaker.record_failure(model_name, is_rate_limit=is_rate_limit)
            errors.append(f"{model_name}: {err_msg}")

            if is_rate_limit:
                logger.warning(f"[gemini] Rate limit hit on {model_name}. Tripping circuit and failing over...")
            else:
                logger.warning(f"[{model_name}] call failed: {err_msg}. Failing over to next model...")

            continue

    raise AllProvidersFailedError(f"All Gemini models in pool failed. Details: {'; '.join(errors)}")


def parse_json_safely(text: str) -> Any:
    """
    Safely cleans markdown wrappers and strictly parses JSON from LLM response text (ENG-4).
    Enforces upstream JSON schema mode and deletes ast.literal_eval fallback for code execution safety.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
        if m:
            cleaned = m.group(1).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Heuristic sanitation: strip trailing commas before closing braces/brackets
        sanitized = re.sub(r",\s*([\]}])", r"\1", cleaned)
        try:
            return json.loads(sanitized)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Failed to parse text as valid JSON (ast.literal_eval disabled for security): {exc}"
            ) from exc
