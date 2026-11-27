import express, { type Express } from 'express';

import type { AppConfig } from '../src/config/index.js';
import { loadConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqlitePaymentStore } from '../src/db/payment-store.js';
import {
  createSqliteWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../src/db/workspace-query-store.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { jsonBodyParser } from '../src/middleware/json-body.js';
import { createRequestIdMiddleware } from '../src/middleware/request-id.js';
import { clearResetRateLimits } from '../src/services/session-service.js';
import type { AnalyticsService } from '../src/services/analytics-service.js';
import type { EvaluationService } from '../src/services/evaluation-service.js';
import type { PrivacyService } from '../src/services/privacy-service.js';
import type { ReportService } from '../src/services/report-service.js';
import type { SessionService } from '../src/services/session-service.js';
import type { UserService } from '../src/services/user-service.js';
import { createPaymentService, type PaymentService } from '../src/services/payment-service.js';
import { createApiRouter } from '../src/routes/index.js';

/** Shared fixtures for the Phase 15 route/service tests. */

export const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
export const OTHER_USER_ID = '11111111-1111-4111-8111-111111111111';
export const SESSION_ONE = '22222222-2222-4222-8222-222222222222';
export const SESSION_TWO = '33333333-3333-4333-8333-333333333333';
export const JOB_ONE = '44444444-4444-4444-8444-444444444444';
export const JOB_TWO = '55555555-5555-4555-8555-555555555555';
export const CANDIDATE_ONE = '66666666-6666-4666-8666-666666666666';
export const CANDIDATE_TWO = '77777777-7777-4777-8777-777777777777';
export const CANDIDATE_THREE = '88888888-8888-4888-8888-888888888888';
export const APPLICATION_ONE = '99999999-9999-4999-8999-999999999999';
export const INTERVIEW_ONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export function devConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

export interface Phase15Services {
  readonly sessionService?: SessionService;
  readonly evaluationService?: EvaluationService;
  readonly reportService?: ReportService;
  readonly analyticsService?: AnalyticsService;
  readonly userService?: UserService;
  readonly privacyService?: PrivacyService;
}

export interface Phase15Harness {
  readonly app: Express;
  readonly db: FallbackDatabase;
  readonly store: WorkspaceQueryStore;
  readonly paymentService: PaymentService;
  readonly config: AppConfig;
}

export interface Phase15HarnessOptions {
  readonly config?: AppConfig;
  readonly services?: Phase15Services;
  readonly credits?: number;
}

/**
 * Build an isolated Express app: in-memory SQLite fallback, the Phase 15 query
 * store over it, and a payment service wired to the same database.
 */
export async function withPhase15<T>(
  fn: (harness: Phase15Harness) => Promise<T> | T,
  options: Phase15HarnessOptions = {},
): Promise<T> {
  const config = options.config ?? devConfig();
  const db = new FallbackDatabase(':memory:', config);
  clearResetRateLimits();
  try {
    seedUser(db, USER_ID, { credits: options.credits ?? 10 });

    const store = createSqliteWorkspaceQueryStore(db);
    const paymentService = createPaymentService({
      config,
      store: createSqlitePaymentStore(db),
    });

    const app = express();
    app.disable('x-powered-by');
    app.use(createRequestIdMiddleware());
    app.use(jsonBodyParser);
    app.use(
      '/api',
      createApiRouter({
        config,
        workspaceQueryStore: store,
        paymentService,
        ...(options.services ?? {}),
      }),
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    return await fn({ app, db, store, paymentService, config });
  } finally {
    db.close();
  }
}

function seedUser(
  db: FallbackDatabase,
  userId: string,
  options: { readonly credits?: number; readonly email?: string } = {},
): void {
  db.table('users')
    .insert({
      id: userId,
      email: options.email ?? `${userId}@recruitai.local`,
      full_name: 'Lead Recruiter',
      role: 'recruiter',
      credits_balance: options.credits ?? 10,
      preferences: JSON.stringify({
        email_alerts: true,
        theme: 'dark',
        blind_mode_default: false,
        auto_rubric: true,
      }),
    })
    .execute();
}

/** Insert a candidate with a JSON metadata object. */
export function seedCandidate(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly userId?: string;
    readonly name?: string;
    readonly email?: string | null;
    readonly metadata?: Record<string, unknown>;
    readonly rawResumeText?: string | null;
    readonly createdAt?: string;
  },
): void {
  db.table('candidates')
    .insert({
      id: options.id,
      user_id: options.userId ?? USER_ID,
      full_name: options.name ?? 'Ada Lovelace',
      email: options.email === undefined ? 'ada@example.com' : options.email,
      raw_resume_text: options.rawResumeText ?? 'Resume text',
      metadata: JSON.stringify(options.metadata ?? {}),
      ...(options.createdAt === undefined ? {} : { created_at: options.createdAt }),
    })
    .execute();
}

/** Insert a job with structured JD JSON. */
export function seedJob(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly userId?: string;
    readonly title?: string;
    readonly status?: string;
    readonly jd?: Record<string, unknown>;
    readonly createdAt?: string;
  },
): void {
  db.table('jobs')
    .insert({
      id: options.id,
      user_id: options.userId ?? USER_ID,
      title: options.title ?? 'Senior Engineer',
      raw_jd: 'Raw job description',
      jd_structured: JSON.stringify(options.jd ?? { role: 'Senior Engineer' }),
      status: options.status ?? 'active',
      ...(options.createdAt === undefined ? {} : { created_at: options.createdAt }),
    })
    .execute();
}

