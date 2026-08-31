"""
backend/app/api/routes_analytics.py
--------------------------------------
Analytics & Stats Dashboard API.
All endpoints are authenticated, user-scoped, and read-only.
They delegate to Supabase RPC functions defined in init_db.sql (section 13).
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional, Any, Dict

from app.rag.vector_store import get_supabase_client
from app.core.auth import get_current_user_id

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Response Models ──────────────────────────────────────────────────────────

class AnalyticsSummary(BaseModel):
    total_candidates: int = 0
    total_jobs: int = 0
    active_jobs: int = 0
    total_applications: int = 0
    total_shortlisted: int = 0
    total_interviews: int = 0
    upcoming_interviews: int = 0
    total_offered: int = 0
    total_rejected: int = 0
    avg_match_score: Optional[float] = None
    total_chat_sessions: int = 0
    screening_rate: Optional[float] = None
    interview_rate: Optional[float] = None
    offer_rate: Optional[float] = None


class PipelineStage(BaseModel):
    stage: str
    count: int
    percentage: float


class TimeSeriesPoint(BaseModel):
    day: str
    count: int


class MatchBucket(BaseModel):
    bucket: str
    count: int
    min_score: int
    max_score: int


class SkillDemand(BaseModel):
    skill: str
    demand_count: int


class HiringVelocity(BaseModel):
    avg_days_to_shortlist: Optional[float] = None
    avg_days_to_interview: Optional[float] = None
    avg_days_to_offer: Optional[float] = None
    total_time_tracked: int = 0


class JobSummaryRow(BaseModel):
    job_id: str
    title: str
    status: str
    created_at: str
    total_applied: int
    total_shortlisted: int
    total_interviewed: int
    total_offered: int
    avg_match_score: Optional[float] = None


class ActivityEvent(BaseModel):
    event_type: str
    description: str
    entity_id: str
    occurred_at: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_rpc(client, fn_name: str, params: dict) -> Any:
    """Calls a Supabase RPC function and returns raw data."""
    try:
        res = client.rpc(fn_name, params).execute()
        return res.data
    except Exception as exc:
        logger.warning(f"[analytics] RPC {fn_name} failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Analytics query failed: {exc}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def get_analytics_summary(user_id: str = Depends(get_current_user_id)):
    """KPI summary cards: totals + computed conversion rates."""
    client = get_supabase_client()
    raw = _safe_rpc(client, "get_analytics_summary", {"p_user_id": user_id})
    data: Dict[str, Any] = raw if isinstance(raw, dict) else (raw[0] if raw else {})

    total_apps = int(data.get("total_applications") or 0)
    total_shortlisted = int(data.get("total_shortlisted") or 0)
    total_interviews = int(data.get("total_interviews") or 0)
    total_offered = int(data.get("total_offered") or 0)

    return AnalyticsSummary(
        total_candidates=int(data.get("total_candidates") or 0),
        total_jobs=int(data.get("total_jobs") or 0),
        active_jobs=int(data.get("active_jobs") or 0),
        total_applications=total_apps,
        total_shortlisted=total_shortlisted,
        total_interviews=total_interviews,
        upcoming_interviews=int(data.get("upcoming_interviews") or 0),
        total_offered=total_offered,
        total_rejected=int(data.get("total_rejected") or 0),
        avg_match_score=float(data["avg_match_score"]) if data.get("avg_match_score") is not None else None,
        total_chat_sessions=int(data.get("total_chat_sessions") or 0),
        screening_rate=round(total_shortlisted / total_apps * 100, 1) if total_apps > 0 else None,
        interview_rate=round(total_interviews / total_shortlisted * 100, 1) if total_shortlisted > 0 else None,
        offer_rate=round(total_offered / total_interviews * 100, 1) if total_interviews > 0 else None,
    )


@router.get("/analytics/pipeline", response_model=List[PipelineStage])
async def get_pipeline_funnel(user_id: str = Depends(get_current_user_id)):
    """Pipeline funnel with per-stage counts and conversion percentages."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_pipeline_funnel", {"p_user_id": user_id})
    return [PipelineStage(stage=r["stage"], count=int(r["count"] or 0), percentage=float(r["percentage"] or 0)) for r in (rows or [])]


