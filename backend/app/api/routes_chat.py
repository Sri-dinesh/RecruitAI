"""
backend/app/api/routes_chat.py
------------------------------
Multi-tenant, authenticated chat API routes backed by the normalized
production database schema (jobs, candidates, applications, interviews,
chat_sessions, chat_messages).
"""

import uuid
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.graph.state import RecruitState
from app.graph.builder import graph
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.rag.vector_store import get_supabase_client
from app.core.auth import get_current_user_id

router = APIRouter()


# ─── Request / Response Models ────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage]
    jd_structured: Optional[Dict[str, Any]] = None
    resumes: List[Dict[str, Any]] = []
    last_shortlist: Optional[List[Dict[str, Any]]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    last_intent: Optional[str] = None
    scheduled_interviews: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    jd_structured: Optional[Dict[str, Any]] = None
    resumes: List[Dict[str, Any]] = []
    last_shortlist: Optional[List[Dict[str, Any]]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    last_intent: Optional[str] = None
    conversation_history: List[ChatMessage]
    router_logs: List[Dict[str, Any]] = []
    scheduled_interviews: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None


# ─── Chat Endpoint ─────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Authenticated multi-tenant chat endpoint wrapping the LangGraph agent.

    1. Appends the user's message to `chat_messages`.
    2. Runs the multi-agent graph.
    3. Normalizes and persists resulting state:
       - Structured JD saved to `jobs` table (linked to `chat_sessions.job_id`)
       - Screened candidates/scores updated in `applications` table
       - Scheduled interviews saved to `interviews` table
       - Assistant reply and router logs appended to `chat_messages`
       - Session metadata updated in `chat_sessions`
    """
    client = get_supabase_client()
    session_id = req.session_id

    # 1. Ensure a valid session exists in DB
    if not session_id:
        session_id = str(uuid.uuid4())
    
    try:
        existing_sess = client.table("chat_sessions").select("id").eq("id", session_id).eq("user_id", user_id).execute()
        if not existing_sess.data or len(existing_sess.data) == 0:
            client.table("chat_sessions").insert({
                "id": session_id,
                "user_id": user_id,
                "title": "New Hiring Campaign"
            }).execute()
    except Exception as e:
        logging.warning(f"[chat] Failed to ensure session row: {e}")

    try:
        # 2. Mobile Bandwidth Optimization: Auto-hydrate state from database if omitted
        jd_dict = req.jd_structured
        if not jd_dict and session_id:
            try:
                sess_lookup = client.table("chat_sessions").select("job_id").eq("id", session_id).eq("user_id", user_id).limit(1).execute()
                if sess_lookup.data and sess_lookup.data[0].get("job_id"):
                    job_lk = client.table("jobs").select("jd_structured").eq("id", sess_lookup.data[0]["job_id"]).eq("user_id", user_id).limit(1).execute()
                    if job_lk.data and job_lk.data[0].get("jd_structured"):
                        jd_dict = job_lk.data[0]["jd_structured"]
            except Exception as e:
                logging.warning(f"[chat] Auto-hydrate JD error: {e}")

        resumes_data = list(req.resumes)
        if not resumes_data:
            try:
                cands_db = client.table("candidates").select("id, full_name, email, phone, raw_resume_text, metadata").eq("user_id", user_id).limit(50).execute()
                for c in (cands_db.data or []):
                    meta = c.get("metadata") or {}
                    resumes_data.append({
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
                logging.warning(f"[chat] Auto-hydrate candidates error: {e}")

        history_items = list(req.conversation_history)
        if not history_items and session_id:
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
                    history_items.append(ChatMessage(role=pm["role"], content=pm["content"]))
            except Exception as e:
                logging.warning(f"[chat] Auto-hydrate conversation history error: {e}")

        # 3. Persist incoming user message to `chat_messages`
        try:
            client.table("chat_messages").insert({
                "session_id": session_id,
                "user_id": user_id,
                "role": "user",
                "content": req.message
            }).execute()
        except Exception as e:
            logging.warning(f"[chat] Failed to persist user chat_message: {e}")

        # 4. Reconstruct Pydantic models
        jd_obj = JobDescription(**jd_dict) if jd_dict else None
        resumes_objs = [Candidate(**r) for r in resumes_data]
        shortlist_objs = (
            [Candidate(**s) for s in req.last_shortlist]
            if req.last_shortlist
            else None
        )

        history_dicts = [
            {"role": msg.role, "content": msg.content}
            for msg in history_items
        ]
        history_dicts.append({"role": "user", "content": req.message})

        # 4. Build LangGraph state & execute
        initial_state = RecruitState(
            jd_structured=jd_obj,
            resumes=resumes_objs,
            conversation_history=history_dicts,
            last_shortlist=shortlist_objs,
            pending_confirmation=req.pending_confirmation,
            last_intent=req.last_intent,
            scheduled_interviews=req.scheduled_interviews,
            user_id=user_id
        )

        result = graph.invoke(initial_state)

        # 5. Serialize output objects
        res_jd = result["jd_structured"].model_dump() if result["jd_structured"] else None
        res_resumes = [c.model_dump() for c in result["resumes"]]
        res_shortlist = (
            [c.model_dump() for c in result["last_shortlist"]]
            if result["last_shortlist"]
            else None
        )

        assistant_content = result["conversation_history"][-1]["content"]
        res_history = [
            ChatMessage(role=m["role"], content=m["content"])
            for m in result["conversation_history"]
        ]

        from app.core.logging import get_all_logs
        logs = get_all_logs()

        # 6. Relational Persistence:
        job_id = None
        # (a) Persist Job Description to `jobs` table
        if result["jd_structured"] and result["jd_structured"].role:
            try:
                job_title = result["jd_structured"].role
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
                        "raw_jd": result["jd_structured"].raw_text or "",
                    }).eq("id", job_id).eq("user_id", user_id).execute()
                else:
                    job_id = str(uuid.uuid4())
                    client.table("jobs").insert({
                        "id": job_id,
                        "user_id": user_id,
                        "title": job_title,
                        "raw_jd": result["jd_structured"].raw_text or "",
                        "jd_structured": res_jd,
                        "status": "active"
                    }).execute()
            except Exception as e:
                logging.warning(f"[chat] Failed to persist job: {e}")

        # (b) Persist Applications & match scores
        if job_id and result["last_shortlist"]:
            for cand in result["last_shortlist"]:
                try:
                    cand_id = cand.candidate_id
                    # Only link if valid candidate_id uuid exists
                    if cand_id and len(str(cand_id)) == 36:
                        client.table("applications").upsert({
                            "job_id": job_id,
                            "candidate_id": cand_id,
                            "user_id": user_id,
                            "match_score": cand.match_score or 0.0,
                            "match_reasoning": {
                                "matched_skills": cand.matched_skills or [],
                                "gaps": cand.gaps or [],
                                "summary": cand.summary
                            },
                            "status": "shortlisted"
                        }, on_conflict="job_id,candidate_id").execute()
                except Exception as e:
                    logging.warning(f"[chat] Failed to persist application: {e}")

        # (c) Persist Scheduled Interviews
        if result.get("scheduled_interviews"):
            for interview in result["scheduled_interviews"]:
                try:
                    cand_name = interview.get("candidate_name", "")
                    cand_res = (
                        client.table("candidates")
                        .select("id")
                        .eq("user_id", user_id)
                        .eq("full_name", cand_name)
                        .limit(1)
                        .execute()
                    )
                    cand_id = cand_res.data[0]["id"] if cand_res.data else None
                    slot = interview.get("slot") or "2026-08-15T10:00:00Z"
                    client.table("interviews").insert({
                        "candidate_id": cand_id,
                        "user_id": user_id,
                        "scheduled_at": slot,
                        "duration_minutes": 45,
                        "mode": "video",
                        "status": "scheduled",
                        "feedback": {"candidate_name": cand_name, "booked_at": interview.get("booked_at")}
                    }).execute()
                except Exception as e:
                    logging.warning(f"[chat] Failed to persist interview: {e}")

        # (d) Persist Assistant response to `chat_messages`
        try:
            client.table("chat_messages").insert({
                "session_id": session_id,
                "user_id": user_id,
                "role": "assistant",
                "content": assistant_content,
                "metadata": {"router_logs": logs}
            }).execute()
        except Exception as e:
            logging.warning(f"[chat] Failed to persist assistant chat_message: {e}")

        # (e) Update `chat_sessions` metadata
        try:
            title = None
            if result["jd_structured"] and result["jd_structured"].role:
                title = f"Hiring: {result['jd_structured'].role}"

            update_data: Dict[str, Any] = {
                "user_id": user_id,
                "last_intent": result["last_intent"],
                "pending_confirmation": result["pending_confirmation"],
            }
            if title:
                update_data["title"] = title
            if job_id:
                update_data["job_id"] = job_id

            client.table("chat_sessions").update(update_data).eq("id", session_id).eq("user_id", user_id).execute()
        except Exception as e:
            logging.warning(f"[chat] Failed to update chat_sessions metadata: {e}")

        return ChatResponse(
            response=assistant_content,
            jd_structured=res_jd,
            resumes=res_resumes,
            last_shortlist=res_shortlist,
            pending_confirmation=result["pending_confirmation"],
            last_intent=result["last_intent"],
            conversation_history=res_history,
            router_logs=logs,
            scheduled_interviews=result.get("scheduled_interviews"),
            session_id=session_id,
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Email Send Endpoint ───────────────────────────────────────────────────────

class EmailRequest(BaseModel):
    email_draft: str
    recipient_email: str


class EmailResponse(BaseModel):
    status: str


@router.post("/email/send", response_model=EmailResponse)
async def send_email_endpoint(
    req: EmailRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Send a recruiter outreach email. Requires authentication."""
    from app.tools.email_tool import send_email_draft
    try:
        res = send_email_draft.invoke(
            {"email_draft": req.email_draft, "recipient_email": req.recipient_email}
        )
        return EmailResponse(status=res)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Session CRUD Endpoints (Normalized Architecture) ─────────────────────────

@router.get("/sessions")
async def get_sessions_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Returns all campaign sessions belonging to the authenticated user.
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
        return res.data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.post("/sessions")
async def create_session_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Creates a new campaign session and initializes the greeting message in `chat_messages`.
    """
    client = get_supabase_client()
    session_id = str(uuid.uuid4())
    try:
        # 1. Insert session
        session_res = client.table("chat_sessions").insert({
            "id": session_id,
            "user_id": user_id,
            "title": "New Hiring Campaign",
        }).execute()

        # 2. Insert initial greeting into chat_messages
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

        if not session_res.data:
            raise HTTPException(status_code=500, detail="Failed to create session")
        return session_res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.get("/sessions/{session_id}")
async def get_session_details_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns the aggregated view of a campaign session for the frontend:
    - Session metadata from `chat_sessions`
    - Conversation messages from `chat_messages`
    - Structured JD from `jobs` (via `job_id`)
    - Candidates from `candidates`
    - Shortlist/evaluations from `applications`
    - Scheduled interviews from `interviews`
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

        # 4. Fetch candidate records from `candidates`
        cand_res = (
            client.table("candidates")
            .select("id, full_name, email, phone, raw_resume_text, metadata")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        candidates_list = []
        for c in (cand_res.data or []):
            meta = c.get("metadata") or {}
            candidates_list.append({
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
                cand_meta = a.get("candidates", {}).get("metadata") or {}
                reasoning = a.get("match_reasoning") or {}
                shortlist_list.append({
                    "candidate_id": a["candidate_id"],
                    "name": a.get("candidates", {}).get("full_name") or "Candidate",
                    "match_score": a.get("match_score"),
                    "matched_skills": reasoning.get("matched_skills", []),
                    "gaps": reasoning.get("gaps", []),
                    "summary": reasoning.get("summary", ""),
                    "experience_years": cand_meta.get("experience_years", 0),
                })

        # 6. Fetch scheduled interviews from `interviews`
        interviews_res = (
            client.table("interviews")
            .select("scheduled_at, feedback, candidates(full_name)")
            .eq("user_id", user_id)
            .order("scheduled_at", desc=False)
            .execute()
        )
        scheduled_interviews = []
        for iv in (interviews_res.data or []):
            cand_name = (
                iv.get("candidates", {}).get("full_name")
                or (iv.get("feedback") or {}).get("candidate_name")
                or "Candidate"
            )
            scheduled_interviews.append({
                "candidate_name": cand_name,
                "slot": iv.get("scheduled_at"),
                "booked_at": (iv.get("feedback") or {}).get("booked_at") or iv.get("scheduled_at")
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
