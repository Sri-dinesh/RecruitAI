"""
backend/app/services/campaign_service.py
----------------------------------------
Domain service for campaign session context hydration, agent turn execution,
and multi-table orchestration.
"""

import uuid
import logging
from typing import List, Optional, Dict, Any, Tuple
from app.graph.state import RecruitState
from app.graph.builder import graph
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.rag.vector_store import get_supabase_client
from app.core.logging import get_all_logs, set_telemetry_context, clear_telemetry_context
from app.services.persistence_service import (
    persist_job,
    persist_applications,
    persist_interviews,
    persist_chat_message,
    update_session_metadata,
)

logger = logging.getLogger(__name__)


def ensure_session_exists(client: Any, user_id: str, session_id: Optional[str]) -> str:
    """
    Ensures that a session with `session_id` exists for `user_id`.
    Returns a valid session ID.
    """
    if not session_id:
        session_id = str(uuid.uuid4())

    try:
        existing_sess = (
            client.table("chat_sessions")
            .select("id")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not existing_sess.data or len(existing_sess.data) == 0:
            client.table("chat_sessions").insert({
                "id": session_id,
                "user_id": user_id,
                "title": "New Hiring Campaign",
            }).execute()
    except Exception as e:
        logger.warning(f"[campaign_service] Failed to ensure session row: {e}")

    return session_id


def hydrate_chat_context(
    client: Any,
    user_id: str,
    session_id: str,
    jd_dict: Optional[Dict[str, Any]],
    resumes_data: List[Dict[str, Any]],
    history_items: List[Any],
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, str]]]:
    """
    Auto-hydrates context from persistent database tables if missing from payload:
    1. Job description (via session's job_id)
    2. Candidate resumes (up to 50 for the user)
    3. Conversation history (last 20 messages)
    """
    # 1. Auto-hydrate JD
    if not jd_dict and session_id:
        try:
            sess_lookup = (
                client.table("chat_sessions")
                .select("job_id")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if sess_lookup.data and sess_lookup.data[0].get("job_id"):
                job_lk = (
                    client.table("jobs")
                    .select("jd_structured")
                    .eq("id", sess_lookup.data[0]["job_id"])
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                )
                if job_lk.data and job_lk.data[0].get("jd_structured"):
                    jd_dict = job_lk.data[0]["jd_structured"]
        except Exception as e:
            logger.warning(f"[campaign_service] Auto-hydrate JD error: {e}")

    # 2. Auto-hydrate candidate resumes
    hydrated_resumes = list(resumes_data)
    if not hydrated_resumes:
        try:
            cands_db = (
                client.table("candidates")
                .select("id, full_name, email, phone, raw_resume_text, metadata")
                .eq("user_id", user_id)
                .limit(50)
                .execute()
            )
            for c in (cands_db.data or []):
                meta = c.get("metadata") or {}
                hydrated_resumes.append({
                    "candidate_id": c["id"],
                    "name": c["full_name"],
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "raw_text": c.get("raw_resume_text"),
                    "skills": meta.get("skills", []),
                    "work_experience": meta.get("work_experience", []),
                    "education": meta.get("education", []),
                    "experience_years": meta.get("experience_years", 0),
                    "location": meta.get("location"),
                    "match_score": meta.get("match_score"),
                    "matched_skills": meta.get("matched_skills", []),
                    "gaps": meta.get("gaps", []),
                    "red_flags": meta.get("red_flags", []),
                })
        except Exception as e:
            logger.warning(f"[campaign_service] Auto-hydrate candidates error: {e}")

    # 3. Auto-hydrate conversation history
    hydrated_history: List[Dict[str, str]] = []
    for item in history_items:
        if hasattr(item, "role") and hasattr(item, "content"):
            hydrated_history.append({"role": item.role, "content": item.content})
        elif isinstance(item, dict):
            hydrated_history.append({"role": item.get("role", "user"), "content": item.get("content", "")})

    if not hydrated_history and session_id:
        try:
            prev_msgs = (
                client.table("chat_messages")
                .select("role, content")
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .order("created_at", desc=False)
                .limit(20)
                .execute()
            )
            for pm in (prev_msgs.data or []):
                hydrated_history.append({"role": pm["role"], "content": pm["content"]})
        except Exception as e:
            logger.warning(f"[campaign_service] Auto-hydrate conversation history error: {e}")

    return jd_dict, hydrated_resumes, hydrated_history


def execute_agent_turn(
    user_id: str,
    session_id: str,
    message: str,
    jd_dict: Optional[Dict[str, Any]],
    resumes_data: List[Dict[str, Any]],
    shortlist_data: Optional[List[Dict[str, Any]]],
    history_dicts: List[Dict[str, str]],
    pending_confirmation: Optional[Dict[str, Any]],
    last_intent: Optional[str],
    scheduled_interviews: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Executes a single agent turn:
    1. Persists incoming user message.
    2. Constructs RecruitState and executes LangGraph.
    3. Persists resulting artifacts atomically (job, applications, interviews, message, metadata).
    4. Serializes output dict for response.
    """
    client = get_supabase_client()
    set_telemetry_context(user_id=user_id, session_id=session_id)

    try:
        # 1. Persist user message
        persist_chat_message(
            client=client,
            user_id=user_id,
            session_id=session_id,
            role="user",
        content=message,
    )

    # 2. Reconstruct Pydantic models
    jd_obj = JobDescription(**jd_dict) if jd_dict else None
    resumes_objs = [Candidate(**r) for r in resumes_data]
    shortlist_objs = (
        [Candidate(**s) for s in shortlist_data]
        if shortlist_data
        else None
    )

    conversation_with_user = list(history_dicts)
    conversation_with_user.append({"role": "user", "content": message})

    initial_state = RecruitState(
        jd_structured=jd_obj,
        resumes=resumes_objs,
        conversation_history=conversation_with_user,
        last_shortlist=shortlist_objs,
        pending_confirmation=pending_confirmation,
        last_intent=last_intent,
        scheduled_interviews=scheduled_interviews,
        user_id=user_id,
    )

    # 3. Execute LangGraph agent
    result = graph.invoke(initial_state)

    # 4. Serialize outputs
    res_jd = result["jd_structured"].model_dump() if result.get("jd_structured") else None
    res_resumes = [c.model_dump() for c in result.get("resumes", [])]
    res_shortlist = (
        [c.model_dump() for c in result["last_shortlist"]]
        if result.get("last_shortlist")
        else None
    )

    assistant_content = ""
    if result.get("conversation_history"):
        assistant_content = result["conversation_history"][-1]["content"]

    res_history = [
        {"role": m["role"], "content": m["content"]}
        for m in result.get("conversation_history", [])
    ]

    logs = get_all_logs()

    # 5. Atomic persistence:
    # (a) Job
    job_id = None
    if result.get("jd_structured") and result["jd_structured"].role:
        job_id = persist_job(
            client=client,
            user_id=user_id,
            jd_structured=result["jd_structured"],
            raw_text=getattr(result["jd_structured"], "raw_text", "") or "",
        )

    # (b) Shortlist / Applications
    if job_id and result.get("last_shortlist"):
        persist_applications(
            client=client,
            user_id=user_id,
            job_id=job_id,
            shortlist=result["last_shortlist"],
        )

    # (c) Scheduled Interviews
    if result.get("scheduled_interviews"):
        persist_interviews(
            client=client,
            user_id=user_id,
            scheduled_interviews=result["scheduled_interviews"],
            job_id=job_id,
        )

    # (d) Assistant message
    persist_chat_message(
        client=client,
        user_id=user_id,
        session_id=session_id,
        role="assistant",
        content=assistant_content,
        metadata={"router_logs": logs},
    )

    # (e) Session metadata
    title = None
    if result.get("jd_structured") and result["jd_structured"].role:
        title = f"Hiring: {result['jd_structured'].role}"

    update_session_metadata(
        client=client,
        user_id=user_id,
        session_id=session_id,
        title=title,
        job_id=job_id,
        last_intent=result.get("last_intent"),
        pending_confirmation=result.get("pending_confirmation"),
    )

        return {
            "response": assistant_content,
            "jd_structured": res_jd,
            "resumes": res_resumes,
            "last_shortlist": res_shortlist,
            "pending_confirmation": result.get("pending_confirmation"),
            "last_intent": result.get("last_intent"),
            "conversation_history": res_history,
            "router_logs": logs,
            "scheduled_interviews": result.get("scheduled_interviews"),
            "session_id": session_id,
        }
    finally:
        clear_telemetry_context()
