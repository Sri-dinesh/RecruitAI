import pytest
from unittest.mock import patch
from app.rag.advanced_rag import expand_query, rerank_chunks

def test_query_expansion():
    # Test that query expansion runs and appends semantic keywords
    query = "React developer"
    jd = {
        "role": "Frontend Engineer",
        "required_skills": ["React", "TypeScript"],
        "experience_years": 3
    }
    with patch("app.rag.advanced_rag.call_llm", return_value=("frontend typescript experience", "mock", 0.1)):
        expanded = expand_query(query, jd)
        assert expanded is not None
        assert "React" in expanded or "developer" in expanded
        assert "frontend" in expanded
        assert len(expanded) >= len(query)

def test_rerank_chunks():
    # Test that the LLM reranker scores and filters chunks based on semantic relevance
    query = "Looking for Python and FastAPI backend skills."
    chunks = [
        {"chunk_text": "Experienced Python backend engineer specializing in FastAPI, REST APIs, and Supabase database design."},
        {"chunk_text": "Professional content copywriter, marketing campaign strategist, and blogging expert."}
    ]
    
    # Mocking call_llm response to return relevance scores for each chunk in a single batch format
    mock_response = ('{"scores": [{"id": 0, "relevance_score": 9}, {"id": 1, "relevance_score": 2}]}', "mock", 0.1)
    with patch("app.rag.advanced_rag.call_llm", return_value=mock_response):
        # Rerank and request the single most relevant chunk
        reranked = rerank_chunks(query, chunks, top_n=1)
        assert len(reranked) == 1
        assert "rerank_score" in reranked[0]
        assert reranked[0]["rerank_score"] == 9.0
        # The Python/FastAPI chunk should be selected over the marketing chunk
        assert "Python" in reranked[0]["chunk_text"]
