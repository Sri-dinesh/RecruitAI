"""
Tavily Search Tool.
Queries real-time compensation intelligence via TavilyService with fallback resilience.
"""

from typing import Tuple
from app.services.tavily_service import get_tavily_service


def search_salary_data(role: str, location: str = "India") -> Tuple[str, bool]:
    """
    Queries Tavily for salary details using enterprise TavilyService.
    If Tavily is unavailable or times out, seamlessly falls back to cached data.
    Returns (result_text, is_live_data).
    """
    service = get_tavily_service()
    benchmark = service.get_salary_benchmark(role=role, location=location)
    
    # Render the structured report markdown
    result_text = benchmark.to_markdown()
    return result_text, benchmark.is_live
