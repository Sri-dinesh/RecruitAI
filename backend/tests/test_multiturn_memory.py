"""
Multiturn conversational memory regression tests.

Covers the reported flow: discuss a candidate, then say "send mail" /
"send him an invite" — the agent must NOT ask back "for who?".
"""
from unittest.mock import patch, MagicMock
from app.graph.builder import supervisor_agent_node
from app.graph.nodes.email_node import email_node
from app.graph.router_node import (
    resolve_candidate_with_memory,
    resolve_candidates_with_memory,
)
from app.schemas.candidate_schema import Candidate


def _cands():
    return [
        Candidate(candidate_id="c-alex", name="Alex Morgan", raw_text="Alex Morgan python backend"),
        Candidate(candidate_id="c-bob", name="Bob Carter", raw_text="Bob Carter frontend react"),
    ]


def _hist(*msgs):
    return [{"role": r, "content": c} for r, c in msgs]


def test_pronoun_resolves_to_last_discussed_candidate():
    state = {
        "resumes": _cands(),
        "conversation_history": _hist(
            ("user", "what are the skills of Alex Morgan?"),
            ("assistant", "Alex Morgan has Python backend skills."),
            ("user", "send him an interview invite"),
        ),
    }
    assert resolve_candidate_with_memory("send him an interview invite", state, intent="email") == "c-alex"


def test_bare_followup_inherits_memory_for_entity_intent():
    state = {
        "resumes": _cands(),
        "conversation_history": _hist(
            ("user", "tell me about Bob Carter"),
            ("assistant", "Bob Carter is a frontend engineer."),
            ("user", "send mail"),
        ),
    }
    assert resolve_candidate_with_memory("send mail", state, intent="email") == "c-bob"


def test_role_level_intent_does_not_inherit():
    state = {
        "resumes": _cands(),
        "active_candidate_id": "c-alex",
        "conversation_history": _hist(
            ("user", "tell me about Alex Morgan"),
            ("assistant", "Alex details."),
            ("user", "what is the salary range for this role?"),
        ),
    }
    assert resolve_candidate_with_memory(
        "what is the salary range for this role?", state, intent="salary"
    ) is None


def test_explicit_name_overrides_memory():
    state = {
        "resumes": _cands(),
        "active_candidate_id": "c-alex",
        "conversation_history": _hist(
            ("user", "tell me about Alex Morgan"),
            ("assistant", "Alex details."),
            ("user", "draft an offer email for Bob Carter"),
        ),
    }
    assert resolve_candidate_with_memory(
        "draft an offer email for Bob Carter", state, intent="email"
    ) == "c-bob"


def test_multi_compare_then_mail_them():
    state = {
        "resumes": _cands(),
        "conversation_history": _hist(
            ("user", "compare Alex Morgan vs Bob Carter"),
            ("assistant", "Comparison table."),
            ("user", "mail them interview invites"),
        ),
    }
    ids = resolve_candidates_with_memory("mail them interview invites", state)
    assert set(ids) == {"c-alex", "c-bob"}


def test_supervisor_sets_memory_and_email_followup_keeps_it():
    cands = _cands()
    # Turn 1: QA about Alex -> supervisor pins memory to Alex.
    s1 = {
        "conversation_history": _hist(("user", "what are the skills of Alex Morgan?")),
        "resumes": cands,
    }
    r1 = supervisor_agent_node(s1)
    assert r1["active_candidate_id"] == "c-alex"

    # Turn 2: bare "send mail" with history -> still Alex, email intent.
    s2 = {
        "conversation_history": _hist(
            ("user", "what are the skills of Alex Morgan?"),
            ("assistant", "Alex Morgan has Python backend skills."),
            ("user", "send mail"),
        ),
        "resumes": cands,
    }
    r2 = supervisor_agent_node(s2)
    assert r2["active_candidate_id"] == "c-alex"
    assert r2["last_intent"] == "email"


def test_email_node_uses_memory_without_askback():
    cands = _cands()
    state = {
        "resumes": cands,
        "active_candidate_id": "c-alex",
        "active_candidate_ids": ["c-alex"],
        "conversation_history": _hist(
            ("user", "what are the skills of Alex Morgan?"),
            ("assistant", "Alex Morgan has Python backend skills."),
            ("user", "send mail"),
        ),
        "jd_structured": None,
    }
    tool = MagicMock()
    tool.invoke.return_value = "Subject: Interview - the position\n\nDear Alex,"
    with patch("app.graph.nodes.email_node.draft_recruiter_email", tool):
        out = email_node(state)
    content = out["conversation_history"][-1]["content"]
    assert "couldn't identify" not in content
    assert "Alex Morgan" in content
    tool.invoke.assert_called_once()
    assert tool.invoke.call_args[0][0]["candidate_name"] == "Alex Morgan"


def test_email_node_still_asks_back_with_no_memory():
    state = {
        "resumes": _cands(),
        "conversation_history": _hist(("user", "send mail")),
        "jd_structured": None,
    }
    out = email_node(state)
    assert "couldn't identify" in out["conversation_history"][-1]["content"]
