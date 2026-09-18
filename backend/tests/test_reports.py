import pytest
from app.services.report_generator import generate_recruitment_report
from fastapi.testclient import TestClient
from app.main import app

from app.core.auth import get_current_user_id

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    app.dependency_overrides[get_current_user_id] = lambda: "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    yield
    vs._use_local_sqlite = old_flag
    app.dependency_overrides = {}

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


def test_session_report_api_endpoint():
    # 1. Create a session
    sess_res = client.post("/api/sessions")
    assert sess_res.status_code == 200
    session_id = sess_res.json()["id"]

    # 2. Query the session PDF report download
    rep_res = client.get(f"/api/reports/session/{session_id}")
    assert rep_res.status_code == 200
    assert rep_res.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in rep_res.headers["content-disposition"]
    assert rep_res.content.startswith(b"%PDF-")


def test_comprehensive_executive_dossier_pdf():
    """Verifies that full executive dossier compiles with evaluations, interviews, and metrics."""
    jd = {
        "role": "Lead Architect",
        "required_skills": ["Python", "FastAPI", "Distributed Systems", "PostgreSQL"],
        "experience_years": 8,
        "tone": "collaborative",
        "summary": "Own core architecture and lead distributed engineering pods.",
    }
    candidates = [
        {
            "candidate_id": "cand-001",
            "name": "Sarah Connor",
            "match_score": 94,
            "status": "shortlisted",
            "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes"],
            "matched_skills": ["Python", "FastAPI", "PostgreSQL"],
            "gaps": ["Rust"],
        },
        {
            "candidate_id": "cand-002",
            "name": "John Doe",
            "match_score": 62,
            "status": "new",
            "skills": ["Python", "Django"],
            "matched_skills": ["Python"],
            "gaps": ["FastAPI", "Distributed Systems"],
        }
    ]
    evaluations = {
        "cand-001": {
            "tech_score": 5,
            "comm_score": 4,
            "notes": "Exceptional system design and clear technical communication.",
        }
    }
    scheduled_interviews = [
        {
            "candidate_name": "Sarah Connor",
            "slot": "2026-09-22 14:00 UTC",
            "booked_at": "2026-09-18T12:00:00Z",
        }
    ]
    questions = (
        "### System Architecture\n"
        "1. How do you design for zero-downtime database migrations with PostgreSQL?\n"
        "2. Explain your approach to distributed rate limiting.\n\n"
        "### Gap Probing\n"
        "- How would you evaluate Rust vs Go for high-throughput microservices?"
    )
    salary = "Market 75th percentile for Lead Architect is $180,000 - $220,000 USD."

    pdf_bytes = generate_recruitment_report(
        jd=jd,
        shortlist=candidates[:1],
        interview_questions=questions,
        salary_data=salary,
        candidates=candidates,
        evaluations=evaluations,
        scheduled_interviews=scheduled_interviews,
        is_blind_mode=False,
        session_title="Hiring: Lead Architect Requisition",
        recruiter_name="Chief People Officer",
    )

    assert pdf_bytes is not None
    assert pdf_bytes.startswith(b"%PDF-")
    # Comprehensive dossier must be substantial in length (>5KB)
    assert len(pdf_bytes) > 5000
