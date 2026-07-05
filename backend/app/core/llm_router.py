import time
import json
from typing import Optional, Tuple
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from app.core.config import GEMINI_API_KEY, GROQ_API_KEY, LLM_TIMEOUT_SECONDS

PROVIDERS = ["gemini", "groq"]
_preferred_provider = "gemini"
_gemini_model = None
_groq_model = None

class AllProvidersFailedError(Exception):
    pass

def _gemini_active() -> bool:
    return bool(GEMINI_API_KEY) and "your_gemini" not in GEMINI_API_KEY

def _groq_active() -> bool:
    return bool(GROQ_API_KEY) and "your_groq" not in GROQ_API_KEY

def _get_gemini_model() -> ChatGoogleGenerativeAI:
    global _gemini_model
    if _gemini_model is None:
        _gemini_model = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            google_api_key=GEMINI_API_KEY,
            temperature=0.0,
            timeout=LLM_TIMEOUT_SECONDS,
        )
    return _gemini_model

def _get_groq_model() -> ChatGroq:
    global _groq_model
    if _groq_model is None:
        _groq_model = ChatGroq(
            model="llama-3.1-8b-instant",
            groq_api_key=GROQ_API_KEY,
            temperature=0.0,
            timeout=LLM_TIMEOUT_SECONDS,
        )
    return _groq_model

def warmup_llm_clients() -> None:
    """Pre-create LLM clients to avoid first-request initialization latency."""
    if _gemini_active():
        _get_gemini_model()
    if _groq_active():
        _get_groq_model()

def call_llm(
    prompt: str, 
    system_instruction: Optional[str] = None, 
    provider_override: Optional[str] = None, 
    json_mode: bool = False
) -> Tuple[str, str, float]:
    """
    Calls Gemini or Groq using active sticky-failover distribution.
    If the preferred provider fails, it immediately switches preference to the other
    provider for subsequent calls and retries the request on the new provider.
    Returns (response_text, provider_used, latency_ms).
    Raises AllProvidersFailedError if both fail.
    """
    global _preferred_provider
    
    if not _gemini_active() and not _groq_active():
        raise ValueError("No valid Gemini or Groq API keys are configured in .env.")
        
    # Determine execution order
    if provider_override:
        secondary = "groq" if provider_override == "gemini" else "gemini"
        order = [provider_override, secondary]
    else:
        primary = _preferred_provider
        secondary = "groq" if primary == "gemini" else "gemini"
        order = [primary, secondary]
        
    # Filter to only active providers
    order = [p for p in order if (p == "gemini" and _gemini_active()) or (p == "groq" and _groq_active())]
    
    errors = []
    for provider in order:
        start_time = time.time()
        try:
            messages = []
            if system_instruction:
                messages.append(SystemMessage(content=system_instruction))
            messages.append(HumanMessage(content=prompt))
            
            if provider == "gemini":
                model = _get_gemini_model()
                if json_mode:
                    model = model.bind(response_mime_type="application/json")
                response = model.invoke(messages)
            elif provider == "groq":
                model = _get_groq_model()
                if json_mode:
                    response = model.invoke(
                        messages,
                        response_format={"type": "json_object"},
                    )
                else:
                    response = model.invoke(messages)
                
            latency_ms = (time.time() - start_time) * 1000
            
            def _extract_text(content) -> str:
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    parts = []
                    for block in content:
                        if isinstance(block, dict):
                            if block.get("type") == "text" and "text" in block:
                                parts.append(block["text"])
                            elif "text" in block:
                                parts.append(str(block["text"]))
                            elif "content" in block:
                                parts.append(str(block["content"]))
                        elif isinstance(block, str):
                            parts.append(block)
                    return "\n".join(parts) if parts else str(content)
                if isinstance(content, dict):
                    if "text" in content:
                        return str(content["text"])
                    if "content" in content:
                        return str(content["content"])
                return str(content)
            
            response_text = _extract_text(response.content)
            
            _preferred_provider = provider
            return response_text, provider, latency_ms
            
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")
            print(f"[{provider}] call failed: {str(e)}. Retrying next provider...")
            _preferred_provider = "groq" if provider == "gemini" else "gemini"
            continue
            
    raise AllProvidersFailedError(f"All LLM providers failed. Details: {'; '.join(errors)}")


import re
import ast
from typing import Any

def parse_json_safely(text: str) -> Any:
    """
    Safely cleans markdown wrappers and parses JSON from LLM response text,
    falling back to Python ast.literal_eval if single quotes are used.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
        if m:
            cleaned = m.group(1).strip()
            
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(cleaned)
        except Exception:
            raise ValueError(f"Failed to parse text as valid JSON: {text}")
