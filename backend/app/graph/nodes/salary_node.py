import re
from app.graph.state import RecruitState
from app.tools.tavily_search import search_salary_data

def salary_node(state: RecruitState) -> dict:
    """
    Salary benchmark node.
    Extracts role/location from query or loaded JD.
    Calls Tavily search tool directly (never uses RAG) and flags cached vs live status.
    """
    history = state.get("conversation_history", [])
    jd = state.get("jd_structured")
    user_msg = history[-1]["content"] if history else ""
    
    # 1. Resolve role title
    role = None
    # Check if query mentions a role (e.g. "salary for Python Developer")
    match = re.search(r"salary (?:expectations|range|for)\s+([a-zA-Z\s\-]+)", user_msg, re.IGNORECASE)
    if match:
        role = match.group(1).strip()
    elif jd:
        role = jd.role
        
    if not role:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": "I need a Job Description loaded first to benchmark salary, or you can ask me explicitly (e.g. 'what is the salary for a Technical Recruiter?')."
            }]
        }
        
    # 2. Resolve location (default to India)
    location = "India"
    user_msg_lower = user_msg.lower()
    if "us" in user_msg_lower or "united states" in user_msg_lower or "america" in user_msg_lower:
        location = "US"
    elif "uk" in user_msg_lower or "united kingdom" in user_msg_lower or "london" in user_msg_lower:
        location = "UK"
    elif "india" in user_msg_lower or "inr" in user_msg_lower:
        location = "India"
        
    # 3. Call Tavily search tool (strictly no RAG)
    result_text, is_live = search_salary_data(role, location)
    
    # 4. Format status indicator per Section 6.3
    status_tag = "**[LIVE DATA - TAVILY REAL-TIME SEARCH]**" if is_live else "**[OFFLINE DATA - CACHED FALLBACK]**"
    
    response = (
        f"### Salary Benchmark: **{role}** ({location})\n"
        f"Source Status: {status_tag}\n\n"
        f"{result_text}"
    )
    
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": response
        }]
    }
