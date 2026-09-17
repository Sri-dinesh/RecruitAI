import re
from typing import Optional
from app.graph.state import RecruitState
from app.services.tavily_service import get_tavily_service


def salary_node(state: RecruitState) -> dict:
    """
    Enterprise salary benchmark node.
    Extracts role, location, and seniority from query or active JD.
    Calls TavilyService for real-time compensation intelligence with verified citations.
    """
    history = state.get("conversation_history", [])
    jd = state.get("jd_structured")
    user_msg = history[-1]["content"] if history else ""
    user_msg_lower = user_msg.lower()

    # 1. Resolve role title
    role = None
    match = re.search(r"(?:salary|compensation|pay|rate|package)\s+(?:expectations|range|for|of)?\s+([a-zA-Z\s\-]+)", user_msg, re.IGNORECASE)
    if match:
        extracted = match.group(1).strip()
        # Clean trailing query tokens like 'in india', 'in us', '2026'
        cleaned = re.sub(r"\b(in|for|at|around|202\d|india|us|usa|uk)\b.*$", "", extracted, flags=re.IGNORECASE).strip()
        if len(cleaned) > 2:
            role = cleaned

    if not role and jd:
        role = jd.role

    if not role:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": "I need a Job Description loaded first to benchmark salary, or you can ask me explicitly (e.g. 'what is the salary for a Technical Recruiter?')."
            }]
        }

    # 2. Resolve location
    location = "India"
    if any(k in user_msg_lower for k in ["us", "united states", "america", "usa", "nyc", "sf", "california", "texas"]):
        location = "US"
    elif any(k in user_msg_lower for k in ["uk", "united kingdom", "london"]):
        location = "UK"
    elif any(k in user_msg_lower for k in ["india", "inr", "bangalore", "bengaluru", "delhi", "mumbai", "hyderabad", "pune"]):
        location = "India"

    # 3. Detect experience level
    exp_match = re.search(r"\b(entry|junior|mid|senior|lead|staff|principal)\b", user_msg_lower)
    exp_level: Optional[str] = exp_match.group(1).capitalize() if exp_match else None

    # 4. Query enterprise TavilyService
    service = get_tavily_service()
    benchmark = service.get_salary_benchmark(role=role, location=location, experience_level=exp_level)

    status_tag = "**[LIVE DATA - TAVILY REAL-TIME SEARCH]**" if benchmark.is_live else "**[OFFLINE DATA - CACHED FALLBACK]**"

    response = (
        f"### Salary Benchmark: **{role}** ({location})\n"
        f"Source Status: {status_tag}\n\n"
        f"{benchmark.to_markdown()}"
    )

    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": response
        }]
    }
