"""
Task 10.2 - Candidate Comparison Table Node
Generates a side-by-side markdown comparison table of candidates.
"""
import re
from typing import List, Optional
from app.graph.state import RecruitState
from app.schemas.candidate_schema import Candidate


def _resolve_candidates_from_query(query: str, candidates: List[Candidate]) -> List[Candidate]:
    """
    Extracts candidate names from the query and returns matching candidates.
    Falls back to the full list if no names are found.
    """
    q = query.lower()
    matched = []

    for candidate in candidates:
        first_name = candidate.name.split()[0].lower()
        full_name = candidate.name.lower()
        if re.search(rf"\b{re.escape(first_name)}\b", q) or re.search(rf"\b{re.escape(full_name)}\b", q):
            matched.append(candidate)

    return matched if matched else candidates


def compare_node(state: RecruitState) -> dict:
    """
    Candidate Comparison Node.
    Generates a side-by-side markdown comparison table of the shortlisted candidates
    (or named candidates from the user query).
    Compares: Name, Match Score, Matched Skills, Gaps, Experience.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""

    # Prefer last_shortlist; fall back to all resumes
    candidates: List[Candidate] = state.get("last_shortlist") or state.get("resumes", [])

    if not candidates:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": (
                    "No candidates available to compare. "
                    "Please screen candidates first or load resumes."
                )
            }]
        }

    # If user named specific candidates, filter to those
    selected = _resolve_candidates_from_query(user_msg, candidates)

    # Build markdown table
    table_lines = [
        "### 📊 Candidate Comparison Table\n",
        "| # | Name | Match Score | Matched Skills | Skill Gaps | Experience |",
        "|---|------|------------|----------------|------------|------------|"
    ]

    for idx, c in enumerate(selected, 1):
        score = f"{c.match_score:.0f}/100" if c.match_score is not None else "N/A"
        skills = ", ".join(c.matched_skills) if c.matched_skills else "—"
        gaps = ", ".join(c.gaps) if c.gaps else "—"
        # Get experience_years from candidate's model property (set by mismatch_analyzer)
        exp_years = c.experience_years
        experience = f"{exp_years:.1f} yrs" if exp_years is not None else "N/A"

        table_lines.append(
            f"| {idx} | **{c.name}** | {score} | {skills} | {gaps} | {experience} |"
        )

    comparison_md = "\n".join(table_lines)

    # Add a brief summary
    if len(selected) > 1 and any(c.match_score is not None for c in selected):
        best = max(selected, key=lambda c: c.match_score or 0.0)
        comparison_md += f"\n\n> 🏆 **Top Candidate**: **{best.name}** with a score of **{best.match_score:.0f}/100**."

    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": comparison_md
        }]
    }
