from supabase import create_client, Client
from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from typing import List, Dict, Optional

_supabase_client = None

def get_supabase_client() -> Client:
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("Supabase URL and SERVICE_ROLE_KEY must be set in your configuration.")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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

def delete_chunks_by_candidate_ids(candidate_ids: List[str]):
    """Delete chunks for specific candidates without wiping the entire table."""
    if not candidate_ids:
        return None
    client = get_supabase_client()
    response = client.table("resume_chunks").delete().in_("candidate_id", candidate_ids).execute()
    return response
