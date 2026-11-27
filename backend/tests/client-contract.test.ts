import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore } from '../src/db/workspace-store.js';
import { InMemoryChatJobManager } from '../src/jobs/in-memory-job-manager.js';
import { CampaignService, type ExecuteAgentTurnInput } from '../src/services/campaign-service.js';
import { IngestionService } from '../src/services/ingestion-service.js';
import { parseStructuredResume } from '../src/services/resume-parser.js';
import { fakeDeps } from './graph-helpers.js';
import {
  APPLICATION_ONE,
  CANDIDATE_ONE,
  INTERVIEW_ONE,
  JOB_ONE,
  SESSION_ONE,
  USER_ID,
  daysAgo,
  seedApplication,
  seedCandidate,
  seedChatMessage,
  seedInterview,
  seedJob,
  seedSession,
  seedSessionCandidate,
  withPhase15,
} from './phase15-helpers.js';

/**
 * Client contract tests for Phase 18.
 *
 * These pin only the fields the shipped clients actually read:
 *   - `mobile/src/types/schema.ts` (Candidate, ChatSession, ChatApiResponse,
 *     CandidateEvaluation)
 *   - `mobile/src/context/RecruitContext.tsx` / `AuthContext.tsx`
 *   - `frontend/src/lib/analyticsTypes.ts` and `analyticsApi.ts`
 *   - `frontend/src/app/dashboard/outreach/page.tsx`
 *   - `frontend/src/components/profile/SecurityTab.tsx`
 *
 * Behaviour-level parity lives in the focused suites (session-routes,
 * evaluate-routes, ingest-routes, chat-routes, privacy-routes, ...). This file
 * fails when a response shape drifts, even if the behaviour still works.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOW = new Date('2026-11-14T10:00:00.000Z');
const RESUME_TEXT =
  'Ada Lovelace is a senior engineer with deep Python, TypeScript and PostgreSQL experience. ' +
  'She has shipped distributed systems and mentored engineers for over eight years.';

function keysOf(value: unknown): string[] {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'expected object',
  );
  return Object.keys(value as Record<string, unknown>).sort();
}

function assertHasKeys(value: unknown, keys: readonly string[], label: string): void {
  assert.ok(value !== null && typeof value === 'object', `${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    assert.ok(key in record, `${label} is missing "${key}"`);
  }
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): void {
  assert.deepEqual(keysOf(value), [...keys].sort(), `${label} keys drifted`);
}

function devConfig(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

interface ClientHarness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: FallbackDatabase;
}

/**
 * App wired with the real campaign/ingestion services over in-memory SQLite.
 * Used for the writing client surfaces (chat, ingest) that the Phase 15
 * harness does not own.
 */
async function withClientApp<T>(fn: (harness: ClientHarness) => Promise<T> | T): Promise<T> {
  const config = devConfig();
  const db = new FallbackDatabase(':memory:', config);
  try {
    const store = createSqliteWorkspaceStore(db);
    const campaignService = new CampaignService({ config, store, graphDeps: fakeDeps() });
    const chatJobManager = new InMemoryChatJobManager({
      runner: (payload) =>
        campaignService.executeAgentTurn(payload as unknown as ExecuteAgentTurnInput),
      schedule: (task) => task(),
    });
    const ingestionService = new IngestionService({
      config,
      store,
      embedTexts: async (texts) => texts.map((_, index) => [index + 1, 1]),
      parseDocumentImpl: async (input) =>
        typeof input === 'string' ? input : input.toString('utf8'),
      parseResumeImpl: (rawText, filename) => parseStructuredResume(rawText, filename),
      now: () => NOW,
    });

    const app = createApp({
      config,
      campaignService,
      chatJobManager,
      ingestionService,
    });
    return await fn({ app, db });
  } finally {
    db.close();
  }
}