/** Insert a session row. */
export function seedSession(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly userId?: string;
    readonly title?: string;
    readonly jobId?: string | null;
    readonly lastIntent?: string | null;
    readonly pendingConfirmation?: string | null;
    readonly updatedAt?: string;
  },
): void {
  db.table('chat_sessions')
    .insert({
      id: options.id,
      user_id: options.userId ?? USER_ID,
      title: options.title ?? 'Campaign',
      job_id: options.jobId ?? null,
      last_intent: options.lastIntent ?? null,
      pending_confirmation: options.pendingConfirmation ?? null,
      ...(options.updatedAt === undefined ? {} : { updated_at: options.updatedAt }),
    })
    .execute();
}

/** Insert an application row. */
export function seedApplication(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly jobId?: string;
    readonly candidateId: string;
    readonly userId?: string;
    readonly matchScore?: number | null;
    readonly reasoning?: Record<string, unknown>;
    readonly status?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
  },
): void {
  db.table('applications')
    .insert({
      id: options.id,
      job_id: options.jobId ?? JOB_ONE,
      candidate_id: options.candidateId,
      user_id: options.userId ?? USER_ID,
      match_score: options.matchScore ?? 80,
      match_reasoning: JSON.stringify(options.reasoning ?? {}),
      status: options.status ?? 'new',
      ...(options.createdAt === undefined ? {} : { created_at: options.createdAt }),
      ...(options.updatedAt === undefined ? {} : { updated_at: options.updatedAt }),
    })
    .execute();
}

/** Link a candidate to a session through the relational join table. */
export function seedSessionCandidate(
  db: FallbackDatabase,
  sessionId: string,
  candidateId: string,
): void {
  db.table('session_candidates')
    .insert({ session_id: sessionId, candidate_id: candidateId })
    .execute();
}

/** Insert an interview row. */
export function seedInterview(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly candidateId: string;
    readonly userId?: string;
    readonly scheduledAt?: string;
    readonly status?: string;
    readonly feedback?: Record<string, unknown> | null;
    readonly mode?: string;
    readonly meetingLink?: string | null;
    readonly createdAt?: string;
  },
): void {
  db.table('interviews')
    .insert({
      id: options.id,
      candidate_id: options.candidateId,
      user_id: options.userId ?? USER_ID,
      scheduled_at: options.scheduledAt ?? '2026-11-20T10:00:00.000Z',
      mode: options.mode ?? 'video',
      meeting_link: options.meetingLink ?? null,
      status: options.status ?? 'scheduled',
      feedback: options.feedback === undefined ? null : JSON.stringify(options.feedback),
      ...(options.createdAt === undefined ? {} : { created_at: options.createdAt }),
    })
    .execute();
}

/** Insert a resume chunk row. */
export function seedResumeChunk(
  db: FallbackDatabase,
  options: { readonly id: string; readonly candidateId: string; readonly userId?: string },
): void {
  db.table('resume_chunks')
    .insert({
      id: options.id,
      candidate_id: options.candidateId,
      user_id: options.userId ?? USER_ID,
      chunk_text: 'Chunk text',
      chunk_index: 0,
    })
    .execute();
}

/** Insert a chat message row. */
export function seedChatMessage(
  db: FallbackDatabase,
  options: {
    readonly id: string;
    readonly sessionId: string;
    readonly userId?: string;
    readonly role?: string;
    readonly content: string;
    readonly metadata?: Record<string, unknown> | null;
    readonly createdAt?: string;
  },
): void {
  db.table('chat_messages')
    .insert({
      id: options.id,
      session_id: options.sessionId,
      user_id: options.userId ?? USER_ID,
      role: options.role ?? 'assistant',
      content: options.content,
      metadata: options.metadata === undefined ? null : JSON.stringify(options.metadata),
      ...(options.createdAt === undefined ? {} : { created_at: options.createdAt }),
    })
    .execute();
}

/** ISO timestamp `days` before now (UTC). */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
