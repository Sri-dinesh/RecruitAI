"""
backend/app/api/routes_reports.py
----------------------------------
Corporate recruitment PDF report generation service.
Supports direct POST generation and authenticated mobile-friendly GET session download.
"""

import io
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client
from app.services.report_generator import generate_recruitment_report

router = APIRouter()


class ReportRequest(BaseModel):
    jd: Optional[Dict[str, Any]] = None
    shortlist: List[Dict[str, Any]] = []
    interview_questions: str = ""
    salary_data: str = ""


@router.post("/reports/generate")
async def generate_report_endpoint(req: ReportRequest):
    """
    Exposes a POST route to generate a styled corporate recruitment PDF report.
    Streams back binary PDF data.
    """
    try:
        jd_data = req.jd or {}
        shortlist_data = req.shortlist
        questions = req.interview_questions
        salary = req.salary_data
        
        pdf_bytes = generate_recruitment_report(jd_data, shortlist_data, questions, salary)
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=recruitment_report.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        print(f"Error in FastAPI report generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/session/{session_id}")
async def generate_session_report_endpoint(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Mobile-optimized GET endpoint to generate and download a complete recruitment report
    directly from an existing campaign session. Native mobile downloaders (e.g. expo-file-system)
    can query this endpoint with standard Bearer authorization headers.
    """
    client = get_supabase_client()
    try:
        # 1. Fetch campaign session
        sess_res = client.table("chat_sessions").select("*").eq("id", session_id).eq("user_id", user_id).execute()
        if not sess_res.data:
            raise HTTPException(status_code=404, detail="Campaign session not found.")
        session_row = sess_res.data[0]
        job_id = session_row.get("job_id")

        # 2. Fetch structured JD if available
        jd_data = {}
        if job_id:
            job_res = client.table("jobs").select("jd_structured").eq("id", job_id).eq("user_id", user_id).execute()
            if job_res.data and job_res.data[0].get("jd_structured"):
                jd_data = job_res.data[0]["jd_structured"]

        # 3. Fetch shortlist from applications table
        shortlist_data = []
        if job_id:
            apps_res = (
                client.table("applications")
                .select("candidate_id, match_score, match_reasoning, status, candidates(full_name, metadata)")
                .eq("job_id", job_id)
                .eq("user_id", user_id)
                .execute()
            )
            for app in (apps_res.data or []):
                cand_meta = app.get("candidates", {}).get("metadata") or {}
                reasoning = app.get("match_reasoning") or {}
                if isinstance(reasoning, str):
                    try:
                        import json
                        reasoning = json.loads(reasoning)
                    except Exception:
                        reasoning = {}
                shortlist_data.append({
                    "name": app.get("candidates", {}).get("full_name") or "Candidate",
                    "match_score": app.get("match_score") or 0,
                    "matched_skills": reasoning.get("matched_skills", []),
                    "gaps": reasoning.get("gaps", []),
                    "experience_years": cand_meta.get("experience_years", 0),
                    "summary": reasoning.get("summary", ""),
                })

        # 4. Search recent chat messages for interview questions and salary data
        msgs_res = (
            client.table("chat_messages")
            .select("content, role")
            .eq("session_id", session_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        questions = ""
        salary = ""
        for m in (msgs_res.data or []):
            content = m.get("content", "")
            if not questions and ("interview question" in content.lower() or "prep question" in content.lower()):
                questions = content
            if not salary and ("salary" in content.lower() or "compensation" in content.lower()):
                salary = content

        pdf_bytes = generate_recruitment_report(jd_data, shortlist_data, questions, salary)
        filename = f"recruitment_report_{session_id[:8]}.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating session PDF report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")
