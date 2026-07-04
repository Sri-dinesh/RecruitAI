import os
import pytest
from app.services.ingestion_service import ingest_resumes_pipeline
from app.rag.vector_store import query_top_k
from app.rag.embeddings import embed_text

def test_ingestion_pipeline():
    # Only run if Supabase keys are configured (not placeholders)
    from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    if not SUPABASE_URL or "your_supabase" in SUPABASE_URL:
        pytest.skip("Supabase is not configured.")
        
    candidates = ingest_resumes_pipeline("backend/data/resumes")
    assert len(candidates) >= 15
    
    # Query for Alice Smith
    query_emb = embed_text("Alice Smith React Python Node.js AWS")
    results = query_top_k(query_emb, k=3)
    assert len(results) > 0
    print("Found top chunks:")
    for r in results:
        print(f"Candidate: {r['candidate_name']} (Similarity: {r['similarity']:.4f})")
