import pytest
from unittest.mock import patch
from app.core.llm_router import call_llm, AllProvidersFailedError

class MockMessage:
    def __init__(self, content):
        self.content = content

def test_llm_failover_gemini_to_groq():
    # Mock Gemini to fail, check that it retries and succeeds via Groq
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=Exception("Gemini Rate Limit")) as mock_gemini:
        with patch("app.core.llm_router.ChatGroq.invoke", return_value=MockMessage("Hello from Groq")) as mock_groq:
            res_text, provider, latency = call_llm("hello", provider_override="gemini")
            
            assert res_text == "Hello from Groq"
            assert provider == "groq"
            assert mock_gemini.call_count == 1
            assert mock_groq.call_count == 1

def test_llm_failover_groq_to_gemini():
    # Mock Groq to fail, check that it retries and succeeds via Gemini
    with patch("app.core.llm_router.ChatGroq.invoke", side_effect=Exception("Groq Service Unavailable")) as mock_groq:
        with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", return_value=MockMessage("Hello from Gemini")) as mock_gemini:
            res_text, provider, latency = call_llm("hello", provider_override="groq")
            
            assert res_text == "Hello from Gemini"
            assert provider == "gemini"
            assert mock_gemini.call_count == 1
            assert mock_groq.call_count == 1

def test_all_providers_fail():
    # Check that when all providers fail, it raises AllProvidersFailedError
    with patch("app.core.llm_router.ChatGoogleGenerativeAI.invoke", side_effect=Exception("Gemini Offline")):
        with patch("app.core.llm_router.ChatGroq.invoke", side_effect=Exception("Groq Offline")):
            with pytest.raises(AllProvidersFailedError) as exc:
                call_llm("hello")
            assert "All LLM providers failed" in str(exc.value)