describe('client contract — identity and campaign sessions', () => {
  it('GET /api/users/me exposes the profile fields the clients render', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app).get('/api/users/me').expect(200);

      assertHasKeys(
        response.body,
        [
          'id',
          'email',
          'full_name',
          'avatar_url',
          'phone',
          'company_name',
          'company_website',
          'department',
          'role',
          'preferences',
          'last_sign_in_at',
          'created_at',
          'updated_at',
        ],
        '/api/users/me',
      );
      assert.equal(response.body.id, USER_ID);
      assert.ok(['recruiter', 'employer'].includes(String(response.body.role)));
      assert.equal(typeof response.body.preferences, 'object');
      assert.equal(response.body.preferences.email_alerts, true);
    });
  });

  it('session list/create/detail/update/delete match the mobile ChatSession shape', async () => {
    await withPhase15(async ({ app, db }) => {
      seedJob(db, { id: JOB_ONE, jd: { role: 'Senior Engineer' } });
      seedSession(db, { id: SESSION_ONE, title: 'Campaign One', jobId: JOB_ONE });
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        metadata: { skills: ['Python'], status: 'shortlisted', match_score: 90 },
      });
      seedSessionCandidate(db, SESSION_ONE, CANDIDATE_ONE);
      seedChatMessage(db, { id: 'message-1', sessionId: SESSION_ONE, content: 'Hello' });

      const list = await request(app).get('/api/sessions').expect(200);
      assert.ok(Array.isArray(list.body));
      assertHasKeys(
        list.body[0],
        ['id', 'title', 'job_id', 'created_at', 'updated_at', 'candidate_count'],
        'session list item',
      );
      assert.match(String(list.body[0].id), UUID_RE);

      const created = await request(app).post('/api/sessions').expect(200);
      assert.match(String(created.body.id), UUID_RE);
      assertHasKeys(
        created.body,
        ['id', 'user_id', 'title', 'conversation_history', 'candidate_count'],
        'created session',
      );
      assert.ok(Array.isArray(created.body.conversation_history));

      const detail = await request(app).get(`/api/sessions/${SESSION_ONE}`).expect(200);
      assertHasKeys(
        detail.body,
        [
          'id',
          'title',
          'jd_structured',
          'resumes',
          'last_shortlist',
          'scheduled_interviews',
          'conversation_history',
        ],
        'session detail',
      );
      assert.equal(detail.body.id, SESSION_ONE);
      assert.ok(Array.isArray(detail.body.conversation_history));

      const resume = (detail.body.resumes as Array<Record<string, unknown>>)[0];
      assertHasKeys(resume, ['candidate_id', 'name', 'raw_text'], 'candidate on the wire');

      const patched = await request(app)
        .patch(`/api/sessions/${SESSION_ONE}`)
        .send({ title: 'Renamed Campaign' })
        .expect(200);
      assert.equal(patched.body.title, 'Renamed Campaign');

      const deleted = await request(app).delete(`/api/sessions/${SESSION_ONE}`).expect(200);
      assert.equal(deleted.body.message, `Session ${SESSION_ONE} deleted successfully.`);
    });
  });
});

