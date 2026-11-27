import { sql, type SQL } from 'drizzle-orm';

import type { Database } from './client.js';

/**
 * Typed raw-SQL access to the Supabase RPC functions.
 *
 * Drizzle has no RPC equivalent, so every `.rpc()` call maps to `drizzle.sql`
 * with PostgreSQL named-argument notation. The argument names (`p_user_id`,
 * `days`, `top_n`, `limit_n`, `target_user_id`, …) and result shapes below are
 * copied from the SQL functions in
 * `supabase/migrations/20260917000000_production_migration.sql` and
 * `backend/scripts/enhanced_schema.sql`.
 *
 * `QueryExecutor` keeps the functions testable without a live database: in
 * production it is `databaseExecutor(getDb())`, in tests it is a recording
 * stub.
 */

export type QueryExecutor = (query: SQL) => PromiseLike<unknown>;

/** Bind a Drizzle database to the executor shape used by the RPC client. */
export function databaseExecutor(db: Database): QueryExecutor {
  return (query) => db.execute(query);
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

/** node-postgres returns int8/numeric as strings; PostgREST emits numbers. */
function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/** Read a scalar jsonb result (`select public.fn(...) as data`). */
function jsonObject(result: unknown): Record<string, unknown> {
  const row = rowsOf(result)[0];
  const value = row?.data;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

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
}

export interface PipelineFunnelStage {
  stage: string;
  count: number;
  percentage: number;
}

export interface CandidatesOverTimePoint {
  day: string;
  count: number;
}

export interface MatchScoreDistributionBucket {
  bucket: string;
  count: number;
  min_score: number;
  max_score: number;
}

export interface TopSkill {
  skill: string;
  demand_count: number;
}

export interface HiringVelocity {
  avg_days_to_shortlist: number;
  avg_days_to_interview: number;
  avg_days_to_offer: number;
  total_time_tracked: number;
}

export interface JobsSummaryRow {
  job_id: string;
  title: string;
  status: string;
  created_at: Date | string;
  total_applied: number;
  total_shortlisted: number;
  total_interviewed: number;
  total_offered: number;
  avg_match_score: number | null;
}

export interface RecentActivityEvent {
  event_type: string;
  description: string;
  entity_id: string;
  occurred_at: Date | string;
}

export interface ResetWorkspaceResult {
  success: true;
  user_id: string;
  reset_at: string;
}

export interface ResumeChunkMatch {
  id: string;
  candidate_id: string;
  full_name: string;
  chunk_text: string;
  similarity: number;
}

export interface MatchResumeChunksParams {
  queryEmbedding: readonly number[];
  matchThreshold?: number;
  matchCount?: number;
  candidateId?: string | null;
  userId?: string | null;
}

/** pgvector text literal: `[0.1,0.2]`. */
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface RpcClient {
  analyticsSummary(userId: string): Promise<AnalyticsSummary>;
  pipelineFunnel(userId: string): Promise<PipelineFunnelStage[]>;
  candidatesOverTime(userId: string, days?: number): Promise<CandidatesOverTimePoint[]>;
  matchScoreDistribution(userId: string): Promise<MatchScoreDistributionBucket[]>;
  topSkills(userId: string, topN?: number): Promise<TopSkill[]>;
  hiringVelocity(userId: string): Promise<HiringVelocity>;
  jobsSummary(userId: string): Promise<JobsSummaryRow[]>;
  recentActivity(userId: string, limit?: number): Promise<RecentActivityEvent[]>;
  resetUserWorkspace(targetUserId: string): Promise<ResetWorkspaceResult>;
  matchResumeChunks(params: MatchResumeChunksParams): Promise<ResumeChunkMatch[]>;
}

/** Build the RPC client over any query executor. */
export function createRpcClient(execute: QueryExecutor): RpcClient {
  return {
    async analyticsSummary(userId) {
      const result = await execute(
        sql`select public.get_analytics_summary(p_user_id => ${userId}) as data`,
      );
      const row = jsonObject(result);
      return {
        total_candidates: toNumber(row.total_candidates),
        total_jobs: toNumber(row.total_jobs),
        active_jobs: toNumber(row.active_jobs),
        total_applications: toNumber(row.total_applications),
        total_shortlisted: toNumber(row.total_shortlisted),
        total_interviews: toNumber(row.total_interviews),
        upcoming_interviews: toNumber(row.upcoming_interviews),
        total_offered: toNumber(row.total_offered),
        total_rejected: toNumber(row.total_rejected),
        avg_match_score: toNullableNumber(row.avg_match_score),
        total_chat_sessions: toNumber(row.total_chat_sessions),
      };
    },

    async pipelineFunnel(userId) {
      const result = await execute(
        sql`select * from public.get_pipeline_funnel(p_user_id => ${userId})`,
      );
      return rowsOf(result).map((row) => ({
        stage: toStringValue(row.stage),
        count: toNumber(row.count),
        percentage: toNumber(row.percentage),
      }));
    },

    async candidatesOverTime(userId, days = 30) {
      const result = await execute(
        sql`select * from public.get_candidates_over_time(p_user_id => ${userId}, days => ${days})`,
      );
      return rowsOf(result).map((row) => ({
        day: toStringValue(row.day),
        count: toNumber(row.count),
      }));
    },

    async matchScoreDistribution(userId) {
      const result = await execute(
        sql`select * from public.get_match_score_distribution(p_user_id => ${userId})`,
      );
      return rowsOf(result).map((row) => ({
        bucket: toStringValue(row.bucket),
        count: toNumber(row.count),
        min_score: toNumber(row.min_score),
        max_score: toNumber(row.max_score),
      }));
    },

    async topSkills(userId, topN = 12) {
      const result = await execute(
        sql`select * from public.get_top_skills(p_user_id => ${userId}, top_n => ${topN})`,
      );
      return rowsOf(result).map((row) => ({
        skill: toStringValue(row.skill),
        demand_count: toNumber(row.demand_count),
      }));
    },

    async hiringVelocity(userId) {
      const result = await execute(
        sql`select public.get_hiring_velocity(p_user_id => ${userId}) as data`,
      );
      const row = jsonObject(result);
      return {
        avg_days_to_shortlist: toNumber(row.avg_days_to_shortlist),
        avg_days_to_interview: toNumber(row.avg_days_to_interview),
        avg_days_to_offer: toNumber(row.avg_days_to_offer),
        total_time_tracked: toNumber(row.total_time_tracked),
      };
    },

    async jobsSummary(userId) {
      const result = await execute(
        sql`select * from public.get_jobs_summary(p_user_id => ${userId})`,
      );
      return rowsOf(result).map((row) => ({
        job_id: toStringValue(row.job_id),
        title: toStringValue(row.title),
        status: toStringValue(row.status),
        created_at: row.created_at as Date | string,
        total_applied: toNumber(row.total_applied),
        total_shortlisted: toNumber(row.total_shortlisted),
        total_interviewed: toNumber(row.total_interviewed),
        total_offered: toNumber(row.total_offered),
        avg_match_score: toNullableNumber(row.avg_match_score),
      }));
    },

    async recentActivity(userId, limit = 20) {
      const result = await execute(
        sql`select * from public.get_recent_activity(p_user_id => ${userId}, limit_n => ${limit})`,
      );
      return rowsOf(result).map((row) => ({
        event_type: toStringValue(row.event_type),
        description: toStringValue(row.description),
        entity_id: toStringValue(row.entity_id),
        occurred_at: row.occurred_at as Date | string,
      }));
    },

    async resetUserWorkspace(targetUserId) {
      const result = await execute(
        sql`select public.reset_user_workspace(target_user_id => ${targetUserId}) as data`,
      );
      const row = jsonObject(result);
      return {
        success: true,
        user_id: toStringValue(row.user_id),
        reset_at: toStringValue(row.reset_at),
      };
    },

    async matchResumeChunks({
      queryEmbedding,
      matchThreshold = 0,
      matchCount = 3,
      candidateId = null,
      userId = null,
    }) {
      const vector = toVectorLiteral(queryEmbedding);
      const result = await execute(
        sql`select * from public.match_resume_chunks(
          query_embedding => ${vector}::vector,
          match_threshold => ${matchThreshold},
          match_count => ${matchCount},
          filter_candidate_id => ${candidateId}::uuid,
          filter_user_id => ${userId}::uuid
        )`,
      );
      return rowsOf(result).map((row) => ({
        id: toStringValue(row.id),
        candidate_id: toStringValue(row.candidate_id),
        full_name: toStringValue(row.full_name),
        chunk_text: toStringValue(row.chunk_text),
        similarity: toNumber(row.similarity),
      }));
    },
  };
}
