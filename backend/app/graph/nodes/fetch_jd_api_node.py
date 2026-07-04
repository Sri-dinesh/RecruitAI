import json
from app.graph.state import RecruitState
from app.services.job_desc_api import fetch_live_job_description
from app.core.llm_router import call_llm
from app.schemas.jd_schema import JobDescription

def fetch_jd_api_node(state: RecruitState) -> dict:
    """
    Node that coordinates fetching job description via live APIs (e.g. IndianAPI, SerpApi)
    and updating state.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""
    
    # Use LLM to extract the job title/role and location search parameters from the query
    system_instruction = (
        "You are an expert HR assistant. Extract the job search query (e.g., job role title like "
        "'Frontend Developer', 'Python Engineer') and location (optional) from the user's request. "
        "Return a JSON object: {\"query\": \"role_name\", \"location\": \"location_name_or_null\"}."
    )
    
    prompt = f"User Request: \"{user_msg}\"\n\nJSON Response:"
    
    query = "Software Engineer"
    location = None
    
    try:
        response_text, _, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )
        data = json.loads(response_text)
        query = data.get("query") or query
        location = data.get("location")
    except Exception as e:
        print(f"Failed to extract search params via LLM: {e}")
        # Try a quick heuristic matching
        words = user_msg.split()
        for i, word in enumerate(words):
            if word.lower() in ["for", "of"] and i + 1 < len(words):
                query = " ".join(words[i+1:])
                break
                
    try:
        jd_structured = fetch_live_job_description(query, location)
        
        success_msg = (
            f"Successfully fetched live Job Description for **{jd_structured.role}** via API.\n\n"
            f"**Required Skills:** {', '.join(jd_structured.required_skills)}\n"
            f"**Experience:** {jd_structured.experience_years}+ years\n\n"
            f"### Job Description Details:\n"
            f"```text\n{jd_structured.raw_text}\n```"
        )
        
        return {
            "jd_structured": jd_structured,
            "conversation_history": history + [{
                "role": "assistant",
                "content": success_msg
            }]
        }
    except Exception as e:
        error_msg = f"Failed to fetch live job description for '{query}' due to: {e}"
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": error_msg
            }]
        }
