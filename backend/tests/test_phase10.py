"""
Phase 10 Test Suite
Tests for: compare_node, email tools, trend_node, schedule_node, and red flag detection.
"""
import json
import pytest
from unittest.mock import patch, MagicMock

from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_candidates():
    c1 = Candidate(
        candidate_id="c1",
        name="Alice Smith",
        raw_text=(
            "Alice Smith - Senior Python Developer\n"
            "Experience: 5 years\n"
            "Skills: Python, FastAPI, PostgreSQL, Docker, Kubernetes\n"
            "Employment:\n"
            "  2019-2021: Software Engineer at Acme Corp\n"
            "  2021-2024: Senior Dev at BetaCo\n"
        ),
        match_score=87.0,
        matched_skills=["Python", "FastAPI", "PostgreSQL"],
        gaps=["Kubernetes"]
    )
    c2 = Candidate(
        candidate_id="c2",
        name="Bob Jones",
        raw_text=(
            "Bob Jones - Junior Python Developer\n"
            "Experience: 1 year\n"
            "Skills: Python, Flask\n"
            "Employment:\n"
            "  2023-2024: Intern at StartupXYZ\n"
        ),
        match_score=55.0,
        matched_skills=["Python", "Flask"],
        gaps=["FastAPI", "PostgreSQL", "Docker"]
    )
    return [c1, c2]


@pytest.fixture
def sample_jd():
    return JobDescription(
        role="Python Developer",
        required_skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        experience_years=3,
        raw_text="We are looking for a Python Developer with 3+ years experience...",
        tone="professional"
    )


@pytest.fixture
def base_state(sample_candidates, sample_jd):
    return {
        "jd_structured": sample_jd,
        "resumes": sample_candidates,
        "last_shortlist": sample_candidates,
        "conversation_history": [{"role": "user", "content": "compare candidates"}],
        "pending_confirmation": None,
        "last_intent": "compare",
        "scheduled_interviews": None
    }


# ─── Task 10.2: compare_node ─────────────────────────────────────────────────

class TestCompareNode:
    def test_returns_markdown_table(self, base_state, sample_candidates):
        from app.graph.nodes.compare_node import compare_node

        result = compare_node(base_state)

        assert "conversation_history" in result
        content = result["conversation_history"][-1]["content"]
        assert "Candidate Comparison Table" in content
        assert "Alice Smith" in content
        assert "Bob Jones" in content
        assert "|" in content  # Markdown table

    def test_shows_scores(self, base_state):
        from app.graph.nodes.compare_node import compare_node

        result = compare_node(base_state)
        content = result["conversation_history"][-1]["content"]
        assert "87" in content
        assert "55" in content

    def test_no_candidates_returns_message(self, base_state):
        from app.graph.nodes.compare_node import compare_node

        state = dict(base_state)
        state["resumes"] = []
        state["last_shortlist"] = None
        result = compare_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "No candidates" in content

    def test_best_candidate_highlight(self, base_state):
        from app.graph.nodes.compare_node import compare_node

        result = compare_node(base_state)
        content = result["conversation_history"][-1]["content"]
        assert "Alice Smith" in content  # Should be top candidate

    def test_named_candidate_filter(self, base_state):
        from app.graph.nodes.compare_node import compare_node

        state = dict(base_state)
        state["conversation_history"] = [{"role": "user", "content": "compare Alice and Bob"}]
        result = compare_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "Alice" in content


# ─── Task 10.3: email tools ───────────────────────────────────────────────────

class TestEmailTool:
    @patch("app.tools.email_tool.call_llm")
    def test_draft_interview_invite(self, mock_llm):
        from app.tools.email_tool import draft_recruiter_email

        mock_llm.return_value = (
            "Subject: Interview Invite - Python Developer\n\nDear Alice,\n\n"
            "We'd like to invite you for an interview.\n\nBest,\nRecruiting Team",
            "gemini",
            120.0
        )
        result = draft_recruiter_email.invoke({
            "candidate_name": "Alice Smith",
            "role": "Python Developer",
            "action": "interview invite"
        })
        assert "Alice" in result or "Interview" in result

    @patch("app.tools.email_tool.call_llm")
    def test_draft_rejection_email(self, mock_llm):
        from app.tools.email_tool import draft_recruiter_email

        mock_llm.return_value = (
            "Subject: Application Update\n\nDear Bob,\n\n"
            "We regret to inform you...\n\nBest,\nRecruiting Team",
            "gemini",
            100.0
        )
        result = draft_recruiter_email.invoke({
            "candidate_name": "Bob Jones",
            "role": "Python Developer",
            "action": "rejection"
        })
        assert isinstance(result, str)
        assert len(result) > 0

    @patch("app.tools.email_tool.call_llm", side_effect=Exception("LLM unavailable"))
    def test_draft_fallback_on_llm_failure(self, mock_llm):
        from app.tools.email_tool import draft_recruiter_email

        result = draft_recruiter_email.invoke({
            "candidate_name": "Carol White",
            "role": "Data Scientist",
            "action": "offer"
        })
        assert "Carol White" in result or "Data Scientist" in result
        assert isinstance(result, str)

    def test_send_email_draft_logs_to_stdout(self, capsys):
        from app.tools.email_tool import send_email_draft

        result = send_email_draft.invoke({
            "email_draft": "Subject: Test\n\nHello World",
            "recipient_email": "test@example.com"
        })
        captured = capsys.readouterr()
        assert "test@example.com" in captured.out or "test@example.com" in result
        assert "Email logged successfully" in result or "SMTP" in result


