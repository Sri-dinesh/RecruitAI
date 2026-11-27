import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import type { GraphDeps } from '../src/graph/deps.js';
import { CampaignService } from '../src/services/campaign-service.js';
import { getAllLogs } from '../src/telemetry/logging.js';
import { fakeDeps, makeCandidate, makeJd } from './graph-helpers.js';

const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const SESSION = '22222222-2222-4222-8222-222222222222';
const ALICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function config(): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
  });
}

interface Harness {
  readonly db: FallbackDatabase;
  readonly store: WorkspaceStore;
  readonly service: CampaignService;
}

async function withService<T>(
  fn: (harness: Harness) => Promise<T> | T,
  graphDeps: GraphDeps = fakeDeps(),
): Promise<T> {
  const cfg = config();
  const db = new FallbackDatabase(':memory:', cfg);
  try {
    const store = createSqliteWorkspaceStore(db);
    const service = new CampaignService({ config: cfg, store, graphDeps });
    return await fn({ db, store, service });
  } finally {
    db.close();
  }
}

function rows(db: FallbackDatabase, table: string): Record<string, unknown>[] {
  return db.table(table).select().execute().data;
}

function sessionRow(db: FallbackDatabase): Record<string, unknown> | undefined {
  return rows(db, 'chat_sessions').find((row) => row.id === SESSION);
}

async function seedSession(store: WorkspaceStore): Promise<void> {
  await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });
}

