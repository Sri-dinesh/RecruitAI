// ─── Analytics Dashboard — Shared TypeScript Types ────────────────────────────

export interface AnalyticsSummary {
  total_candidates: number;
  total_jobs: number;
  active_jobs: number;
  total_applications: number;
  total_shortlisted: number;
  total_interviews: number;
  upcoming_interviews: number;
  total_offered: number;
  total_rejected: number;
  avg_match_score: number | null;
  total_chat_sessions: number;
  screening_rate: number | null;
  interview_rate: number | null;
  offer_rate: number | null;
}

export interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

export interface TimeSeriesPoint {
  day: string;
  count: number;
}

export interface MatchBucket {
  bucket: string;
  count: number;
  min_score: number;
  max_score: number;
}

export interface SkillDemand {
  skill: string;
  demand_count: number;
}

export interface HiringVelocity {
  avg_days_to_shortlist: number | null;
  avg_days_to_interview: number | null;
  avg_days_to_offer: number | null;
  total_time_tracked: number;
}

export interface JobSummaryRow {
  job_id: string;
  title: string;
  status: string;
  created_at: string;
  total_applied: number;
  total_shortlisted: number;
  total_interviewed: number;
  total_offered: number;
  avg_match_score: number | null;
}

export interface ActivityEvent {
  event_type: string;
  description: string;
  entity_id: string;
  occurred_at: string;
}
