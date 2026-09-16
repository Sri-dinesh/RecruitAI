"""
backend/app/services/persistence_service.py
-------------------------------------------
Domain persistence service providing atomic database writers for jobs,
applications, interview slots, chat messages, and session state.
"""

import uuid
import logging
from typing import List, Optional, Dict, Any
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

logger = logging.getLogger(__name__)


def persist_job(
    client: Any,
    user_id: str,
    jd_structured: JobDescription,
    raw_text: str = "",
) -> Optional[str]:
    """
    Persists or updates a structured job description in the `jobs` table.
    Returns the job UUID.
    """
    if not jd_structured or not jd_structured.role:
        return None

    job_title = jd_structured.role
    res_jd = jd_structured.model_dump()
    job_id = None

    try:
        existing_job = (
            client.table("jobs")
            .select("id")
            .eq("user_id", user_id)
            .eq("title", job_title)
            .limit(1)
            .execute()
        )
        if existing_job.data and len(existing_job.data) > 0:
            job_id = existing_job.data[0]["id"]
            client.table("jobs").update({
                "jd_structured": res_jd,
                "raw_jd": jd_structured.raw_text or raw_text or "",
            }).eq("id", job_id).eq("user_id", user_id).execute()
        else:
            job_id = str(uuid.uuid4())
            client.table("jobs").insert({
                "id": job_id,
                "user_id": user_id,
                "title": job_title,
                "raw_jd": jd_structured.raw_text or raw_text or "",
                "jd_structured": res_jd,
                "status": "active",
            }).execute()
    except Exception as e:
        logger.warning(f"[persistence_service] Failed to persist job: {e}")

    return job_id


def persist_applications(
    client: Any,
    user_id: str,
    job_id: str,
    shortlist: List[Candidate],
) -> None:
    """
    Persists shortlisted candidate evaluations into the `applications` table.
    """
    if not job_id or not shortlist:
        return

    for cand in shortlist:
        try:
            cand_id = cand.candidate_id
            if cand_id and len(str(cand_id)) == 36:
                client.table("applications").upsert({
                    "job_id": job_id,
                    "candidate_id": str(cand_id),
                    "user_id": user_id,
                    "match_score": cand.match_score or 0.0,
                    "match_reasoning": {
                        "matched_skills": cand.matched_skills or [],
                        "gaps": cand.gaps or [],
                        "summary": cand.summary,
                    },
                    "status": "shortlisted",
                }, on_conflict="job_id,candidate_id").execute()
        except Exception as e:
            logger.warning(f"[persistence_service] Failed to persist application for candidate {getattr(cand, 'candidate_id', None)}: {e}")


def persist_interviews(
    client: Any,
    user_id: str,
    scheduled_interviews: List[Dict[str, Any]],
    job_id: Optional[str] = None,
) -> None:
    """
    Persists scheduled interviews into the `interviews` table.
    Enforces BUG-4 compliance:
    - Never fabricates timestamps; sets scheduled_at to NULL if slot is unextracted.
    - Propagates actual candidate_id, duration_minutes, and mode.
    """
    if not scheduled_interviews:
        return

    for interview in scheduled_interviews:
        try:
            cand_id = interview.get("candidate_id")
            cand_name = interview.get("candidate_name", "")
            if not cand_id and cand_name:
                cand_res = (
                    client.table("candidates")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("full_name", cand_name)
                    .limit(1)
                    .execute()
                )
                cand_id = cand_res.data[0]["id"] if cand_res.data else None

            raw_slot = interview.get("slot")
            slot = raw_slot.strip() if raw_slot and isinstance(raw_slot, str) and raw_slot.strip() else None

            duration = interview.get("duration_minutes") or interview.get("duration") or 30
            mode = interview.get("mode") or "video"

            app_id = interview.get("application_id")
            if not app_id and cand_id and job_id:
                app_res = (
                    client.table("applications")
                    .select("id")
                    .eq("candidate_id", cand_id)
                    .eq("job_id", job_id)
                    .limit(1)
                    .execute()
                )
                if app_res.data:
                    app_id = app_res.data[0]["id"]

            payload = {
                "candidate_id": cand_id,
                "user_id": user_id,
                "application_id": app_id,
                "scheduled_at": slot,
                "duration_minutes": duration,
                "mode": mode,
                "status": "scheduled",
                "feedback": {
                    "candidate_name": cand_name,
                    "booked_at": interview.get("booked_at"),
                },
            }
            client.table("interviews").insert(payload).execute()
        except Exception as e:
            logger.warning(f"[persistence_service] Failed to persist interview: {e}")


def persist_chat_message(
    client: Any,
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Inserts a user or assistant message into the `chat_messages` table.
    """
    try:
        payload: Dict[str, Any] = {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "content": content,
        }
        if metadata is not None:
            payload["metadata"] = metadata
        client.table("chat_messages").insert(payload).execute()
    except Exception as e:
        logger.warning(f"[persistence_service] Failed to persist chat message ({role}): {e}")


def update_session_metadata(
    client: Any,
    user_id: str,
    session_id: str,
    title: Optional[str] = None,
    job_id: Optional[str] = None,
    last_intent: Optional[str] = None,
    pending_confirmation: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Updates campaign session metadata in `chat_sessions`.
    """
    try:
        update_data: Dict[str, Any] = {
            "user_id": user_id,
            "last_intent": last_intent,
            "pending_confirmation": pending_confirmation,
        }
        if title:
            update_data["title"] = title
        if job_id:
            update_data["job_id"] = job_id

        client.table("chat_sessions").update(update_data).eq("id", session_id).eq("user_id", user_id).execute()
    except Exception as e:
        logger.warning(f"[persistence_service] Failed to update chat_sessions metadata: {e}")
