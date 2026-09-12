import pytest
from unittest.mock import patch
from app.core.llm_router import (
    call_llm,
    AllProvidersFailedError,
    ROTATING_MODELS,
    get_next_model_order,
    extract_text,
)

class MockMessage:
    def __init__(self, content):
        self.content = content

def test_round_robin_rotation():
    """Verify that calling get_next_model_order rotates through all 5 models."""
    seen_primaries = []
    for _ in range(len(ROTATING_MODELS)):
        order = get_next_model_order()
        assert len(order) == len(ROTATING_MODELS)
        assert set(order) == set(ROTATING_MODELS)
        seen_primaries.append(order[0])

    # All 5 models must have taken the primary slot exactly once in a full cycle
    assert len(set(seen_primaries)) == len(ROTATING_MODELS)
    assert set(seen_primaries) == set(ROTATING_MODELS)

def test_provider_override():
    """Verify that a specific model override is prioritized in primary position."""
    override = "gemini-3.7-flash"
    order = get_next_model_order(provider_override=override)
    assert order[0] == override
    assert len(order) == len(ROTATING_MODELS)
    assert set(order) == set(ROTATING_MODELS)

def test_extract_text_formats():
    """Verify robust extraction across raw strings, Gemini 3.x block lists, and dicts."""
    # 1. Plain string
    assert extract_text("hello world") == "hello world"

    # 2. Gemini 3.x content block list
    blocks = [{"type": "text", "text": "{\"key\": "}, {"type": "text", "text": "\"value\"}"}]
    assert extract_text(blocks) == "{\"key\": \"value\"}"

    # 3. Simple string list
    assert extract_text(["chunk1", "chunk2"]) == "chunk1chunk2"

    # 4. Dict content
    assert extract_text({"text": "dict text"}) == "dict text"

def test_llm_model_failover():
    """First model fails with a rate limit, second model succeeds immediately."""
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=[
        Exception("429 ResourceExhausted: rate limit exceeded"),
        MockMessage("Hello from fallback Gemini model")
    ]) as mock_invoke:
        res_text, provider, latency = call_llm("hello")
        assert res_text == "Hello from fallback Gemini model"
        assert provider == "gemini"
        assert mock_invoke.call_count == 2

def test_all_models_fail():
    """When all 5 models fail, AllProvidersFailedError is raised after trying all 5."""
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=Exception("Gemini Offline")) as mock_invoke:
        with pytest.raises(AllProvidersFailedError) as exc:
            call_llm("hello")
        assert "All Gemini models in pool failed" in str(exc.value)
        assert mock_invoke.call_count == len(ROTATING_MODELS)
