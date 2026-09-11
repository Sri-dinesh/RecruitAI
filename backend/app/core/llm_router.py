import time
import json
import logging
from typing import Optional, Tuple
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite"]
_preferred_model = "gemini-2.5-flash"

class AllProvidersFailedError(Exception):
    pass

def call_llm(
    prompt: str, 
    system_instruction: Optional[str] = None, 
    provider_override: Optional[str] = None, 
    json_mode: bool = False
) -> Tuple[str, str, float]:
    """
    Calls Google Gemini using model failover (gemini-2.5-flash <-> gemini-3.1-flash-lite).
    If a model hits rate limits or transient errors, it automatically falls back to the secondary model.
    Returns (response_text, provider_used, latency_ms).
    Raises AllProvidersFailedError if all Gemini models fail.
    """
    global _preferred_model
    
    if not GEMINI_API_KEY or "your_gemini" in GEMINI_API_KEY:
        raise ValueError("No valid GEMINI_API_KEY is configured in backend/.env.")
        
    primary = _preferred_model
    secondary = "gemini-3.1-flash-lite" if primary == "gemini-2.5-flash" else "gemini-2.5-flash"
    order = [primary, secondary]
    
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
                google_api_key=GEMINI_API_KEY,
                temperature=0.0,
                response_mime_type="application/json" if json_mode else None,
                timeout=30.0
            )
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
            _preferred_model = model_name
            return response_text, "gemini", latency_ms
            
        except Exception as e:
            err_msg = str(e)
            errors.append(f"{model_name}: {err_msg}")
            
            if "429" in err_msg or "resource_exhausted" in err_msg.lower() or "rate_limit" in err_msg.lower():
                logger.warning(f"[gemini] Rate limit hit on {model_name}. Waiting 1.5s before model fallback...")
                time.sleep(1.5)
                
            logger.warning(f"[{model_name}] call failed: {err_msg}. Retrying with next model...")
            _preferred_model = secondary
            continue
            
    raise AllProvidersFailedError(f"All Gemini models failed. Details: {'; '.join(errors)}")


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

