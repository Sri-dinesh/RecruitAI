"""
Web Intelligence Node for RecruitAI Copilot.
Handles real-time recruiter web searches (e.g., company background vetting,
technology stack analysis, market certifications) using TavilyService.
"""

import re
from app.graph.state import RecruitState
from app.services.tavily_service import get_tavily_service


def web_intel_node(state: RecruitState) -> dict:
    """
    Executes real-time web intelligence research for recruiter queries.
    Provides synthesized answers and verified web sources.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""

    # Clean the query for web searching
    query = user_msg.strip()
    # Strip common conversational prefixes like "search the web for", "google", "look up"
    cleaned = re.sub(
        r"^(?:please\s+)?(?:search(?:\s+the\s+web|\s+online|\s+for)?|look\s+up|google|find\s+info\s+on|tell\s+me\s+about)\s+",
        "",
        query,
        flags=re.IGNORECASE
    ).strip()
    if len(cleaned) > 2:
        search_query = cleaned
    else:
        search_query = query

    service = get_tavily_service()
    intel = service.search_recruiter_intel(query=search_query, search_depth="advanced")

    status_tag = "**[LIVE DATA - TAVILY WEB INTELLIGENCE]**" if intel.is_live else "**[OFFLINE NOTICE]**"

    response = (
        f"### 🌐 Web Intelligence Report\n"
        f"Source Status: {status_tag}\n\n"
        f"{intel.to_markdown()}"
    )

    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": response
        }]
    }
