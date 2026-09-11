"""
backend/app/api/routes_analytics.py
--------------------------------------
Analytics & Stats Dashboard API.
All endpoints are authenticated, user-scoped, and read-only.
Attempts Supabase RPC execution first; if RPC functions are not in schema cache
or fail (PGRST202), automatically computes accurate metrics directly from database tables
(candidates, jobs, applications, interviews, chat_sessions) so the endpoints NEVER crash.
"""

import json
import logging
import collections
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

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


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def get_analytics_summary(user_id: str = Depends(get_current_user_id)):
    """KPI summary cards: totals + computed conversion rates."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_analytics_summary", {"p_user_id": user_id}).execute()
        raw = res.data
        data: Dict[str, Any] = raw if isinstance(raw, dict) else (raw[0] if raw else {})
        if data:
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
    except Exception as exc:
        logger.info(f"[analytics] RPC get_analytics_summary unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        cands = client.table("candidates").select("id, metadata").eq("user_id", user_id).execute().data or []
        jobs = client.table("jobs").select("id, status").eq("user_id", user_id).execute().data or []
        apps = client.table("applications").select("id, match_score, status").eq("user_id", user_id).execute().data or []
        interviews = client.table("interviews").select("id, scheduled_at").eq("user_id", user_id).execute().data or []
        sessions = client.table("chat_sessions").select("id").eq("user_id", user_id).execute().data or []

        total_candidates = len(cands)
        total_jobs = len(jobs)
        active_jobs = sum(1 for j in jobs if j.get("status") == "active")
        total_applications = len(apps)

        total_shortlisted = sum(1 for a in apps if a.get("status") == "shortlisted")
        total_offered = sum(1 for a in apps if a.get("status") == "offered")
        total_rejected = sum(1 for a in apps if a.get("status") == "rejected")

        # If no application records yet, check metadata in candidates
        if total_applications == 0 and total_candidates > 0:
            for c in cands:
                meta = c.get("metadata") or {}
                st = meta.get("status")
                if st == "shortlisted":
                    total_shortlisted += 1
                elif st == "offered":
                    total_offered += 1
                elif st == "rejected":
                    total_rejected += 1

        total_interviews = len(interviews)
        now_iso = datetime.now(timezone.utc).isoformat()
        upcoming_interviews = sum(1 for iv in interviews if (iv.get("scheduled_at") or "") >= now_iso)

        scores = [float(a["match_score"]) for a in apps if a.get("match_score") is not None]
        if not scores:
            for c in cands:
                meta = c.get("metadata") or {}
                if meta.get("match_score") is not None:
                    scores.append(float(meta["match_score"]))

        avg_match_score = round(sum(scores) / len(scores), 1) if scores else None
        total_chat_sessions = len(sessions)

        base_count = total_applications if total_applications > 0 else total_candidates
        screening_rate = round(total_shortlisted / base_count * 100, 1) if base_count > 0 else None
        interview_rate = round(total_interviews / total_shortlisted * 100, 1) if total_shortlisted > 0 else None
        offer_rate = round(total_offered / total_interviews * 100, 1) if total_interviews > 0 else None

        return AnalyticsSummary(
            total_candidates=total_candidates,
            total_jobs=total_jobs,
            active_jobs=active_jobs,
            total_applications=total_applications,
            total_shortlisted=total_shortlisted,
            total_interviews=total_interviews,
            upcoming_interviews=upcoming_interviews,
            total_offered=total_offered,
            total_rejected=total_rejected,
            avg_match_score=avg_match_score,
            total_chat_sessions=total_chat_sessions,
            screening_rate=screening_rate,
            interview_rate=interview_rate,
            offer_rate=offer_rate,
        )
    except Exception as exc:
        logger.error(f"[analytics] Summary fallback failed: {exc}")
        return AnalyticsSummary()


@router.get("/analytics/pipeline", response_model=List[PipelineStage])
async def get_pipeline_funnel(user_id: str = Depends(get_current_user_id)):
    """Pipeline funnel with per-stage counts and conversion percentages."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_pipeline_funnel", {"p_user_id": user_id}).execute()
        rows = res.data
        if rows:
            return [PipelineStage(stage=r["stage"], count=int(r["count"] or 0), percentage=float(r["percentage"] or 0)) for r in rows]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_pipeline_funnel unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        cands_cnt = len(client.table("candidates").select("id").eq("user_id", user_id).execute().data or [])
        apps = client.table("applications").select("status").eq("user_id", user_id).execute().data or []
        interviews_cnt = len(client.table("interviews").select("id").eq("user_id", user_id).execute().data or [])

        shortlisted_cnt = sum(1 for a in apps if a.get("status") == "shortlisted")
        offered_cnt = sum(1 for a in apps if a.get("status") == "offered")

        if not apps and cands_cnt > 0:
            cands_meta = client.table("candidates").select("metadata").eq("user_id", user_id).execute().data or []
            for c in cands_meta:
                st = (c.get("metadata") or {}).get("status")
                if st == "shortlisted":
                    shortlisted_cnt += 1
                elif st == "offered":
                    offered_cnt += 1

        total_pool = max(cands_cnt, len(apps))
        def _pct(val: int) -> float:
            return round(val / total_pool * 100, 1) if total_pool > 0 else 0.0

        return [
            PipelineStage(stage="Ingested", count=total_pool, percentage=100.0 if total_pool > 0 else 0.0),
            PipelineStage(stage="Shortlisted", count=shortlisted_cnt, percentage=_pct(shortlisted_cnt)),
            PipelineStage(stage="Interview", count=interviews_cnt, percentage=_pct(interviews_cnt)),
            PipelineStage(stage="Offer", count=offered_cnt, percentage=_pct(offered_cnt)),
        ]
    except Exception as exc:
        logger.error(f"[analytics] Pipeline fallback failed: {exc}")
        return [
            PipelineStage(stage="Ingested", count=0, percentage=0.0),
            PipelineStage(stage="Shortlisted", count=0, percentage=0.0),
            PipelineStage(stage="Interview", count=0, percentage=0.0),
            PipelineStage(stage="Offer", count=0, percentage=0.0),
        ]