@router.get("/analytics/candidates-over-time", response_model=List[TimeSeriesPoint])
async def get_candidates_over_time(
    days: int = Query(default=30, ge=7, le=365),
    user_id: str = Depends(get_current_user_id),
):
    """Daily time-series of candidate ingestion for the given lookback window."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_candidates_over_time", {"p_user_id": user_id, "days": days})
    return [TimeSeriesPoint(day=str(r["day"]), count=int(r["count"] or 0)) for r in (rows or [])]


@router.get("/analytics/match-distribution", response_model=List[MatchBucket])
async def get_match_distribution(user_id: str = Depends(get_current_user_id)):
    """Match score distribution bucketed by quality tier (histogram data)."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_match_score_distribution", {"p_user_id": user_id})
    return [MatchBucket(bucket=r["bucket"], count=int(r["count"] or 0), min_score=int(r["min_score"] or 0), max_score=int(r["max_score"] or 0)) for r in (rows or [])]


@router.get("/analytics/top-skills", response_model=List[SkillDemand])
async def get_top_skills(
    top_n: int = Query(default=12, ge=5, le=30),
    user_id: str = Depends(get_current_user_id),
):
    """Top N most demanded skills across all job descriptions."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_top_skills", {"p_user_id": user_id, "top_n": top_n})
    return [SkillDemand(skill=r["skill"], demand_count=int(r["demand_count"] or 0)) for r in (rows or [])]


@router.get("/analytics/hiring-velocity", response_model=HiringVelocity)
async def get_hiring_velocity(user_id: str = Depends(get_current_user_id)):
    """Average time-to-hire metrics across pipeline milestones."""
    client = get_supabase_client()
    raw = _safe_rpc(client, "get_hiring_velocity", {"p_user_id": user_id})
    data: Dict[str, Any] = raw if isinstance(raw, dict) else (raw[0] if raw else {})
    def _f(k): return float(data[k]) if data.get(k) is not None else None
    return HiringVelocity(
        avg_days_to_shortlist=_f("avg_days_to_shortlist"),
        avg_days_to_interview=_f("avg_days_to_interview"),
        avg_days_to_offer=_f("avg_days_to_offer"),
        total_time_tracked=int(data.get("total_time_tracked") or 0),
    )


@router.get("/analytics/jobs-summary", response_model=List[JobSummaryRow])
async def get_jobs_summary(user_id: str = Depends(get_current_user_id)):
    """Per-job aggregate statistics for the jobs summary table."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_jobs_summary", {"p_user_id": user_id})
    return [
        JobSummaryRow(
            job_id=str(r["job_id"]), title=r["title"], status=r["status"],
            created_at=str(r["created_at"]),
            total_applied=int(r["total_applied"] or 0),
            total_shortlisted=int(r["total_shortlisted"] or 0),
            total_interviewed=int(r["total_interviewed"] or 0),
            total_offered=int(r["total_offered"] or 0),
            avg_match_score=float(r["avg_match_score"]) if r.get("avg_match_score") is not None else None,
        )
        for r in (rows or [])
    ]


@router.get("/analytics/recent-activity", response_model=List[ActivityEvent])
async def get_recent_activity(
    limit: int = Query(default=20, ge=5, le=50),
    user_id: str = Depends(get_current_user_id),
):
    """Reverse-chronological activity feed of recruitment events."""
    client = get_supabase_client()
    rows = _safe_rpc(client, "get_recent_activity", {"p_user_id": user_id, "limit_n": limit})
    return [ActivityEvent(event_type=r["event_type"], description=r["description"], entity_id=str(r["entity_id"]), occurred_at=str(r["occurred_at"])) for r in (rows or [])]
