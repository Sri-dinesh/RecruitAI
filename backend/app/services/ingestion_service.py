import json
import logging
import uuid
import hashlib
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from app.services.resume_loader import load_resumes
from app.rag.chunking import chunk_resume
from app.rag.embeddings import embed_texts
from app.rag.vector_store import get_supabase_client, upsert_chunks, clear_all_chunks
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.core.auth import _ensure_valid_uuid


def compute_resume_hash(raw_text: str) -> Optional[str]:
    """
    Computes a deterministic SHA-256 hash from normalized resume text (BUG-5).
    Strips irregular whitespace and lowercases to deduplicate identical resumes.
    """
    if not raw_text:
        return None
    normalized = re.sub(r"\s+", " ", raw_text.strip().lower())
    if len(normalized) < 20:
        return None
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def upsert_candidate_record(candidate: Candidate, user_id: str, session_id: Optional[str] = None) -> str:
    """
    Persists or updates a single candidate record in public.candidates table.
    Performs deterministic candidate deduplication:
    1. Primary: SHA-256 hash of normalized resume text
    2. Secondary: Verified real email address
    Associates the candidate with a specific campaign session for complete isolation.
    Returns the persistent UUID string for candidate_id.
    """
    client = get_supabase_client()
    user_id = _ensure_valid_uuid(user_id)
    email = candidate.email
    if not email or "@" not in email:
        fallback_tag = candidate.candidate_id or uuid.uuid4().hex[:8]
        email = f"{fallback_tag}@recruitai.local"

    raw_text = candidate.raw_text or ""
    resume_hash = compute_resume_hash(raw_text)

    meta: Dict[str, Any] = {
        "resume_hash": resume_hash,
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
        "consent_at": getattr(candidate, "consent_at", None) or datetime.now(timezone.utc).isoformat(),
        "consent_version": getattr(candidate, "consent_version", "1.0") or "1.0",
        "source": getattr(candidate, "source", "direct_upload") or "direct_upload",
    }
    if session_id:
        meta["session_id"] = session_id
        meta["session_ids"] = [session_id]

    try:
        existing_cand = None

        # 1. Primary Deduplication: Match by SHA-256 hash of normalized resume text (BUG-5)
        if resume_hash:
            cands_check = client.table("candidates").select("id, metadata, email").eq("user_id", user_id).execute()
            for cand_row in (cands_check.data or []):
                c_meta = cand_row.get("metadata") or {}
                if isinstance(c_meta, str):
                    try:
                        c_meta = json.loads(c_meta)
                    except (json.JSONDecodeError, TypeError):
                        c_meta = {}
                if c_meta.get("resume_hash") == resume_hash:
                    existing_cand = cand_row
                    break

        # 2. Secondary Deduplication: Verified real email address
        if not existing_cand and email and not email.endswith("@recruitai.local") and "@" in email:
            email_check = client.table("candidates").select("id, metadata").eq("user_id", user_id).eq("email", email).limit(1).execute()
            if email_check.data and len(email_check.data) > 0:
                existing_cand = email_check.data[0]

        if existing_cand:
            cand_id = existing_cand["id"]
            existing_meta = existing_cand.get("metadata") or {}
            if isinstance(existing_meta, str):
                try:
                    existing_meta = json.loads(existing_meta)
                except (json.JSONDecodeError, TypeError) as parse_err:
                    logging.warning(f"[ingestion] Failed to parse existing candidate metadata JSON: {parse_err}")
                    existing_meta = {}
            # Merge session_ids
            merged_session_ids = set(existing_meta.get("session_ids", []))
            if session_id:
                merged_session_ids.add(session_id)
                meta["session_id"] = session_id
            meta["session_ids"] = list(merged_session_ids)

            client.table("candidates").update({
                "full_name": candidate.name,
                "phone": candidate.phone,
                "raw_resume_text": candidate.raw_text,
                "metadata": meta,
            }).eq("id", cand_id).eq("user_id", user_id).execute()
        else:
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

        if session_id:
            try:
                client.table("session_candidates").upsert({
                    "session_id": session_id,
                    "candidate_id": str(cand_id)
                }).execute()
            except Exception as sc_err:
                logging.warning(f"[ingestion] Could not link candidate {cand_id} to session {session_id}: {sc_err}")

        return str(cand_id)
    except Exception as e:
        print(f"[ingestion] Warning: Error upserting candidate to DB: {e}")
        return _ensure_valid_uuid(candidate.candidate_id) if candidate.candidate_id else str(uuid.uuid4())