@router.get("/analytics/candidates-over-time", response_model=List[TimeSeriesPoint])
async def get_candidates_over_time(
    days: int = Query(default=30, ge=7, le=365),
    user_id: str = Depends(get_current_user_id),
):
    """Daily time-series of candidate ingestion for the given lookback window."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_candidates_over_time", {"p_user_id": user_id, "days": days}).execute()
        rows = res.data
        if rows:
            return [TimeSeriesPoint(day=str(r["day"]), count=int(r["count"] or 0)) for r in rows]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_candidates_over_time unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        cands = client.table("candidates").select("created_at").eq("user_id", user_id).gte("created_at", cutoff).execute().data or []

        counts_by_day = collections.Counter()
        for c in cands:
            raw_dt = c.get("created_at") or ""
            day_str = raw_dt[:10]
            if day_str:
                counts_by_day[day_str] += 1

        today = datetime.now(timezone.utc).date()
        result = []
        for i in range(days - 1, -1, -1):
            d = (today - timedelta(days=i)).isoformat()
            result.append(TimeSeriesPoint(day=d, count=counts_by_day.get(d, 0)))

        return result
    except Exception as exc:
        logger.error(f"[analytics] Ingestion time series fallback failed: {exc}")
        return []


@router.get("/analytics/match-distribution", response_model=List[MatchBucket])
async def get_match_distribution(user_id: str = Depends(get_current_user_id)):
    """Match score distribution bucketed by quality tier (histogram data)."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_match_score_distribution", {"p_user_id": user_id}).execute()
        rows = res.data
        if rows:
            return [MatchBucket(bucket=r["bucket"], count=int(r["count"] or 0), min_score=int(r["min_score"] or 0), max_score=int(r["max_score"] or 0)) for r in rows]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_match_score_distribution unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        scores = []
        apps = client.table("applications").select("match_score").eq("user_id", user_id).execute().data or []
        for a in apps:
            if a.get("match_score") is not None:
                scores.append(float(a["match_score"]))

        if not scores:
            cands = client.table("candidates").select("metadata").eq("user_id", user_id).execute().data or []
            for c in cands:
                meta = c.get("metadata") or {}
                if meta.get("match_score") is not None:
                    scores.append(float(meta["match_score"]))

        buckets = [
            {"bucket": "Top Tier (90-100%)", "min_score": 90, "max_score": 100, "count": 0},
            {"bucket": "Strong Fit (75-89%)", "min_score": 75, "max_score": 89, "count": 0},
            {"bucket": "Good Fit (60-74%)", "min_score": 60, "max_score": 74, "count": 0},
            {"bucket": "Fair Fit (40-59%)", "min_score": 40, "max_score": 59, "count": 0},
            {"bucket": "Low Fit (<40%)", "min_score": 0, "max_score": 39, "count": 0},
        ]

        for s in scores:
            if s >= 90:
                buckets[0]["count"] += 1
            elif s >= 75:
                buckets[1]["count"] += 1
            elif s >= 60:
                buckets[2]["count"] += 1
            elif s >= 40:
                buckets[3]["count"] += 1
            else:
                buckets[4]["count"] += 1

        return [MatchBucket(**b) for b in buckets]
    except Exception as exc:
        logger.error(f"[analytics] Match distribution fallback failed: {exc}")
        return [
            MatchBucket(bucket="Top Tier (90-100%)", min_score=90, max_score=100, count=0),
            MatchBucket(bucket="Strong Fit (75-89%)", min_score=75, max_score=89, count=0),
            MatchBucket(bucket="Good Fit (60-74%)", min_score=60, max_score=74, count=0),
            MatchBucket(bucket="Fair Fit (40-59%)", min_score=40, max_score=59, count=0),
            MatchBucket(bucket="Low Fit (<40%)", min_score=0, max_score=39, count=0),
        ]


