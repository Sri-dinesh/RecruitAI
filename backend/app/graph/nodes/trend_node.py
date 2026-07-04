"""
Task 10.4 - Skill Trend Analyzer Node
Calls skill_trend_tool, compares trending skills with JD required_skills,
and returns a formatted markdown analysis.
"""
from typing import List
from app.graph.state import RecruitState
from app.tools.skill_trend_tool import search_skill_trends


def _extract_skills_from_trend_text(trend_text: str) -> List[str]:
    """
    Parses trending skill names from the tool output text.
    Looks for bullet point list items.
    """
    skills = []
    for line in trend_text.splitlines():
        line = line.strip()
        if line.startswith("- "):
            # Remove markdown bold markers and extract skill name
            skill = line[2:].strip()
            # If it has a colon (from Tavily results), take the part before the colon
            if "**:" in skill:
                skill = skill.split("**:")[0].replace("**", "").strip()
            elif "**" in skill:
                skill = skill.replace("**", "").strip()
            if skill:
                skills.append(skill)
    return skills


def trend_node(state: RecruitState) -> dict:
    """
    Skill Trend Analyzer Node.
    Calls Tavily (via skill_trend_tool) to get trending skills for the JD role.
    Compares trending skills with JD required_skills:
    - Skills in JD that are ALSO trending (great alignment)
    - Trending skills MISSING from JD (gaps to consider adding)
    Returns a formatted markdown analysis.
    """
    history = state.get("conversation_history", [])
    jd = state.get("jd_structured")

    if not jd:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": (
                    "I need a Job Description loaded first before I can analyze skill trends. "
                    "Please load a JD first."
                )
            }]
        }

    role = jd.role
    jd_required_skills = [s.lower() for s in (jd.required_skills or [])]

    # Call the LangChain tool
    try:
        trend_text = search_skill_trends.invoke({"role": role})
    except Exception as e:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": f"Failed to fetch skill trends: {e}"
            }]
        }

    # Extract trending skills from output
    trending_skills = _extract_skills_from_trend_text(trend_text)
    trending_lower = [s.lower() for s in trending_skills]

    # Compare with JD required skills
    in_jd_and_trending = []
    trending_not_in_jd = []

    for skill_lower, skill_display in zip(trending_lower, trending_skills):
        # Check if trending skill appears in any JD required skill
        matched = any(
            skill_lower in jd_skill or jd_skill in skill_lower
            for jd_skill in jd_required_skills
        )
        if matched:
            in_jd_and_trending.append(skill_display)
        else:
            trending_not_in_jd.append(skill_display)

    # Also flag JD skills not in trending (legacy/niche skills)
    jd_skills_not_trending = []
    for jd_skill_display, jd_skill_lower in zip(jd.required_skills, jd_required_skills):
        matched = any(
            jd_skill_lower in t_lower or t_lower in jd_skill_lower
            for t_lower in trending_lower
        )
        if not matched:
            jd_skills_not_trending.append(jd_skill_display)

    # Format report
    lines = [
        f"### 📈 Skill Trend Analysis for **{role}**\n",
        f"*Comparing your JD's required skills against 2026 market trends.*\n",
    ]

    lines.append("---\n")
    lines.append("#### 🔥 Trending Skills in Your JD (Market-Aligned)")
    if in_jd_and_trending:
        for s in in_jd_and_trending:
            lines.append(f"- ✅ **{s}**")
    else:
        lines.append("- *None of the JD skills directly match top trending skills.*")

    lines.append("\n#### 🆕 Trending Skills NOT in Your JD (Consider Adding)")
    if trending_not_in_jd:
        for s in trending_not_in_jd[:8]:  # Top 8 suggestions
            lines.append(f"- 💡 {s}")
    else:
        lines.append("- *Your JD already covers the trending skill landscape well!*")

    lines.append("\n#### 🗓️ JD Skills Not in Top Trends (Niche/Legacy)")
    if jd_skills_not_trending:
        for s in jd_skills_not_trending:
            lines.append(f"- ⚠️ {s}")
    else:
        lines.append("- *All JD skills are aligned with current market trends.*")

    lines.append("\n---")
    lines.append("\n**Raw Trend Data:**")
    lines.append(trend_text)

    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": "\n".join(lines)
        }]
    }
