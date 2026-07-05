import hashlib
from typing import List, Optional
from app.services.resume_loader import load_resumes
from app.rag.chunking import chunk_resume
from app.rag.embeddings import embed_texts
from app.rag.vector_store import upsert_chunks, delete_chunks_by_candidate_ids
from app.schemas.candidate_schema import Candidate

_last_ingest_hash: Optional[str] = None

def _compute_ingest_hash(chunks: List[dict]) -> str:
    payload = "|".join(sorted(c["chunk_text"] for c in chunks))
    return hashlib.md5(payload.encode("utf-8")).hexdigest()

def ingest_resumes_pipeline(directory_path: str, force_reindex: bool = False) -> List[Candidate]:
    """
    Runs the end-to-end ingestion pipeline:
    1. Load candidate resumes from directory
    2. Split raw resume text into chunks with metadata
    3. Generate vector embeddings for all chunks in a batch
    4. Replace only affected candidate chunks in Supabase
    5. Return the list of ingested Candidates
    """
    global _last_ingest_hash

    candidates = load_resumes(directory_path)
    if not candidates:
        print("No resumes found to ingest.")
        return []
        
    all_chunks = []
    for candidate in candidates:
        chunks = chunk_resume(candidate.raw_text, candidate.candidate_id, candidate.name)
        all_chunks.extend(chunks)
        
    if not all_chunks:
        print("No chunks generated from resumes.")
        return candidates

    content_hash = _compute_ingest_hash(all_chunks)
    if not force_reindex and _last_ingest_hash == content_hash:
        print("Resumes unchanged — skipping re-embed and re-upload.")
        return candidates
        
    print(f"Generating embeddings for {len(all_chunks)} chunks...")
    texts_to_embed = [c["chunk_text"] for c in all_chunks]
    embeddings = embed_texts(texts_to_embed)
    
    for chunk, embedding in zip(all_chunks, embeddings):
        chunk["embedding"] = embedding
        
    print("Uploading embeddings to Supabase...")
    delete_chunks_by_candidate_ids([c.candidate_id for c in candidates])
    upsert_chunks(all_chunks)
    _last_ingest_hash = content_hash
    print(f"Ingestion complete. Ingested {len(candidates)} candidates.")
    
    return candidates

def ingest_single_candidate_text(candidate_id: str, name: str, raw_text: str) -> Candidate:
    """
    Ingests a single candidate's resume: chunks it, embeds it, and
    upserts it to Supabase pgvector without clearing other candidates.
    """
    global _last_ingest_hash
    _last_ingest_hash = None

    chunks = chunk_resume(raw_text, candidate_id, name)
    if not chunks:
        return Candidate(
            candidate_id=candidate_id,
            name=name,
            raw_text=raw_text,
            match_score=0,
            matched_skills=[],
            gaps=[]
        )
        
    texts_to_embed = [c["chunk_text"] for c in chunks]
    embeddings = embed_texts(texts_to_embed)
    
    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding
        
    delete_chunks_by_candidate_ids([candidate_id])
    upsert_chunks(chunks)
    
    return Candidate(
        candidate_id=candidate_id,
        name=name,
        raw_text=raw_text,
        match_score=0,
        matched_skills=[],
        gaps=[]
    )
