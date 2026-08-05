"""
backend/app/api/routes_chat.py
------------------------------
Multi-tenant, authenticated chat API routes.

Every endpoint now:
  - Requires a valid JWT via `get_current_user_id` dependency.
  - Scopes all DB reads/writes strictly to the authenticated user_id.
  - Persists complete agent state (JD, resumes, history, etc.) after each turn.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

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

    Receives message + active campaign state, executes the multi-agent graph,
    and auto-persists the full resulting state to the DB scoped to user_id.
    """
    try:
        # ── Reconstruct Pydantic models from raw request dicts ─────────────────
        jd_obj = JobDescription(**req.jd_structured) if req.jd_structured else None

        resumes_objs = [Candidate(**r) for r in req.resumes]

        shortlist_objs = (
            [Candidate(**s) for s in req.last_shortlist]
            if req.last_shortlist
            else None
        )

        history_dicts = [
            {"role": msg.role, "content": msg.content}
            for msg in req.conversation_history
        ]
        history_dicts.append({"role": "user", "content": req.message})

        # ── Build LangGraph state ──────────────────────────────────────────────
        state = {
            "jd_structured": jd_obj,
            "resumes": resumes_objs,
            "conversation_history": history_dicts,
            "last_shortlist": shortlist_objs,
            "pending_confirmation": req.pending_confirmation,
            "last_intent": req.last_intent,
            "scheduled_interviews": req.scheduled_interviews,
        }

        # ── Execute the multi-agent graph ──────────────────────────────────────
        result = graph.invoke(state)

        # ── Serialize Pydantic objects back to raw dicts ───────────────────────
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

        # ── Retrieve trace/router logs ─────────────────────────────────────────
        from app.core.logging import get_all_logs
        logs = get_all_logs()

        # ── Persist updated campaign state (scoped strictly to user_id) ────────
        if req.session_id:
            try:
                client = get_supabase_client()

                # Derive a meaningful campaign title from the JD role
                title = None
                if result["jd_structured"] and result["jd_structured"].role:
                    title = f"Hiring: {result['jd_structured'].role}"

                hist_dump = [{"role": m.role, "content": m.content} for m in res_history]

                update_data: Dict[str, Any] = {
                    "user_id": user_id,          # enforce ownership on every update
                    "jd_structured": res_jd,
                    "resumes": res_resumes,
                    "last_shortlist": res_shortlist,
                    "pending_confirmation": result["pending_confirmation"],
                    "last_intent": result["last_intent"],
                    "scheduled_interviews": result.get("scheduled_interviews") or [],
                    "conversation_history": hist_dump,
                }
                if title:
                    update_data["title"] = title

                # Double-filter by session_id AND user_id — prevents cross-user writes
                db_result = (
                    client.table("chat_sessions")
                    .update(update_data)
                    .eq("id", req.session_id)
                    .eq("user_id", user_id)
                    .execute()
                )

                if not db_result.data:
                    # Session not found OR belongs to another user — log and continue
                    import logging
                    logging.warning(
                        f"[auth] Session {req.session_id} not updated: "
                        f"not found or user_id mismatch (user={user_id})"
                    )

            except Exception as db_err:
                # Surface DB errors as a warning but do NOT crash the chat response
                import logging
                logging.error(
                    f"[db] Failed to persist chat session {req.session_id}: {db_err}"
                )

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
            session_id=req.session_id,
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


# ─── Session CRUD Endpoints (all user-scoped) ──────────────────────────────────

@router.get("/sessions")
async def get_sessions_endpoint(user_id: str = Depends(get_current_user_id)):
    """
    Returns all campaign sessions belonging to the authenticated user,
    sorted by most recently updated first.
    """
    client = get_supabase_client()
    try:
        res = (
            client.table("chat_sessions")
            .select("id, title, created_at, updated_at")
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
    Creates a new blank campaign session owned by the authenticated user.
    """
    client = get_supabase_client()
    try:
        payload = {
            "user_id": user_id,
            "title": "New Hiring Campaign",
            "resumes": [],
            "conversation_history": [],
        }
        res = client.table("chat_sessions").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create session")
        return res.data[0]
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
    Returns the full state of a session. Enforces that the session belongs
    to the authenticated user — returns 404 if not found or mismatched.
    """
    client = get_supabase_client()
    try:
        res = (
            client.table("chat_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=404, detail="Campaign session not found."
            )
        return res.data[0]
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
    Permanently deletes a campaign session. Double-filtered by user_id
    to prevent cross-tenant deletion.
    """
    client = get_supabase_client()
    try:
        client.table("chat_sessions") \
            .delete() \
            .eq("id", session_id) \
            .eq("user_id", user_id) \
            .execute()
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
    Scoped strictly to the authenticated user.
    """
    # Strip user_id from caller-supplied payload to prevent privilege escalation
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
