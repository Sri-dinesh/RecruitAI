import logging
from typing import Optional
from app.schemas.jd_schema import JobDescription
from app.services.tavily_service import get_tavily_service

logger = logging.getLogger(__name__)


def get_mock_jd(query: str) -> JobDescription:
    """
    Returns a high-quality mock JobDescription when external APIs are not available or fail.
    """
    query_lower = query.lower()
    if "front" in query_lower or "react" in query_lower or "ui" in query_lower:
        role = "Frontend Engineer"
        skills = ["React", "TypeScript", "HTML5", "CSS3", "Tailwind CSS", "Next.js"]
        exp = 3
        text = (
            "We are looking for a skilled Frontend Engineer with 3+ years of experience. "
            "You will build responsive, interactive web applications using React, Next.js, and TypeScript. "
            "Experience with Tailwind CSS and performance optimization is highly preferred."
        )
    elif "back" in query_lower or "python" in query_lower or "django" in query_lower or "api" in query_lower:
        role = "Backend Python Developer"
        skills = ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis", "REST APIs"]
        exp = 4
        text = (
            "We are seeking a Backend Python Developer to join our core engineering team. "
            "You will design and implement scalable microservices using FastAPI/Django, PostgreSQL, and Docker. "
            "Experience with pgvector or semantic search is a plus."
        )
    else:
        role = f"Software Engineer ({query.title()})"
        skills = ["Python", "JavaScript", "SQL", "Git", "Docker", "Cloud Services"]
        exp = 2
        text = (
            f"We are looking for a versatile Software Engineer interested in working on {query}. "
            "You should have 2+ years of experience with software development, good communication skills, "
            "and a strong desire to learn new backend and frontend technologies."
        )

    return JobDescription(
        role=role,
        required_skills=skills,
        experience_years=exp,
        raw_text=text,
        tone="professional"
    )


def fetch_live_job_description(
    query: str,
    location: Optional[str] = None,
    use_tavily: bool = True
) -> JobDescription:
    """
    Fetches real-time job listings using Tavily's job board discovery engine,
    with a deterministic fallback to structured mock JDs.
    """
    if use_tavily:
        tavily_svc = get_tavily_service()
        if tavily_svc.is_available:
            try:
                live_jobs = tavily_svc.search_live_jobs(query, location, max_results=3)
                if live_jobs:
                    job_data = {
                        "title": live_jobs[0].get("title", query),
                        "description": live_jobs[0].get("description", ""),
                        "company": live_jobs[0].get("company", "Top Industry Employer"),
                        "location": location or "Remote"
                    }
                    return map_raw_job_to_jd(job_data, "Tavily")
            except Exception as e:
                logger.warning(f"[Tavily] Live job search failed: {e}. Falling back to mock JD.")

    logger.info(f"Using local mock fallback job description for query '{query}'")
    return get_mock_jd(query)


def map_raw_job_to_jd(job_data: dict, source_name: str) -> JobDescription:
    """
    Maps raw job dictionary from live search into a validated JobDescription
    using LLM-assisted schema extraction and heuristic fallback.
    """
    title = job_data.get("title") or job_data.get("job_title") or "Software Engineer"
    desc = job_data.get("description") or job_data.get("job_description") or ""
    company = job_data.get("company_name") or job_data.get("company") or "Top Industry Employer"
    location = job_data.get("location") or "Remote"

    full_text = f"Job Title: {title}\nCompany: {company}\nLocation: {location}\nDescription:\n{desc}"

    from app.services.jd_parser import parse_structured_jd
    jd = parse_structured_jd(full_text)
    if not jd.company_name or jd.company_name == "Unknown Company":
        jd.company_name = company
    if not jd.location:
        jd.location = location
    return jd
