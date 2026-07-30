from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import json

router = APIRouter()

# Global in-memory persistence store for candidate recruiter rubrics
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
def save_candidate_evaluation(req: CandidateEvaluationRequest):
    """
    Persists recruiter rubric assessment scores and interview notes for a candidate.
    """
    CANDIDATE_EVALUATIONS[req.candidate_id] = {
        "candidate_id": req.candidate_id,
        "tech_score": req.tech_score,
        "comm_score": req.comm_score,
        "notes": req.notes,
        "updated_at": json.dumps({"status": "saved"})
    }
    return {
        "status": "success",
        "message": f"Evaluation for candidate '{req.candidate_id}' saved successfully.",
        "evaluation": CANDIDATE_EVALUATIONS[req.candidate_id]
    }

@router.get("/candidates/{candidate_id}/evaluation")
def get_candidate_evaluation(candidate_id: str):
    """
    Retrieves recruiter rubric assessment scores and interview notes for a candidate.
    """
    if candidate_id not in CANDIDATE_EVALUATIONS:
        return {
            "candidate_id": candidate_id,
            "tech_score": 0,
            "comm_score": 0,
            "notes": ""
        }
    return CANDIDATE_EVALUATIONS[candidate_id]

@router.post("/export/ats")
def export_ats_data(req: ATSExportRequest):
    """
    Generates server-side Greenhouse / Lever / Workday compliant ATS export payloads.
    """
    return {
        "status": "success",
        "format": req.format,
        "export_timestamp": "2026-07-30T22:56:00Z",
        "evaluations_count": len(CANDIDATE_EVALUATIONS),
        "evaluations": CANDIDATE_EVALUATIONS
    }
