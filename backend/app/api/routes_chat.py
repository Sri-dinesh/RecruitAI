from fastapi import APIRouter, HTTPException
import asyncio
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.graph.builder import graph
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.rag.vector_store import get_supabase_client

router = APIRouter()

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

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    Stateless chat endpoint wrapping the LangGraph agent.
    Receives message and active conversation state, executes the graph,
    and returns the updated state and agent response.
    Additionally updates the database record if a session_id is provided.
    """
    try:
        # Re-construct Pydantic models from request state
        jd_obj = None
        if req.jd_structured:
            jd_obj = JobDescription(**req.jd_structured)
            
        resumes_objs = []
        for r in req.resumes:
            resumes_objs.append(Candidate(**r))
            
        shortlist_objs = None
        if req.last_shortlist:
            shortlist_objs = []
            for s in req.last_shortlist:
                shortlist_objs.append(Candidate(**s))
                
        # Compile history dicts
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in req.conversation_history]
        history_dicts.append({"role": "user", "content": req.message})
        
        # Build state dict
        state = {
            "jd_structured": jd_obj,
            "resumes": resumes_objs,
            "conversation_history": history_dicts,
            "last_shortlist": shortlist_objs,
            "pending_confirmation": req.pending_confirmation,
            "last_intent": req.last_intent,
            "scheduled_interviews": req.scheduled_interviews
        }
        
        # Execute the LangGraph without blocking the event loop
        result = await asyncio.to_thread(graph.invoke, state)
        
        # Serialize Pydantic objects back to raw dicts
        res_jd = result["jd_structured"].model_dump() if result["jd_structured"] else None
        res_resumes = [c.model_dump() for c in result["resumes"]]
        res_shortlist = [c.model_dump() for c in result["last_shortlist"]] if result["last_shortlist"] else None
        
        assistant_content = result["conversation_history"][-1]["content"]
        res_history = [ChatMessage(role=m["role"], content=m["content"]) for m in result["conversation_history"]]
        
        # Retrieve all trace logs
        from app.core.logging import get_all_logs
        logs = get_all_logs()
        
        # Persist session changes if a session ID is given
        if req.session_id:
            try:
                client = get_supabase_client()
                
                title = None
                if result["jd_structured"] and result["jd_structured"].role:
                    title = f"Hiring: {result['jd_structured'].role}"
                
                hist_dump = [{"role": m.role, "content": m.content} for m in res_history]
                
                update_data = {
                    "jd_structured": res_jd,
                    "resumes": res_resumes,
                    "last_shortlist": res_shortlist,
                    "pending_confirmation": result["pending_confirmation"],
                    "last_intent": result["last_intent"],
                    "scheduled_interviews": result.get("scheduled_interviews") or [],
                    "conversation_history": hist_dump
                }
                if title:
                    update_data["title"] = title
                    
                client.table("chat_sessions").update(update_data).eq("id", req.session_id).execute()
            except Exception as db_err:
                print(f"Failed to persist chat session {req.session_id} to DB: {db_err}")
        
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
            session_id=req.session_id
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in FastAPI chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class EmailRequest(BaseModel):
    email_draft: str
    recipient_email: str

class EmailResponse(BaseModel):
    status: str

@router.post("/email/send", response_model=EmailResponse)
async def send_email_endpoint(req: EmailRequest):
    from app.tools.email_tool import send_email_draft
    try:
        res = send_email_draft.invoke({
            "email_draft": req.email_draft,
            "recipient_email": req.recipient_email
        })
        return EmailResponse(status=res)
    except Exception as e:
        print(f"Error in FastAPI send email endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def get_sessions_endpoint():
    client = get_supabase_client()
    try:
        res = client.table("chat_sessions").select("id, title, created_at").order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        print(f"Database error in get_sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/sessions/{session_id}")
async def get_session_details_endpoint(session_id: str):
    client = get_supabase_client()
    try:
        res = client.table("chat_sessions").select("*").eq("id", session_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Session not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Database error in get_session_details ({session_id}): {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/sessions")
async def create_session_endpoint():
    client = get_supabase_client()
    try:
        res = client.table("chat_sessions").insert({"title": "New Chat"}).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create session")
        return res.data[0]
    except Exception as e:
        print(f"Database error in create_session: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(session_id: str):
    client = get_supabase_client()
    try:
        res = client.table("chat_sessions").delete().eq("id", session_id).execute()
        return {"message": f"Session {session_id} deleted successfully"}
    except Exception as e:
        print(f"Database error in delete_session ({session_id}): {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.patch("/sessions/{session_id}")
async def patch_session_endpoint(session_id: str, payload: dict):
    client = get_supabase_client()
    try:
        res = client.table("chat_sessions").update(payload).eq("id", session_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Session not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Database error in patch_session ({session_id}): {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


