"""
Task 10.3 - Email Node
Extracts candidate name from the query, calls draft_recruiter_email tool,
and returns the email draft in conversation history.
"""
import re
from typing import Optional
from app.graph.state import RecruitState
from app.tools.email_tool import draft_recruiter_email


def _extract_candidate_name(query: str, state: RecruitState) -> Optional[str]:
    """
    Resolves the candidate name using conversational memory:
    explicit reference -> supervisor-resolved active_candidate_id ->
    legacy regex fallback.
    """
    from app.graph.router_node import resolve_candidate_with_memory

    resumes = state.get("resumes", []) or state.get("last_shortlist") or []

    # Supervisor already memory-resolved this turn; trust it first.
    active_id = state.get("active_candidate_id")
    if active_id:
        c = next((cand for cand in resumes if cand.candidate_id == active_id), None)
        if c:
            return c.name

    cid = resolve_candidate_with_memory(query, state, intent="email")
    if cid:
        c = next((cand for cand in resumes if cand.candidate_id == cid), None)
        if c:
            return c.name

    # Attempt regex extraction of any capitalized name pattern
    match = re.search(r"\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", query)
    if match:
        return match.group(1)

    return None


def _extract_action(query: str) -> str:
    """
    Extracts the action type from the query.
    Defaults to 'interview invite'.
    """
    q = query.lower()
    if any(kw in q for kw in ["reject", "decline", "not moving forward", "no"]):
        return "rejection"
    if any(kw in q for kw in ["offer", "hire", "accept"]):
        return "offer"
    return "interview invite"


def email_node(state: RecruitState) -> dict:
    """
    Email Drafter Node.
    Extracts candidate name and action from the user query,
    calls draft_recruiter_email tool, and returns the draft in conversation history.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""
    jd = state.get("jd_structured")

    # Resolve role
    role = jd.role if jd else "the position"

    # Resolve candidate name
    candidate_name = _extract_candidate_name(user_msg, state)
    if not candidate_name:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": (
                    "I couldn't identify a candidate to draft the email for. "
                    "Please mention the candidate's name (e.g. 'draft an interview invite email for Alice')."
                )
            }]
        }

    # Resolve action type
    action = _extract_action(user_msg)

    # Call the LangChain tool
    try:
        email_draft = draft_recruiter_email.invoke({
            "candidate_name": candidate_name,
            "role": role,
            "action": action
        })
    except Exception as e:
        email_draft = (
            f"Subject: {action.title()} - {role} Position\n\n"
            f"Dear {candidate_name},\n\n"
            f"Please note this is a fallback draft due to: {e}\n\n"
            f"Best regards,\nThe Recruiting Team"
        )

    response = (
        f"### ✉️ Email Draft: **{action.title()}** for **{candidate_name}**\n\n"
        f"```\n{email_draft}\n```\n\n"
        f"*Review and customize before sending.*"
    )

    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": response
        }]
    }
