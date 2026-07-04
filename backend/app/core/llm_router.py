import time
from typing import Optional, Tuple
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from app.core.config import GEMINI_API_KEY, GROQ_API_KEY

PROVIDERS = ["gemini", "groq"]
_preferred_provider = "gemini"

class AllProvidersFailedError(Exception):
    pass

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
    
    gemini_active = bool(GEMINI_API_KEY) and "your_gemini" not in GEMINI_API_KEY
    groq_active = bool(GROQ_API_KEY) and "your_groq" not in GROQ_API_KEY
    
    if not gemini_active and not groq_active:
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
    order = [p for p in order if (p == "gemini" and gemini_active) or (p == "groq" and groq_active)]
    
    errors = []
    for provider in order:
        start_time = time.time()
        try:
            # Build messages in LangChain format
            messages = []
            if system_instruction:
                messages.append(SystemMessage(content=system_instruction))
            messages.append(HumanMessage(content=prompt))
            
            if provider == "gemini":
                # Initialize LangChain ChatGoogleGenerativeAI
                model = ChatGoogleGenerativeAI(
                    model="gemini-3.1-flash-lite",
                    google_api_key=GEMINI_API_KEY,
                    temperature=0.0,
                    response_mime_type="application/json" if json_mode else None
                )
                response = model.invoke(messages)
                response_text = str(response.content)
                
            elif provider == "groq":
                # Initialize LangChain ChatGroq
                model_kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
                model = ChatGroq(
                    model="llama-3.1-8b-instant",
                    groq_api_key=GROQ_API_KEY,
                    temperature=0.0,
                    model_kwargs=model_kwargs
                )
                response = model.invoke(messages)
                response_text = str(response.content)
                
            latency_ms = (time.time() - start_time) * 1000
            
            # Sticky routing: make this successfully-responding provider preferred for subsequent calls
            _preferred_provider = provider
            return response_text, provider, latency_ms
            
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")
            print(f"[{provider}] call failed: {str(e)}. Retrying next provider...")
            # Switch preferred provider to the other one since this one is failing
            _preferred_provider = "groq" if provider == "gemini" else "gemini"
            continue
            
    raise AllProvidersFailedError(f"All LLM providers failed. Details: {'; '.join(errors)}")
