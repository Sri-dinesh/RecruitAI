import pytest
from app.services.report_generator import generate_recruitment_report
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_report_generator_raw():
    # Test ReportLab generator service
    jd = {
        "role": "Senior Full Stack Engineer",
        "required_skills": ["Python", "React", "AWS"],
        "experience_years": 5,
        "tone": "startup"
    }
    shortlist = [
        {"name": "Alice Smith", "match_score": 95, "matched_skills": ["Python", "React"], "gaps": ["AWS"]},
        {"name": "Bob Jones", "match_score": 55, "matched_skills": ["Python"], "gaps": ["React", "AWS"]}
    ]
    questions = "1. Why React?\n2. Tell us about AWS."
    salary = "Estimated benchmark is 1,200,000 - 3,000,000 INR per annum."
    
    pdf_bytes = generate_recruitment_report(jd, shortlist, questions, salary)
    assert pdf_bytes is not None
    assert len(pdf_bytes) > 0
    # A valid PDF must start with the PDF signature magic bytes
    assert pdf_bytes.startswith(b"%PDF-")

def test_report_api_endpoint():
    # Test FastAPI API endpoint
    payload = {
        "jd": {
            "role": "Senior Full Stack Engineer",
            "required_skills": ["Python", "React"],
            "experience_years": 5,
            "tone": "corporate"
        },
        "shortlist": [
            {"name": "Alice Smith", "match_score": 95, "matched_skills": ["Python", "React"], "gaps": []}
        ],
        "interview_questions": "1. Tell us about your Python projects.",
        "salary_data": "Benchmark salary is 1,500,000 INR."
    }
    response = client.post("/api/reports/generate", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment; filename=recruitment_report.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF-")
