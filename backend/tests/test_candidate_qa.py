import pytest
from unittest.mock import patch
from app.graph.nodes.candidate_qa_node import candidate_qa_node
from app.graph.router_node import rule_based_classify
from app.schemas.candidate_schema import Candidate

from app.graph.router_node import resolve_candidate_reference
from app.graph.builder import supervisor_agent_node

def test_router_query_candidate_classification():
    assert rule_based_classify("what are the skills of santhi sridinesh ?") == ("query_candidate", 1.0)
    assert rule_based_classify("what are the project of sridinesh ?") == ("query_candidate", 1.0)
    assert rule_based_classify("tell me about Alice") == ("query_candidate", 1.0)

def test_resolve_candidate_reference_last_name():
    candidate = Candidate(candidate_id="c1", name="Santhi Sridinesh", raw_text="Santhi Sridinesh text")
    state = {"resumes": [candidate]}
    
    assert resolve_candidate_reference("for sridinesh", state) == "c1"
    assert resolve_candidate_reference("create interview prep qns for sridinesh", state) == "c1"
    assert resolve_candidate_reference("santhi sridinesh", state) == "c1"

def test_supervisor_followup_context():
    candidate = Candidate(candidate_id="c1", name="Santhi Sridinesh", raw_text="Santhi Sridinesh text")
    state = {
        "conversation_history": [
            {"role": "user", "content": "generate interview prep questions for the job description"},
            {"role": "assistant", "content": "Which candidate would you like to generate interview questions for? Please specify a name or 'the top candidate'."},
            {"role": "user", "content": "for sridinesh"}
        ],
        "resumes": [candidate]
    }
    
    res = supervisor_agent_node(state)
    assert res["last_intent"] == "interview_questions"

@patch("app.graph.nodes.candidate_qa_node.call_llm")
def test_candidate_qa_node_execution(mock_llm):
    mock_llm.return_value = (
        "Santhi Sridinesh has expertise in Python, React, Next.js, and RAG architectures.",
        "gemini-flash",
        120.0
    )
    
    candidate = Candidate(
        candidate_id="cand_123",
        name="Santhi Sridinesh",
        headline="Senior Full Stack Engineer",
        skills=["Python", "React", "Next.js", "FastAPI"],
        raw_text="Santhi Sridinesh is a Senior Full Stack Engineer with projects in RAG AI systems."
    )
    
    state = {
        "conversation_history": [
            {"role": "user", "content": "what are the skills of santhi sridinesh ?"}
        ],
        "resumes": [candidate],
        "jd_structured": None
    }
    
    res = candidate_qa_node(state)
    assert res["last_intent"] == "query_candidate"
    assert len(res["conversation_history"]) == 2
    assert "Santhi Sridinesh has expertise in Python" in res["conversation_history"][-1]["content"]
