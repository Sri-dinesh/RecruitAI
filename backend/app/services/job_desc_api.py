import httpx
import os
import json
from typing import Optional
from app.core.config import INDIANAPI_JOBS_KEY, SERPAPI_API_KEY
from app.schemas.jd_schema import JobDescription
from app.core.llm_router import call_llm

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

def fetch_live_job_description(query: str, location: Optional[str] = None) -> JobDescription:
    """
    Fetches job listings from live APIs and constructs a structured JobDescription.
    Supports IndianAPI and SerpApi, with a robust fallback to structured mock JDs.
    """
    # Try IndianAPI first
    if INDIANAPI_JOBS_KEY:
        try:
            headers = {"X-Api-Key": INDIANAPI_JOBS_KEY}
            params = {"limit": "20"}
            response = httpx.get("https://jobs.indianapi.in/jobs", headers=headers, params=params, timeout=5.0)
            if response.status_code == 200:
                jobs_data = response.json()
                jobs = jobs_data if isinstance(jobs_data, list) else jobs_data.get("jobs", [])
                
                matched_job = None
                for job in jobs:
                    title = job.get("title", "").lower()
                    description = job.get("description", "").lower()
                    if query.lower() in title or query.lower() in description:
                        matched_job = job
                        break
                
                if not matched_job and jobs:
                    matched_job = jobs[0]
                    
                if matched_job:
                    return map_raw_job_to_jd(matched_job, "IndianAPI")
        except Exception as e:
            print(f"[IndianAPI] failed to fetch: {e}. Trying SerpApi fallback...")

    # Try SerpApi second
    if SERPAPI_API_KEY:
        try:
            q = f"{query} {location}" if location else query
            params = {
                "engine": "google_jobs",
                "q": q,
                "api_key": SERPAPI_API_KEY,
                "hl": "en"
            }
            response = httpx.get("https://serpapi.com/search.json", params=params, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                jobs = data.get("jobs_results", [])
                if jobs:
                    return map_raw_job_to_jd(jobs[0], "SerpApi")
        except Exception as e:
            print(f"[SerpApi] failed to fetch: {e}. Trying fallback...")

    # Default fallback to mock JD
    print(f"Using local mock fallback job description for query '{query}'")
    return get_mock_jd(query)

def map_raw_job_to_jd(job_data: dict, source_name: str) -> JobDescription:
    """
    Helper to map raw job dictionary (from SerpApi or IndianAPI) into a JobDescription
    using LLM-assisted schema extraction (or heuristics if LLM fails).
    """
    title = job_data.get("title") or job_data.get("job_title") or "Software Engineer"
    desc = job_data.get("description") or job_data.get("job_description") or ""
    company = job_data.get("company_name") or job_data.get("company") or "Unknown Company"
    location = job_data.get("location") or "Remote"
    
    full_text = f"Job Title: {title}\nCompany: {company}\nLocation: {location}\nDescription:\n{desc}"
    
    system_instruction = (
        "You are an expert recruitment parser. Extract structured fields from the job description "
        "and return a JSON object containing:\n"
        "- role (str)\n"
        "- required_skills (list of str)\n"
        "- experience_years (int, default to 2 if not found)\n"
        "Return only the raw JSON."
    )
    
    prompt = f"Extract fields from this job description:\n{full_text}"
    
    try:
        response_text, provider, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )
        data = json.loads(response_text)
        return JobDescription(
            role=data.get("role", title),
            required_skills=data.get("required_skills", []),
            experience_years=data.get("experience_years", 2),
            raw_text=full_text,
            tone="professional"
        )
    except Exception as e:
        print(f"LLM mapping of job description failed: {e}. Using simple parsing.")
        skills = []
        possible_skills = ["python", "javascript", "react", "node", "typescript", "django", "fastapi", "sql", "docker", "aws"]
        for skill in possible_skills:
            if skill in full_text.lower():
                skills.append(skill.title())
        return JobDescription(
            role=title,
            required_skills=skills if skills else ["General Software Development"],
            experience_years=2,
            raw_text=full_text,
            tone="professional"
        )
