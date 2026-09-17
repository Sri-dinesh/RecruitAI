import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

import pytest
from unittest.mock import patch, MagicMock
from app.services.job_desc_api import fetch_live_job_description, get_mock_jd
from app.services.resume_api import parse_resume_via_api, get_mock_parsed_resume
from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate


def test_fetch_live_job_description_fallback_on_network_error():
    """
    Ensure Tavily failure deterministically falls back to high quality mock JD
    without raising exceptions or crashing the workflow.
    """
    with patch("app.services.job_desc_api.get_tavily_service") as mock_get_svc:
        mock_svc = MagicMock()
        mock_svc.is_available = True
        mock_svc.search_live_jobs.side_effect = RuntimeError("Tavily service unreachable")
        mock_get_svc.return_value = mock_svc

        jd = fetch_live_job_description(query="Frontend React Developer", use_tavily=True)
        assert isinstance(jd, JobDescription)
        assert jd.role == "Frontend Engineer"
        assert "React" in jd.required_skills
        assert jd.experience_years == 3


def test_fetch_live_job_description_tavily_mock():
    """
    Hermetically mock Tavily live job discovery response and verify job description extraction.
    """
    mock_jobs = [
        {
            "title": "Senior React Developer",
            "description": "5+ years building Next.js apps with TypeScript and Tailwind CSS.",
            "company": "Acme Corp",
            "location": "Remote"
        }
    ]
    with patch("app.services.job_desc_api.get_tavily_service") as mock_get_svc:
        mock_svc = MagicMock()
        mock_svc.is_available = True
        mock_svc.search_live_jobs.return_value = mock_jobs
        mock_get_svc.return_value = mock_svc

        with patch("app.services.job_desc_api.map_raw_job_to_jd") as mock_mapper:
            mock_mapper.return_value = JobDescription(
                role="Senior React Developer",
                required_skills=["React", "Next.js", "TypeScript"],
                experience_years=5,
                raw_text="5+ years building Next.js apps",
                company_name="Acme Corp",
                location="Remote"
            )
            jd = fetch_live_job_description(query="React Developer", use_tavily=True)
            assert jd.role == "Senior React Developer"
            assert jd.company_name == "Acme Corp"
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
