from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate
from app.graph.state import RecruitState

def test_job_description_validation():
    jd = JobDescription(
        role="Software Engineer",
        required_skills=["Python", "React"],
        experience_years=3,
        raw_text="Job description text...",
        tone="professional"
    )
    assert jd.role == "Software Engineer"
    assert jd.experience_years == 3

def test_candidate_validation():
    candidate = Candidate(
        candidate_id="123",
        name="John Doe",
        raw_text="Resume text...",
        match_score=85.5,
        matched_skills=["Python"],
        gaps=["React"]
    )
    assert candidate.name == "John Doe"
    assert candidate.match_score == 85.5

def test_recruit_state():
    state: RecruitState = {
        "jd_structured": JobDescription(
            role="Software Engineer",
            required_skills=["Python"],
            experience_years=3,
            raw_text="Job description text..."
        ),
        "resumes": [
            Candidate(
                candidate_id="123",
                name="John Doe",
                raw_text="Resume text..."
            )
        ],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    assert state["jd_structured"].role == "Software Engineer"
    assert len(state["resumes"]) == 1
    print("All schema tests pass successfully.")
