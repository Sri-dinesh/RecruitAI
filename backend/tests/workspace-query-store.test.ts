import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDrizzleWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../src/db/workspace-query-store.js';
import { daysAgo, OTHER_USER_ID, USER_ID, withPhase15 } from './phase15-helpers.js';

describe('WorkspaceQueryStore (SQLite)', () => {
  it('exposes a safe backend label and a readiness ping', async () => {
    await withPhase15(async ({ store }) => {
      assert.equal(store.kind, 'sqlite_fallback');
      await store.ping();

      // The Postgres implementation reports its own label without connecting.
      const drizzle = createDrizzleWorkspaceQueryStore(
        {} as unknown as Parameters<typeof createDrizzleWorkspaceQueryStore>[0],
      );
      assert.equal(drizzle.kind, 'postgresql');
      assert.equal(typeof drizzle.ping, 'function');
      const contract: WorkspaceQueryStore = drizzle;
      assert.equal(contract.kind, 'postgresql');
    });
  });

  it('manages sessions with tenant scoping', async () => {
    await withPhase15(async ({ store }) => {
      await store.insertSession({ id: 's-1', userId: USER_ID, title: 'Campaign A' });

      const created = await store.getSession(USER_ID, 's-1');
      assert.equal(created?.title, 'Campaign A');
      assert.equal(created?.user_id, USER_ID);
      assert.equal(await store.getSession(OTHER_USER_ID, 's-1'), undefined);

      const updated = await store.updateSession(USER_ID, 's-1', { title: 'Renamed' });
      assert.equal(updated?.title, 'Renamed');
      assert.equal(await store.updateSession(OTHER_USER_ID, 's-1', { title: 'Hijack' }), undefined);

      assert.equal((await store.listSessions(USER_ID)).length, 1);
      assert.equal((await store.listSessions(OTHER_USER_ID)).length, 0);

      await store.deleteSession(USER_ID, 's-1');
      assert.equal(await store.getSession(USER_ID, 's-1'), undefined);
    });
  });

  it('lists chat messages in both directions, with limits', async () => {
    await withPhase15(async ({ store, db }) => {
      db.table('chat_messages')
        .insert([
          {
            id: 'm-1',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'assistant',
            content: 'first',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'm-2',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'user',
            content: 'second',
            created_at: '2026-01-02T00:00:00.000Z',
          },
          {
            id: 'm-3',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'assistant',
            content: 'third',
            created_at: '2026-01-03T00:00:00.000Z',
          },
        ])
        .execute();

      assert.deepEqual(
        (await store.listChatMessages(USER_ID, 's-1')).map((row) => row['content']),
        ['first', 'second', 'third'],
      );
      assert.deepEqual(
        (await store.listChatMessages(USER_ID, 's-1', { descending: true, limit: 2 })).map(
          (row) => row['content'],
        ),
        ['third', 'second'],
      );
      assert.deepEqual(await store.listChatMessages(OTHER_USER_ID, 's-1'), []);
    });
  });

  it('deletes chat messages before a cutoff without touching other tenants', async () => {
    await withPhase15(async ({ store, db }) => {
      db.table('chat_messages')
        .insert([
          {
            id: 'old',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'user',
            content: 'old',
            created_at: daysAgo(400),
          },
          {
            id: 'new',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'user',
            content: 'new',
            created_at: daysAgo(1),
          },
          {
            id: 'other-old',
            session_id: 's-2',
            user_id: OTHER_USER_ID,
            role: 'user',
            content: 'other',
            created_at: daysAgo(400),
          },
        ])
        .execute();

      const deleted = await store.deleteChatMessagesBefore(USER_ID, daysAgo(365));
      assert.equal(deleted, 1);
      const remaining = db.table('chat_messages').select().execute().data;
      assert.deepEqual(remaining.map((row) => row['id']).sort(), ['new', 'other-old']);
    });
  });

  it('counts retention candidates and chat messages', async () => {
    await withPhase15(async ({ store, db }) => {
      db.table('candidates')
        .insert([
          {
            id: 'old-own',
            user_id: USER_ID,
            full_name: 'Old Own',
            metadata: '{}',
            created_at: daysAgo(200),
          },
          {
            id: 'new-own',
            user_id: USER_ID,
            full_name: 'New Own',
            metadata: '{}',
            created_at: daysAgo(1),
          },
          {
            id: 'old-other',
            user_id: OTHER_USER_ID,
            full_name: 'Old Other',
            metadata: '{}',
            created_at: daysAgo(200),
          },
        ])
        .execute();
      db.table('chat_messages')
        .insert([
          {
            id: 'chat-old',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'user',
            content: 'old',
            created_at: daysAgo(400),
          },
          {
            id: 'chat-new',
            session_id: 's-1',
            user_id: USER_ID,
            role: 'user',
            content: 'new',
            created_at: daysAgo(1),
          },
        ])
        .execute();

      assert.equal(await store.countCandidatesBefore(USER_ID, daysAgo(90)), 1);
      assert.equal(await store.countCandidatesBefore(undefined, daysAgo(90)), 2);
      assert.equal(await store.countCandidatesBefore(USER_ID, daysAgo(300)), 0);
      assert.equal(await store.countChatMessagesBefore(USER_ID, daysAgo(365)), 1);
      assert.equal(await store.countChatMessagesBefore(undefined, daysAgo(365)), 1);
      assert.equal(await store.countChatMessagesBefore(OTHER_USER_ID, daysAgo(365)), 0);
      const userIds = await store.listUserIds();
      assert.deepEqual(userIds.slice().sort(), [USER_ID, 'local_dev_user_123'].sort());
    });
  });

  it('updates candidate metadata and clears raw resume text by cutoff', async () => {
    await withPhase15(async ({ store, db }) => {
      await store.insertCandidate({
        id: 'c-1',
        userId: USER_ID,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        rawResumeText: 'raw',
        metadata: { skills: ['Python'] },
      });

      const updated = await store.updateCandidateMetadata(USER_ID, 'c-1', {
        skills: ['Python', 'TypeScript'],
        status: 'shortlisted',
      });
      assert.deepEqual(updated?.metadata, {
        skills: ['Python', 'TypeScript'],
        status: 'shortlisted',
      });
      assert.equal(await store.updateCandidateMetadata(OTHER_USER_ID, 'c-1', {}), undefined);

      db.table('candidates')
        .update({ created_at: daysAgo(200) })
        .eq('id', 'c-1')
        .execute();
      await store.insertCandidate({
        id: 'c-2',
        userId: USER_ID,
        fullName: 'Grace Hopper',
        email: null,
        rawResumeText: 'fresh',
        metadata: {},
      });

      const cleared = await store.clearRawResumeTextBefore(USER_ID, daysAgo(90));
      assert.equal(cleared, 1);
      assert.equal((await store.getCandidate(USER_ID, 'c-1'))?.raw_resume_text, null);
      assert.equal((await store.getCandidate(USER_ID, 'c-2'))?.raw_resume_text, 'fresh');
      assert.equal((await store.listCandidatesCreatedSince(USER_ID, daysAgo(90))).length, 1);

      await store.deleteCandidate(USER_ID, 'c-1');
      assert.equal(await store.getCandidate(USER_ID, 'c-1'), undefined);
      assert.ok(await store.getCandidate(USER_ID, 'c-2'));
    });
  });

  it('reads job structured data without exposing other tenants', async () => {
    await withPhase15(async ({ store, db }) => {
      db.table('jobs')
        .insert({
          id: 'j-1',
          user_id: USER_ID,
          title: 'Engineer',
          jd_structured: JSON.stringify({ role: 'Engineer' }),
          status: 'active',
        })
        .execute();

      assert.deepEqual(await store.getJobStructured(USER_ID, 'j-1'), {
        jd_structured: { role: 'Engineer' },
      });
      assert.equal(await store.getJobStructured(OTHER_USER_ID, 'j-1'), undefined);
      assert.equal((await store.listJobs(USER_ID)).length, 1);
    });
  });

  it('links candidates to sessions idempotently', async () => {
    await withPhase15(async ({ store }) => {
      await store.upsertSessionCandidate('s-1', 'c-1');
      await store.upsertSessionCandidate('s-1', 'c-1');
      await store.upsertSessionCandidate('s-2', 'c-2');

      assert.deepEqual(await store.listSessionCandidates('s-1'), ['c-1']);
      assert.equal((await store.listSessionCandidatesForSessions(['s-1', 's-2'])).length, 2);
      assert.deepEqual(await store.listSessionCandidatesForSessions([]), []);

      await store.deleteSessionCandidatesForCandidate('c-1');
      assert.deepEqual(await store.listSessionCandidates('s-1'), []);
    });
  });

  it('resets a workspace without deleting another tenant', async () => {
    await withPhase15(async ({ store, db }) => {
      for (const userId of [USER_ID, OTHER_USER_ID]) {
        db.table('chat_sessions')
          .insert({ id: `s-${userId}`, user_id: userId, title: 'Campaign' })
          .execute();
        db.table('candidates')
          .insert({
            id: `c-${userId}`,
            user_id: userId,
            full_name: 'Candidate',
            metadata: '{}',
          })
          .execute();
        db.table('applications')
          .insert({
            id: `a-${userId}`,
            job_id: 'j-1',
            candidate_id: `c-${userId}`,
            user_id: userId,
            status: 'new',
          })
          .execute();
        db.table('interviews')
          .insert({ id: `i-${userId}`, candidate_id: `c-${userId}`, user_id: userId })
          .execute();
        db.table('resume_chunks')
          .insert({
            id: `rc-${userId}`,
            candidate_id: `c-${userId}`,
            user_id: userId,
            chunk_text: 'chunk',
          })
          .execute();
        db.table('chat_messages')
          .insert({
            id: `m-${userId}`,
            session_id: `s-${userId}`,
            user_id: userId,
            role: 'user',
            content: 'hi',
          })
          .execute();
        db.table('jobs')
          .insert({ id: `j-${userId}`, user_id: userId, title: 'Role' })
          .execute();
      }
      db.table('session_candidates')
        .insert([
          { session_id: `s-${USER_ID}`, candidate_id: `c-${USER_ID}` },
          { session_id: `s-${OTHER_USER_ID}`, candidate_id: `c-${OTHER_USER_ID}` },
        ])
        .execute();

      await store.resetWorkspace(USER_ID);

      for (const table of [
        'chat_messages',
        'interviews',
        'applications',
        'resume_chunks',
        'candidates',
        'chat_sessions',
        'jobs',
      ]) {
        const remaining = db.table(table).select().execute().data;
        assert.deepEqual(
          remaining.map((row) => row['user_id']),
          [OTHER_USER_ID],
          `${table} should keep only the other tenant`,
        );
      }
      const links = db.table('session_candidates').select().execute().data;
      assert.deepEqual(
        links.map((row) => row['session_id']),
        [`s-${OTHER_USER_ID}`],
      );
    });
  });

  it('purges an account cascade without deleting another tenant', async () => {
    await withPhase15(async ({ store, db }) => {
      for (const userId of [USER_ID, OTHER_USER_ID]) {
        db.table('candidates')
          .insert({ id: `c-${userId}`, user_id: userId, full_name: 'C', metadata: '{}' })
          .execute();
        db.table('jobs')
          .insert({ id: `j-${userId}`, user_id: userId, title: 'Role' })
          .execute();
      }
      await store.purgeUserAccount(USER_ID);

      assert.equal(await store.getUser(USER_ID), undefined);
      assert.equal(
        db
          .table('candidates')
          .select()
          .execute()
          .data.map((row) => row['user_id'])
          .join(','),
        OTHER_USER_ID,
      );
      assert.equal(
        db
          .table('jobs')
          .select()
          .execute()
          .data.map((row) => row['user_id'])
          .join(','),
        OTHER_USER_ID,
      );
    });
  });

  it('reads and updates users', async () => {
    await withPhase15(async ({ store }) => {
      const user = await store.getUser(USER_ID);
      assert.equal(user?.email, `${USER_ID}@recruitai.local`);
      assert.deepEqual(user?.preferences, {
        email_alerts: true,
        theme: 'dark',
        blind_mode_default: false,
        auto_rubric: true,
      });

      const updated = await store.updateUser(USER_ID, {
        full_name: 'Dana Scully',
        preferences: { theme: 'light' },
      });
      assert.equal(updated?.full_name, 'Dana Scully');
      assert.deepEqual(updated?.preferences, { theme: 'light' });

      await store.deleteUser(USER_ID);
      assert.equal(await store.getUser(USER_ID), undefined);
    });
  });
});
