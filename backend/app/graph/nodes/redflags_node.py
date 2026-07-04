"""
Task 10.6 - Resume Red-Flag Detector Node
Calls detect_red_flags for each candidate and generates a formatted report.
"""
from app.graph.state import RecruitState
from app.services.mismatch_analyzer import detect_red_flags


def redflags_node(state: RecruitState) -> dict:
    """
    Resume Red-Flag Detector Node.
    For each candidate in state.resumes, calls detect_red_flags (LLM-based).
    Returns a formatted report with ⚠️ flags or ✅ clean indicators per candidate.
    """
    history = state.get("conversation_history", [])
    resumes = state.get("resumes", [])

    if not resumes:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": (
                    "No resumes loaded yet. Please load candidate resumes before running "
                    "the red-flag detection."
                )
            }]
        }

    report_lines = [
        "### 🔍 Resume Red-Flag Detection Report\n",
        f"Analyzed **{len(resumes)}** candidate(s) for timeline gaps, "
        f"inconsistencies, and suspicious patterns.\n",
        "---\n"
    ]

    for candidate in resumes:
        try:
            flags = detect_red_flags(candidate)
        except Exception as e:
            flags = [f"Could not analyze due to error: {e}"]

        report_lines.append(f"#### 👤 {candidate.name}")

        if flags:
            report_lines.append(f"**Status:** ⚠️ {len([flag for flag in flags if flag])} potential issue(s) found\n")
            for flag in flags:
                report_lines.append(f"  - ⚠️ {flag}")
        else:
            report_lines.append("**Status:** ✅ No red flags detected\n")

        report_lines.append("")  # blank line separator

    report_lines.append("---")
    report_lines.append(
        "\n*Note: Red flags are LLM-generated suggestions. Always verify manually before action.*"
    )

    return {
        "resumes": resumes,
        "conversation_history": history + [{
            "role": "assistant",
            "content": "\n".join(report_lines)
        }]
    }
