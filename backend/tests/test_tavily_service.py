"""
Unit tests for enterprise TavilyService, tools, and web intelligence nodes.
Ensures 100% offline hermetic execution and validates caching, fallback, and live modes.
"""

import time
import pytest
from unittest.mock import MagicMock, patch

from app.services.tavily_service import (
    TavilyService,
    Citation,
    SalaryBenchmarkResult,
    SkillTrendResult,
    WebIntelResult,
    get_tavily_service
)
from app.tools.tavily_search import search_salary_data
from app.tools.skill_trend_tool import search_skill_trends
from app.graph.nodes.salary_node import salary_node
from app.graph.nodes.web_intel_node import web_intel_node
from app.schemas.jd_schema import JobDescription
from app.graph.state import RecruitState


@pytest.fixture(autouse=True)
def clean_tavily_cache():
    """Ensure clean cache before and after every test."""
    service = get_tavily_service()
    service.clear_cache()
    yield
    service.clear_cache()


class TestTavilyServiceCore:
    def test_singleton_instance(self):
        s1 = get_tavily_service()
        s2 = get_tavily_service()
        assert s1 is s2

    def test_ttl_cache_hit_and_expiration(self):
        service = get_tavily_service()
        # Set short TTL
        service._set_cache("test_key", "test_value", ttl_seconds=1)
        assert service._get_cache("test_key") == "test_value"

        # Wait for expiration
        time.sleep(1.1)
        assert service._get_cache("test_key") is None

    def test_cache_clear(self):
        service = get_tavily_service()
        service._set_cache("key1", "val1", ttl_seconds=60)
        service._set_cache("key2", "val2", ttl_seconds=60)
        service.clear_cache()
        assert service._get_cache("key1") is None
        assert service._get_cache("key2") is None


class TestSalaryBenchmarking:
    def test_offline_fallback_salary(self):
        service = get_tavily_service()
        with patch.object(service, "_client", None):
            result = service.get_salary_benchmark("Senior Full Stack Engineer", "India")
            assert isinstance(result, SalaryBenchmarkResult)
            assert result.is_live is False
            assert result.currency == "INR"
            assert result.min_salary is not None
            assert result.max_salary is not None
            assert result.median_salary is not None
            assert any("Entry / Associate" in k for k in result.experience_breakdown)
            assert any("Senior Specialist" in k for k in result.experience_breakdown)
            markdown = result.to_markdown()
            assert "Market Compensation Report" in markdown
            assert "CACHED BENCHMARK" in markdown

    def test_live_mocked_salary_benchmark(self):
        service = get_tavily_service()
        mock_client = MagicMock()
        mock_client.search.return_value = {
            "answer": "A Senior Python Developer in India earns between ₹18,00,000 and ₹32,00,000 annually with a median of ₹24,00,000.",
            "results": [
                {
                    "title": "Levels.fyi India Compensation",
                    "url": "https://www.levels.fyi/salaries/software-engineer/india",
                    "content": "Average compensation for Senior Devs in India is 25 LPA to 35 LPA."
                },
                {
                    "title": "Glassdoor Software Engineer Salaries",
                    "url": "https://www.glassdoor.co.in/Salaries/india-software-engineer-salary",
                    "content": "Base pay ranges from ₹15 Lakhs to ₹30 Lakhs."
                }
            ]
        }

        with patch.object(service, "_client", mock_client):
            result = service.get_salary_benchmark("Senior Python Developer", "India")
            assert result.is_live is True
            assert result.cached is False
            assert len(result.citations) == 2
            assert result.currency == "INR"
            markdown = result.to_markdown()
            assert "LIVE DATA - TAVILY REAL-TIME SEARCH" in markdown
            assert "Levels.fyi" in markdown
            assert "https://www.levels.fyi" in markdown

            # Verify caching
            cached_result = service.get_salary_benchmark("Senior Python Developer", "India")
            assert cached_result.cached is True
            assert mock_client.search.call_count == 1  # No second API call


