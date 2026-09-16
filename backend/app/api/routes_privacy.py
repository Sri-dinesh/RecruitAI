"""
backend/app/api/routes_privacy.py
---------------------------------
GDPR compliance and privacy API controller providing candidate right-of-access (Art. 15),
data portability export (Art. 20), right-to-erasure cascade purge (Art. 17),
and automated retention policy execution (AI-SEC-3).
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from app.core.auth import get_current_user_id
from app.services.retention import (
    purge_candidate,
    export_candidate_data,
    enforce_retention_policy,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class RetentionRunRequest(BaseModel):
    raw_resume_ttl_days: Optional[int] = 90
    chat_ttl_days: Optional[int] = 365


@router.get("/privacy/export/{candidate_id}")
async def export_candidate_endpoint(
    candidate_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    GDPR Art. 15 / Art. 20: Exports all personal data and processing records for a candidate.
    """
    try:
        data = export_candidate_data(candidate_id=candidate_id, user_id=user_id)
        if not data:
            raise HTTPException(status_code=404, detail="Candidate not found or access denied.")
        return data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"GDPR export failed: {exc}")


@router.delete("/privacy/candidates/{candidate_id}", status_code=status.HTTP_200_OK)
async def delete_candidate_erasure_endpoint(
    candidate_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    GDPR Art. 17: Right to Erasure ('Right to be Forgotten').
    Permanently purges candidate record, raw text, embeddings, applications, and interview logs.
    """
    try:
        success = purge_candidate(candidate_id=candidate_id, user_id=user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Candidate not found or already erased.")
        return {
            "success": True,
            "message": f"Candidate {candidate_id} and all associated PII, vector chunks, and evaluations permanently erased."
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"GDPR erasure failed: {exc}")


@router.post("/privacy/retention/run")
async def run_retention_policy_endpoint(
    req: RetentionRunRequest = RetentionRunRequest(),
    user_id: str = Depends(get_current_user_id),
):
    """
    Enforces automated tiered retention schedule (AI-SEC-3) for the authenticated tenant.
    """
    try:
        result = enforce_retention_policy(
            user_id=user_id,
            raw_resume_ttl_days=req.raw_resume_ttl_days or 90,
            chat_ttl_days=req.chat_ttl_days or 365,
        )
        return {
            "success": True,
            "summary": result,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retention run failed: {exc}")
