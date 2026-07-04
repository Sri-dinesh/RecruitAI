"""
Task 10.4 - Skill Trend Tool (LangChain @tool decorator)
Searches Tavily for trending skills for a given role.
"""
import os
import requests
from langchain_core.tools import tool
from app.core.config import TAVILY_API_KEY


@tool
def search_skill_trends(role: str) -> str:
    """
    Search for trending skills for a given developer/engineering role using Tavily.

    Args:
        role: The job role to search trending skills for (e.g. 'Python Developer').

    Returns:
        A string containing trending skill information from web search results,
        or a fallback message if search is unavailable.
    """
    query = f"trending skills for {role} developers 2026"

    tavily_active = bool(TAVILY_API_KEY) and "your_tavily" not in TAVILY_API_KEY

    if tavily_active:
        try:
            response = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": 4
                },
                timeout=5.0
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                if results:
                    summary_lines = []
                    for r in results:
                        title = r.get("title", "Skill Source")
                        content = r.get("content", "")
                        url = r.get("url", "")
                        summary_lines.append(f"- **{title}**: {content}\n  Source: {url}")
                    return "\n\n".join(summary_lines)
        except Exception as e:
            print(f"[Tavily Skill Trend Search] failed or timed out: {e}. Using fallback...")

    # Fallback data for common roles
    fallback_trends = {
        "python": [
            "FastAPI", "LangChain", "LlamaIndex", "Pydantic v2", "Ruff",
            "Polars", "Modal", "Instructor", "OpenTelemetry", "Asyncio"
        ],
        "javascript": [
            "React 19", "Next.js 15", "TypeScript 5", "Bun", "Vite",
            "Biome", "TanStack Query", "Tailwind CSS v4", "Zod", "Remix"
        ],
        "data": [
            "Apache Spark", "dbt", "Apache Iceberg", "DuckDB", "Polars",
            "MLflow", "Great Expectations", "Dagster", "Snowflake", "dbt-core"
        ],
        "fullstack": [
            "Next.js", "tRPC", "Prisma", "ShadcnUI", "Turbopack",
            "Supabase", "Drizzle ORM", "Clerk", "Stripe SDK", "Zod"
        ],
        "devops": [
            "Kubernetes", "ArgoCD", "Terraform", "OpenTelemetry", "eBPF",
            "Cilium", "FluxCD", "Crossplane", "Helmfile", "GitHub Actions"
        ],
        "ai": [
            "LangChain", "LlamaIndex", "Transformers", "vLLM", "Ollama",
            "LangGraph", "CrewAI", "OpenAI API", "Anthropic Claude", "Qdrant"
        ]
    }

    role_lower = role.lower()
    matched_trends = []
    for key, trends in fallback_trends.items():
        if key in role_lower:
            matched_trends = trends
            break

    if not matched_trends:
        # Generic trends
        matched_trends = [
            "Generative AI / LLM Integration", "Cloud-native development",
            "Infrastructure as Code", "Observability (OpenTelemetry)",
            "API-first design", "CI/CD automation", "Security by design"
        ]

    trend_list = "\n".join(f"- {t}" for t in matched_trends)
    return (
        f"**Trending Skills for {role} (2026) [Cached Fallback]:**\n{trend_list}"
    )
