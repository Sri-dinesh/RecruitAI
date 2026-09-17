"""
backend/app/api/routes_evaluate.py
-----------------------------------
Authenticated, multi-tenant candidate rubric assessment and ATS export endpoints.
Persists evaluations directly to PostgreSQL schema as single source of truth (BUG-2).
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client

router = APIRouter()


def _to_uuid_str(val: str) -> str:
    """
    Ensures an identifier is a compliant UUID string for PostgreSQL uuid fields.
    If arbitrary string is passed, derives deterministic UUID.
    """
    try:
        return str(uuid.UUID(str(val)))
    except (ValueError, AttributeError, TypeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(val)))


class CandidateEvaluationRequest(BaseModel):
    candidate_id: str
    job_id: Optional[str] = Field(default=None, description="Optional target job UUID to link evaluation application")
    session_id: Optional[str] = Field(default=None, description="Optional campaign session UUID")
    tech_score: int = Field(..., ge=1, le=5, description="Technical fit rating 1-5")
    comm_score: int = Field(..., ge=1, le=5, description="Communication & culture fit rating 1-5")
    notes: Optional[str] = Field(default="", description="Recruiter and interviewer notes")
    status: Optional[str] = Field(default=None, description="Candidate status: shortlisted, offered, rejected, new")


class ATSExportRequest(BaseModel):
    format: str = Field(default="json", description="Export format: json or csv")
    session_id: Optional[str] = None


@router.post("/candidates/evaluate")
def save_candidate_evaluation(
    req: CandidateEvaluationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Persists recruiter rubric assessment scores, status, and interview notes for a candidate.
    Saves to the multi-tenant PostgreSQL database as the single source of truth without in-memory caching.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    client = get_supabase_client()
    norm_cand_id = _to_uuid_str(req.candidate_id)
    norm_user_id = _to_uuid_str(user_id)

    eval_payload = {
        "candidate_id": req.candidate_id,
        "user_id": user_id,
        "tech_score": req.tech_score,
        "comm_score": req.comm_score,
        "notes": req.notes,
        "status": req.status,
        "updated_at": now_iso
    }

    try:
        # 1. Update or create candidate record in candidates table
        cand_meta_res = (
            client.table("candidates")
            .select("id, metadata")
            .eq("id", norm_cand_id)
            .eq("user_id", norm_user_id)
            .limit(1)
            .execute()
        )

        rubric_data = {
            "tech_score": req.tech_score,
            "comm_score": req.comm_score,
            "notes": req.notes,
            "updated_at": now_iso
        }

        if cand_meta_res.data:
            cm = cand_meta_res.data[0].get("metadata") or {}
            if isinstance(cm, str):
                try:
                    cm = json.loads(cm)
                except (json.JSONDecodeError, TypeError):
                    cm = {}
            if req.status:
                cm["status"] = req.status
            cm["rubric"] = rubric_data
            if req.session_id:
                cm["session_id"] = req.session_id
                s_ids = set(cm.get("session_ids") or [])
                s_ids.add(req.session_id)
                cm["session_ids"] = list(s_ids)

            client.table("candidates").update({"metadata": cm}).eq("id", norm_cand_id).eq("user_id", norm_user_id).execute()
        else:
            # Candidate row does not exist yet for this tenant; insert stub candidate record
            stub_meta = {
                "status": req.status or "evaluated",
                "rubric": rubric_data
            }
            if req.session_id:
                stub_meta["session_id"] = req.session_id
                stub_meta["session_ids"] = [req.session_id]

            client.table("candidates").insert({
                "id": norm_cand_id,
                "user_id": norm_user_id,
                "full_name": f"Candidate {req.candidate_id}",
                "email": f"{req.candidate_id}@recruitai.local",
                "raw_resume_text": "",
                "metadata": stub_meta
            }).execute()

        # 2. Update existing application or create application if job/session association exists
        app_res = (
            client.table("applications")
            .select("id, match_reasoning")
            .eq("candidate_id", norm_cand_id)
            .eq("user_id", norm_user_id)
            .limit(1)
            .execute()
        )
        if app_res.data:
            app_id = app_res.data[0]["id"]
            reasoning = app_res.data[0].get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except (json.JSONDecodeError, TypeError):
                    reasoning = {}
            reasoning["rubric"] = rubric_data
            update_app_payload = {"match_reasoning": reasoning}
            if req.status:
                update_app_payload["status"] = req.status
            client.table("applications").update(update_app_payload).eq("id", app_id).execute()
        else:
            # Only create an application if an explicit job association is known (NO arbitrary job guessing)
            target_job_id = _to_uuid_str(req.job_id) if req.job_id else None
            if not target_job_id and req.session_id:
                sess_res = client.table("chat_sessions").select("job_id").eq("id", req.session_id).eq("user_id", norm_user_id).execute()
                if sess_res.data and sess_res.data[0].get("job_id"):
                    target_job_id = sess_res.data[0].get("job_id")

            if target_job_id:
                app_status = req.status if req.status else ("shortlisted" if req.tech_score >= 4 else "new")
                client.table("applications").insert({
                    "id": str(uuid.uuid4()),
                    "job_id": target_job_id,
                    "candidate_id": norm_cand_id,
                    "user_id": norm_user_id,
                    "match_score": (req.tech_score + req.comm_score) * 10,
                    "match_reasoning": {"rubric": rubric_data},
                    "status": app_status
                }).execute()

    except Exception as e:
        logging.error(f"[routes_evaluate] DB sync error for candidate rubric: {e}")
        raise HTTPException(status_code=500, detail=f"Database error saving evaluation: {e}")

    return {
        "status": "success",
        "message": f"Evaluation for candidate '{req.candidate_id}' saved successfully.",
        "evaluation": eval_payload
    }


@router.get("/candidates/{candidate_id}/evaluation")
def get_candidate_evaluation(
    candidate_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Retrieves recruiter rubric assessment scores and interview notes for a candidate,
    scoped strictly to the authenticated recruiter and queried from PostgreSQL as the single source of truth.
    """
    client = get_supabase_client()
    norm_cand_id = _to_uuid_str(candidate_id)
    norm_user_id = _to_uuid_str(user_id)
    found_status = None
    try:
        # 1. Primary check: check application rubric
        app_res = (
            client.table("applications")
            .select("match_reasoning, status")
            .eq("candidate_id", norm_cand_id)
            .eq("user_id", norm_user_id)
            .limit(1)
            .execute()
        )
        if app_res.data:
            if app_res.data[0].get("status"):
                found_status = app_res.data[0].get("status")
            reasoning = app_res.data[0].get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except (json.JSONDecodeError, TypeError):
                    reasoning = {}
            rubric = reasoning.get("rubric")
            if rubric:
                return {
                    "candidate_id": candidate_id,
                    "user_id": user_id,
                    "tech_score": rubric.get("tech_score", 0),
                    "comm_score": rubric.get("comm_score", 0),
                    "notes": rubric.get("notes", ""),
                    "status": found_status,
                    "updated_at": rubric.get("updated_at")
                }

        # 2. Secondary check: check candidate metadata rubric
        cand_res = (
            client.table("candidates")
            .select("metadata")
            .eq("id", norm_cand_id)
            .eq("user_id", norm_user_id)
            .limit(1)
            .execute()
        )
        if cand_res.data:
            meta = cand_res.data[0].get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            if not found_status and meta.get("status"):
                found_status = meta.get("status")
            rubric = meta.get("rubric")
            if rubric:
                return {
                    "candidate_id": candidate_id,
                    "user_id": user_id,
                    "tech_score": rubric.get("tech_score", 0),
                    "comm_score": rubric.get("comm_score", 0),
                    "notes": rubric.get("notes", ""),
                    "status": found_status,
                    "updated_at": rubric.get("updated_at")
                }
    except Exception as e:
        logging.warning(f"[routes_evaluate] DB lookup error for candidate {candidate_id}: {e}")

    return {
        "candidate_id": candidate_id,
        "user_id": user_id,
        "tech_score": 0,
        "comm_score": 0,
        "notes": "",
        "status": found_status
    }


