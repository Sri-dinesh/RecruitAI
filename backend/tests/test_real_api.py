import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

import pytest
from unittest.mock import patch
from app.services.job_desc_api import fetch_live_job_description, get_mock_jd
from app.services.resume_api import parse_resume_via_api, get_mock_parsed_resume
from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate

def test_fetch_live_job_description_fallback():
    jd = fetch_live_job_description(query="Frontend React Developer")
    assert isinstance(jd, JobDescription)
    assert jd.role == "Frontend Engineer"
    assert "React" in jd.required_skills
    assert jd.experience_years == 3

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
