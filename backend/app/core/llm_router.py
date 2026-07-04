import time
import google.generativeai as genai
from groq import Groq
from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
from typing import Optional, Tuple

PROVIDERS = ["gemini", "groq"]
_provider_counter = 0

class AllProvidersFailedError(Exception):
    pass

def call_llm(
    prompt: str, 
    system_instruction: Optional[str] = None, 
    provider_override: Optional[str] = None, 
    json_mode: bool = False
) -> Tuple[str, str, float]:
    """
    Calls Gemini or Groq using round-robin distribution.
    If the chosen provider fails, it attempts the other provider automatically.
    Returns (response_text, provider_used, latency_ms).
    Raises AllProvidersFailedError if both fail.
    """
    global _provider_counter
    
    gemini_active = bool(GEMINI_API_KEY) and "your_gemini" not in GEMINI_API_KEY
    groq_active = bool(GROQ_API_KEY) and "your_groq" not in GROQ_API_KEY
    
    if not gemini_active and not groq_active:
        raise ValueError("No valid Gemini or Groq API keys are configured in .env.")
        
    # Determine execution order
    if provider_override:
        order = [provider_override]
    else:
        primary = PROVIDERS[_provider_counter % 2]
        _provider_counter += 1
        secondary = "groq" if primary == "gemini" else "gemini"
        order = [primary, secondary]
        
    # Filter to only active providers
    order = [p for p in order if (p == "gemini" and gemini_active) or (p == "groq" and groq_active)]
    
    errors = []
    for provider in order:
        start_time = time.time()
        try:
            if provider == "gemini":
                genai.configure(api_key=GEMINI_API_KEY)
                model_name = "gemini-1.5-flash"
                
                generation_config = {}
                if json_mode:
                    generation_config["response_mime_type"] = "application/json"
                    
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instruction
                )
                response = model.generate_content(prompt, generation_config=generation_config)
                response_text = response.text
                
            elif provider == "groq":
                client = Groq(api_key=GROQ_API_KEY)
                messages = []
                if system_instruction:
                    messages.append({"role": "system", "content": system_instruction})
                messages.append({"role": "user", "content": prompt})
                
                kwargs = {
                    "model": "llama3-8b-8192",
                    "messages": messages,
                    "temperature": 0.0
                }
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                    
                completion = client.chat.completions.create(**kwargs)
                response_text = completion.choices[0].message.content
                
            latency_ms = (time.time() - start_time) * 1000
            return response_text, provider, latency_ms
            
        except Exception as e:
            errors.append(f"{provider}: {str(e)}")
            print(f"[{provider}] call failed: {str(e)}. Retrying next provider...")
            continue
            
    raise AllProvidersFailedError(f"All LLM providers failed. Details: {'; '.join(errors)}")