describe('client contract — chat and ingest', () => {
  it('POST /api/chat returns the synchronous ChatApiResponse shape', async () => {
    await withClientApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', conversation_history: [] })
        .expect(200);

      assertHasKeys(
        response.body,
        [
          'response',
          'jd_structured',
          'resumes',
          'last_shortlist',
          'pending_confirmation',
          'last_intent',
          'conversation_history',
          'router_logs',
          'scheduled_interviews',
          'session_id',
        ],
        'chat response',
      );
      assert.equal(typeof response.body.response, 'string');
      assert.match(String(response.body.session_id), UUID_RE);
      assert.ok(Array.isArray(response.body.conversation_history));
      assert.equal(response.body.conversation_history.length, 2);
      assert.equal(response.body.conversation_history[0].role, 'user');
      assert.equal(response.body.conversation_history[1].role, 'assistant');
    });
  });

  it('async chat returns the 202 job envelope and the pollable job shape', async () => {
    await withClientApp(async ({ app }) => {
      const accepted = await request(app)
        .post('/api/chat')
        .send({ message: 'hello', async_mode: true })
        .expect(202);

      assertExactKeys(
        accepted.body,
        ['job_id', 'session_id', 'status', 'check_url', 'stream_url'],
        'async chat response',
      );
      assert.equal(accepted.body.status, 'queued');
      assert.match(String(accepted.body.session_id), UUID_RE);
      assert.equal(accepted.body.check_url, `/api/chat/jobs/${accepted.body.job_id}`);

      const job = await request(app).get(String(accepted.body.check_url)).expect(200);
      assertHasKeys(
        job.body,
        [
          'job_id',
          'session_id',
          'status',
          'created_at',
          'updated_at',
          'steps_count',
          'result',
          'error',
        ],
        'chat job',
      );
      assert.equal(job.body.job_id, accepted.body.job_id);
      assert.ok(['running', 'completed'].includes(String(job.body.status)));
    });
  });

  it('POST /api/ingest/upload returns the per-file result shape', async () => {
    await withClientApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/ingest/upload')
        .attach('files', Buffer.from(RESUME_TEXT), {
          filename: 'ada_lovelace.txt',
          contentType: 'text/plain',
        })
        .expect(200);

      assert.ok(Array.isArray(response.body));
      assert.equal(response.body.length, 1);
      const item = response.body[0] as Record<string, unknown>;
      assertHasKeys(item, ['filename', 'status', 'candidate_id', 'name'], 'ingest result');
      assert.equal(item.status, 'success');
      assert.equal(item.filename, 'ada_lovelace.txt');
      assert.match(String(item.candidate_id), UUID_RE);
    });
  });
});

describe('client contract — evaluation and ATS export', () => {
  it('POST /api/candidates/evaluate and GET evaluation match CandidateEvaluation', async () => {
    await withPhase15(async ({ app, db }) => {
      seedJob(db, { id: JOB_ONE });
      seedCandidate(db, { id: CANDIDATE_ONE, metadata: { skills: ['Python'] } });
      seedApplication(db, {
        id: APPLICATION_ONE,
        jobId: JOB_ONE,
        candidateId: CANDIDATE_ONE,
        status: 'new',
      });

      const saved = await request(app)
        .post('/api/candidates/evaluate')
        .send({
          candidate_id: CANDIDATE_ONE,
          tech_score: 4,
          comm_score: 5,
          notes: 'Strong systems thinker',
          status: 'shortlisted',
        })
        .expect(200);

      assertHasKeys(saved.body, ['status', 'message', 'evaluation'], 'evaluate response');
      assertHasKeys(
        saved.body.evaluation,
        ['candidate_id', 'tech_score', 'comm_score', 'notes', 'status', 'updated_at'],
        'evaluation',
      );
      assert.equal(saved.body.evaluation.candidate_id, CANDIDATE_ONE);

      const fetched = await request(app)
        .get(`/api/candidates/${CANDIDATE_ONE}/evaluation`)
        .expect(200);
      assert.equal(fetched.body.candidate_id, CANDIDATE_ONE);
      assert.equal(fetched.body.tech_score, 4);
      assert.equal(fetched.body.status, 'shortlisted');
    });
  });

  it('candidate status updates return new_status and the ATS export keeps both formats', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        metadata: {
          status: 'new',
          rubric: { tech_score: 5, comm_score: 4, notes: 'Great' },
        },
      });

      const status = await request(app)
        .post(`/api/candidates/${CANDIDATE_ONE}/status`)
        .send({ status: 'shortlisted', actor: 'human_recruiter' })
        .expect(200);
      assertHasKeys(status.body, ['status', 'candidate_id', 'new_status'], 'status response');
      assert.equal(status.body.new_status, 'shortlisted');

      const json = await request(app).post('/api/export/ats').send({ format: 'json' }).expect(200);
      assertHasKeys(
        json.body,
        ['status', 'format', 'evaluations', 'evaluations_count'],
        'ATS JSON',
      );
      assert.equal(json.body.evaluations[CANDIDATE_ONE].candidate_name, 'Ada Lovelace');

      const csv = await request(app).post('/api/export/ats').send({ format: 'csv' }).expect(200);
      assert.match(String(csv.headers['content-type']), /^text\/csv/);
      assert.equal(
        csv.text.trim().split('\r\n')[0],
        'Candidate ID,Candidate Name,Email,Status,Match Score,Tech Score,Comm Score,Notes',
      );
    });
  });
});

