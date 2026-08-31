// ─── Analytics Dashboard — API Client ─────────────────────────────────────────
import { fetchWithAuth } from '@/lib/apiClient';
import type {
  AnalyticsSummary,
  PipelineStage,
  TimeSeriesPoint,
  MatchBucket,
  SkillDemand,
  HiringVelocity,
  JobSummaryRow,
  ActivityEvent,
} from '@/lib/analyticsTypes';

async function get<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(path);
  if (!res.ok) throw new Error(`Analytics API error: ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const fetchAnalyticsSummary = (): Promise<AnalyticsSummary> =>
  get<AnalyticsSummary>('/api/analytics/summary');

export const fetchPipelineData = (): Promise<PipelineStage[]> =>
  get<PipelineStage[]>('/api/analytics/pipeline');

export const fetchCandidatesOverTime = (days: number = 30): Promise<TimeSeriesPoint[]> =>
  get<TimeSeriesPoint[]>(`/api/analytics/candidates-over-time?days=${days}`);

export const fetchMatchDistribution = (): Promise<MatchBucket[]> =>
  get<MatchBucket[]>('/api/analytics/match-distribution');

export const fetchTopSkills = (topN: number = 12): Promise<SkillDemand[]> =>
  get<SkillDemand[]>(`/api/analytics/top-skills?top_n=${topN}`);

export const fetchHiringVelocity = (): Promise<HiringVelocity> =>
  get<HiringVelocity>('/api/analytics/hiring-velocity');

export const fetchJobsSummary = (): Promise<JobSummaryRow[]> =>
  get<JobSummaryRow[]>('/api/analytics/jobs-summary');

export const fetchRecentActivity = (limit: number = 20): Promise<ActivityEvent[]> =>
  get<ActivityEvent[]>(`/api/analytics/recent-activity?limit=${limit}`);
