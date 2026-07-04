import pytest
from app.graph.state import RecruitState
from app.schemas.candidate_schema import Candidate
from app.graph.nodes.hitl_confirm_node import hitl_confirm_node

def test_hitl_flow():
    # 1. Trigger initial confirmation prompt
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [
            Candidate(candidate_id="alice", name="Alice Smith", raw_text="..."),
            Candidate(candidate_id="bob", name="Bob Jones", raw_text="...")
        ],
        "conversation_history": [{"role": "user", "content": "finalize the shortlist"}],
        "last_shortlist": [
            Candidate(candidate_id="alice", name="Alice Smith", raw_text="..."),
            Candidate(candidate_id="bob", name="Bob Jones", raw_text="...")
        ],
        "pending_confirmation": None,
        "last_intent": None
    }
    
    result = hitl_confirm_node(state)
    assert result["pending_confirmation"] is not None
    assert result["pending_confirmation"]["action"] == "finalize_shortlist"
    assert len(result["pending_confirmation"]["payload"]) == 2
    assert "Confirm? (yes/no/edit)" in result["conversation_history"][-1]["content"]
    
    # 2. Simulate User saying "remove bob" to edit the shortlist
    state_edit = {
        **state,
        "pending_confirmation": result["pending_confirmation"],
        "conversation_history": [{"role": "user", "content": "remove bob"}]
    }
    result_edit = hitl_confirm_node(state_edit)
    assert len(result_edit["pending_confirmation"]["payload"]) == 1
    assert result_edit["pending_confirmation"]["payload"][0] == "alice"
    assert "Alice Smith" in result_edit["conversation_history"][-1]["content"]
    assert "Bob Jones" not in result_edit["conversation_history"][-1]["content"]
    
    # 3. Simulate User confirming with "yes"
    state_yes = {
        **state_edit,
        "last_shortlist": result_edit["last_shortlist"],
        "pending_confirmation": result_edit["pending_confirmation"],
        "conversation_history": [{"role": "user", "content": "yes"}]
    }
    result_yes = hitl_confirm_node(state_yes)
    assert result_yes["pending_confirmation"] is None
    assert "Shortlist Finalized" in result_yes["conversation_history"][-1]["content"]
    print("HITL unit tests run and pass successfully.")
