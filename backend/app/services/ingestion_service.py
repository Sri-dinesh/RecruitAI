import uuid
from typing import List, Optional, Dict, Any
from app.services.resume_loader import load_resumes
from app.rag.chunking import chunk_resume
from app.rag.embeddings import embed_texts
from app.rag.vector_store import get_supabase_client, upsert_chunks, clear_all_chunks
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

def upsert_candidate_record(candidate: Candidate, user_id: str) -> str:
    """
    Persists or updates a single candidate record in public.candidates table.
    Returns the persistent UUID string for candidate_id.
    """
    client = get_supabase_client()
    email = candidate.email
    if not email or "@" not in email:
        fallback_tag = candidate.candidate_id or uuid.uuid4().hex[:8]
        email = f"{fallback_tag}@recruitai.local"

    meta: Dict[str, Any] = {
        "skills": candidate.skills or [],
        "work_experience": candidate.work_experience or [],
        "education": candidate.education or [],
        "summary": candidate.summary,
        "experience_years": candidate.experience_years,
        "location": candidate.location,
        "matched_skills": candidate.matched_skills or [],
        "gaps": candidate.gaps or [],
        "match_score": candidate.match_score,
        "red_flags": candidate.red_flags or [],
        "headline": candidate.headline,
        "certifications": candidate.certifications or [],
        "languages": candidate.languages or [],
    }

    try:
        # Check if candidate exists for this recruiter by (user_id, email)
        existing = (
            client.table("candidates")
            .select("id")
            .eq("user_id", user_id)
            .eq("email", email)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            cand_id = existing.data[0]["id"]
            client.table("candidates").update({
                "full_name": candidate.name,
                "phone": candidate.phone,
                "raw_resume_text": candidate.raw_text,
                "metadata": meta,
            }).eq("id", cand_id).eq("user_id", user_id).execute()
            return str(cand_id)

        # Otherwise insert a new candidate record
        cand_id = str(uuid.uuid4())
        client.table("candidates").insert({
            "id": cand_id,
            "user_id": user_id,
            "full_name": candidate.name,
            "email": email,
            "phone": candidate.phone,
            "raw_resume_text": candidate.raw_text,
            "metadata": meta,
        }).execute()
        return cand_id
    except Exception as e:
        print(f"[ingestion] Warning: Error upserting candidate to DB: {e}")
        return candidate.candidate_id or str(uuid.uuid4())


def save_job_description(jd: JobDescription, user_id: str, raw_text: str = "") -> str:
    """
    Persists or updates a job description record in public.jobs table.
    Returns the job_id UUID.
    """
    client = get_supabase_client()
    job_id = str(uuid.uuid4())
    title = jd.role or "Hiring Campaign"

    try:
        payload = {
            "id": job_id,
            "user_id": user_id,
            "title": title,
            "raw_jd": raw_text or jd.raw_text or "",
            "jd_structured": jd.model_dump(),
            "status": "active"
        }
        res = client.table("jobs").insert(payload).execute()
        if res.data and len(res.data) > 0:
            return str(res.data[0]["id"])
    except Exception as e:
        print(f"[ingestion] Warning: Error saving job to DB: {e}")
    return job_id


def ingest_candidate_object(
    candidate: Candidate, 
    user_id: str = "local_dev_user_123"
) -> Candidate:
    """
    Ingests an already parsed Candidate object:
    1. Upserts candidate record into public.candidates (obtains UUID)
    2. Chunks resume text and embeds vectors
    3. Upserts chunks into public.resume_chunks
    """
    raw_text = candidate.raw_text or ""
    cand_uuid = upsert_candidate_record(candidate, user_id)
    candidate.candidate_id = cand_uuid

    if not raw_text:
        return candidate

    raw_chunks = chunk_resume(raw_text, cand_uuid, candidate.name)
    if not raw_chunks:
        return candidate

    texts_to_embed = [c["chunk_text"] for c in raw_chunks]
    embeddings = embed_texts(texts_to_embed)

    formatted_chunks = []
    for idx, (chunk, embedding) in enumerate(zip(raw_chunks, embeddings)):
        formatted_chunks.append({
            "candidate_id": cand_uuid,
            "user_id": user_id,
            "chunk_text": chunk["chunk_text"],
            "chunk_index": idx,
            "embedding": embedding
        })

    client = get_supabase_client()
    try:
        client.table("resume_chunks").delete().eq("candidate_id", cand_uuid).eq("user_id", user_id).execute()
    except Exception:
        pass

    upsert_chunks(formatted_chunks)
    return candidate


def ingest_single_candidate_text(
    candidate_id: str, 
    name: str, 
    raw_text: str, 
    user_id: str = "local_dev_user_123"
) -> Candidate:
    """
    Ingests raw candidate text: parses structured resume and persists.
    """
    from app.services.resume_parser import parse_structured_resume
    candidate = parse_structured_resume(raw_text, filename=f"{candidate_id}.txt")
    candidate.candidate_id = candidate_id
    if name and name != "Unknown Candidate":
        candidate.name = name

    return ingest_candidate_object(candidate, user_id)


def ingest_resumes_pipeline(
    directory_path: str, 
    user_id: str = "local_dev_user_123"
) -> List[Candidate]:
    """
    Runs the end-to-end ingestion pipeline across a folder of resumes.
    """
    candidates = load_resumes(directory_path)
    if not candidates:
        print("No resumes found to ingest.")
        return []

    ingested = []
    for cand in candidates:
        ingested_cand = ingest_candidate_object(cand, user_id)
        ingested.append(ingested_cand)

    print(f"Ingestion complete. Ingested {len(ingested)} candidates.")
    return ingested
