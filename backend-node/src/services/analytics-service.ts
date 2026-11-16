import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import { pythonRound } from './parsing-utils.js';
import { asJsonObject } from './session-service.js';
import { createLogger } from '../telemetry/logger.js';

const logger = createLogger('recruitai.routes_analytics');

/**
 * Port of `backend/app/api/routes_analytics.py`.
 *
 * Python first tries Supabase RPCs and falls back to direct table reads. The
 * Node backend always computes directly from tables (the migration plan allows
 * this); the returned shapes and the fallback arithmetic are preserved,
 * including Python's half-even rounding.
 */

export interface AnalyticsServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  readonly now?: () => Date;
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

function emptySummary(): AnalyticsSummary {
  return {
    total_candidates: 0,
    total_jobs: 0,
    active_jobs: 0,
    total_applications: 0,
    total_shortlisted: 0,
    total_interviews: 0,
    upcoming_interviews: 0,
    total_offered: 0,
    total_rejected: 0,
    avg_match_score: null,
    total_chat_sessions: 0,
    screening_rate: null,
    interview_rate: null,
    offer_rate: null,
  };
}

function emptyPipeline(): PipelineStage[] {
  return [
    { stage: 'Ingested', count: 0, percentage: 0 },
    { stage: 'Shortlisted', count: 0, percentage: 0 },
    { stage: 'Interview', count: 0, percentage: 0 },
    { stage: 'Offer', count: 0, percentage: 0 },
  ];
}

function matchBuckets(counts: ReadonlyArray<number>): MatchBucket[] {
  return [
    { bucket: 'Top Tier (90-100%)', min_score: 90, max_score: 100, count: counts[0] ?? 0 },
    { bucket: 'Strong Fit (75-89%)', min_score: 75, max_score: 89, count: counts[1] ?? 0 },
    { bucket: 'Good Fit (60-74%)', min_score: 60, max_score: 74, count: counts[2] ?? 0 },
    { bucket: 'Fair Fit (40-59%)', min_score: 40, max_score: 59, count: counts[3] ?? 0 },
    { bucket: 'Low Fit (<40%)', min_score: 0, max_score: 39, count: counts[4] ?? 0 },
  ];
}

/** Python `datetime.fromisoformat(... .replace("Z", "+00:00"))` for our rows. */
function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  let text = value.replace('Z', '+00:00');
  // SQLite CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS"; fromisoformat
  // accepts that as a naive local time, which is fine for difference math.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    text = text.replace(' ', 'T');
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function average(values: ReadonlyArray<number>): number | null {
  return values.length > 0
    ? pythonRound(values.reduce((total, value) => total + value, 0) / values.length, 1)
    : null;
}

