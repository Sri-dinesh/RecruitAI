import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import { persistApplications, persistInterviews } from '../src/services/persistence.js';

const db = new FallbackDatabase(':memory:');
const store = createSqliteWorkspaceStore(db, loadConfig({}));

after(() => {
  db.close();
});

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const JOB = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANDIDATE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION = '99999999-9999-4999-8999-999999999999';

function seed(): void {
  db.table('users').insert({ id: USER, email: 'batch@example.test' }).execute();
  db.table('jobs').insert({ id: JOB, user_id: USER, title: 'Engineer' }).execute();
  db.table('chat_sessions').insert({ id: SESSION, user_id: USER, title: 'Campaign' }).execute();
  db.table('candidates')
    .insert([
      {
        id: CANDIDATE_A,
        user_id: USER,
        full_name: 'Ada Lovelace',
        email: 'ada@example.test',
        metadata: {},
      },
      {
        id: CANDIDATE_B,
        user_id: USER,
        full_name: 'Grace Hopper',
        email: 'grace@example.test',
        metadata: {},
      },
    ])
    .execute();
}

describe('batched workspace writes', () => {
  it('upserts applications in one multi-row statement', async () => {
    seed();
    await store.upsertApplications([
      {
        jobId: JOB,
        candidateId: CANDIDATE_A,
        userId: USER,
        matchScore: 80,
        matchReasoning: { summary: 'first' },
        status: 'shortlisted',
      },
      {
        jobId: JOB,
        candidateId: CANDIDATE_B,
        userId: USER,
        matchScore: 60,
        matchReasoning: { summary: 'second' },
        status: 'shortlisted',
      },
    ]);
    assert.equal(db.table('applications').select().execute().data.length, 2);

    await store.upsertApplications([
      {
        jobId: JOB,
        candidateId: CANDIDATE_A,
        userId: USER,
        matchScore: 95,
        matchReasoning: { summary: 'updated' },
        status: 'offered',
      },
    ]);
    const rows = db.table('applications').select().execute().data;
    assert.equal(rows.length, 2, 'upsert must not duplicate (job_id, candidate_id)');
    const updated = rows.find((row) => row['candidate_id'] === CANDIDATE_A);
    assert.equal(updated?.['match_score'], 95);
    assert.equal(updated?.['status'], 'offered');
  });

  it('inserts interviews and chat messages as batches', async () => {
    await store.insertInterviews([
      {
        applicationId: null,
        candidateId: CANDIDATE_A,
        userId: USER,
        scheduledAt: null,
        durationMinutes: 30,
        mode: 'video',
        status: 'scheduled',
        feedback: { candidate_name: 'Ada Lovelace' },
      },
      {
        applicationId: null,
        candidateId: CANDIDATE_B,
        userId: USER,
        scheduledAt: new Date('2026-12-01T10:00:00Z'),
        durationMinutes: 45,
        mode: 'phone',
        status: 'scheduled',
        feedback: { candidate_name: 'Grace Hopper' },
      },
    ]);
    assert.equal(db.table('interviews').select().execute().data.length, 2);

    await store.insertChatMessages([
      { sessionId: SESSION, userId: USER, role: 'user', content: 'one' },
      { sessionId: SESSION, userId: USER, role: 'assistant', content: 'two' },
    ]);
    assert.equal(db.table('chat_messages').select().execute().data.length, 2);
  });

  it('resolves candidate names and applications with IN batches', async () => {
    const names = await store.findCandidateIdsByNames(USER, ['Ada Lovelace', 'Grace Hopper']);
    assert.equal(names.get('Ada Lovelace'), CANDIDATE_A);
    assert.equal(names.get('Grace Hopper'), CANDIDATE_B);

    const applications = await store.findApplicationIds(USER, [CANDIDATE_A], JOB);
    assert.ok(applications.get(CANDIDATE_A), 'application id resolves for the candidate');
  });

  it('persistApplications calls the batch upsert once', async () => {
    const calls = { batch: 0, single: 0 };
    const spy: WorkspaceStore = {
      ...store,
      async upsertApplications(records) {
        calls.batch += 1;
        return store.upsertApplications(records);
      },
      async upsertApplication(record) {
        calls.single += 1;
        return store.upsertApplication(record);
      },
    };

    await persistApplications(spy, USER, JOB, [
      {
        candidate_id: CANDIDATE_A,
        match_score: 88,
        matched_skills: ['TypeScript'],
        gaps: [],
        summary: 'strong',
      },
      {
        candidate_id: CANDIDATE_B,
        match_score: 71,
        matched_skills: [],
        gaps: ['SQL'],
        summary: 'ok',
      },
    ] as unknown as Parameters<typeof persistApplications>[3]);

    assert.equal(calls.batch, 1);
    assert.equal(calls.single, 0);
  });

  it('persistInterviews batches lookups and the insert', async () => {
    const calls = { names: 0, apps: 0, batch: 0, single: 0 };
    const spy: WorkspaceStore = {
      ...store,
      async findCandidateIdsByNames(userId, fullNames) {
        calls.names += 1;
        return store.findCandidateIdsByNames(userId, fullNames);
      },
      async findApplicationIds(userId, candidateIds, jobId) {
        calls.apps += 1;
        return store.findApplicationIds(userId, candidateIds, jobId);
      },
      async insertInterviews(records) {
        calls.batch += 1;
        return store.insertInterviews(records);
      },
      async insertInterview(record) {
        calls.single += 1;
        return store.insertInterview(record);
      },
    };

    await persistInterviews(
      spy,
      USER,
      [
        { candidate_name: 'Ada Lovelace', slot: '2026-12-05T10:00:00Z' },
        { candidate_name: 'Grace Hopper', slot: 'not-a-date' },
      ],
      JOB,
    );

    assert.equal(calls.names, 1);
    assert.equal(calls.apps, 1);
    assert.equal(calls.batch, 1);
    assert.equal(calls.single, 0);

    const rows = db.table('interviews').select().execute().data;
    assert.equal(rows.length, 4, 'two earlier + two persisted interviews');
    const nullSlots = rows.filter((row) => row['scheduled_at'] === null);
    assert.ok(nullSlots.length >= 1, 'unparseable slot stays NULL (BUG-4)');
  });
});