@router.post("/export/ats")
def export_ats_data(
    req: ATSExportRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Generates server-side Greenhouse / Lever / Workday compliant ATS export payloads
    for the authenticated recruiter directly from PostgreSQL (single source of truth).
    Supports optional session-level scoping.
    """
    client = get_supabase_client()
    norm_user_id = _to_uuid_str(user_id)
    user_evaluations: Dict[str, Dict[str, Any]] = {}
    try:
        # 1. Query candidates for this user
        cand_query = client.table("candidates").select("id, full_name, email, metadata").eq("user_id", norm_user_id)
        cand_res = cand_query.execute()
        for c in (cand_res.data or []):
            cid = c.get("id")
            if not cid:
                continue
            c_meta = c.get("metadata") or {}
            if isinstance(c_meta, str):
                try:
                    c_meta = json.loads(c_meta)
                except (json.JSONDecodeError, TypeError):
                    c_meta = {}

            # If session_id filter is requested, verify membership
            if req.session_id:
                sess_ids = c_meta.get("session_ids") or []
                if c_meta.get("session_id") != req.session_id and req.session_id not in sess_ids:
                    continue

            rubric = c_meta.get("rubric") or {}
            user_evaluations[cid] = {
                "candidate_id": cid,
                "candidate_name": c.get("full_name") or "Candidate",
                "candidate_email": c.get("email"),
                "tech_score": rubric.get("tech_score", 0),
                "comm_score": rubric.get("comm_score", 0),
                "notes": rubric.get("notes", ""),
                "status": c_meta.get("status", "new"),
                "match_score": c_meta.get("match_score", 0)
            }

        # 2. Supplement / enrich from applications table
        app_res = client.table("applications").select("candidate_id, match_score, match_reasoning, status").eq("user_id", norm_user_id).execute()
        for a in (app_res.data or []):
            cid = a.get("candidate_id")
            if not cid:
                continue
            if req.session_id and cid not in user_evaluations:
                # If session_id was requested and candidate is not in this session, skip
                continue

            reasoning = a.get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except (json.JSONDecodeError, TypeError):
                    reasoning = {}
            rubric = reasoning.get("rubric") or {}
            if cid in user_evaluations:
                if rubric.get("tech_score"):
                    user_evaluations[cid]["tech_score"] = rubric.get("tech_score", 0)
                if rubric.get("comm_score"):
                    user_evaluations[cid]["comm_score"] = rubric.get("comm_score", 0)
                if rubric.get("notes"):
                    user_evaluations[cid]["notes"] = rubric.get("notes", "")
                if a.get("status"):
                    user_evaluations[cid]["status"] = a.get("status")
                if a.get("match_score") is not None:
                    user_evaluations[cid]["match_score"] = a.get("match_score")
            else:
                user_evaluations[cid] = {
                    "candidate_id": cid,
                    "candidate_name": "Candidate",
                    "candidate_email": None,
                    "tech_score": rubric.get("tech_score", 0),
                    "comm_score": rubric.get("comm_score", 0),
                    "notes": rubric.get("notes", ""),
                    "status": a.get("status", "new"),
                    "match_score": a.get("match_score", 0)
                }
    except Exception as e:
        logging.warning(f"[routes_evaluate] ATS export DB query notice: {e}")

    if req.format.lower() == "csv":
        import io
        import csv
        from fastapi.responses import Response
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Candidate ID", "Candidate Name", "Email", "Status", "Match Score", "Tech Score", "Comm Score", "Notes"])
        for cid, eval_data in user_evaluations.items():
            writer.writerow([
                eval_data.get("candidate_id", cid),
                eval_data.get("candidate_name", "Candidate"),
                eval_data.get("candidate_email", ""),
                eval_data.get("status", "new"),
                eval_data.get("match_score", 0),
                eval_data.get("tech_score", 0),
                eval_data.get("comm_score", 0),
                eval_data.get("notes", "").replace("\n", " "),
            ])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=ats_export.csv"}
        )

    return {
        "status": "success",
        "format": req.format,
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "evaluations_count": len(user_evaluations),
        "evaluations": user_evaluations
    }


class CandidateStatusRequest(BaseModel):
    status: str = Field(..., description="Candidate status: shortlisted, offered, rejected, new")
    session_id: Optional[str] = Field(default=None, description="Optional campaign session UUID")
    actor: Optional[str] = Field(default="human_recruiter", description="Action initiator: human_recruiter or automated_agent")


@router.post("/candidates/{candidate_id}/status")
@router.patch("/candidates/{candidate_id}/status")
def update_candidate_status_endpoint(
    candidate_id: str,
    req: CandidateStatusRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Persists candidate recruitment status directly to PostgreSQL (BUG-6).
    Enforces GDPR Art. 22 human-in-the-loop guard against automated adverse decisions (AI-SEC-6).
    Updates candidates metadata and applications status for tenant isolation.
    """
    # AI-SEC-6: GDPR Art. 22 Human-in-the-Loop Guard
    if req.actor == "automated_agent" and req.status.lower() in ("rejected", "disqualified"):
        raise HTTPException(
            status_code=403,
            detail="GDPR Art. 22 Violation: Adverse automated hiring decisions prohibited. "
                   "Candidate rejection requires explicit authenticated human recruiter action."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    client = get_supabase_client()
    norm_cand_id = _to_uuid_str(candidate_id)
    norm_user_id = _to_uuid_str(user_id)

    try:
        # 1. Update candidate metadata
        cand_res = (
            client.table("candidates")
            .select("id, metadata")
            .eq("id", norm_cand_id)
            .eq("user_id", norm_user_id)
            .limit(1)
            .execute()
        )
        if cand_res.data:
            cm = cand_res.data[0].get("metadata") or {}
            if isinstance(cm, str):
                try:
                    cm = json.loads(cm)
                except (json.JSONDecodeError, TypeError):
                    cm = {}
            cm["status"] = req.status
            cm["status_updated_at"] = now_iso
            if req.session_id:
                cm["session_id"] = req.session_id
                s_ids = set(cm.get("session_ids") or [])
                s_ids.add(req.session_id)
                cm["session_ids"] = list(s_ids)

            client.table("candidates").update({"metadata": cm}).eq("id", norm_cand_id).eq("user_id", norm_user_id).execute()
        else:
            stub_meta: dict[str, Any] = {
                "status": req.status,
                "status_updated_at": now_iso
            }
            if req.session_id:
                stub_meta["session_id"] = req.session_id
                stub_meta["session_ids"] = [req.session_id]
            client.table("candidates").insert({
                "id": norm_cand_id,
                "user_id": norm_user_id,
                "full_name": f"Candidate {candidate_id}",
                "email": f"{candidate_id}@recruitai.local",
                "raw_resume_text": "",
                "metadata": stub_meta
            }).execute()

        # 2. Update applications table status if application exists
        client.table("applications").update({"status": req.status}).eq("candidate_id", norm_cand_id).eq("user_id", norm_user_id).execute()

        return {
            "status": "success",
            "candidate_id": candidate_id,
            "candidate_status": req.status,
            "new_status": req.status
        }
    except Exception as e:
        logging.error(f"[routes_evaluate] Error updating candidate status: {e}")
        raise HTTPException(status_code=500, detail=f"Database error updating status: {e}")

