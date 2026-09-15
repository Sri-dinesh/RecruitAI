import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.services.matching_service import (
    evaluate_candidate_against_jd, 
    match_skills_against_text, 
    calculate_5pillar_score
)
from app.services.ingestion_service import ingest_candidate_object, save_job_description
from app.core.auth import get_current_user_id

client = TestClient(app)
TEST_USER_ID = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"

@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    yield
    vs._use_local_sqlite = old_flag
    app.dependency_overrides = {}


def test_matching_service_unit():
    jd = JobDescription(
        role="Senior Backend Engineer",
        required_skills=["5+ years of Python", "FastAPI / Django", "PostgreSQL", "Docker and Kubernetes", "AWS"],
        preferred_skills=["Redis", "GraphQL"],
        experience_years=5,
        raw_text="Looking for a Senior Backend Engineer proficient in Python, FastAPI, PostgreSQL, and Docker."
    )

    candidate = Candidate(
        candidate_id="cand-1",
        name="Alex Mercer",
        email="alex@example.com",
        experience_years=6.0,
        skills=["Python", "FastAPI", "PostgreSQL", "Docker", "Redis"],
        raw_text="Senior Developer with 6 years experience architecting scalable microservices using Python, FastAPI, Docker, and PostgreSQL on AWS cloud.",
        education=["B.S. Computer Science"]
    )

    scored = evaluate_candidate_against_jd(candidate, jd)

    # Assert 5-pillar match score is computed accurately
    assert scored.match_score is not None
    assert 70.0 <= scored.match_score <= 98.0

    # Assert matched skills are properly normalized
    assert "Python" in scored.matched_skills or "Fastapi" in scored.matched_skills
    assert "Postgresql" in scored.matched_skills or "Docker" in scored.matched_skills

    # Assert gaps identified (Kubernetes was not in candidate skills/text)
    assert any("Kubernetes" in g for g in scored.gaps)


def test_jd_upload_scores_existing_candidates():
    # 1. Create campaign
    create_res = client.post("/api/sessions")
    assert create_res.status_code == 200
    session_id = create_res.json()["id"]

    # 2. Ingest candidate before JD
    candidate = Candidate(
        name="Diana Prince",
        email="diana@amazon.com",
        skills=["React", "TypeScript", "Next.js", "Tailwind CSS"],
        experience_years=4.0,
        raw_text="Frontend engineer with 4 years building responsive web apps with React, TypeScript, and Next.js."
    )
    ingest_candidate_object(candidate, user_id=TEST_USER_ID, session_id=session_id)

    # 3. Now upload JD to this campaign
    jd = JobDescription(
        role="Senior Frontend Architect",
        required_skills=["React", "TypeScript", "Next.js", "GraphQL"],
        experience_years=4,
        raw_text="Hiring a Senior Frontend Architect with React, TypeScript, and GraphQL expertise."
    )
    save_job_description(jd, user_id=TEST_USER_ID, session_id=session_id)

    # 4. Fetch session details and verify candidate has match_score, matched_skills, and gaps
    res = client.get(f"/api/sessions/{session_id}")
    assert res.status_code == 200
    data = res.json()
    assert len(data["resumes"]) == 1

    cand_data = data["resumes"][0]
    assert cand_data["name"] == "Diana Prince"
    assert cand_data["match_score"] is not None
    assert cand_data["match_score"] > 60.0
    assert len(cand_data["matched_skills"]) > 0
    assert any("React" in s or "Typescript" in s for s in cand_data["matched_skills"])
    # GraphQL should be in gaps
    assert any("Graphql" in g for g in cand_data["gaps"])


def test_candidate_upload_auto_scores_against_existing_jd():
    # 1. Create campaign
    create_res = client.post("/api/sessions")
    assert create_res.status_code == 200
    session_id = create_res.json()["id"]

    # 2. Save JD first
    jd = JobDescription(
        role="DevOps Platform Engineer",
        required_skills=["Kubernetes", "Terraform", "AWS", "CI/CD"],
        experience_years=3,
        raw_text="Seeking DevOps Engineer with Kubernetes, Terraform, and AWS CI/CD pipelines."
    )
    save_job_description(jd, user_id=TEST_USER_ID, session_id=session_id)

    # 3. Now ingest candidate
    cand = Candidate(
        name="Bruce Wayne",
        email="bruce@wayne.corp",
        skills=["Kubernetes", "AWS", "Docker", "Python"],
        experience_years=5.0,
        raw_text="Cloud architect with 5 years managing AWS Kubernetes clusters and infrastructure automation."
    )
    ingested = ingest_candidate_object(cand, user_id=TEST_USER_ID, session_id=session_id)

    # Ingested candidate object must have score immediately populated
    assert ingested.match_score is not None
    assert ingested.match_score >= 60.0
    assert len(ingested.matched_skills) >= 2

    # 4. Session details must also reflect the scores, matched skills, and gaps
    res = client.get(f"/api/sessions/{session_id}")
    assert res.status_code == 200
    cand_data = res.json()["resumes"][0]
    assert cand_data["match_score"] == ingested.match_score
    assert len(cand_data["matched_skills"]) >= 2
    assert "Terraform" in cand_data["gaps"] or "Ci/Cd" in cand_data["gaps"]
