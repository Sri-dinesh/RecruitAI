import pytest
import time
from unittest.mock import patch, MagicMock
from app.core.llm_router import (
    ModelCircuitBreaker,
    CircuitState,
    parse_json_safely,
    call_llm,
    AllProvidersFailedError,
    ROTATING_MODELS,
)


def test_circuit_breaker_transitions():
    cb = ModelCircuitBreaker(failure_threshold=3, cooldown_seconds=0.1)
    model = "gemini-2.5-flash-lite"

    # 1. Starts CLOSED
    assert cb.can_attempt(model) is True
    assert cb.get_circuit_state(model) == CircuitState.CLOSED

    # 2. Record 2 failures - still CLOSED
    cb.record_failure(model, is_rate_limit=False)
    cb.record_failure(model, is_rate_limit=False)
    assert cb.can_attempt(model) is True
    assert cb.get_circuit_state(model) == CircuitState.CLOSED

    # 3. 3rd failure trips circuit to OPEN
    cb.record_failure(model, is_rate_limit=False)
    assert cb.get_circuit_state(model) == CircuitState.OPEN
    assert cb.can_attempt(model) is False

    # 4. Wait for cooldown -> transitions to HALF_OPEN
    time.sleep(0.15)
    assert cb.can_attempt(model) is True
    assert cb.get_circuit_state(model) == CircuitState.HALF_OPEN

    # 5. Success resets circuit to CLOSED
    cb.record_success(model)
    assert cb.get_circuit_state(model) == CircuitState.CLOSED
    assert cb.can_attempt(model) is True


def test_circuit_breaker_rate_limit_immediate_trip():
    cb = ModelCircuitBreaker(failure_threshold=3, cooldown_seconds=10.0)
    model = "gemini-3.5-flash"

    # Rate limit immediately trips circuit to OPEN
    cb.record_failure(model, is_rate_limit=True)
    assert cb.get_circuit_state(model) == CircuitState.OPEN
    assert cb.can_attempt(model) is False


def test_strict_json_parser_rejects_unsafe_eval():
    # Valid JSON
    valid = '{"name": "Alice", "score": 95}'
    assert parse_json_safely(valid) == {"name": "Alice", "score": 95}

    # Markdown wrapped
    md_wrapped = '```json\n{"role": "Engineer", "active": true}\n```'
    assert parse_json_safely(md_wrapped) == {"role": "Engineer", "active": True}

    # Trailing comma sanitation
    trailing = '{"items": [1, 2, 3,], "valid": true,}'
    res = parse_json_safely(trailing)
    assert res["valid"] is True
    assert res["items"] == [1, 2, 3]

    # Python single quote dictionary without valid JSON syntax should fail (no ast.literal_eval)
    python_eval_injection = "{'user': __import__('os').system('echo pwned')}"
    with pytest.raises(ValueError) as exc:
        parse_json_safely(python_eval_injection)
    assert "ast.literal_eval disabled for security" in str(exc.value)


def test_token_and_cost_accounting_telemetry():
    from langchain_core.messages import AIMessage

    mock_response = AIMessage(content='{"result": "success"}')
    mock_response.usage_metadata = {
        "input_tokens": 120,
        "output_tokens": 40
    }

    with patch("app.core.llm_router.config.GEMINI_API_KEY", "valid_key"):
        with patch("app.core.llm_router.config.LLM_KILL_SWITCH", False):
            with patch("app.core.llm_router.ChatGoogleGenerativeAI") as mock_chat:
                mock_instance = MagicMock()
                mock_instance.invoke.return_value = mock_response
                mock_chat.return_value = mock_instance

                with patch("app.core.llm_router.log_event") as mock_log:
                    text, provider, latency = call_llm(
                        "Test prompt for accounting",
                        provider_override="gemini-2.5-flash-lite",
                        json_mode=True
                    )
                    assert text == '{"result": "success"}'
                    assert provider == "gemini"
                    assert latency > 0

                    mock_log.assert_called_once()
                    event_name, kwargs = mock_log.call_args
                    assert event_name[0] == "llm_call_completed"
                    extra = kwargs["extra"]
                    assert extra["tokens_in"] == 120
                    assert extra["tokens_out"] == 40
                    assert extra["cost_usd"] > 0
                    assert extra["status"] == "success"
                    assert extra["model"] == "gemini-2.5-flash-lite"
