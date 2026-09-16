from fastapi import HTTPException, status
from supabase import create_client, Client
from app.core import config
from typing import List, Dict, Optional

_supabase_client = None
_use_local_sqlite = False

def get_supabase_client():
    global _supabase_client, _use_local_sqlite
    
    # 1. In Production: strictly require live Supabase. Never fallback to SQLite.
    if getattr(config, "IS_PRODUCTION", False):
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY or "your_supabase" in config.SUPABASE_URL:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service configuration missing in production environment.",
            )
        if _supabase_client is None:
            try:
                client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
                client.table("chat_sessions").select("id").limit(1).execute()
                _supabase_client = client
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Production database connection failure: {e}",
                )
        return _supabase_client

    # 2. In Local Dev / Test mode:
    if _use_local_sqlite:
        from app.rag.fallback_db import FallbackSupabaseClient
        return FallbackSupabaseClient()
        
    if _supabase_client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY or "your_supabase" in config.SUPABASE_URL:
            from app.rag.fallback_db import FallbackSupabaseClient
            return FallbackSupabaseClient()
        try:
            client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
            client.table("chat_sessions").select("id").limit(1).execute()
            _supabase_client = client
        except Exception as e:
            print(f"Supabase connection check failed: {e}. Falling back to local SQLite database for this request.")
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

def query_top_k(query_embedding: List[float], k: int = 3, candidate_id: Optional[str] = None, threshold: float = 0.0, user_id: Optional[str] = None) -> List[Dict]:
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
    if user_id is not None:
        params["filter_user_id"] = user_id
        
    response = client.rpc("match_resume_chunks", params).execute()
    return response.data

def clear_all_chunks(user_id: Optional[str] = None):
    """
    Deletes all chunks from the resume_chunks table (useful for re-indexing).
    """
    client = get_supabase_client()
    query = client.table("resume_chunks").delete().neq("chunk_text", "")
    if user_id:
        query = query.eq("user_id", user_id)
    response = query.execute()
    return response
