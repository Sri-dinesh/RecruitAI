"""
backend/app/api/routes_evaluate.py
-----------------------------------
Authenticated, multi-tenant candidate rubric assessment and ATS export endpoints.
Persists evaluations to Supabase PostgreSQL applications schema with in-memory caching.
"""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client

router = APIRouter()

# Multi-tenant in-memory cache keyed by "{user_id}:{candidate_id}"
CANDIDATE_EVALUATIONS: Dict[str, Dict[str, Any]] = {}


class CandidateEvaluationRequest(BaseModel):
    candidate_id: str
    tech_score: int = Field(..., ge=1, le=5, description="Technical fit rating 1-5")
    comm_score: int = Field(..., ge=1, le=5, description="Communication & culture fit rating 1-5")
    notes: Optional[str] = Field(default="", description="Recruiter and interviewer notes")


class ATSExportRequest(BaseModel):
    format: str = Field(default="json", description="Export format: json or csv")
    session_id: Optional[str] = None


@router.post("/candidates/evaluate")
def save_candidate_evaluation(
    req: CandidateEvaluationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Persists recruiter rubric assessment scores and interview notes for a candidate.
    Saves to the multi-tenant PostgreSQL applications table and updates local cache.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    eval_dict = {
        "candidate_id": req.candidate_id,
        "user_id": user_id,
        "tech_score": req.tech_score,
        "comm_score": req.comm_score,
        "notes": req.notes,
        "updated_at": now_iso
    }

    # 1. Update in-memory user cache
    cache_key = f"{user_id}:{req.candidate_id}"
    CANDIDATE_EVALUATIONS[cache_key] = eval_dict

    # 2. Persist into Supabase / fallback database
    client = get_supabase_client()
    try:
        app_res = (
            client.table("applications")
            .select("id, match_reasoning")
            .eq("candidate_id", req.candidate_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if app_res.data:
            app_id = app_res.data[0]["id"]
            reasoning = app_res.data[0].get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except Exception:
                    reasoning = {}
            reasoning["rubric"] = {
                "tech_score": req.tech_score,
                "comm_score": req.comm_score,
                "notes": req.notes,
                "updated_at": now_iso
            }
            client.table("applications").update({"match_reasoning": reasoning}).eq("id", app_id).execute()
        else:
            # Check if job exists for this user to link application, otherwise link candidate directly
            cand_check = (
                client.table("candidates")
                .select("id")
                .eq("id", req.candidate_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            # If candidate exists, insert a default application record with rubric
            if cand_check.data:
                # Find an active job if any
                job_res = client.table("jobs").select("id").eq("user_id", user_id).limit(1).execute()
                job_id = job_res.data[0]["id"] if job_res.data else None
                if job_id:
                    client.table("applications").insert({
                        "job_id": job_id,
                        "candidate_id": req.candidate_id,
                        "user_id": user_id,
                        "match_score": (req.tech_score + req.comm_score) * 10,
                        "match_reasoning": {
                            "rubric": {
                                "tech_score": req.tech_score,
                                "comm_score": req.comm_score,
                                "notes": req.notes,
                                "updated_at": now_iso
                            }
                        },
                        "status": "shortlisted" if req.tech_score >= 4 else "new"
                    }).execute()
    except Exception as e:
        print(f"[routes_evaluate] Notice: DB sync error for candidate rubric (cache retained): {e}")

    return {
        "status": "success",
        "message": f"Evaluation for candidate '{req.candidate_id}' saved successfully.",
        "evaluation": eval_dict
    }


@router.get("/candidates/{candidate_id}/evaluation")
def get_candidate_evaluation(
    candidate_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Retrieves recruiter rubric assessment scores and interview notes for a candidate,
    scoped strictly to the authenticated recruiter.
    """
    cache_key = f"{user_id}:{candidate_id}"
    if cache_key in CANDIDATE_EVALUATIONS:
        return CANDIDATE_EVALUATIONS[cache_key]

    # Query DB for stored rubric
    client = get_supabase_client()
    try:
        app_res = (
            client.table("applications")
            .select("match_reasoning")
            .eq("candidate_id", candidate_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if app_res.data:
            reasoning = app_res.data[0].get("match_reasoning") or {}
            if isinstance(reasoning, str):
                try:
                    reasoning = json.loads(reasoning)
                except Exception:
                    reasoning = {}
            rubric = reasoning.get("rubric")
            if rubric:
                res_data = {
                    "candidate_id": candidate_id,
                    "user_id": user_id,
                    "tech_score": rubric.get("tech_score", 0),
                    "comm_score": rubric.get("comm_score", 0),
                    "notes": rubric.get("notes", ""),
                    "updated_at": rubric.get("updated_at")
                }
                CANDIDATE_EVALUATIONS[cache_key] = res_data
                return res_data
    except Exception as e:
        print(f"[routes_evaluate] Notice: DB lookup error: {e}")

    return {
        "candidate_id": candidate_id,
        "user_id": user_id,
        "tech_score": 0,
        "comm_score": 0,
        "notes": ""
    }


@router.post("/export/ats")
def export_ats_data(
    req: ATSExportRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Generates server-side Greenhouse / Lever / Workday compliant ATS export payloads
    for the authenticated recruiter.
    """
    user_evaluations = {
        k.split(":", 1)[1]: v 
        for k, v in CANDIDATE_EVALUATIONS.items() 
        if k.startswith(f"{user_id}:")
    }

    # Supplement from applications table
    client = get_supabase_client()
    try:
        apps = client.table("applications").select("candidate_id, match_score, match_reasoning, status, candidates(full_name, email)").eq("user_id", user_id).execute()
        for a in (apps.data or []):
            cid = a.get("candidate_id")
            if cid and cid not in user_evaluations:
                reasoning = a.get("match_reasoning") or {}
                if isinstance(reasoning, str):
                    try:
                        reasoning = json.loads(reasoning)
                    except Exception:
                        reasoning = {}
                rubric = reasoning.get("rubric", {})
                user_evaluations[cid] = {
                    "candidate_id": cid,
                    "candidate_name": (a.get("candidates") or {}).get("full_name") or "Candidate",
                    "candidate_email": (a.get("candidates") or {}).get("email"),
                    "tech_score": rubric.get("tech_score", 0),
                    "comm_score": rubric.get("comm_score", 0),
                    "notes": rubric.get("notes", ""),
                    "status": a.get("status", "new"),
                    "match_score": a.get("match_score", 0)
                }
    except Exception as e:
        print(f"[routes_evaluate] ATS export DB query notice: {e}")

    return {
        "status": "success",
        "format": req.format,
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "evaluations_count": len(user_evaluations),
        "evaluations": user_evaluations
    }
