"""
backend/app/api/routes_chat.py
------------------------------
Lean chat API controller (<150 lines) providing authenticated agent execution,
async job queueing (ARCH-4), and Server-Sent Events (SSE) streaming.
"""

import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from app.graph.builder import graph  # Re-exported for test mocking compatibility
from app.rag.vector_store import get_supabase_client
from app.core.auth import get_current_user_id
from app.services.campaign_service import (
    ensure_session_exists,
    hydrate_chat_context,
    execute_agent_turn,
)
from app.services.job_queue import job_manager
from app.api.routes_sessions import _LAST_RESET_REQUESTS  # Re-exported for test compatibility

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    jd_structured: Optional[Dict[str, Any]] = None
    resumes: List[Dict[str, Any]] = []
    last_shortlist: Optional[List[Dict[str, Any]]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    last_intent: Optional[str] = None
    scheduled_interviews: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None
    async_mode: Optional[bool] = False


class ChatResponse(BaseModel):
    response: str
    jd_structured: Optional[Dict[str, Any]] = None
    resumes: List[Dict[str, Any]] = []
    last_shortlist: Optional[List[Dict[str, Any]]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    last_intent: Optional[str] = None
    conversation_history: List[ChatMessage] = []
    router_logs: List[Dict[str, Any]] = []
    scheduled_interviews: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    async_mode: bool = Query(False, description="Whether to run asynchronously via background job queue"),
    user_id: str = Depends(get_current_user_id),
):
    """
    Authenticated multi-tenant chat endpoint.
    Supports synchronous execution (default) and asynchronous job queuing (ARCH-4).
    """
    client = get_supabase_client()
    session_id = ensure_session_exists(client, user_id, req.session_id)

    jd_dict, resumes_data, history_dicts = hydrate_chat_context(
        client=client,
        user_id=user_id,
        session_id=session_id,
        jd_dict=req.jd_structured,
        resumes_data=req.resumes,
        history_items=req.conversation_history,
    )

    should_run_async = async_mode or bool(req.async_mode)

    if should_run_async:
        job = job_manager.create_job(user_id=user_id, session_id=session_id)
        job_manager.start_job(
            job,
            execute_agent_turn,
            user_id=user_id,
            session_id=session_id,
            message=req.message,
            jd_dict=jd_dict,
            resumes_data=resumes_data,
            shortlist_data=req.last_shortlist,
            history_dicts=history_dicts,
            pending_confirmation=req.pending_confirmation,
            last_intent=req.last_intent,
            scheduled_interviews=req.scheduled_interviews,
        )
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "job_id": job.job_id,
                "session_id": session_id,
                "status": "queued",
                "check_url": f"/api/chat/jobs/{job.job_id}",
                "stream_url": f"/api/chat/jobs/{job.job_id}/stream",
            },
        )

    try:
        result = execute_agent_turn(
            user_id=user_id,
            session_id=session_id,
            message=req.message,
            jd_dict=jd_dict,
            resumes_data=resumes_data,
            shortlist_data=req.last_shortlist,
            history_dicts=history_dicts,
            pending_confirmation=req.pending_confirmation,
            last_intent=req.last_intent,
            scheduled_interviews=req.scheduled_interviews,
        )
        return ChatResponse(**result)
    except Exception as exc:
        logger.error(f"[chat_endpoint] Agent execution failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/chat/jobs/{job_id}")
async def get_chat_job_status(job_id: str, user_id: str = Depends(get_current_user_id)):
    """Retrieves status and results for an asynchronous agent job."""
    job = job_manager.get_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent job not found.")
    return job.to_dict()


@router.get("/chat/jobs/{job_id}/stream")
async def stream_chat_job_events(job_id: str, user_id: str = Depends(get_current_user_id)):
    """Streams real-time Server-Sent Events (SSE) for an asynchronous agent job."""
    job = job_manager.get_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent job not found.")
    return StreamingResponse(job_manager.stream_events(job), media_type="text/event-stream")