class TestSkillTrends:
    def test_offline_fallback_skill_trends(self):
        service = get_tavily_service()
        with patch.object(service, "_client", None):
            result = service.get_skill_trends("Python Developer")
            assert isinstance(result, SkillTrendResult)
            assert result.is_live is False
            assert any("FastAPI" in s or "LangChain" in s for s in result.trending_skills)
            markdown = result.to_markdown()
            assert "2026 Tech Market Trends" in markdown
            assert "Top Trending & In-Demand Skills" in markdown

    def test_live_mocked_skill_trends(self):
        service = get_tavily_service()
        mock_client = MagicMock()
        mock_client.search.return_value = {
            "answer": "In 2026, top trending skills for Python developers include FastAPI, LangGraph, Polars, and OpenTelemetry.",
            "results": [
                {
                    "title": "GitHub Octoverse 2026",
                    "url": "https://github.com/features/octoverse",
                    "content": "FastAPI and LangGraph are the fastest growing Python frameworks."
                }
            ]
        }

        with patch.object(service, "_client", mock_client):
            result = service.get_skill_trends("Python Developer")
            assert result.is_live is True
            assert len(result.citations) >= 1
            assert "FastAPI" in result.trending_skills or "LangGraph" in result.trending_skills
            markdown = result.to_markdown()
            assert "2026 Tech Market Trends" in markdown
            assert "GitHub Octoverse" in markdown


class TestLiveJobDiscovery:
    def test_search_live_jobs_mock(self):
        service = get_tavily_service()
        mock_client = MagicMock()
        mock_client.search.return_value = {
            "results": [
                {
                    "title": "Senior Backend Engineer - Distributed Systems",
                    "content": "We are seeking a Senior Backend Engineer with 5+ years experience in Python, FastAPI, Docker, and Kubernetes to lead our distributed data platform.",
                    "url": "https://jobs.lever.co/example/senior-backend"
                }
            ]
        }

        with patch.object(service, "_client", mock_client):
            jobs = service.search_live_jobs("Senior Backend Engineer", "Remote")
            assert len(jobs) == 1
            assert "Senior Backend Engineer" in jobs[0]["title"]
            assert "lever.co" in jobs[0]["url"]


class TestWebIntelligence:
    def test_search_recruiter_intel_mock(self):
        service = get_tavily_service()
        mock_client = MagicMock()
        mock_client.search.return_value = {
            "answer": "Stripe utilizes a technology stack comprising Ruby, Go, Java, React, and Kubernetes for high-throughput global payments.",
            "results": [
                {
                    "title": "Stripe Engineering Blog",
                    "url": "https://stripe.com/blog/engineering",
                    "content": "Overview of Stripe's scalable infrastructure."
                }
            ]
        }

        with patch.object(service, "_client", mock_client):
            intel = service.search_recruiter_intel("Stripe engineering tech stack")
            assert intel.is_live is True
            assert "Ruby" in intel.answer
            markdown = intel.to_markdown()
            assert "Web Intelligence" in markdown
            assert "Stripe Engineering Blog" in markdown


class TestToolIntegrations:
    def test_tavily_search_tool(self):
        text, is_live = search_salary_data("Senior Full Stack Engineer", "India")
        assert isinstance(text, str)
        assert "Market Compensation Report" in text
        assert isinstance(is_live, bool)

    def test_skill_trend_tool(self):
        result_text = search_skill_trends.invoke({"role": "Python Developer"})
        assert isinstance(result_text, str)
        assert "Tech Market Trends" in result_text
        assert "Top Trending" in result_text


class TestGraphNodeIntegrations:
    def test_salary_node_execution(self):
        state: RecruitState = {
            "jd_structured": JobDescription(
                role="Senior Full Stack Engineer",
                required_skills=["Python", "React"],
                experience_years=5,
                raw_text="..."
            ),
            "resumes": [],
            "conversation_history": [{"role": "user", "content": "what is the salary in India?"}],
            "last_shortlist": None,
            "pending_confirmation": None,
            "last_intent": "salary"
        }
        output = salary_node(state)
        assert "conversation_history" in output
        content = output["conversation_history"][-1]["content"]
        assert "Salary Benchmark" in content
        assert "Market Compensation Report" in content

    def test_web_intel_node_execution(self):
        state: RecruitState = {
            "jd_structured": None,
            "resumes": [],
            "conversation_history": [{"role": "user", "content": "search the web for modern Python async libraries"}],
            "last_shortlist": None,
            "pending_confirmation": None,
            "last_intent": "web_intel"
        }
        output = web_intel_node(state)
        assert "conversation_history" in output
        content = output["conversation_history"][-1]["content"]
        assert "Web Intelligence Report" in content
