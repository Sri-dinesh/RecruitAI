import pytest
from app.graph.state import RecruitState
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.graph.nodes.count_node import count_node
from app.graph.nodes.salary_node import salary_node
from app.graph.nodes.jd_rewrite_node import jd_rewrite_node
from app.graph.nodes.interview_qgen_node import interview_qgen_node

def test_count_node_empty():
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = count_node(state)
    assert "0" in result["conversation_history"][-1]["content"]

def test_count_node_populated():
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [Candidate(candidate_id="alice", name="Alice", raw_text="...")],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = count_node(state)
    assert "1" in result["conversation_history"][-1]["content"]

def test_salary_node_no_jd():
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [],
        "conversation_history": [{"role": "user", "content": "salary range"}],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = salary_node(state)
    assert "need a Job Description" in result["conversation_history"][-1]["content"]

def test_salary_node_fallback():
    # Verify it runs and uses fallback data if Tavily is inactive or times out
    state: RecruitState = {
        "jd_structured": JobDescription(role="Senior Full Stack Engineer", required_skills=["Python"], experience_years=5, raw_text="..."),
        "resumes": [],
        "conversation_history": [{"role": "user", "content": "salary in India"}],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = salary_node(state)
    content = result["conversation_history"][-1]["content"]
    assert "Salary Benchmark" in content
    assert "offline" in content.lower() or "live" in content.lower()

def test_rewrite_node_no_jd():
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = jd_rewrite_node(state)
    assert "need a JD loaded" in result["conversation_history"][-1]["content"]

def test_interview_node_no_resumes():
    state: RecruitState = {
        "jd_structured": JobDescription(role="Senior Full Stack Engineer", required_skills=["Python"], experience_years=5, raw_text="..."),
        "resumes": [],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    result = interview_qgen_node(state)
    assert "resumes" in result["conversation_history"][-1]["content"].lower()