describe('client contract — analytics dashboard', () => {
  function seedDashboard(db: FallbackDatabase): void {
    seedJob(db, {
      id: JOB_ONE,
      title: 'Platform Engineer',
      status: 'active',
      jd: { role: 'Platform Engineer', required_skills: ['Python'] },
      createdAt: daysAgo(10),
    });
    seedCandidate(db, {
      id: CANDIDATE_ONE,
      name: 'Ada Lovelace',
      createdAt: daysAgo(5),
      metadata: { status: 'shortlisted', match_score: 90, skills: ['Python'] },
    });
    seedApplication(db, {
      id: APPLICATION_ONE,
      jobId: JOB_ONE,
      candidateId: CANDIDATE_ONE,
      matchScore: 90,
      status: 'shortlisted',
      createdAt: daysAgo(10),
      updatedAt: daysAgo(3),
    });
    seedInterview(db, {
      id: INTERVIEW_ONE,
      candidateId: CANDIDATE_ONE,
      scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      createdAt: daysAgo(2),
    });
    seedSession(db, { id: SESSION_ONE, title: 'Campaign' });
  }

  it('every analytics endpoint keeps the field names in analyticsTypes.ts', async () => {
    await withPhase15(async ({ app, db }) => {
      seedDashboard(db);

      const summary = await request(app).get('/api/analytics/summary').expect(200);
      assertExactKeys(
        summary.body,
        [
          'total_candidates',
          'total_jobs',
          'active_jobs',
          'total_applications',
          'total_shortlisted',
          'total_interviews',
          'upcoming_interviews',
          'total_offered',
          'total_rejected',
          'avg_match_score',
          'total_chat_sessions',
          'screening_rate',
          'interview_rate',
          'offer_rate',
        ],
        'analytics summary',
      );

      const pipeline = await request(app).get('/api/analytics/pipeline').expect(200);
      assertHasKeys(pipeline.body[0], ['stage', 'count', 'percentage'], 'pipeline row');

      const overTime = await request(app)
        .get('/api/analytics/candidates-over-time?days=30')
        .expect(200);
      assertHasKeys(overTime.body[0], ['day', 'count'], 'time series point');

      const distribution = await request(app).get('/api/analytics/match-distribution').expect(200);
      assertHasKeys(
        distribution.body[0],
        ['bucket', 'count', 'min_score', 'max_score'],
        'match bucket',
      );

      const skills = await request(app).get('/api/analytics/top-skills?top_n=12').expect(200);
      assertHasKeys(skills.body[0], ['skill', 'demand_count'], 'skill demand');

      const velocity = await request(app).get('/api/analytics/hiring-velocity').expect(200);
      assertExactKeys(
        velocity.body,
        [
          'avg_days_to_shortlist',
          'avg_days_to_interview',
          'avg_days_to_offer',
          'total_time_tracked',
        ],
        'hiring velocity',
      );

      const jobs = await request(app).get('/api/analytics/jobs-summary').expect(200);
      assertHasKeys(
        jobs.body[0],
        [
          'job_id',
          'title',
          'status',
          'created_at',
          'total_applied',
          'total_shortlisted',
          'total_interviewed',
          'total_offered',
          'avg_match_score',
        ],
        'job summary row',
      );

      const activity = await request(app)
        .get('/api/analytics/recent-activity?limit=20')
        .expect(200);
      assert.ok(Array.isArray(activity.body));
      assertHasKeys(
        activity.body[0],
        ['event_type', 'description', 'entity_id', 'occurred_at'],
        'activity event',
      );
    });
  });
});

