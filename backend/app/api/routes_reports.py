"""
backend/app/api/routes_reports.py
----------------------------------
Corporate recruitment PDF report generation service.
Supports direct POST generation and authenticated session-linked GET downloads
for both web dashboards and native mobile applications.
"""

import io
import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client
from app.services.report_generator import generate_recruitment_report

router = APIRouter()
logger = logging.getLogger(__name__)


class ReportRequest(BaseModel):
    jd: Optional[Dict[str, Any]] = None
    shortlist: List[Dict[str, Any]] = []
    interview_questions: str = ""
    salary_data: str = ""
    candidates: List[Dict[str, Any]] = []
    evaluations: Optional[Dict[str, Any]] = None
    scheduled_interviews: List[Dict[str, Any]] = []
    is_blind_mode: Optional[bool] = False
    session_title: Optional[str] = None
    recruiter_name: Optional[str] = None


@router.post("/reports/generate")
async def generate_report_endpoint(
    req: ReportRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Exposes a POST route to compile and generate a styled corporate recruitment PDF report.
    Streams back binary PDF data.
    """
    try:
        jd_data = req.jd or {}
        shortlist_data = req.shortlist
        questions = req.interview_questions
        salary = req.salary_data

        pdf_bytes = generate_recruitment_report(
            jd=jd_data,
            shortlist=shortlist_data,
            interview_questions=questions,
            salary_data=salary,
            candidates=req.candidates or [],
            evaluations=req.evaluations,
            scheduled_interviews=req.scheduled_interviews or [],
            is_blind_mode=bool(req.is_blind_mode),
            session_title=req.session_title,
            recruiter_name=req.recruiter_name,
        )

        filename = "recruitment_report.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except Exception as e:
        logger.error(f"[generate_report_endpoint] Report generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/session/{session_id}")
async def generate_session_report_endpoint(
    session_id: str,
    blind_mode: Optional[bool] = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    GET endpoint to compile and download a complete, executive-grade recruitment report
    directly from an existing campaign session with full candidate ranking, evaluations,
    interview prep questions, salary intelligence, and scheduled slots.
    """
    client = get_supabase_client()
    try:
        # 1. Fetch campaign session
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
        session_title = session_row.get("title")

        # 2. Fetch recruiter profile & preferences
        recruiter_name = "Lead Recruiter"
        is_blind_mode = False
        try:
            usr_res = client.table("users").select("full_name, preferences").eq("id", user_id).execute()
            if usr_res.data and len(usr_res.data) > 0:
                recruiter_name = usr_res.data[0].get("full_name") or "Lead Recruiter"
                prefs = usr_res.data[0].get("preferences") or {}
                if isinstance(prefs, str):
                    try:
                        prefs = json.loads(prefs)
                    except Exception:
                        prefs = {}
                if blind_mode is not None:
                    is_blind_mode = bool(blind_mode)
                else:
                    is_blind_mode = prefs.get("blind_mode_default") is True
        except Exception:
            pass

        # 3. Fetch structured JD if linked
        jd_data = {}
        if job_id:
            job_res = (
                client.table("jobs")
                .select("jd_structured")
                .eq("id", job_id)
                .eq("user_id", user_id)
                .execute()
            )
            if job_res.data and job_res.data[0].get("jd_structured"):
                jd_data = job_res.data[0]["jd_structured"]

        # 4. Fetch session candidates and evaluations
        candidates_list = []
        shortlist_data = []

        # Find candidates linked to this session
        session_cand_ids = set()
        try:
            sc_res = client.table("session_candidates").select("candidate_id").eq("session_id", session_id).execute()
            session_cand_ids = {r["candidate_id"] for r in (sc_res.data or [])}
        except Exception:
            pass

        cand_res = (
            client.table("candidates")
            .select("id, full_name, email, phone, metadata")
            .eq("user_id", user_id)
            .execute()
        )

        apps_res = (
            client.table("applications")
            .select("candidate_id, match_score, match_reasoning, status, job_id")
            .eq("user_id", user_id)
            .execute()
        )
        apps_map = {
            a["candidate_id"]: a
            for a in (apps_res.data or [])
            if not job_id or a.get("job_id") == job_id
        }

        # Fetch evaluations map
        evals_map = {}
        try:
            eval_res = (
                client.table("candidate_evaluations")
                .select("*")
                .eq("session_id", session_id)
                .execute()
            )
            for ev in (eval_res.data or []):
                evals_map[ev["candidate_id"]] = ev
        except Exception:
            pass

        for c in (cand_res.data or []):
            meta = c.get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}

            belongs = (
                c["id"] in session_cand_ids
                or c["id"] in apps_map
                or meta.get("session_id") == session_id
                or session_id in (meta.get("session_ids") or [])
            )
            if not belongs and len(session_cand_ids) > 0:
                continue

            app = apps_map.get(c["id"]) or {}
            reasoning = app.get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except Exception:
                    reasoning = {}

            matched_skills = reasoning.get("matched_skills") or meta.get("skills", [])
            gaps = reasoning.get("gaps") or []
            score = app.get("match_score") if app.get("match_score") is not None else meta.get("match_score", 0)
            status = app.get("status") or meta.get("status") or "new"

            cand_entry = {
                "candidate_id": c["id"],
                "name": c["full_name"],
                "email": c.get("email"),
                "phone": c.get("phone"),
                "match_score": score,
                "status": status,
                "matched_skills": matched_skills,
                "gaps": gaps,
                "experience_years": meta.get("experience_years", 0),
                "summary": reasoning.get("summary", ""),
            }
            candidates_list.append(cand_entry)

            if status in ["shortlisted", "offered"]:
                shortlist_data.append(cand_entry)

        # 5. Fetch scheduled interviews
        scheduled_interviews = []
        try:
            itv_res = (
                client.table("interviews")
                .select("*")
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .execute()
            )
            if itv_res.data:
                scheduled_interviews = itv_res.data
        except Exception:
            pass

        # 6. Search recent chat messages for questions and salary data
        msgs_res = (
            client.table("chat_messages")
            .select("content, role")
            .eq("session_id", session_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(15)
            .execute()
        )
        questions = ""
        salary = ""
        for m in (msgs_res.data or []):
            content = m.get("content", "")
            if not questions and any(term in content.lower() for term in ["interview question", "prep question", "technical question"]):
                questions = content
            if not salary and any(term in content.lower() for term in ["salary", "compensation", "benchmark"]):
                salary = content

        pdf_bytes = generate_recruitment_report(
            jd=jd_data,
            shortlist=shortlist_data,
            interview_questions=questions,
            salary_data=salary,
            candidates=candidates_list,
            evaluations=evals_map,
            scheduled_interviews=scheduled_interviews,
            is_blind_mode=is_blind_mode,
            session_title=session_title,
            recruiter_name=recruiter_name,
        )

        role_slug = re_slug(jd_data.get("role") or session_title or "recruitment_report")
        filename = f"{role_slug}_{session_id[:8]}.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generate_session_report_endpoint] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


def re_slug(text: str) -> str:
    """Creates a clean filesystem-safe slug from a string."""
    import re
    cleaned = re.sub(r"[^a-zA-Z0-9_\-]+", "_", text.strip().lower())
    return cleaned.strip("_") or "report"