export class AnalyticsService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;
  private readonly now: () => Date;

  constructor(options: AnalyticsServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
    this.now = options.now ?? (() => new Date());
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  async summary(userId: string): Promise<AnalyticsSummary> {
    try {
      const store = this.getStore();
      const [candidates, jobs, apps, interviews, sessions] = await Promise.all([
        store.listCandidates(userId),
        store.listJobs(userId),
        store.listApplications(userId),
        store.listInterviews(userId),
        store.listSessions(userId),
      ]);

      const totalCandidates = candidates.length;
      const totalJobs = jobs.length;
      const activeJobs = jobs.filter((job) => job['status'] === 'active').length;
      const totalApplications = apps.length;

      let totalShortlisted = apps.filter((app) => app['status'] === 'shortlisted').length;
      let totalOffered = apps.filter((app) => app['status'] === 'offered').length;
      let totalRejected = apps.filter((app) => app['status'] === 'rejected').length;

      if (totalApplications === 0 && totalCandidates > 0) {
        for (const candidate of candidates) {
          const status = asJsonObject(candidate['metadata'])['status'];
          if (status === 'shortlisted') {
            totalShortlisted += 1;
          } else if (status === 'offered') {
            totalOffered += 1;
          } else if (status === 'rejected') {
            totalRejected += 1;
          }
        }
      }

      const totalInterviews = interviews.length;
      const nowIso = this.now().toISOString();
      const upcomingInterviews = interviews.filter(
        (interview) => stringValue(interview['scheduled_at']) >= nowIso,
      ).length;

      const scores: number[] = [];
      for (const app of apps) {
        const score = numeric(app['match_score']);
        if (score !== null) {
          scores.push(score);
        }
      }
      if (scores.length === 0) {
        for (const candidate of candidates) {
          const score = numeric(asJsonObject(candidate['metadata'])['match_score']);
          if (score !== null) {
            scores.push(score);
          }
        }
      }
      const avgMatchScore =
        scores.length > 0
          ? pythonRound(scores.reduce((total, score) => total + score, 0) / scores.length, 1)
          : null;

      const baseCount = totalApplications > 0 ? totalApplications : totalCandidates;
      return {
        total_candidates: totalCandidates,
        total_jobs: totalJobs,
        active_jobs: activeJobs,
        total_applications: totalApplications,
        total_shortlisted: totalShortlisted,
        total_interviews: totalInterviews,
        upcoming_interviews: upcomingInterviews,
        total_offered: totalOffered,
        total_rejected: totalRejected,
        avg_match_score: avgMatchScore,
        total_chat_sessions: sessions.length,
        screening_rate: baseCount > 0 ? pythonRound((totalShortlisted / baseCount) * 100, 1) : null,
        interview_rate:
          totalShortlisted > 0 ? pythonRound((totalInterviews / totalShortlisted) * 100, 1) : null,
        offer_rate:
          totalInterviews > 0 ? pythonRound((totalOffered / totalInterviews) * 100, 1) : null,
      };
    } catch (error) {
      logger.error(`[analytics] Summary fallback failed: ${errorMessage(error)}`);
      return emptySummary();
    }
  }

  async pipeline(userId: string): Promise<PipelineStage[]> {
    try {
      const store = this.getStore();
      const [candidates, apps, interviews] = await Promise.all([
        store.listCandidates(userId),
        store.listApplications(userId),
        store.listInterviews(userId),
      ]);

      const candidatesCount = candidates.length;
      let shortlistedCount = apps.filter((app) => app['status'] === 'shortlisted').length;
      let offeredCount = apps.filter((app) => app['status'] === 'offered').length;

      if (apps.length === 0 && candidatesCount > 0) {
        for (const candidate of candidates) {
          const status = asJsonObject(candidate['metadata'])['status'];
          if (status === 'shortlisted') {
            shortlistedCount += 1;
          } else if (status === 'offered') {
            offeredCount += 1;
          }
        }
      }

      const totalPool = Math.max(candidatesCount, apps.length);
      const percent = (value: number): number =>
        totalPool > 0 ? pythonRound((value / totalPool) * 100, 1) : 0;

      return [
        { stage: 'Ingested', count: totalPool, percentage: totalPool > 0 ? 100 : 0 },
        { stage: 'Shortlisted', count: shortlistedCount, percentage: percent(shortlistedCount) },
        { stage: 'Interview', count: interviews.length, percentage: percent(interviews.length) },
        { stage: 'Offer', count: offeredCount, percentage: percent(offeredCount) },
      ];
    } catch (error) {
      logger.error(`[analytics] Pipeline fallback failed: ${errorMessage(error)}`);
      return emptyPipeline();
    }
  }

  async candidatesOverTime(userId: string, days: number): Promise<TimeSeriesPoint[]> {
    try {
      const store = this.getStore();
      const now = this.now();
      const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
      const candidates = await store.listCandidatesCreatedSince(userId, cutoff);

      const counts = new Map<string, number>();
      for (const candidate of candidates) {
        const day = stringValue(candidate['created_at']).slice(0, 10);
        if (day) {
          counts.set(day, (counts.get(day) ?? 0) + 1);
        }
      }

      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const result: TimeSeriesPoint[] = [];
      for (let index = days - 1; index >= 0; index -= 1) {
        const day = new Date(todayUtc - index * 86_400_000).toISOString().slice(0, 10);
        result.push({ day, count: counts.get(day) ?? 0 });
      }
      return result;
    } catch (error) {
      logger.error(`[analytics] Ingestion time series fallback failed: ${errorMessage(error)}`);
      return [];
    }
  }

  async matchDistribution(userId: string): Promise<MatchBucket[]> {
    try {
      const store = this.getStore();
      const scores: number[] = [];
      const apps = await store.listApplications(userId);
      for (const app of apps) {
        const score = numeric(app['match_score']);
        if (score !== null) {
          scores.push(score);
        }
      }
      if (scores.length === 0) {
        const candidates = await store.listCandidates(userId);
        for (const candidate of candidates) {
          const score = numeric(asJsonObject(candidate['metadata'])['match_score']);
          if (score !== null) {
            scores.push(score);
          }
        }
      }

      const tiers: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      for (const score of scores) {
        if (score >= 90) {
          tiers[0] += 1;
        } else if (score >= 75) {
          tiers[1] += 1;
        } else if (score >= 60) {
          tiers[2] += 1;
        } else if (score >= 40) {
          tiers[3] += 1;
        } else {
          tiers[4] += 1;
        }
      }
      return matchBuckets(tiers);
    } catch (error) {
      logger.error(`[analytics] Match distribution fallback failed: ${errorMessage(error)}`);
      return matchBuckets([0, 0, 0, 0, 0]);
    }
  }

  async topSkills(userId: string, topN: number): Promise<SkillDemand[]> {
    try {
      const store = this.getStore();
      const counter = new Map<string, number>();
      const bump = (skill: string, amount: number): void => {
        counter.set(skill, (counter.get(skill) ?? 0) + amount);
      };

      const jobs = await store.listJobs(userId);
      for (const job of jobs) {
        const structured = asJsonObject(job['jd_structured']);
        const required = structured['required_skills'];
        if (Array.isArray(required)) {
          for (const skill of required) {
            if (typeof skill === 'string' && skill) {
              bump(skill.trim(), 2);
            }
          }
        }
      }

      const candidates = await store.listCandidates(userId);
      for (const candidate of candidates) {
        const skills = asJsonObject(candidate['metadata'])['skills'];
        if (Array.isArray(skills)) {
          for (const skill of skills) {
            if (typeof skill === 'string' && skill) {
              bump(skill.trim(), 1);
            }
          }
        }
      }

      return [...counter.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, topN)
        .map(([skill, demandCount]) => ({ skill, demand_count: demandCount }));
    } catch (error) {
      logger.error(`[analytics] Top skills fallback failed: ${errorMessage(error)}`);
      return [];
    }
  }

  async hiringVelocity(userId: string): Promise<HiringVelocity> {
    try {
      const store = this.getStore();
      const apps = await store.listApplications(userId);
      const shortlistDiffs: number[] = [];
      const offerDiffs: number[] = [];
      for (const app of apps) {
        const createdAt = parseTimestamp(app['created_at']);
        const updatedAt = parseTimestamp(app['updated_at']);
        if (!createdAt || !updatedAt) {
          continue;
        }
        const diffDays = Math.max(0.1, (updatedAt.getTime() - createdAt.getTime()) / 86_400_000);
        if (app['status'] === 'shortlisted') {
          shortlistDiffs.push(diffDays);
        } else if (app['status'] === 'offered') {
          offerDiffs.push(diffDays);
        }
      }

      const interviews = await store.listInterviews(userId);
      const interviewDiffs: number[] = [];
      for (const interview of interviews) {
        const createdAt = parseTimestamp(interview['created_at']);
        const scheduledAt = parseTimestamp(interview['scheduled_at']);
        if (!createdAt || !scheduledAt) {
          continue;
        }
        interviewDiffs.push(
          Math.max(0.1, (scheduledAt.getTime() - createdAt.getTime()) / 86_400_000),
        );
      }

      return {
        avg_days_to_shortlist: average(shortlistDiffs),
        avg_days_to_interview: average(interviewDiffs),
        avg_days_to_offer: average(offerDiffs),
        total_time_tracked: shortlistDiffs.length + interviewDiffs.length + offerDiffs.length,
      };
    } catch (error) {
      logger.error(`[analytics] Hiring velocity fallback failed: ${errorMessage(error)}`);
      return {
        avg_days_to_shortlist: null,
        avg_days_to_interview: null,
        avg_days_to_offer: null,
        total_time_tracked: 0,
      };
    }
  }

  async jobsSummary(userId: string): Promise<JobSummaryRow[]> {
    try {
      const store = this.getStore();
      const [jobs, apps, candidates] = await Promise.all([
        store.listJobs(userId),
        store.listApplications(userId),
        store.listCandidates(userId),
      ]);
      const totalCandidates = candidates.length;

      return jobs.map((job) => {
        const jobId = stringValue(job['id']);
        const jobApps = apps.filter((app) => app['job_id'] === jobId);
        const applied = jobApps.length > 0 ? jobApps.length : totalCandidates;
        const shortlisted = jobApps.filter((app) => app['status'] === 'shortlisted').length;
        const interviewed = jobApps.filter((app) =>
          ['interview_scheduled', 'interviewed'].includes(stringValue(app['status'])),
        ).length;
        const offered = jobApps.filter((app) => app['status'] === 'offered').length;
        const scores = jobApps
          .map((app) => numeric(app['match_score']))
          .filter((score): score is number => score !== null);

        return {
          job_id: jobId,
          title: stringValue(job['title']) || 'Hiring Campaign',
          status: stringValue(job['status']) || 'active',
          created_at: stringValue(job['created_at']),
          total_applied: applied,
          total_shortlisted: shortlisted,
          total_interviewed: interviewed,
          total_offered: offered,
          avg_match_score:
            scores.length > 0
              ? pythonRound(scores.reduce((total, score) => total + score, 0) / scores.length, 1)
              : null,
        };
      });
    } catch (error) {
      logger.error(`[analytics] Jobs summary fallback failed: ${errorMessage(error)}`);
      return [];
    }
  }

  async recentActivity(userId: string, limit: number): Promise<ActivityEvent[]> {
    try {
      const store = this.getStore();
      const nowIso = this.now().toISOString();
      const events: ActivityEvent[] = [];

      const candidates = [...(await store.listCandidates(userId))]
        .sort((left, right) =>
          stringValue(right['created_at']).localeCompare(stringValue(left['created_at'])),
        )
        .slice(0, limit);
      for (const candidate of candidates) {
        events.push({
          event_type: 'Candidate Ingested',
          description: `Candidate '${stringValue(candidate['full_name'])}' was ingested and indexed into talent pool.`,
          entity_id: stringValue(candidate['id']),
          occurred_at: stringValue(candidate['created_at']) || nowIso,
        });
      }

      const interviews = [...(await store.listInterviews(userId))]
        .sort((left, right) =>
          stringValue(right['created_at']).localeCompare(stringValue(left['created_at'])),
        )
        .slice(0, limit);
      for (const interview of interviews) {
        const candidateName =
          stringValue(asJsonObject(interview['feedback'])['candidate_name']) || 'Candidate';
        events.push({
          event_type: 'Interview Scheduled',
          description: `Technical interview scheduled with ${candidateName}.`,
          entity_id: stringValue(interview['id']),
          occurred_at:
            stringValue(interview['created_at']) ||
            stringValue(interview['scheduled_at']) ||
            nowIso,
        });
      }

      const applications = [...(await store.listApplications(userId))]
        .filter((app) => app['status'] !== 'new')
        .sort((left, right) =>
          stringValue(right['updated_at']).localeCompare(stringValue(left['updated_at'])),
        )
        .slice(0, limit);
      for (const application of applications) {
        events.push({
          event_type: 'Status Changed',
          description: `Candidate was marked as ${stringValue(application['status'])}.`,
          entity_id: stringValue(application['candidate_id']) || stringValue(application['id']),
          occurred_at: stringValue(application['updated_at']) || nowIso,
        });
      }

      return events
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, limit);
    } catch (error) {
      logger.error(`[analytics] Recent activity fallback failed: ${errorMessage(error)}`);
      return [];
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Factory used by the API router and tests. */
export function createAnalyticsService(options: AnalyticsServiceOptions = {}): AnalyticsService {
  return new AnalyticsService(options);
}
