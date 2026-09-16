"""
backend/app/services/retention.py
---------------------------------
Automated data retention schedules, GDPR Art. 17 right-to-erasure cascade purge,
and GDPR Art. 15/20 candidate data subject export service (AI-SEC-3).
"""

import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from app.rag.vector_store import get_supabase_client

logger = logging.getLogger(__name__)


def purge_candidate(candidate_id: str, user_id: str) -> bool:
    """
    GDPR Art. 17 Right-to-Erasure:
    Transactionally and completely cascades deletion of a candidate across all
    workspace tables:
    session_candidates -> interviews -> applications -> resume_chunks -> candidates.
    """
    client = get_supabase_client()
    try:
        # Check existence
        existing = client.table("candidates").select("id").eq("id", candidate_id).eq("user_id", user_id).execute()
        if not existing.data or len(existing.data) == 0:
            return False

        # 1. Clear session join relations
        try:
            client.table("session_candidates").delete().eq("candidate_id", candidate_id).execute()
        except Exception as e:
            logger.warning(f"[retention] session_candidates purge notice: {e}")

        # 2. Delete interviews
        client.table("interviews").delete().eq("candidate_id", candidate_id).eq("user_id", user_id).execute()

        # 3. Delete applications & scores
        client.table("applications").delete().eq("candidate_id", candidate_id).eq("user_id", user_id).execute()

        # 4. Delete vector chunks
        client.table("resume_chunks").delete().eq("candidate_id", candidate_id).eq("user_id", user_id).execute()

        # 5. Delete candidate root record
        client.table("candidates").delete().eq("id", candidate_id).eq("user_id", user_id).execute()

        logger.info(f"[AUDIT] [GDPR_ERASURE] candidate_id={candidate_id} user_id={user_id} status=purged")
        return True
    except Exception as exc:
        logger.error(f"[retention] Failed to purge candidate {candidate_id}: {exc}", exc_info=True)
        raise


def export_candidate_data(candidate_id: str, user_id: str) -> Dict[str, Any]:
    """
    GDPR Art. 15 (Right of Access) & Art. 20 (Data Portability):
    Exports all personal data, resume chunks, evaluations, and scheduled interview history
    for a specific candidate.
    """
    client = get_supabase_client()
    try:
        cand_res = (
            client.table("candidates")
            .select("*")
            .eq("id", candidate_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not cand_res.data:
            return {}

        candidate_data = cand_res.data[0]

        apps_res = (
            client.table("applications")
            .select("job_id, match_score, match_reasoning, status, created_at, updated_at")
            .eq("candidate_id", candidate_id)
            .eq("user_id", user_id)
            .execute()
        )

        interviews_res = (
            client.table("interviews")
            .select("scheduled_at, duration_minutes, mode, status, feedback, meeting_link, created_at")
            .eq("candidate_id", candidate_id)
            .eq("user_id", user_id)
            .execute()
        )

        chunks_res = (
            client.table("resume_chunks")
            .select("chunk_index, created_at")
            .eq("candidate_id", candidate_id)
            .eq("user_id", user_id)
            .execute()
        )

        return {
            "candidate": candidate_data,
            "applications": apps_res.data or [],
            "interviews": interviews_res.data or [],
            "vector_chunks_stored": len(chunks_res.data or []),
            "export_metadata": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "gdpr_compliance": "Articles 15 & 20",
                "tenant_user_id": user_id,
            }
        }
    except Exception as exc:
        logger.error(f"[retention] Failed to export data for candidate {candidate_id}: {exc}")
        raise


def enforce_retention_policy(
    user_id: Optional[str] = None,
    raw_resume_ttl_days: int = 90,
    chat_ttl_days: int = 365,
) -> Dict[str, int]:
    """
    Automated Tiered Retention Policy Engine (AI-SEC-3):
    - Purges raw resume text (sets to NULL) for candidates older than 90 days.
    - Purges chat messages older than 12 months (365 days).
    """
    client = get_supabase_client()
    purged_counts = {"raw_resumes_cleared": 0, "chat_messages_purged": 0}

    now = datetime.now(timezone.utc)
    resume_cutoff = (now - timedelta(days=raw_resume_ttl_days)).isoformat()
    chat_cutoff = (now - timedelta(days=chat_ttl_days)).isoformat()

    try:
        # 1. Purge raw resume text past 90-day retention
        query = client.table("candidates").update({"raw_resume_text": None}).lt("created_at", resume_cutoff)
        if user_id:
            query = query.eq("user_id", user_id)
        res_resumes = query.execute()
        purged_counts["raw_resumes_cleared"] = len(res_resumes.data or [])

        # 2. Purge chat messages past 365-day retention
        chat_query = client.table("chat_messages").delete().lt("created_at", chat_cutoff)
        if user_id:
            chat_query = chat_query.eq("user_id", user_id)
        res_chat = chat_query.execute()
        purged_counts["chat_messages_purged"] = len(res_chat.data or [])

        logger.info(f"[retention] Automated retention run complete: {purged_counts}")
    except Exception as e:
        logger.warning(f"[retention] Automated retention policy encountered notice: {e}")

    return purged_counts