def save_job_description(jd: JobDescription, user_id: str, raw_text: str = "", session_id: Optional[str] = None) -> str:
    """
    Persists or updates a job description record in public.jobs table.
    If session_id is provided, automatically binds job to chat_sessions.job_id,
    updates campaign title, and scores any existing candidates in this session.
    Returns the job_id UUID.
    """
    client = get_supabase_client()
    user_id = _ensure_valid_uuid(user_id)
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
            job_id = str(res.data[0]["id"])

        if session_id:
            # Bind job to campaign session
            client.table("chat_sessions").update({
                "job_id": job_id,
                "title": f"Hiring: {title}"
            }).eq("id", session_id).eq("user_id", user_id).execute()

            # Score any existing candidates belonging to this session
            cand_res = client.table("candidates").select("id, full_name, raw_resume_text, metadata").eq("user_id", user_id).execute()
            for c in (cand_res.data or []):
                c_meta = c.get("metadata") or {}
                if isinstance(c_meta, str):
                    try:
                        c_meta = json.loads(c_meta)
                    except (json.JSONDecodeError, TypeError) as parse_err:
                        logging.warning(f"[ingestion] Failed to parse candidate metadata JSON during JD scoring: {parse_err}")
                        c_meta = {}
                if c_meta.get("session_id") == session_id or session_id in c_meta.get("session_ids", []):
                    from app.services.matching_service import evaluate_candidate_against_jd
                    c_obj = Candidate(
                        candidate_id=c["id"],
                        name=c["full_name"],
                        skills=c_meta.get("skills", []),
                        work_experience=c_meta.get("work_experience", []),
                        education=c_meta.get("education", []),
                        certifications=c_meta.get("certifications", []),
                        experience_years=c_meta.get("experience_years", 0),
                        raw_text=c.get("raw_resume_text") or ""
                    )
                    scored = evaluate_candidate_against_jd(c_obj, jd)
                    client.table("applications").upsert({
                        "job_id": job_id,
                        "candidate_id": c["id"],
                        "user_id": user_id,
                        "match_score": scored.match_score,
                        "match_reasoning": {
                            "matched_skills": scored.matched_skills,
                            "gaps": scored.gaps,
                            "red_flags": scored.red_flags,
                            "summary": scored.summary,
                        },
                        "status": "new"
                    }).execute()
                    
                    c_meta["match_score"] = scored.match_score
                    c_meta["matched_skills"] = scored.matched_skills
                    c_meta["gaps"] = scored.gaps
                    c_meta["red_flags"] = scored.red_flags
                    c_meta["summary"] = scored.summary
                    client.table("candidates").update({"metadata": c_meta}).eq("id", c["id"]).execute()
    except Exception as e:
        print(f"[ingestion] Warning: Error saving job to DB: {e}")
    return job_id


def ingest_candidate_object(
    candidate: Candidate, 
    user_id: Optional[str] = None,
    session_id: Optional[str] = None
) -> Candidate:
    """
    Ingests an already parsed Candidate object:
    1. Upserts candidate record into public.candidates (obtains UUID and scopes to session)
    2. If campaign session already has an active JD, scores candidate and saves application
    3. Chunks resume text and embeds vectors
    4. Upserts chunks into public.resume_chunks
    """
    from app.core import config
    if not user_id or user_id == "local_dev_user_123":
        user_id = config.LOCAL_DEV_USER_ID
    user_id = _ensure_valid_uuid(user_id)
    raw_text = candidate.raw_text or ""
    cand_uuid = upsert_candidate_record(candidate, user_id, session_id=session_id)
    candidate.candidate_id = cand_uuid

    # If session has an active JD, score immediately
    if session_id:
        try:
            client = get_supabase_client()
            sess_res = client.table("chat_sessions").select("job_id").eq("id", session_id).eq("user_id", user_id).execute()
            if sess_res.data and sess_res.data[0].get("job_id"):
                job_id = sess_res.data[0]["job_id"]
                job_res = client.table("jobs").select("jd_structured").eq("id", job_id).execute()
                if job_res.data and job_res.data[0].get("jd_structured"):
                    from app.services.matching_service import evaluate_candidate_against_jd
                    from app.schemas.jd_schema import JobDescription
                    jd_data = job_res.data[0]["jd_structured"]
                    if isinstance(jd_data, str):
                        try:
                            jd_data = json.loads(jd_data)
                        except (json.JSONDecodeError, TypeError) as parse_err:
                            logging.warning(f"[ingestion] Failed to parse jd_structured JSON: {parse_err}")
                            jd_data = {}
                    jd_obj = JobDescription(**jd_data)
                    scored = evaluate_candidate_against_jd(candidate, jd_obj)
                    candidate.match_score = scored.match_score
                    candidate.matched_skills = scored.matched_skills
                    candidate.gaps = scored.gaps
                    candidate.red_flags = scored.red_flags
                    candidate.summary = scored.summary
                    client.table("applications").upsert({
                        "job_id": job_id,
                        "candidate_id": cand_uuid,
                        "user_id": user_id,
                        "match_score": scored.match_score,
                        "match_reasoning": {
                            "matched_skills": scored.matched_skills,
                            "gaps": scored.gaps,
                            "red_flags": scored.red_flags,
                            "summary": scored.summary,
                        },
                        "status": "new"
                    }).execute()

                    # Update candidates table metadata
                    cand_rec = client.table("candidates").select("metadata").eq("id", cand_uuid).execute()
                    if cand_rec.data:
                        curr_meta = cand_rec.data[0].get("metadata") or {}
                        if isinstance(curr_meta, str):
                            try:
                                curr_meta = json.loads(curr_meta)
                            except (json.JSONDecodeError, TypeError) as parse_err:
                                logging.warning(f"[ingestion] Failed to parse candidate metadata JSON during score update: {parse_err}")
                                curr_meta = {}
                        curr_meta["match_score"] = scored.match_score
                        curr_meta["matched_skills"] = scored.matched_skills
                        curr_meta["gaps"] = scored.gaps
                        curr_meta["red_flags"] = scored.red_flags
                        curr_meta["summary"] = scored.summary
                        client.table("candidates").update({"metadata": curr_meta}).eq("id", cand_uuid).execute()
        except Exception as eval_err:
            print(f"[ingestion] Non-fatal error auto-scoring candidate against session JD: {eval_err}")

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
    user_id: Optional[str] = None
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
