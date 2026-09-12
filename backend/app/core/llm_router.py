import time
import json
import threading
import logging
from typing import Optional, Tuple, Any, List
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import GEMINI_API_KEY

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

def extract_text(content) -> str:
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

def get_next_model_order(provider_override: Optional[str] = None) -> list:
    """
    Thread-safe selection of the next model in the round-robin pool,
    followed by the remaining models as ordered failovers.
    If provider_override specifies a valid model in the pool, it takes the primary slot.
    """
    global _model_index
    num_models = len(ROTATING_MODELS)

    if provider_override and provider_override in ROTATING_MODELS:
        return [provider_override] + [m for m in ROTATING_MODELS if m != provider_override]

    with _model_lock:
        start_idx = _model_index
        _model_index = (_model_index + 1) % num_models

    return [ROTATING_MODELS[(start_idx + i) % num_models] for i in range(num_models)]

def call_llm(
    prompt: str, 
    system_instruction: Optional[str] = None, 
    provider_override: Optional[str] = None, 
    json_mode: bool = False
) -> Tuple[str, str, float]:
    """
    Calls Google Gemini using a round-robin rotation loop across 5 verified models:
    1. gemini-2.5-flash-lite
    2. gemini-3.1-flash-lite
    3. gemini-3.5-flash
    4. gemini-3.5-flash-lite
    5. gemini-3.7-flash

    Rotates model after each usage to distribute quota load and avoid 429 rate limits.
    If any model hits a rate limit or transient error, automatically fails over to the
    remaining models in the circular pool without interrupting the user.

    Returns (response_text, provider_used, latency_ms).
    Raises AllProvidersFailedError if all 5 Gemini models fail.
    """
    if not GEMINI_API_KEY or "your_gemini" in GEMINI_API_KEY:
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
                google_api_key=GEMINI_API_KEY,
                temperature=0.0,
                response_mime_type="application/json" if json_mode else None,
                timeout=30.0
            )
            response = model.invoke(messages)
            latency_ms = (time.time() - start_time) * 1000

            response_text = extract_text(response.content)
            logger.info(f"[llm_router] Handled by {model_name} in {latency_ms:.1f}ms (round-robin)")
            return response_text, "gemini", latency_ms

        except Exception as e:
            err_msg = str(e)
            errors.append(f"{model_name}: {err_msg}")

            if "429" in err_msg or "resource_exhausted" in err_msg.lower() or "rate_limit" in err_msg.lower():
                logger.warning(f"[gemini] Rate limit hit on {model_name}. Immediate failover to next model in pool...")
            else:
                logger.warning(f"[{model_name}] call failed: {err_msg}. Failing over to next model...")

            continue

    raise AllProvidersFailedError(f"All Gemini models in pool failed. Details: {'; '.join(errors)}")


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