describe('client contract — billing and outreach', () => {
  it('plans, subscription status and the credit ledger keep their field names', async () => {
    await withPhase15(async ({ app }) => {
      const plans = await request(app).get('/api/payments/plans').expect(200);
      assert.equal(plans.body.length, 3);
      assertExactKeys(
        plans.body[0],
        ['id', 'name', 'amount', 'currency', 'interval', 'candidate_quota', 'features'],
        'pricing plan',
      );
      assert.deepEqual(
        (plans.body as Array<{ id: string }>).map((plan) => plan.id),
        ['starter', 'pro', 'agency'],
      );

      const status = await request(app).get('/api/payments/status').expect(200);
      assertExactKeys(
        status.body,
        ['user_id', 'plan_id', 'status', 'credits_remaining', 'current_period_end'],
        'subscription status',
      );

      const consumed = await request(app)
        .post('/api/payments/consume-credit')
        .send({ amount: 1, reason: 'contract test' })
        .expect(200);
      assertExactKeys(
        consumed.body,
        ['success', 'credits_remaining', 'amount_deducted', 'reason'],
        'credit consumption',
      );

      const transactions = await request(app).get('/api/payments/transactions').expect(200);
      assert.ok(Array.isArray(transactions.body));
      assertExactKeys(
        transactions.body[0],
        ['id', 'user_id', 'amount', 'balance_after', 'reason', 'created_at'],
        'credit transaction',
      );
    });
  });

  it('outreach history and stats keep the shapes the outreach page reads', async () => {
    await withPhase15(async ({ app }) => {
      const history = await request(app).get('/api/email/history?limit=20').expect(200);
      assertExactKeys(history.body, ['total', 'items'], 'email history');
      assert.ok(Array.isArray(history.body.items));

      const stats = await request(app).get('/api/email/stats').expect(200);
      assertExactKeys(
        stats.body,
        ['total_sent', 'smtp_count', 'simulated_count', 'failed_count'],
        'email stats',
      );
    });
  });
});

describe('client contract — privacy and GDPR', () => {
  it('candidate export, erasure, user export and bias audit keep their field names', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, {
        id: CANDIDATE_ONE,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        metadata: { skills: ['Python'] },
      });
      seedApplication(db, {
        id: APPLICATION_ONE,
        jobId: JOB_ONE,
        candidateId: CANDIDATE_ONE,
        matchScore: 90,
      });
      seedSession(db, { id: SESSION_ONE, title: 'Campaign' });

      const exported = await request(app).get(`/api/privacy/export/${CANDIDATE_ONE}`).expect(200);
      assertHasKeys(
        exported.body,
        ['candidate', 'applications', 'interviews', 'vector_chunks_stored', 'export_metadata'],
        'candidate export',
      );

      const userExport = await request(app).get('/api/privacy/user/export').expect(200);
      assertHasKeys(
        userExport.body,
        [
          'export_metadata',
          'campaign_sessions',
          'campaign_sessions_count',
          'candidates',
          'candidates_count',
        ],
        'user export',
      );

      const audit = await request(app).get('/api/privacy/bias-audit').expect(200);
      assertHasKeys(
        audit.body,
        [
          'audit_timestamp',
          'law_compliance',
          'sample_size',
          'metrics',
          'score_distribution',
          'certification',
        ],
        'bias audit',
      );

      const erased = await request(app)
        .delete(`/api/privacy/candidates/${CANDIDATE_ONE}`)
        .expect(200);
      assertExactKeys(erased.body, ['success', 'message'], 'candidate erasure');
      assert.equal(erased.body.success, true);
    });
  });
});
