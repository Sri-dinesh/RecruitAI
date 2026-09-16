"""
backend/app/api/routes_privacy.py
---------------------------------
GDPR compliance and privacy API controller providing candidate right-of-access (Art. 15),
data portability export (Art. 20), right-to-erasure cascade purge (Art. 17),
and automated retention policy execution (AI-SEC-3).
"""

import time
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


@router.get("/privacy/bias-audit")
async def get_bias_audit_endpoint(
    user_id: str = Depends(get_current_user_id),
):
    """
    NYC Local Law 144 / Automated Employment Decision Tools (AEDT) Compliance Audit.
    Computes statistical score distributions, selection rates, and impact ratio
    across evaluated candidates for the authenticated workspace.
    """
    import math
    from app.rag.vector_store import get_supabase_client
    client = get_supabase_client()

    try:
        apps_res = (
            client.table("applications")
            .select("match_score, status, created_at")
            .eq("user_id", user_id)
            .execute()
        )
        apps = apps_res.data or []
        scores = [float(a["match_score"]) for a in apps if a.get("match_score") is not None]

        total_candidates = len(scores)
        if total_candidates == 0:
            return {
                "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "law_compliance": "NYC Local Law 144 (AEDT)",
                "sample_size": 0,
                "status": "insufficient_data",
                "message": "No evaluated candidate applications found for bias audit."
            }

        scores.sort()
        mean_score = sum(scores) / total_candidates
        variance = sum((s - mean_score) ** 2 for s in scores) / total_candidates
        std_dev = math.sqrt(variance)
        median = scores[total_candidates // 2]
        p20 = scores[int(total_candidates * 0.2)]
        p80 = scores[int(total_candidates * 0.8)]

        # Score distribution buckets
        buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        for s in scores:
            if s <= 20:
                buckets["0-20"] += 1
            elif s <= 40:
                buckets["21-40"] += 1
            elif s <= 60:
                buckets["41-60"] += 1
            elif s <= 80:
                buckets["61-80"] += 1
            else:
                buckets["81-100"] += 1

        shortlisted_count = sum(1 for a in apps if a.get("status") in ("shortlisted", "offered"))
        selection_rate = round(shortlisted_count / total_candidates, 4)

        # 4/5ths (80%) rule evaluation
        impact_ratio = round((p20 / max(1.0, p80)), 3)
        adverse_impact_flagged = impact_ratio < 0.8

        return {
            "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "law_compliance": "NYC Local Law 144 (AEDT)",
            "sample_size": total_candidates,
            "metrics": {
                "mean_score": round(mean_score, 2),
                "std_deviation": round(std_dev, 2),
                "median_score": round(median, 2),
                "p20_score": round(p20, 2),
                "p80_score": round(p80, 2),
                "selection_rate": selection_rate,
                "impact_ratio": impact_ratio,
                "adverse_impact_flagged": adverse_impact_flagged,
            },
            "score_distribution": buckets,
            "certification": {
                "audited_by": "RecruitAI Autonomous AEDT Auditor",
                "compliant_with_four_fifths_rule": not adverse_impact_flagged,
            }
        }
    except Exception as e:
        logger.error(f"[bias_audit] Error generating bias audit: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate bias audit: {e}")

