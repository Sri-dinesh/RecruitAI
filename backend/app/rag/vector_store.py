from supabase import create_client, Client
from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from typing import List, Dict, Optional

_supabase_client = None
_use_local_sqlite = False

def get_supabase_client():
    global _supabase_client, _use_local_sqlite
    
    if _use_local_sqlite:
        from app.rag.fallback_db import FallbackSupabaseClient
        return FallbackSupabaseClient()
        
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or "your_supabase" in SUPABASE_URL:
            print("Supabase credentials missing or default. Falling back to local SQLite.")
            _use_local_sqlite = True
            from app.rag.fallback_db import FallbackSupabaseClient
            return FallbackSupabaseClient()
        try:
            client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            # Ping test
            client.table("chat_sessions").select("id").limit(1).execute()
            _supabase_client = client
        except Exception as e:
            print(f"Supabase connection check failed: {e}. Falling back to local SQLite database.")
            _use_local_sqlite = True
            from app.rag.fallback_db import FallbackSupabaseClient
            return FallbackSupabaseClient()
            
    return _supabase_client

def upsert_chunks(chunks: List[Dict]):
    """
    Inserts a list of chunk dictionaries into the resume_chunks table.
    Each chunk dict should contain keys: candidate_id, candidate_name, chunk_text, embedding.
    """
    if not chunks:
        return None
    client = get_supabase_client()
    response = client.table("resume_chunks").insert(chunks).execute()
    return response

def query_top_k(query_embedding: List[float], k: int = 3, candidate_id: Optional[str] = None, threshold: float = 0.0) -> List[Dict]:
    """
    Queries the pgvector store for the top-k chunks matching the query embedding.
    Optionally filters by candidate_id to fetch top-k chunks for a specific candidate.
    """
    client = get_supabase_client()
    params = {
        "query_embedding": query_embedding,
        "match_threshold": threshold,
        "match_count": k
    }
    if candidate_id is not None:
        params["filter_candidate_id"] = candidate_id
        
    response = client.rpc("match_resume_chunks", params).execute()
    return response.data

def clear_all_chunks():
    """
    Deletes all chunks from the resume_chunks table (useful for re-indexing).
    """
    client = get_supabase_client()
    response = client.table("resume_chunks").delete().neq("candidate_id", "").execute()
    return response
