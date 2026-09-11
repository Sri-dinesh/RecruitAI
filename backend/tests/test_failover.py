import pytest
from unittest.mock import patch
from app.core.llm_router import call_llm, AllProvidersFailedError

class MockMessage:
    def __init__(self, content):
        self.content = content

def test_llm_model_failover():
    # First model fails, second model succeeds
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=[
        Exception("gemini-2.5-flash Rate Limit"),
        MockMessage("Hello from fallback Gemini model")
    ]) as mock_invoke:
        res_text, provider, latency = call_llm("hello")
        assert res_text == "Hello from fallback Gemini model"
        assert provider == "gemini"
        assert mock_invoke.call_count == 2

def test_all_models_fail():
    # Check that when all models fail, it raises AllProvidersFailedError
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=Exception("Gemini Offline")):
        with pytest.raises(AllProvidersFailedError) as exc:
            call_llm("hello")
        assert "All Gemini models failed" in str(exc.value)
