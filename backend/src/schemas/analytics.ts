import { z } from 'zod';

import { pydanticFloat, pydanticInt } from './common.js';

/**
 * Response models and query parameters from `app/api/routes_analytics.py`.
 *
 * Query constraints (unchanged):
 *   candidates-over-time  days   7..365  default 30
 *   top-skills            top_n  5..30   default 12
 *   recent-activity       limit  5..50   default 20
 */

export const analyticsDaysQuerySchema = z.object({
  days: pydanticInt({ ge: 7, le: 365 }).default(30),
});

export const analyticsTopNQuerySchema = z.object({
  top_n: pydanticInt({ ge: 5, le: 30 }).default(12),
});

export const analyticsLimitQuerySchema = z.object({
  limit: pydanticInt({ ge: 5, le: 50 }).default(20),
});

export const analyticsSummarySchema = z.object({
  total_candidates: pydanticInt().default(0),
  total_jobs: pydanticInt().default(0),
  active_jobs: pydanticInt().default(0),
  total_applications: pydanticInt().default(0),
  total_shortlisted: pydanticInt().default(0),
  total_interviews: pydanticInt().default(0),
  upcoming_interviews: pydanticInt().default(0),
  total_offered: pydanticInt().default(0),
  total_rejected: pydanticInt().default(0),
  avg_match_score: pydanticFloat().nullable().default(null),
  total_chat_sessions: pydanticInt().default(0),
  screening_rate: pydanticFloat().nullable().default(null),
  interview_rate: pydanticFloat().nullable().default(null),
  offer_rate: pydanticFloat().nullable().default(null),
});

export const pipelineStageSchema = z.object({
  stage: z.string(),
  count: pydanticInt(),
  percentage: pydanticFloat(),
});

export const timeSeriesPointSchema = z.object({
  day: z.string(),
  count: pydanticInt(),
});

export const matchBucketSchema = z.object({
  bucket: z.string(),
  count: pydanticInt(),
  min_score: pydanticInt(),
  max_score: pydanticInt(),
});

export const skillDemandSchema = z.object({
  skill: z.string(),
  demand_count: pydanticInt(),
});

export const hiringVelocitySchema = z.object({
  avg_days_to_shortlist: pydanticFloat().nullable().default(null),
  avg_days_to_interview: pydanticFloat().nullable().default(null),
  avg_days_to_offer: pydanticFloat().nullable().default(null),
  total_time_tracked: pydanticInt().default(0),
});

export const jobSummaryRowSchema = z.object({
  job_id: z.string(),
  title: z.string(),
  status: z.string(),
  created_at: z.string(),
  total_applied: pydanticInt(),
  total_shortlisted: pydanticInt(),
  total_interviewed: pydanticInt(),
  total_offered: pydanticInt(),
  avg_match_score: pydanticFloat().nullable().default(null),
});

export const activityEventSchema = z.object({
  event_type: z.string(),
  description: z.string(),
  entity_id: z.string(),
  occurred_at: z.string(),
});

export const pipelineResponseSchema = z.array(pipelineStageSchema);
export const timeSeriesResponseSchema = z.array(timeSeriesPointSchema);
export const matchDistributionResponseSchema = z.array(matchBucketSchema);
export const skillDemandResponseSchema = z.array(skillDemandSchema);
export const jobSummaryResponseSchema = z.array(jobSummaryRowSchema);
export const activityResponseSchema = z.array(activityEventSchema);

export type AnalyticsDaysQuery = z.infer<typeof analyticsDaysQuerySchema>;
export type AnalyticsTopNQuery = z.infer<typeof analyticsTopNQuerySchema>;
export type AnalyticsLimitQuery = z.infer<typeof analyticsLimitQuerySchema>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
export type PipelineStage = z.infer<typeof pipelineStageSchema>;
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;
export type MatchBucket = z.infer<typeof matchBucketSchema>;
export type SkillDemand = z.infer<typeof skillDemandSchema>;
export type HiringVelocity = z.infer<typeof hiringVelocitySchema>;
export type JobSummaryRow = z.infer<typeof jobSummaryRowSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