@router.get("/analytics/top-skills", response_model=List[SkillDemand])
async def get_top_skills(
    top_n: int = Query(default=12, ge=5, le=30),
    user_id: str = Depends(get_current_user_id),
):
    """Top N most demanded skills across all job descriptions and applicant resumes."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_top_skills", {"p_user_id": user_id, "top_n": top_n}).execute()
        rows = res.data
        if rows:
            return [SkillDemand(skill=r["skill"], demand_count=int(r["demand_count"] or 0)) for r in rows]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_top_skills unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        skills_counter = collections.Counter()

        # 1. From Jobs
        jobs = client.table("jobs").select("jd_structured").eq("user_id", user_id).execute().data or []
        for j in jobs:
            jd_s = j.get("jd_structured") or {}
            if isinstance(jd_s, str):
                try:
                    jd_s = json.loads(jd_s)
                except Exception:
                    jd_s = {}
            for skill in jd_s.get("required_skills", []):
                if skill and isinstance(skill, str):
                    skills_counter[skill.strip()] += 2

        # 2. From Candidates
        cands = client.table("candidates").select("metadata").eq("user_id", user_id).execute().data or []
        for c in cands:
            meta = c.get("metadata") or {}
            for skill in meta.get("skills", []):
                if skill and isinstance(skill, str):
                    skills_counter[skill.strip()] += 1

        most_common = skills_counter.most_common(top_n)
        return [SkillDemand(skill=s, demand_count=c) for s, c in most_common]
    except Exception as exc:
        logger.error(f"[analytics] Top skills fallback failed: {exc}")
        return []


@router.get("/analytics/hiring-velocity", response_model=HiringVelocity)
async def get_hiring_velocity(user_id: str = Depends(get_current_user_id)):
    """Average time-to-hire metrics across pipeline milestones."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_hiring_velocity", {"p_user_id": user_id}).execute()
        raw = res.data
        data: Dict[str, Any] = raw if isinstance(raw, dict) else (raw[0] if raw else {})
        if data:
            def _f(k: str) -> Optional[float]:
                return float(data[k]) if data.get(k) is not None else None
            return HiringVelocity(
                avg_days_to_shortlist=_f("avg_days_to_shortlist"),
                avg_days_to_interview=_f("avg_days_to_interview"),
                avg_days_to_offer=_f("avg_days_to_offer"),
                total_time_tracked=int(data.get("total_time_tracked") or 0),
            )
    except Exception as exc:
        logger.info(f"[analytics] RPC get_hiring_velocity unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        apps = client.table("applications").select("status, created_at, updated_at").eq("user_id", user_id).execute().data or []
        shortlist_diffs = []
        offer_diffs = []
        for a in apps:
            try:
                c_at = datetime.fromisoformat((a.get("created_at") or "").replace("Z", "+00:00"))
                u_at = datetime.fromisoformat((a.get("updated_at") or "").replace("Z", "+00:00"))
                diff_days = max(0.1, (u_at - c_at).total_seconds() / 86400.0)
                st = a.get("status")
                if st == "shortlisted":
                    shortlist_diffs.append(diff_days)
                elif st == "offered":
                    offer_diffs.append(diff_days)
            except Exception:
                pass

        interviews = client.table("interviews").select("created_at, scheduled_at").eq("user_id", user_id).execute().data or []
        interview_diffs = []
        for iv in interviews:
            try:
                c_at = datetime.fromisoformat((iv.get("created_at") or "").replace("Z", "+00:00"))
                s_at = datetime.fromisoformat((iv.get("scheduled_at") or "").replace("Z", "+00:00"))
                diff_days = max(0.1, (s_at - c_at).total_seconds() / 86400.0)
                interview_diffs.append(diff_days)
            except Exception:
                pass

        def _avg(lst: List[float]) -> Optional[float]:
            return round(sum(lst) / len(lst), 1) if lst else None

        return HiringVelocity(
            avg_days_to_shortlist=_avg(shortlist_diffs),
            avg_days_to_interview=_avg(interview_diffs),
            avg_days_to_offer=_avg(offer_diffs),
            total_time_tracked=len(shortlist_diffs) + len(interview_diffs) + len(offer_diffs),
        )
    except Exception as exc:
        logger.error(f"[analytics] Hiring velocity fallback failed: {exc}")
        return HiringVelocity()


@router.get("/analytics/jobs-summary", response_model=List[JobSummaryRow])
async def get_jobs_summary(user_id: str = Depends(get_current_user_id)):
    """Per-job aggregate statistics for the jobs summary table."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_jobs_summary", {"p_user_id": user_id}).execute()
        rows = res.data
        if rows:
            return [
                JobSummaryRow(
                    job_id=str(r["job_id"]),
                    title=r["title"],
                    status=r["status"],
                    created_at=str(r["created_at"]),
                    total_applied=int(r["total_applied"] or 0),
                    total_shortlisted=int(r["total_shortlisted"] or 0),
                    total_interviewed=int(r["total_interviewed"] or 0),
                    total_offered=int(r["total_offered"] or 0),
                    avg_match_score=float(r["avg_match_score"]) if r.get("avg_match_score") is not None else None,
                )
                for r in rows
            ]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_jobs_summary unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        jobs = client.table("jobs").select("id, title, status, created_at").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
        apps = client.table("applications").select("job_id, status, match_score").eq("user_id", user_id).execute().data or []
        total_cands = len(client.table("candidates").select("id").eq("user_id", user_id).execute().data or [])

        result = []
        for j in jobs:
            jid = j["id"]
            job_apps = [a for a in apps if a.get("job_id") == jid]
            applied = len(job_apps) if job_apps else total_cands
            shortlisted = sum(1 for a in job_apps if a.get("status") == "shortlisted")
            interviewed = sum(1 for a in job_apps if a.get("status") in ("interview_scheduled", "interviewed"))
            offered = sum(1 for a in job_apps if a.get("status") == "offered")
            scores = [float(a["match_score"]) for a in job_apps if a.get("match_score") is not None]
            avg_score = round(sum(scores) / len(scores), 1) if scores else None

            result.append(JobSummaryRow(
                job_id=str(jid),
                title=j.get("title") or "Hiring Campaign",
                status=j.get("status") or "active",
                created_at=str(j.get("created_at") or ""),
                total_applied=applied,
                total_shortlisted=shortlisted,
                total_interviewed=interviewed,
                total_offered=offered,
                avg_match_score=avg_score,
            ))

        return result
    except Exception as exc:
        logger.error(f"[analytics] Jobs summary fallback failed: {exc}")
        return []


@router.get("/analytics/recent-activity", response_model=List[ActivityEvent])
async def get_recent_activity(
    limit: int = Query(default=20, ge=5, le=50),
    user_id: str = Depends(get_current_user_id),
):
    """Reverse-chronological activity feed of recruitment events."""
    client = get_supabase_client()
    try:
        res = client.rpc("get_recent_activity", {"p_user_id": user_id, "limit_n": limit}).execute()
        rows = res.data
        if rows:
            return [ActivityEvent(event_type=r["event_type"], description=r["description"], entity_id=str(r["entity_id"]), occurred_at=str(r["occurred_at"])) for r in rows]
    except Exception as exc:
        logger.info(f"[analytics] RPC get_recent_activity unavailable: {exc}. Computing directly from tables.")

    # ── Fallback direct table queries ──
    try:
        events = []

        # 1. Recent candidates
        cands = client.table("candidates").select("id, full_name, created_at").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute().data or []
        for c in cands:
            events.append({
                "event_type": "Candidate Ingested",
                "description": f"Candidate '{c.get('full_name')}' was ingested and indexed into talent pool.",
                "entity_id": c["id"],
                "occurred_at": c.get("created_at") or datetime.now(timezone.utc).isoformat(),
            })

        # 2. Recent interviews
        interviews = client.table("interviews").select("id, scheduled_at, created_at, feedback").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute().data or []
        for iv in interviews:
            cand_name = (iv.get("feedback") or {}).get("candidate_name") or "Candidate"
            events.append({
                "event_type": "Interview Scheduled",
                "description": f"Technical interview scheduled with {cand_name}.",
                "entity_id": iv["id"],
                "occurred_at": iv.get("created_at") or iv.get("scheduled_at") or datetime.now(timezone.utc).isoformat(),
            })

        # 3. Recent applications status changes
        apps = client.table("applications").select("id, candidate_id, status, updated_at").eq("user_id", user_id).neq("status", "new").order("updated_at", desc=True).limit(limit).execute().data or []
        for a in apps:
            events.append({
                "event_type": "Status Changed",
                "description": f"Candidate was marked as {a.get('status')}.",
                "entity_id": a.get("candidate_id") or a["id"],
                "occurred_at": a.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            })

        # Sort all events reverse chronologically
        events.sort(key=lambda e: e["occurred_at"], reverse=True)
        return [ActivityEvent(**e) for e in events[:limit]]
    except Exception as exc:
        logger.error(f"[analytics] Recent activity fallback failed: {exc}")
        return []