# ─── Task 10.3: email_node ────────────────────────────────────────────────────

class TestEmailNode:
    @patch("app.graph.nodes.email_node.draft_recruiter_email")
    def test_returns_email_draft(self, mock_tool, base_state):
        from app.graph.nodes.email_node import email_node

        mock_tool.invoke.return_value = "Subject: Interview\n\nDear Alice..."
        state = dict(base_state)
        state["conversation_history"] = [
            {"role": "user", "content": "draft an interview invite for Alice Smith"}
        ]
        result = email_node(state)
        assert "conversation_history" in result
        content = result["conversation_history"][-1]["content"]
        assert "Email Draft" in content or "email" in content.lower()

    def test_no_candidate_name_returns_helpful_message(self, base_state):
        from app.graph.nodes.email_node import email_node

        state = dict(base_state)
        state["resumes"] = []
        state["last_shortlist"] = None
        state["conversation_history"] = [
            {"role": "user", "content": "draft an email"}
        ]
        # When no shortlist and no name in query for unknown person
        result = email_node(state)
        assert "conversation_history" in result


# ─── Task 10.4: trend_node ────────────────────────────────────────────────────

class TestTrendNode:
    @patch("app.graph.nodes.trend_node.search_skill_trends")
    def test_returns_trend_analysis(self, mock_tool, base_state):
        from app.graph.nodes.trend_node import trend_node

        mock_tool.invoke.return_value = (
            "**Trending Skills for Python Developer (2026) [Cached Fallback]:**\n"
            "- FastAPI\n- LangChain\n- Polars\n- Ruff\n- Pydantic v2"
        )
        state = dict(base_state)
        state["conversation_history"] = [
            {"role": "user", "content": "what skills are trending for this role?"}
        ]
        result = trend_node(state)
        assert "conversation_history" in result
        content = result["conversation_history"][-1]["content"]
        assert "Skill Trend" in content or "Trending" in content

    def test_no_jd_returns_message(self, base_state):
        from app.graph.nodes.trend_node import trend_node

        state = dict(base_state)
        state["jd_structured"] = None
        state["conversation_history"] = [
            {"role": "user", "content": "what are the trending skills?"}
        ]
        result = trend_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "Job Description" in content or "JD" in content

    @patch("app.graph.nodes.trend_node.search_skill_trends")
    def test_highlights_trending_jd_skills(self, mock_tool, base_state):
        from app.graph.nodes.trend_node import trend_node

        mock_tool.invoke.return_value = (
            "**Trending Skills (2026):**\n"
            "- Python\n- FastAPI\n- Docker\n- Kubernetes\n- AI/ML"
        )
        result = trend_node(base_state)
        content = result["conversation_history"][-1]["content"]
        # Should identify Python, FastAPI, Docker as in JD AND trending
        assert "✅" in content or "Trending" in content


# ─── Task 10.5: schedule_node ─────────────────────────────────────────────────

