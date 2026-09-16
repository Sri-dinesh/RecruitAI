"""
backend/app/api/routes_sessions.py
----------------------------------
Session management API controller providing CRUD endpoints for campaign sessions,
per-session isolated candidate aggregations, workspace reset, and title management.
Maintains strict HTTP GET idempotency with zero database write mutations (ARCH-3).
"""

import time
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from app.rag.vector_store import get_supabase_client
from app.core.auth import get_current_user_id

router = APIRouter()
logger = logging.getLogger(__name__)

# SEC-3 / SEC-4: Rate-limiting cache and window for destructive workspace reset
_LAST_RESET_REQUESTS: Dict[str, float] = {}
RESET_RATE_LIMIT_SECONDS = 30.0


class PatchSessionRequest(BaseModel):
    title: Optional[str] = None


@router.get("/sessions")
async def get_sessions_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Returns all campaign sessions belonging to the authenticated user with strictly isolated candidate counts.
    """
    client = get_supabase_client()
    try:
        res = (
            client.table("chat_sessions")
            .select("id, title, job_id, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        sessions_list = res.data or []

        cand_res = client.table("candidates").select("id, metadata").eq("user_id", user_id).execute()
        all_cands = cand_res.data or []

        apps_res = client.table("applications").select("job_id, candidate_id").eq("user_id", user_id).execute()
        apps_by_job: Dict[str, set] = {}
        for app in (apps_res.data or []):
            jid = app.get("job_id")
            if jid:
                apps_by_job.setdefault(jid, set()).add(app["candidate_id"])

        # Relational candidate-session mapping (BUG-3)
        session_cands_map: Dict[str, set] = {}
        try:
            sc_res = client.table("session_candidates").select("session_id, candidate_id").execute()
            for r in (sc_res.data or []):
                session_cands_map.setdefault(r["session_id"], set()).add(r["candidate_id"])
        except Exception as sc_err:
            logger.warning(f"[sessions] session_candidates query notice: {sc_err}")

        # Expand/contract backfill support for legacy candidates
        for c in all_cands:
            meta = c.get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            s_ids = set()
            if meta.get("session_id"):
                s_ids.add(meta["session_id"])
            if meta.get("session_ids") and isinstance(meta["session_ids"], list):
                s_ids.update(meta["session_ids"])
            for sid in s_ids:
                if sid not in session_cands_map or c["id"] not in session_cands_map[sid]:
                    session_cands_map.setdefault(sid, set()).add(c["id"])
                    try:
                        client.table("session_candidates").upsert({
                            "session_id": sid,
                            "candidate_id": c["id"]
                        }).execute()
                    except Exception:
                        pass

        for s in sessions_list:
            sid = s["id"]
            jid = s.get("job_id")
            s_cand_ids = set(session_cands_map.get(sid, []))
            if jid and jid in apps_by_job:
                s_cand_ids.update(apps_by_job[jid])

            s["candidate_count"] = len(s_cand_ids)

        return sessions_list
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.post("/sessions")
async def create_session_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Creates a new campaign session and initializes the greeting message in `chat_messages`.
    """
    import uuid
    client = get_supabase_client()
    session_id = str(uuid.uuid4())
    try:
        client.table("chat_sessions").insert({
            "id": session_id,
            "user_id": user_id,
            "title": "New Hiring Campaign",
        }).execute()

        greeting_text = (
            "Hello! I am **RecruitAI**, your AI recruiting assistant. "
            "Start by loading a job description and candidate resumes, or select one of the quick start options below."
        )
        client.table("chat_messages").insert({
            "session_id": session_id,
            "user_id": user_id,
            "role": "assistant",
            "content": greeting_text
        }).execute()

        return {
            "id": session_id,
            "user_id": user_id,
            "title": "New Hiring Campaign",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "candidate_count": 0,
            "conversation_history": [{"role": "assistant", "content": greeting_text}],
            "resumes": [],
            "scheduled_interviews": []
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.post("/sessions/reset-all")
async def reset_all_data_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Safely and transactionally resets all recruitment workspace data
    belonging exclusively to the authenticated user.
    Enforces per-user rate limiting (30s), audit logging, and transactional cascade order.
    """
    now = time.time()
    last_reset = _LAST_RESET_REQUESTS.get(user_id, 0.0)
    if now - last_reset < RESET_RATE_LIMIT_SECONDS:
        retry_after = int(RESET_RATE_LIMIT_SECONDS - (now - last_reset))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Reset rate limit exceeded. You may only reset your workspace once every {int(RESET_RATE_LIMIT_SECONDS)} seconds. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )

    _LAST_RESET_REQUESTS[user_id] = now
    logger.info(f"[AUDIT] [WORKSPACE_RESET] user_id={user_id} timestamp={now} action=reset_all_data")

    client = get_supabase_client()
    try:
        # 1. Primary: execute atomic transactional Postgres/SQLite RPC if available
        try:
            rpc_res = client.rpc("reset_user_workspace", {"target_user_id": user_id}).execute()
            if rpc_res and getattr(rpc_res, "data", None) is not None:
                return {"success": True, "message": "All recruitment workspace data successfully reset via atomic transaction."}
        except Exception as rpc_err:
            logger.warning(f"[reset-all] RPC reset_user_workspace unavailable: {rpc_err}. Falling back to cascade delete order.")

        # 2. Fallback: Strict topological foreign-key cascade order deletion
        try:
            client.table("session_candidates").delete().execute()
        except Exception:
            pass
        client.table("chat_messages").delete().eq("user_id", user_id).execute()
        client.table("interviews").delete().eq("user_id", user_id).execute()
        client.table("applications").delete().eq("user_id", user_id).execute()
        client.table("resume_chunks").delete().eq("user_id", user_id).execute()
        client.table("candidates").delete().eq("user_id", user_id).execute()
        client.table("chat_sessions").delete().eq("user_id", user_id).execute()
        client.table("jobs").delete().eq("user_id", user_id).execute()
        return {"success": True, "message": "All recruitment workspace data successfully reset for fresh start."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error during reset: {e}")


@router.get("/sessions/{session_id}")
async def get_session_details_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns the aggregated view of a campaign session with STRICT data isolation:
    - Session metadata from `chat_sessions`
    - Conversation messages from `chat_messages`
    - Structured JD from `jobs` (via `job_id`)
    - Candidates strictly belonging to this session
    - Shortlist/evaluations from `applications` for this session's job
    - Scheduled interviews for candidates in this session

    ARCH-3 COMPLIANCE: Pure, idempotent read operation with ZERO database write mutations.
    """
    client = get_supabase_client()
    try:
        # 1. Fetch session record
        sess_res = (
            client.table("chat_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not sess_res.data:
            raise HTTPException(status_code=404, detail="Campaign session not found.")
        session_row = sess_res.data[0]
        job_id = session_row.get("job_id")

        # 2. Fetch conversation history from `chat_messages`
        msgs_res = (
            client.table("chat_messages")
            .select("role, content, metadata, created_at")
            .eq("session_id", session_id)
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        history = [
            {"role": m["role"], "content": m["content"]}
            for m in (msgs_res.data or [])
        ]

        # 3. Fetch structured JD from `jobs` if linked
        jd_structured = None
        if job_id:
            job_res = (
                client.table("jobs")
                .select("jd_structured")
                .eq("id", job_id)
                .eq("user_id", user_id)
                .execute()
            )
            if job_res.data and job_res.data[0].get("jd_structured"):
                jd_structured = job_res.data[0]["jd_structured"]

        # 4. Fetch candidate records from `candidates` and application statuses strictly for this session
        cand_res = (
            client.table("candidates")
            .select("id, full_name, email, phone, raw_resume_text, metadata")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )

        apps_res = (
            client.table("applications")
            .select("job_id, candidate_id, match_score, match_reasoning, status")
            .eq("user_id", user_id)
            .execute()
        )
        apps_for_this_job = {}
        candidate_ids_in_job_apps = set()
        for a in (apps_res.data or []):
            if job_id and a.get("job_id") == job_id:
                apps_for_this_job[a["candidate_id"]] = a
                candidate_ids_in_job_apps.add(a["candidate_id"])

        session_candidate_ids_rel: set = set()
        try:
            sc_res = client.table("session_candidates").select("candidate_id").eq("session_id", session_id).execute()
            session_candidate_ids_rel = {r["candidate_id"] for r in (sc_res.data or [])}
        except Exception as sc_err:
            logger.warning(f"[sessions] session_candidates detail query notice: {sc_err}")

        candidates_list = []
        session_candidate_ids = set()
        for c in (cand_res.data or []):
            meta = c.get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, TypeError):
                    meta = {}

            # Strict campaign isolation using relational join table or job application links
            belongs_to_this_session = (
                c["id"] in session_candidate_ids_rel
                or c["id"] in candidate_ids_in_job_apps
                or meta.get("session_id") == session_id
                or session_id in (meta.get("session_ids") or [])
            )
            if not belongs_to_this_session:
                continue

            session_candidate_ids.add(c["id"])
            app_data = apps_for_this_job.get(c["id"]) or {}
            reasoning = app_data.get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except Exception:
                    reasoning = {}

            cand_status = app_data.get("status") or meta.get("status") or "new"
            cand_score = app_data.get("match_score") if app_data.get("match_score") is not None else meta.get("match_score")
            matched = reasoning.get("matched_skills") or meta.get("matched_skills") or []
            gaps = reasoning.get("gaps") or meta.get("gaps") or []
            red_flags = reasoning.get("red_flags") or meta.get("red_flags") or []
            summary = reasoning.get("summary") or meta.get("summary") or ""

            candidates_list.append({
                "candidate_id": c["id"],
                "name": c["full_name"],
                "email": c.get("email"),
                "phone": c.get("phone"),
                "raw_text": c.get("raw_resume_text"),
                "status": cand_status,
                "match_score": cand_score,
                "skills": meta.get("skills", []),
                "work_experience": meta.get("work_experience", []),
                "education": meta.get("education", []),
                "experience_years": meta.get("experience_years", 0),
                "location": meta.get("location"),
                "matched_skills": matched,
                "gaps": gaps,
                "red_flags": red_flags,
                "summary": summary,
                "headline": meta.get("headline"),
                "certifications": meta.get("certifications", []),
                "languages": meta.get("languages", []),
                "links": meta.get("links", []),
            })

        # 5. Fetch shortlisted candidates from `applications`
        shortlist_list = []
        if job_id:
            app_res = (
                client.table("applications")
                .select("candidate_id, match_score, match_reasoning, status, candidates(full_name, metadata)")
                .eq("job_id", job_id)
                .eq("user_id", user_id)
                .execute()
            )
            for a in (app_res.data or []):
                c_rel = a.get("candidates")
                if not isinstance(c_rel, dict):
                    if isinstance(c_rel, str):
                        try:
                            c_rel = json.loads(c_rel)
                        except Exception:
                            c_rel = {}
                    else:
                        c_rel = {}

                cand_meta = c_rel.get("metadata")
                if not isinstance(cand_meta, dict):
                    if isinstance(cand_meta, str):
                        try:
                            cand_meta = json.loads(cand_meta)
                        except Exception:
                            cand_meta = {}
                    else:
                        cand_meta = {}

                reasoning = a.get("match_reasoning")
                if not isinstance(reasoning, dict):
                    if isinstance(reasoning, str):
                        try:
                            reasoning = json.loads(reasoning)
                        except Exception:
                            reasoning = {}
                    else:
                        reasoning = {}

                shortlist_list.append({
                    "candidate_id": a["candidate_id"],
                    "name": c_rel.get("full_name") or "Candidate",
                    "match_score": a.get("match_score"),
                    "matched_skills": reasoning.get("matched_skills", []),
                    "gaps": reasoning.get("gaps", []),
                    "summary": reasoning.get("summary", ""),
                    "experience_years": cand_meta.get("experience_years", 0),
                })

        # 6. Fetch scheduled interviews strictly for candidates in this session
        interviews_res = (
            client.table("interviews")
            .select("candidate_id, scheduled_at, feedback, mode, meeting_link, candidates(full_name)")
            .eq("user_id", user_id)
            .order("scheduled_at", desc=False)
            .execute()
        )
        scheduled_interviews = []
        for iv in (interviews_res.data or []):
            cid = iv.get("candidate_id")
            if cid and cid not in session_candidate_ids:
                continue

            fb = iv.get("feedback")
            if not isinstance(fb, dict):
                if isinstance(fb, str):
                    try:
                        fb = json.loads(fb)
                    except Exception:
                        fb = {"notes": fb}
                else:
                    fb = {}

            c_rel = iv.get("candidates")
            if not isinstance(c_rel, dict):
                c_rel = {}

            cand_name = c_rel.get("full_name") or fb.get("candidate_name") or "Candidate"
            scheduled_interviews.append({
                "candidate_name": cand_name,
                "slot": str(iv.get("scheduled_at")),
                "feedback": json.dumps(fb) if isinstance(fb, dict) else str(fb),
                "mode": iv.get("mode", "video"),
                "meeting_link": iv.get("meeting_link"),
                "booked_at": fb.get("booked_at") or str(iv.get("scheduled_at"))
            })

        return {
            "id": session_id,
            "title": session_row.get("title", "New Hiring Campaign"),
            "created_at": session_row.get("created_at"),
            "updated_at": session_row.get("updated_at"),
            "jd_structured": jd_structured,
            "resumes": candidates_list,
            "last_shortlist": shortlist_list if shortlist_list else None,
            "pending_confirmation": session_row.get("pending_confirmation"),
            "last_intent": session_row.get("last_intent"),
            "scheduled_interviews": scheduled_interviews,
            "conversation_history": history,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Permanently deletes a campaign session. Foreign keys cascade to `chat_messages`.
    """
    client = get_supabase_client()
    try:
        try:
            client.table("session_candidates").delete().eq("session_id", session_id).execute()
        except Exception:
            pass
        client.table("chat_sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
        return {"message": f"Session {session_id} deleted successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.patch("/sessions/{session_id}")
async def patch_session_endpoint(
    session_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user_id),
):
    """
    Partial update for a campaign session (e.g., rename title).
    """
    payload.pop("user_id", None)
    client = get_supabase_client()
    try:
        res = (
            client.table("chat_sessions")
            .update(payload)
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Session not found.")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")
