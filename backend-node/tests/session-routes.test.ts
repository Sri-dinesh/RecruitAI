import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import type { FallbackDatabase } from '../src/db/fallback.js';
import {
  CANDIDATE_ONE,
  CANDIDATE_TWO,
  CANDIDATE_THREE,
  INTERVIEW_ONE,
  JOB_ONE,
  OTHER_USER_ID,
  SESSION_ONE,
  SESSION_TWO,
  USER_ID,
  seedApplication,
  seedCandidate,
  seedChatMessage,
  seedInterview,
  seedJob,
  seedSession,
  seedSessionCandidate,
  withPhase15,
} from './phase15-helpers.js';

const CANDIDATE_FOUR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function seedWorkspace(db: FallbackDatabase): void {
  seedJob(db, {
    id: JOB_ONE,
    jd: { role: 'Senior Engineer', required_skills: ['Python'] },
  });
  seedSession(db, { id: SESSION_ONE, title: 'Campaign One', jobId: JOB_ONE });
  seedSession(db, {
    id: SESSION_TWO,
    userId: OTHER_USER_ID,
    title: 'Other Campaign',
    jobId: null,
  });

  seedCandidate(db, {
    id: CANDIDATE_ONE,
    name: 'Ada Lovelace',
    metadata: { skills: ['Python'], experience_years: 8 },
  });
  seedCandidate(db, {
    id: CANDIDATE_TWO,
    name: 'Grace Hopper',
    metadata: {
      session_ids: [SESSION_ONE],
      skills: ['COBOL'],
      experience_years: 12,
    },
  });
  seedCandidate(db, { id: CANDIDATE_THREE, name: 'Unrelated Candidate', metadata: {} });
  seedCandidate(db, { id: CANDIDATE_FOUR, name: 'Katherine Johnson', metadata: {} });
  seedCandidate(db, {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userId: OTHER_USER_ID,
    name: 'Other Tenant Candidate',
    metadata: { session_id: SESSION_ONE },
  });

  seedSessionCandidate(db, SESSION_ONE, CANDIDATE_ONE);
  seedSessionCandidate(db, SESSION_ONE, CANDIDATE_FOUR);
  seedSessionCandidate(db, SESSION_ONE, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

  seedApplication(db, {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    jobId: JOB_ONE,
    candidateId: CANDIDATE_FOUR,
    matchScore: 92,
    reasoning: { matched_skills: ['Python'], gaps: [], summary: 'Strong fit' },
    status: 'shortlisted',
  });
  seedApplication(db, {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    jobId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    candidateId: CANDIDATE_ONE,
    matchScore: 70,
    status: 'new',
  });

  seedInterview(db, {
    id: INTERVIEW_ONE,
    candidateId: CANDIDATE_TWO,
    scheduledAt: '2026-11-20T10:00:00.000Z',
    feedback: { candidate_name: 'Grace Hopper', booked_at: '2026-11-15T10:00:00.000Z' },
  });
  seedInterview(db, {
    id: 'abababab-abab-4bab-8bab-abababababab',
    candidateId: CANDIDATE_THREE,
    scheduledAt: '2026-11-21T10:00:00.000Z',
  });

  seedChatMessage(db, {
    id: 'm-1',
    sessionId: SESSION_ONE,
    content: 'Hello',
    metadata: { agent_steps: [{ step: 'greet' }], suggested_followups: ['Upload a JD'] },
  });
}

describe('sessions routes', () => {
  it('lists sessions with tenant-isolated candidate counts and backfills links', async () => {
    await withPhase15(async ({ app, db }) => {
      seedWorkspace(db);

      const response = await request(app).get('/api/sessions').expect(200);
      assert.equal(response.body.length, 1);
      assert.deepEqual(response.body[0], {
        id: SESSION_ONE,
        title: 'Campaign One',
        job_id: JOB_ONE,
        created_at: response.body[0].created_at,
        updated_at: response.body[0].updated_at,
        candidate_count: 3,
      });
      assert.ok(response.body[0].created_at);

      const links = db
        .table('session_candidates')
        .select()
        .eq('session_id', SESSION_ONE)
        .execute()
        .data.map((row) => row['candidate_id']);
      assert.ok(links.includes(CANDIDATE_TWO), 'legacy metadata link was backfilled');
    });
  });

  it('returns an isolated session detail with history, shortlist and interviews', async () => {
    await withPhase15(async ({ app, db }) => {
      seedWorkspace(db);

      const response = await request(app).get(`/api/sessions/${SESSION_ONE}`).expect(200);
      assert.equal(response.body.id, SESSION_ONE);
      assert.equal(response.body.title, 'Campaign One');
      assert.equal(response.body.jd_structured.role, 'Senior Engineer');

      const ids = (response.body.resumes as Array<Record<string, unknown>>).map(
        (row) => row.candidate_id,
      );
      assert.deepEqual(ids.sort(), [CANDIDATE_ONE, CANDIDATE_TWO, CANDIDATE_FOUR].sort());

      assert.equal(response.body.conversation_history.length, 1);
      assert.deepEqual(response.body.conversation_history[0].agent_steps, [{ step: 'greet' }]);
      assert.deepEqual(response.body.conversation_history[0].suggested_followups, ['Upload a JD']);

      assert.equal(response.body.last_shortlist.length, 1);
      assert.equal(response.body.last_shortlist[0].candidate_id, CANDIDATE_FOUR);
      assert.equal(response.body.last_shortlist[0].match_score, 92);

      assert.equal(response.body.scheduled_interviews.length, 1);
      assert.equal(response.body.scheduled_interviews[0].candidate_name, 'Grace Hopper');
      assert.equal(response.body.scheduled_interviews[0].booked_at, '2026-11-15T10:00:00.000Z');
      assert.equal(
        response.body.scheduled_interviews[0].feedback,
        JSON.stringify({
          candidate_name: 'Grace Hopper',
          booked_at: '2026-11-15T10:00:00.000Z',
        }),
      );
    });
  });

  it("returns 404 for another tenant's session", async () => {
    await withPhase15(async ({ app, db }) => {
      seedWorkspace(db);
      const response = await request(app).get(`/api/sessions/${SESSION_TWO}`).expect(404);
      assert.deepEqual(response.body, { detail: 'Campaign session not found.' });
    });
  });

  it('creates a session with the greeting history', async () => {
    await withPhase15(async ({ app, db }) => {
      const response = await request(app).post('/api/sessions').expect(200);
      assert.match(response.body.id, /^[0-9a-f-]{36}$/);
      assert.equal(response.body.user_id, USER_ID);
      assert.equal(response.body.title, 'New Hiring Campaign');
      assert.equal(response.body.candidate_count, 0);
      assert.equal(response.body.conversation_history.length, 1);
      assert.match(response.body.conversation_history[0].content, /RecruitAI/);

      const session = db.table('chat_sessions').select().eq('id', response.body.id).execute()
        .data[0];
      assert.ok(session);
      assert.equal(
        db.table('chat_messages').select().eq('session_id', response.body.id).execute().data.length,
        1,
      );
    });
  });

  it('patches arbitrary payloads minus user_id', async () => {
    await withPhase15(async ({ app, db }) => {
      seedSession(db, { id: SESSION_ONE, title: 'Old Title' });

      const response = await request(app)
        .patch(`/api/sessions/${SESSION_ONE}`)
        .send({ title: 'New Title', user_id: OTHER_USER_ID, last_intent: 'rename' })
        .expect(200);
      assert.equal(response.body.title, 'New Title');
      assert.equal(response.body.last_intent, 'rename');

      const row = db.table('chat_sessions').select().eq('id', SESSION_ONE).execute().data[0];
      assert.equal(row?.user_id, USER_ID);
    });
  });

  it('returns 404 when patching a missing session', async () => {
    await withPhase15(async ({ app }) => {
      const response = await request(app)
        .patch(`/api/sessions/${SESSION_ONE}`)
        .send({ title: 'Nope' })
        .expect(404);
      assert.deepEqual(response.body, { detail: 'Session not found.' });
    });
  });

  it('deletes a session and its candidate links', async () => {
    await withPhase15(async ({ app, db }) => {
      seedSession(db, { id: SESSION_ONE });
      seedSessionCandidate(db, SESSION_ONE, CANDIDATE_ONE);

      const response = await request(app).delete(`/api/sessions/${SESSION_ONE}`).expect(200);
      assert.deepEqual(response.body, {
        message: `Session ${SESSION_ONE} deleted successfully.`,
      });
      assert.equal(db.table('chat_sessions').select().execute().data.length, 0);
      assert.equal(db.table('session_candidates').select().execute().data.length, 0);
    });
  });

  it('resets a workspace once per 30 seconds with Retry-After', async () => {
    await withPhase15(async ({ app, db }) => {
      seedWorkspace(db);

      const first = await request(app).post('/api/sessions/reset-all').expect(200);
      assert.deepEqual(first.body, {
        success: true,
        message: 'All recruitment workspace data successfully reset for fresh start.',
      });
      assert.equal(db.table('candidates').select().eq('user_id', USER_ID).execute().data.length, 0);
      assert.equal(
        db.table('chat_sessions').select().eq('user_id', USER_ID).execute().data.length,
        0,
      );
      assert.equal(
        db.table('candidates').select().eq('user_id', OTHER_USER_ID).execute().data.length,
        1,
        'another tenant is untouched',
      );

      const second = await request(app).post('/api/sessions/reset-all').expect(429);
      assert.match(
        String(second.body.detail),
        /^Reset rate limit exceeded\. You may only reset your workspace once every 30 seconds\. Retry in \d+s\.$/,
      );
      const retryAfter = Number(second.headers['retry-after']);
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 29 && retryAfter <= 30);
    });
  });
});
