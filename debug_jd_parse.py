"""Debug script to trace the JD parsing pipeline end-to-end."""
import sys
sys.path.insert(0, "backend")

from app.core.llm_router import call_llm, parse_json_safely

raw_jd_text = open("backend/data/jds/senior_fullstack_engineer.txt", "r").read()
print("=== RAW JD TEXT ===")
print(repr(raw_jd_text))
print()

system_instruction = (
    "You are an expert recruitment assistant. Extract structured job description fields from the provided text. "
    "Return ONLY a JSON object — no explanation, no markdown, no code fences — matching this exact schema:\n"
    '{"role": "string", "required_skills": ["string"], "experience_years": integer}'
)
prompt = (
    "Parse this job description and return ONLY a raw JSON object.\n\n"
    "<job_description>\n"
    f"{raw_jd_text}\n"
    "</job_description>\n\n"
    "JSON Response:"
)

print("=== CALLING LLM ===")
try:
    response_text, provider, latency_ms = call_llm(
        prompt=prompt,
        system_instruction=system_instruction,
        json_mode=True
    )
    print(f"Provider: {provider} | Latency: {latency_ms}ms")
    print("=== RAW LLM RESPONSE ===")
    print(repr(response_text))
    print()
    print("=== AFTER parse_json_safely ===")
    data = parse_json_safely(response_text)
    print(f"Type: {type(data)}")
    print(f"Value: {data}")
    print()
    print("=== EXTRACTED FIELDS ===")
    print("role:", data.get("role") if isinstance(data, dict) else "N/A")
    print("required_skills:", data.get("required_skills") if isinstance(data, dict) else "N/A")
    print("experience_years:", data.get("experience_years") if isinstance(data, dict) else "N/A")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
