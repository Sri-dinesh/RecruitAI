"""
Task 10.4 - Skill Trend Tool (LangChain @tool decorator)
Searches Tavily for trending skills for a given role via TavilyService.
"""

from langchain_core.tools import tool
from app.services.tavily_service import get_tavily_service


@tool
def search_skill_trends(role: str) -> str:
    """
    Search for trending skills for a given developer/engineering role using Tavily.

    Args:
        role: The job role to search trending skills for (e.g. 'Python Developer').

    Returns:
        A formatted markdown string containing trending skills, emerging tooling,
        and market intelligence from Tavily.
    """
    service = get_tavily_service()
    trends = service.get_skill_trends(role=role)
    return trends.to_markdown()
