import pytest
from app.schemas.candidate_schema import Candidate
from app.services.mismatch_analyzer import (
    extract_candidate_experience,
    analyze_experience_mismatch,
    suggest_jd_improvements
)

def test_extract_candidate_experience():
    candidate = Candidate(
        candidate_id="c1",
        name="John Doe",
        raw_text="Experienced engineer with 7 years of working with Python and cloud services."
    )
    exp = extract_candidate_experience(candidate)
    assert exp >= 5.0
    assert candidate.__dict__.get("experience_years") == exp

def test_analyze_experience_mismatch():
    candidates = [
        Candidate(candidate_id="c1", name="A", raw_text="2 years of developer experience"),
        Candidate(candidate_id="c2", name="B", raw_text="3 years of developer experience"),
        Candidate(candidate_id="c3", name="C", raw_text="8 years of developer experience")
    ]
    # JD asks for 5 years. 2 out of 3 candidates (66%) have < 5 years of experience.
    # This should trigger mismatch alert (> 50%).
    result = analyze_experience_mismatch(5, candidates)
    assert result["has_mismatch"] is True
    assert result["mismatch_percentage"] > 60.0
    assert "Experience Mismatch Alert" in result["message"]

def test_suggest_jd_improvements():
    # JD text missing salary and location details
    jd_text = "We are hiring a Senior Software Developer with expert Python and SQL skills."
    suggestions = suggest_jd_improvements(jd_text)
    assert isinstance(suggestions, list)
    assert len(suggestions) > 0
