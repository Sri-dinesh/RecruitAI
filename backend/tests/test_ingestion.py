import os
import pytest
from app.services.ingestion_service import ingest_resumes_pipeline
from app.rag.vector_store import query_top_k
from app.rag.embeddings import embed_text

@pytest.fixture(autouse=True)
def use_test_fallback_db():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    yield
    vs._use_local_sqlite = old_flag


def test_ingestion_pipeline():
    # Only run if Supabase keys are configured (not placeholders)
    from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    if not SUPABASE_URL or "your_supabase" in SUPABASE_URL:
        pytest.skip("Supabase is not configured.")
        
    from pathlib import Path
    resumes_dir = Path(__file__).resolve().parent.parent / "data" / "resumes"
    candidates = ingest_resumes_pipeline(str(resumes_dir))
    assert len(candidates) >= 15
    
    # Query for Alice Smith
    query_emb = embed_text("Alice Smith React Python Node.js AWS")
    results = query_top_k(query_emb, k=3)
    assert len(results) > 0
    print("Found top chunks:")
    for r in results:
        print(f"Candidate: {r['candidate_name']} (Similarity: {r['similarity']:.4f})")


def test_upsert_candidate_record_json_metadata():
    import json
    from app.schemas.candidate_schema import Candidate
    from app.services.ingestion_service import upsert_candidate_record
    from app.rag.vector_store import get_supabase_client

    user_id = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"
    client = get_supabase_client()

    cand = Candidate(
        name="Charlie Test",
        email="charlie@example.com",
        skills=["Python", "FastAPI"],
        raw_text="Charlie Test Python FastAPI"
    )

    # 1. First upsert with session_1
    cand_id = upsert_candidate_record(cand, user_id=user_id, session_id="session-1")
    assert cand_id is not None

    # Simulate raw string JSON in metadata column
    client.table("candidates").update({
        "metadata": json.dumps({"session_id": "session-1", "session_ids": ["session-1"], "skills": ["Python"]})
    }).eq("id", cand_id).execute()

    # 2. Second upsert with session_2 - this exercises lines 55-68 where existing_meta is a string
    cand_id_2 = upsert_candidate_record(cand, user_id=user_id, session_id="session-2")
    assert cand_id_2 == cand_id

    # Verify metadata merged session_ids properly
    res = client.table("candidates").select("metadata").eq("id", cand_id).execute()
    assert res.data and len(res.data) > 0
    meta = res.data[0]["metadata"]
    if isinstance(meta, str):
        meta = json.loads(meta)
    assert "session-1" in meta["session_ids"]
    assert "session-2" in meta["session_ids"]

