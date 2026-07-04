import pytest
from unittest.mock import patch
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
    with patch("app.services.mismatch_analyzer.call_llm", return_value=('{"experience_years": 7.0}', "mock", 0.1)):
        exp = extract_candidate_experience(candidate)
        assert exp == 7.0
        assert candidate.experience_years == exp

def test_analyze_experience_mismatch():
    # Pass experience_years directly to Candidate Pydantic objects to bypass LLM extraction caching
    candidates = [
        Candidate(candidate_id="c1", name="A", raw_text="2 years of developer experience", experience_years=2.0),
        Candidate(candidate_id="c2", name="B", raw_text="3 years of developer experience", experience_years=3.0),
        Candidate(candidate_id="c3", name="C", raw_text="8 years of developer experience", experience_years=8.0)
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
    with patch("app.services.mismatch_analyzer.call_llm", return_value=('{"suggestions": ["Add salary range"]}', "mock", 0.1)):
        suggestions = suggest_jd_improvements(jd_text)
        assert isinstance(suggestions, list)
        assert len(suggestions) > 0
        assert "Add salary range" in suggestions