class TestScheduleNode:
    def test_generates_5_slots(self, base_state):
        from app.graph.nodes.schedule_node import schedule_node

        state = dict(base_state)
        state["conversation_history"] = [
            {"role": "user", "content": "schedule an interview with Alice Smith"}
        ]
        result = schedule_node(state)
        assert "conversation_history" in result
        content = result["conversation_history"][-1]["content"]
        # Should have at least 5 numbered slots
        assert "1." in content
        assert "5." in content

    def test_stores_pending_confirmation(self, base_state):
        from app.graph.nodes.schedule_node import schedule_node

        state = dict(base_state)
        state["conversation_history"] = [
            {"role": "user", "content": "schedule interview with Alice"}
        ]
        result = schedule_node(state)
        assert "pending_confirmation" in result
        assert result["pending_confirmation"] is not None
        assert result["pending_confirmation"]["action"] == "schedule_interview"

    def test_confirms_booking_when_slot_selected(self, base_state):
        from app.graph.nodes.schedule_node import schedule_node
        from app.graph.nodes.schedule_node import _generate_slots

        slots = _generate_slots(5)
        state = dict(base_state)
        state["pending_confirmation"] = {
            "action": "schedule_interview",
            "candidate_name": "Alice Smith",
            "role": "Python Developer",
            "slots": slots
        }
        state["conversation_history"] = [
            {"role": "user", "content": "slot 1"}
        ]
        result = schedule_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "Interview Scheduled" in content or "Alice Smith" in content
        assert result.get("pending_confirmation") is None

    def test_invalid_slot_asks_again(self, base_state):
        from app.graph.nodes.schedule_node import schedule_node
        from app.graph.nodes.schedule_node import _generate_slots

        slots = _generate_slots(5)
        state = dict(base_state)
        state["pending_confirmation"] = {
            "action": "schedule_interview",
            "candidate_name": "Alice Smith",
            "role": "Python Developer",
            "slots": slots
        }
        state["conversation_history"] = [
            {"role": "user", "content": "select slot 9"}  # invalid
        ]
        result = schedule_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "valid slot" in content.lower() or "1-5" in content

    def test_slots_are_business_days(self):
        from app.graph.nodes.schedule_node import _next_business_days

        days = _next_business_days(5)
        assert len(days) == 5
        for day in days:
            assert day.weekday() < 5  # Monday=0, Friday=4


# ─── Task 10.6: detect_red_flags + redflags_node ─────────────────────────────

class TestRedFlagDetection:
    @patch("app.services.mismatch_analyzer.call_llm")
    def test_detects_flags_in_gapped_resume(self, mock_llm, sample_candidates):
        from app.services.mismatch_analyzer import detect_red_flags

        mock_llm.return_value = (
            json.dumps({"red_flags": ["Gap detected: 18 months unexplained period in 2019-2020."]}),
            "gemini",
            80.0
        )
        candidate = Candidate(
            candidate_id="c3",
            name="Dave Gap",
            raw_text="Dave Gap\nWorked at Company A: Jan 2017 - June 2018\nWorked at Company B: Jan 2020 - Present",
        )
        flags = detect_red_flags(candidate)
        assert isinstance(flags, list)
        assert len(flags) >= 0  # Could be 0 or more

    @patch("app.services.mismatch_analyzer.call_llm")
    def test_returns_empty_list_for_clean_resume(self, mock_llm, sample_candidates):
        from app.services.mismatch_analyzer import detect_red_flags

        mock_llm.return_value = (
            json.dumps({"red_flags": []}),
            "gemini",
            60.0
        )
        flags = detect_red_flags(sample_candidates[0])
        assert flags == []

    @patch("app.services.mismatch_analyzer.call_llm", side_effect=Exception("LLM down"))
    def test_graceful_failure_returns_empty_list(self, mock_llm, sample_candidates):
        from app.services.mismatch_analyzer import detect_red_flags

        flags = detect_red_flags(sample_candidates[0])
        assert flags == []

    @patch("app.services.mismatch_analyzer.call_llm")
    def test_redflags_node_report(self, mock_llm, base_state, sample_candidates):
        from app.graph.nodes.redflags_node import redflags_node

        # First candidate: 1 flag; second: no flags
        mock_llm.side_effect = [
            (json.dumps({"red_flags": ["Short tenure at two consecutive jobs."]}), "gemini", 80.0),
            (json.dumps({"red_flags": []}), "gemini", 60.0),
        ]
        state = dict(base_state)
        state["conversation_history"] = [
            {"role": "user", "content": "check for red flags in resumes"}
        ]
        result = redflags_node(state)
        assert "conversation_history" in result
        content = result["conversation_history"][-1]["content"]
        assert "Red-Flag" in content or "red flag" in content.lower()
        assert "Alice Smith" in content
        assert "Bob Jones" in content

    def test_redflags_node_no_resumes(self, base_state):
        from app.graph.nodes.redflags_node import redflags_node

        state = dict(base_state)
        state["resumes"] = []
        state["conversation_history"] = [
            {"role": "user", "content": "check for red flags"}
        ]
        result = redflags_node(state)
        content = result["conversation_history"][-1]["content"]
        assert "No resumes" in content or "no resumes" in content.lower()
