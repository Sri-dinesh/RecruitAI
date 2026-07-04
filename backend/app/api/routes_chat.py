from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.graph.builder import graph
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

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

class ChatResponse(BaseModel):
    response: str
    jd_structured: Optional[Dict[str, Any]] = None
    resumes: List[Dict[str, Any]] = []
    last_shortlist: Optional[List[Dict[str, Any]]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    last_intent: Optional[str] = None
    conversation_history: List[ChatMessage]
    router_logs: List[Dict[str, Any]] = []

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """
    Stateless chat endpoint wrapping the LangGraph agent.
    Receives message and active conversation state, executes the graph,
    and returns the updated state and agent response.
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
            "last_intent": req.last_intent
        }
        
        # Execute the LangGraph
        result = graph.invoke(state)
        
        # Serialize Pydantic objects back to raw dicts
        res_jd = result["jd_structured"].model_dump() if result["jd_structured"] else None
        res_resumes = [c.model_dump() for c in result["resumes"]]
        res_shortlist = [c.model_dump() for c in result["last_shortlist"]] if result["last_shortlist"] else None
        
        assistant_content = result["conversation_history"][-1]["content"]
        res_history = [ChatMessage(role=m["role"], content=m["content"]) for m in result["conversation_history"]]
        
        # Retrieve all trace logs
        from app.core.logging import get_all_logs
        logs = get_all_logs()
        
        return ChatResponse(
            response=assistant_content,
            jd_structured=res_jd,
            resumes=res_resumes,
            last_shortlist=res_shortlist,
            pending_confirmation=result["pending_confirmation"],
            last_intent=result["last_intent"],
            conversation_history=res_history,
            router_logs=logs
        )
    except Exception as e:
        print(f"Error in FastAPI chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
