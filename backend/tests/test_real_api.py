import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

import pytest
from unittest.mock import patch, MagicMock
import httpx
from app.services.job_desc_api import fetch_live_job_description, get_mock_jd
from app.services.resume_api import parse_resume_via_api, get_mock_parsed_resume
from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate


def test_fetch_live_job_description_fallback_on_network_error():
    """
    Ensure network failure deterministically falls back to high quality mock JD
    without raising exceptions or hanging on socket connections (ENG-2).
    """
    with patch("httpx.get", side_effect=httpx.ConnectError("Network unreachable")):
        jd = fetch_live_job_description(query="Frontend React Developer")
        assert isinstance(jd, JobDescription)
        assert jd.role == "Frontend Engineer"
        assert "React" in jd.required_skills
        assert jd.experience_years == 3


def test_fetch_live_job_description_indianapi_mock():
    """
    Hermetically mock IndianAPI 200 OK response and verify job description extraction (ENG-2).
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "jobs": [
            {
                "title": "Senior React Developer",
                "description": "5+ years building Next.js apps with TypeScript and Tailwind CSS.",
                "company_name": "Acme Corp",
                "location": "Remote"
            }
        ]
    }
    with patch("app.services.job_desc_api.INDIANAPI_JOBS_KEY", "test-key"):
        with patch("httpx.get", return_value=mock_resp):
            with patch("app.services.job_desc_api.map_raw_job_to_jd") as mock_mapper:
                mock_mapper.return_value = JobDescription(
                    role="Senior React Developer",
                    required_skills=["React", "Next.js", "TypeScript"],
                    experience_years=5,
                    raw_text="5+ years building Next.js apps",
                    company_name="Acme Corp",
                    location="Remote"
                )
                jd = fetch_live_job_description(query="React Developer")
                assert jd.role == "Senior React Developer"
                assert jd.company_name == "Acme Corp"
                mock_mapper.assert_called_once()


def test_fetch_live_job_description_serpapi_mock():
    """
    Hermetically mock SerpApi google_jobs 200 OK response and verify job description extraction (ENG-2).
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "jobs_results": [
            {
                "title": "Staff Backend Python Architect",
                "description": "Expert in FastAPI, PostgreSQL, and distributed microservices.",
                "company_name": "Google",
                "location": "Mountain View, CA"
            }
        ]
    }
    with patch("app.services.job_desc_api.INDIANAPI_JOBS_KEY", None):
        with patch("app.services.job_desc_api.SERPAPI_API_KEY", "serp-key-123"):
            with patch("httpx.get", return_value=mock_resp):
                with patch("app.services.job_desc_api.map_raw_job_to_jd") as mock_mapper:
                    mock_mapper.return_value = JobDescription(
                        role="Staff Backend Python Architect",
                        required_skills=["Python", "FastAPI", "PostgreSQL"],
                        experience_years=8,
                        raw_text="Staff backend engineer role",
                        company_name="Google",
                        location="Mountain View, CA"
                    )
                    jd = fetch_live_job_description(query="Python Architect")
                    assert jd.role == "Staff Backend Python Architect"
                    assert jd.company_name == "Google"
                    mock_mapper.assert_called_once()


def test_get_mock_jd():
    jd_back = get_mock_jd("backend developer")
    assert jd_back.role == "Backend Python Developer"
    assert "FastAPI" in jd_back.required_skills
    
    jd_generic = get_mock_jd("machine learning specialist")
    assert "Machine Learning Specialist" in jd_generic.role
    assert jd_generic.experience_years == 2


def test_parse_resume_via_api_fallback():
    filename = "Bob_Smith.txt"
    file_bytes = b"Name: Bob Smith\nExperience: 5 years of Python development."
    with patch("app.services.resume_api.call_llm", return_value=('{"name": "Bob Smith"}', "mock", 0.1)):
        candidate = parse_resume_via_api(file_bytes, filename)
        assert isinstance(candidate, Candidate)
        assert candidate.name == "Bob Smith"
        assert candidate.candidate_id == "bob_smith"


def test_parse_resume_via_api_network_down():
    """
    Verify parse_resume_via_api falls back cleanly to regex extraction when LLM fails (ENG-2).
    """
    filename = "Alice_Johnson.txt"
    file_bytes = b"Alice Johnson\nalice.johnson@example.com\nPython, Docker, SQL"
    with patch("app.services.resume_api.call_llm", side_effect=RuntimeError("AI Provider unreachable")):
        candidate = parse_resume_via_api(file_bytes, filename)
        assert isinstance(candidate, Candidate)
        assert candidate.name == "Alice Johnson"
        assert candidate.candidate_id == "alice_johnson"
