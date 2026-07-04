from typing import List
from app.services.resume_loader import load_resumes
from app.rag.chunking import chunk_resume
from app.rag.embeddings import embed_texts
from app.rag.vector_store import upsert_chunks, clear_all_chunks
from app.schemas.candidate_schema import Candidate

def ingest_resumes_pipeline(directory_path: str) -> List[Candidate]:
    """
    Runs the end-to-end ingestion pipeline:
    1. Load candidate resumes from directory
    2. Split raw resume text into chunks with metadata
    3. Generate vector embeddings for all chunks in a batch
    4. Clear existing chunks and upsert the new chunks to Supabase
    5. Return the list of ingested Candidates
    """
    # 1. Load candidates
    candidates = load_resumes(directory_path)
    if not candidates:
        print("No resumes found to ingest.")
        return []
        
    # 2. Chunk resumes
    all_chunks = []
    for candidate in candidates:
        chunks = chunk_resume(candidate.raw_text, candidate.candidate_id, candidate.name)
        all_chunks.extend(chunks)
        
    if not all_chunks:
        print("No chunks generated from resumes.")
        return candidates
        
    # 3. Embed chunks in batch
    print(f"Generating embeddings for {len(all_chunks)} chunks...")
    texts_to_embed = [c["chunk_text"] for c in all_chunks]
    embeddings = embed_texts(texts_to_embed)
    
    # 4. Attach embeddings
    for chunk, embedding in zip(all_chunks, embeddings):
        chunk["embedding"] = embedding
        
    # 5. Clear old and upload new to Supabase
    print("Clearing old database chunks and uploading new embeddings to Supabase...")
    clear_all_chunks()
    upsert_chunks(all_chunks)
    print(f"Ingestion complete. Ingested {len(candidates)} candidates.")
    
    return candidates