describe('CampaignService.executeAgentTurn persistence', () => {
  it('runs the graph and persists the job, chat messages and session metadata', async () => {
    await withService(async ({ db, store, service }) => {
      await seedSession(store);

      const result = await service.executeAgentTurn({
        userId: USER_ID,
        sessionId: SESSION,
        message: 'how many candidates do we have?',
        jd: makeJd(),
        resumes: [
          makeCandidate({ candidate_id: ALICE_ID, name: 'Alice Smith' }),
          makeCandidate({ candidate_id: BOB_ID, name: 'Bob Jones' }),
        ],
      });

      assert.equal(
        result.response,
        'There are currently 2 candidate resumes loaded in the system.',
      );
      assert.equal(result.session_id, SESSION);
      assert.equal(result.last_intent, 'count');
      assert.deepEqual(result.conversation_history, [
        { role: 'user', content: 'how many candidates do we have?' },
        { role: 'assistant', content: result.response },
      ]);
      assert.equal(result.jd_structured?.role, 'Senior Backend Engineer');
      assert.ok(result.router_logs.length > 0);

      // Job row + session binding.
      const jobs = rows(db, 'jobs');
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.title, 'Senior Backend Engineer');
      assert.equal(jobs[0]?.raw_jd, 'We are hiring a Senior Backend Engineer.');
      assert.equal(jobs[0]?.user_id, USER_ID);

      const session = sessionRow(db);
      assert.equal(session?.job_id, jobs[0]?.id);
      assert.equal(session?.title, 'Hiring: Senior Backend Engineer');
      assert.equal(session?.last_intent, 'count');
      assert.equal(session?.pending_confirmation, null);

      // Both messages, with assistant metadata defaults.
      const messages = rows(db, 'chat_messages');
      assert.equal(messages.length, 2);
      const userMessage = messages.find((row) => row.role === 'user');
      const assistantMessage = messages.find((row) => row.role === 'assistant');
      assert.equal(userMessage?.content, 'how many candidates do we have?');
      assert.equal(assistantMessage?.content, result.response);

      const metadata = assistantMessage?.metadata as Record<string, unknown>;
      assert.deepEqual(metadata.agent_steps, ['Supervisor: Synthesized agent response']);
      assert.deepEqual(metadata.suggested_followups, [
        'Compare our top candidates side-by-side',
        'Generate a technical interview rubric for this role',
        'Draft interview invitation email for the top candidate',
      ]);
      assert.ok(Array.isArray(metadata.router_logs));

      // Telemetry boundary is cleared after the turn.
      assert.deepEqual(getAllLogs(), []);
    });
  });

  it('persists applications for the shortlist and stores the pending gate', async () => {
    await withService(async ({ db, store, service }) => {
      await seedSession(store);
      const alice = makeCandidate({
        candidate_id: ALICE_ID,
        name: 'Alice Smith',
        match_score: 88,
        matched_skills: ['Python', 'FastAPI'],
        gaps: ['Kubernetes'],
        summary: 'Strong backend fit.',
      });

      const result = await service.executeAgentTurn({
        userId: USER_ID,
        sessionId: SESSION,
        message: 'finalize the shortlist',
        jd: makeJd(),
        resumes: [alice],
        shortlist: [alice],
      });

      assert.equal(result.last_intent, 'finalize_shortlist');
      assert.deepEqual(result.pending_confirmation, {
        action: 'finalize_shortlist',
        payload: [ALICE_ID],
      });
      assert.equal(result.last_shortlist?.length, 1);

      const applications = rows(db, 'applications');
      assert.equal(applications.length, 1);
      assert.equal(applications[0]?.candidate_id, ALICE_ID);
      assert.equal(applications[0]?.status, 'shortlisted');
      assert.equal(applications[0]?.match_score, 88);
      assert.deepEqual(applications[0]?.match_reasoning, {
        matched_skills: ['Python', 'FastAPI'],
        gaps: ['Kubernetes'],
        summary: 'Strong backend fit.',
      });

      const session = sessionRow(db);
      assert.equal(session?.last_intent, 'finalize_shortlist');
      assert.deepEqual(session?.pending_confirmation, {
        action: 'finalize_shortlist',
        payload: [ALICE_ID],
      });
    });
  });

  it('books a slot across two turns and persists the interview', async () => {
    await withService(async ({ db, store, service }) => {
      await seedSession(store);
      const alice = makeCandidate({ candidate_id: ALICE_ID, name: 'Alice Smith' });
      const jd = makeJd({ role: 'Platform Engineer' });

      const opened = await service.executeAgentTurn({
        userId: USER_ID,
        sessionId: SESSION,
        message: 'schedule an interview with Alice Smith',
        jd,
        resumes: [alice],
      });

      assert.equal(opened.last_intent, 'schedule');
      assert.equal(opened.scheduled_interviews, null);
      const pending = opened.pending_confirmation as Record<string, unknown>;
      assert.equal(pending.action, 'schedule_interview');
      assert.equal(pending.candidate_id, ALICE_ID);

      const booked = await service.executeAgentTurn({
        userId: USER_ID,
        sessionId: SESSION,
        message: '2',
        jd,
        resumes: [alice],
        history: opened.conversation_history,
        pendingConfirmation: opened.pending_confirmation,
        lastIntent: opened.last_intent,
        scheduledInterviews: opened.scheduled_interviews,
      });

      assert.equal(booked.pending_confirmation, null);
      assert.equal(booked.scheduled_interviews?.length, 1);
      assert.equal(
        (booked.scheduled_interviews?.[0] as Record<string, unknown>)?.slot,
        'Monday, November 16 2026 at 2:00 PM',
      );

      const interviews = rows(db, 'interviews');
      assert.equal(interviews.length, 1);
      assert.equal(interviews[0]?.candidate_id, ALICE_ID);
      assert.equal(interviews[0]?.duration_minutes, 30);
      assert.equal(interviews[0]?.mode, 'video');
      assert.equal(interviews[0]?.status, 'scheduled');
      // Python's parser cannot read the label either, so the slot stays NULL (BUG-4).
      assert.equal(interviews[0]?.scheduled_at, null);
      assert.deepEqual(interviews[0]?.feedback, {
        candidate_name: 'Alice Smith',
        booked_at: '2026-11-13T09:30:00',
      });

      const session = sessionRow(db);
      assert.equal(session?.last_intent, 'schedule');
      assert.equal(session?.pending_confirmation, null);
    });
  });

  it('rejects an invalid candidate payload before touching the graph', async () => {
    await withService(async ({ db, store, service }) => {
      await seedSession(store);

      await assert.rejects(
        () =>
          service.executeAgentTurn({
            userId: USER_ID,
            sessionId: SESSION,
            message: 'how many candidates?',
            jd: null,
            resumes: [{ candidate_id: ALICE_ID, name: 'Alice', match_score: 'not-a-number' }],
          }),
        /match_score/i,
      );

      assert.equal(rows(db, 'chat_messages').length, 1);
      assert.equal(rows(db, 'chat_messages')[0]?.role, 'user');
      assert.deepEqual(getAllLogs(), []);
    });
  });

  it('survives persistence failures without losing the response', async () => {
    await withService(async ({ db, store }) => {
      await seedSession(store);
      const failingStore = new Proxy(store, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver) as unknown;
          if (property === 'insertChatMessage' || property === 'updateSession') {
            return async () => {
              throw new Error('write failure');
            };
          }
          return value;
        },
      });
      const failingService = new CampaignService({
        config: config(),
        store: failingStore,
        graphDeps: fakeDeps(),
      });

      const result = await failingService.executeAgentTurn({
        userId: USER_ID,
        sessionId: SESSION,
        message: 'how many candidates?',
        jd: null,
        resumes: [],
      });

      assert.equal(
        result.response,
        '0 — no resumes have been loaded yet. Point me to a folder or paste JD + resumes to start.',
      );
      assert.equal(rows(db, 'chat_messages').length, 0);
    });
  });
});
