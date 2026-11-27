import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import {
  FallbackDatabase,
  createFallbackDatabase,
  getSqliteConnection,
  resetFallbackDatabaseForTests,
} from '../src/db/fallback.js';
import { DatabaseUnavailableError, SQLITE_FALLBACK_PROHIBITED } from '../src/db/errors.js';

const tempDir = mkdtempSync(join(tmpdir(), 'recruitai-fallback-'));

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const PRODUCTION_ENV = {
  ENVIRONMENT: 'production',
  LLM_DATA_USE_MODE: 'zero_retention_verified',
  GEMINI_API_KEY: 'test-gemini',
  TAVILY_API_KEY: 'test-tavily',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  PORT: '8000',
};

function openFile(name: string): string {
  return join(tempDir, `${name}-${Math.random().toString(16).slice(2)}.db`);
}

describe('SQLite fallback schema', () => {
  it('creates every table used by the backend', () => {
    const path = openFile('schema');
    const db = new FallbackDatabase(path);
    db.close();

    const conn = getSqliteConnection(path);
    try {
      const rows = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const names = rows.map((row) => row.name);
      for (const table of [
        'users',
        'jobs',
        'candidates',
        'resume_chunks',
        'applications',
        'interviews',
        'chat_sessions',
        'chat_messages',
        'session_candidates',
        'subscriptions',
        'credit_transactions',
        'outreach_logs',
      ]) {
        assert.ok(names.includes(table), `missing fallback table ${table}`);
      }
    } finally {
      conn.close();
    }
  });

  it('applies the Python pragmas and seeds the local recruiter', () => {
    const path = openFile('pragmas');
    const db = new FallbackDatabase(path);
    try {
      const conn = getSqliteConnection(path);
      try {
        assert.equal(conn.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
        assert.equal(Number(conn.prepare('PRAGMA synchronous').get()?.synchronous), 1);
        assert.equal(Number(conn.prepare('PRAGMA foreign_keys').get()?.foreign_keys), 1);
        assert.equal(Number(conn.prepare('PRAGMA busy_timeout').get()?.timeout), 30_000);
      } finally {
        conn.close();
      }

      const seeded = db.table('users').select().eq('id', 'local_dev_user_123').execute().data[0];
      assert.ok(seeded);
      assert.equal(seeded.email, 'recruiter@recruitai.local');
      assert.deepEqual(seeded.preferences, {
        email_alerts: true,
        theme: 'system',
        blind_mode_default: false,
        auto_rubric: true,
      });
      assert.equal(seeded.credits_balance, 10);
    } finally {
      db.close();
    }
  });

  it('initialises a file-backed database only once', () => {
    const path = openFile('shared');
    const first = new FallbackDatabase(path);
    first.table('jobs').insert({ id: 'job-shared', user_id: 'u1', title: 'Shared' }).execute();
    first.close();

    const second = new FallbackDatabase(path);
    try {
      const rows = second.table('jobs').select().eq('id', 'job-shared').execute().data;
      assert.equal(rows.length, 1);
    } finally {
      second.close();
    }
  });

  it('is blocked in production with the Python 503 message', () => {
    const config = loadConfig(PRODUCTION_ENV);
    assert.throws(
      () => new FallbackDatabase(':memory:', config),
      (error: unknown) =>
        error instanceof DatabaseUnavailableError &&
        error.statusCode === 503 &&
        error.detail === SQLITE_FALLBACK_PROHIBITED,
    );
  });

  it('exposes a creatable handle without touching the singleton', () => {
    resetFallbackDatabaseForTests();
    const db = createFallbackDatabase(':memory:');
    try {
      assert.equal(db.dbPath, ':memory:');
    } finally {
      db.close();
    }
  });
});

describe('SQLite fallback table operations', () => {
  it('round-trips JSON columns and applies tenant filters', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('jobs')
        .insert({
          id: 'job-1',
          user_id: 'user-a',
          title: 'Engineer',
          jd_structured: { role: 'Engineer', required_skills: ['typescript'] },
        })
        .execute();
      db.table('jobs').insert({ id: 'job-2', user_id: 'user-b', title: 'Designer' }).execute();

      const rows = db
        .table('jobs')
        .select('id, title, jd_structured')
        .eq('user_id', 'user-a')
        .execute().data;
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0]?.jd_structured, {
        role: 'Engineer',
        required_skills: ['typescript'],
      });

      const updated = db
        .table('jobs')
        .update({ title: 'Staff Engineer' })
        .eq('id', 'job-1')
        .eq('user_id', 'user-a')
        .execute().data;
      assert.equal(updated[0]?.title, 'Staff Engineer');

      const crossTenantUpdate = db
        .table('jobs')
        .update({ title: 'Hijacked' })
        .eq('id', 'job-1')
        .eq('user_id', 'user-b')
        .execute().data;
      assert.equal(crossTenantUpdate.length, 0);
      assert.equal(
        db.table('jobs').select('title').eq('id', 'job-1').execute().data[0]?.title,
        'Staff Engineer',
      );
    } finally {
      db.close();
    }
  });

  it('supports embedded candidate relations and ordering/limits', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('candidates')
        .insert({ id: 'cand-1', user_id: 'u1', full_name: 'Ada', metadata: { skills: ['ts'] } })
        .execute();
      db.table('resume_chunks')
        .insert({ id: 'chunk-1', candidate_id: 'cand-1', user_id: 'u1', chunk_text: 'one' })
        .execute();
      db.table('resume_chunks')
        .insert({ id: 'chunk-2', candidate_id: 'cand-1', user_id: 'u1', chunk_text: 'two' })
        .execute();

      const rows = db
        .table('resume_chunks')
        .select('id, candidates(full_name, metadata)')
        .eq('candidate_id', 'cand-1')
        .order('id', true)
        .limit(1)
        .execute().data;
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0]?.candidates, {
        full_name: 'Ada',
        metadata: { skills: ['ts'] },
      });
    } finally {
      db.close();
    }
  });

  it('keeps scheduled_at nullable (BUG-4)', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('interviews')
        .insert({
          id: 'interview-1',
          candidate_id: 'cand-1',
          user_id: 'u1',
          scheduled_at: null,
        })
        .execute();
      const row = db.table('interviews').select().eq('id', 'interview-1').execute().data[0];
      assert.equal(row?.scheduled_at, null);
      assert.equal(row?.duration_minutes, 30);
      assert.equal(row?.status, 'scheduled');
    } finally {
      db.close();
    }
  });

  it('prioritises primary-id upserts over secondary keys', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('jobs').insert({ id: 'job-1', user_id: 'u1', title: 'Engineer' }).execute();
      db.table('jobs')
        .upsert({
          id: 'job-1',
          user_id: 'u1',
          title: 'Engineer II',
          status: 'closed',
        })
        .execute();

      const jobs = db.table('jobs').select().execute().data;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.title, 'Engineer II');
      assert.equal(jobs[0]?.status, 'closed');

      // No title secondary key: a new row is inserted, exactly like Python.
      db.table('jobs').upsert({ user_id: 'u1', title: 'Engineer II' }).execute();
      assert.equal(db.table('jobs').select().execute().data.length, 2);
    } finally {
      db.close();
    }
  });

  it('upserts applications by job_id + candidate_id', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('applications')
        .upsert(
          {
            job_id: 'job-1',
            candidate_id: 'cand-1',
            user_id: 'u1',
            match_score: 40,
            match_reasoning: { gaps: ['sql'] },
            status: 'new',
          },
          'job_id,candidate_id',
        )
        .execute();
      db.table('applications')
        .upsert(
          {
            job_id: 'job-1',
            candidate_id: 'cand-1',
            user_id: 'u1',
            match_score: 91,
            match_reasoning: { gaps: [] },
            status: 'shortlisted',
          },
          'job_id,candidate_id',
        )
        .execute();

      const rows = db.table('applications').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.match_score, 91);
      assert.equal(rows[0]?.status, 'shortlisted');
      assert.deepEqual(rows[0]?.match_reasoning, { gaps: [] });
    } finally {
      db.close();
    }
  });

  it('upserts users by email and subscriptions by user_id', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('users')
        .upsert({
          email: 'recruiter@recruitai.local',
          full_name: 'Renamed Recruiter',
        })
        .execute();
      const users = db
        .table('users')
        .select()
        .eq('email', 'recruiter@recruitai.local')
        .execute().data;
      assert.equal(users.length, 1);
      assert.equal(users[0]?.id, 'local_dev_user_123');
      assert.equal(users[0]?.full_name, 'Renamed Recruiter');

      db.table('subscriptions').upsert({ user_id: 'u1', plan_id: 'starter' }).execute();
      db.table('subscriptions')
        .upsert({ user_id: 'u1', plan_id: 'pro', status: 'active' })
        .execute();
      const subscriptions = db.table('subscriptions').select().eq('user_id', 'u1').execute().data;
      assert.equal(subscriptions.length, 1);
      assert.equal(subscriptions[0]?.plan_id, 'pro');
    } finally {
      db.close();
    }
  });

  it('upserts session_candidates on the composite key', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('session_candidates').upsert({ session_id: 's1', candidate_id: 'c1' }).execute();
      db.table('session_candidates').upsert({ session_id: 's1', candidate_id: 'c1' }).execute();
      const rows = db.table('session_candidates').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.session_id, 's1');
      assert.equal(rows[0]?.candidate_id, 'c1');
    } finally {
      db.close();
    }
  });

  it('deletes only the targeted rows', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('candidates').insert({ id: 'c1', user_id: 'u1', full_name: 'Ada' }).execute();
      db.table('candidates').insert({ id: 'c2', user_id: 'u2', full_name: 'Grace' }).execute();
      db.table('candidates').delete().eq('user_id', 'u1').execute();
      const remaining = db.table('candidates').select('id').execute().data;
      assert.deepEqual(
        remaining.map((row) => row.id),
        ['c2'],
      );
    } finally {
      db.close();
    }
  });
});

describe('SQLite fallback RPCs', () => {
  function seedWorkspace(db: FallbackDatabase): void {
    for (const userId of ['u1', 'u2']) {
      db.table('jobs')
        .insert({ id: `job-${userId}`, user_id: userId, title: 'Engineer' })
        .execute();
      db.table('candidates')
        .insert({ id: `cand-${userId}`, user_id: userId, full_name: `Candidate ${userId}` })
        .execute();
      db.table('applications')
        .insert({
          id: `app-${userId}`,
          job_id: `job-${userId}`,
          candidate_id: `cand-${userId}`,
          user_id: userId,
        })
        .execute();
      db.table('interviews')
        .insert({
          id: `interview-${userId}`,
          candidate_id: `cand-${userId}`,
          user_id: userId,
          scheduled_at: null,
        })
        .execute();
      db.table('chat_sessions')
        .insert({ id: `session-${userId}`, user_id: userId })
        .execute();
      db.table('chat_messages')
        .insert({
          id: `message-${userId}`,
          session_id: `session-${userId}`,
          user_id: userId,
          role: 'user',
          content: 'hello',
        })
        .execute();
      db.table('resume_chunks')
        .insert({
          id: `chunk-${userId}`,
          candidate_id: `cand-${userId}`,
          user_id: userId,
          chunk_text: 'resume',
          embedding: [1, 0],
        })
        .execute();
      db.table('session_candidates')
        .upsert({
          session_id: `session-${userId}`,
          candidate_id: `cand-${userId}`,
        })
        .execute();
    }
  }

  it('resets one tenant and leaves the other untouched', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      seedWorkspace(db);
      const result = db.rpc('reset_user_workspace', { target_user_id: 'u1' }).execute();
      assert.deepEqual(result.data, { success: true });

      for (const table of [
        'jobs',
        'candidates',
        'applications',
        'interviews',
        'chat_sessions',
        'chat_messages',
        'resume_chunks',
        'session_candidates',
      ]) {
        const rows = db.table(table).select().execute().data;
        assert.ok(
          rows.every((row) => String(row.id ?? row.session_id ?? '').includes('u2')),
          `${table} should only contain u2 rows after reset`,
        );
      }
    } finally {
      db.close();
    }
  });

  it('returns cosine-ranked vector matches with filters', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      db.table('candidates').insert({ id: 'cand-1', user_id: 'u1', full_name: 'Ada' }).execute();
      db.table('candidates').insert({ id: 'cand-2', user_id: 'u1', full_name: 'Grace' }).execute();
      db.table('candidates').insert({ id: 'cand-3', user_id: 'u2', full_name: 'Other' }).execute();
      db.table('resume_chunks')
        .insert({
          id: 'chunk-a',
          candidate_id: 'cand-1',
          user_id: 'u1',
          chunk_text: 'typescript',
          embedding: [1, 0],
        })
        .execute();
      db.table('resume_chunks')
        .insert({
          id: 'chunk-b',
          candidate_id: 'cand-2',
          user_id: 'u1',
          chunk_text: 'python',
          embedding: [0.8, 0.2],
        })
        .execute();
      db.table('resume_chunks')
        .insert({
          id: 'chunk-c',
          candidate_id: 'cand-3',
          user_id: 'u2',
          chunk_text: 'go',
          embedding: [1, 0],
        })
        .execute();
      db.table('resume_chunks')
        .insert({
          id: 'chunk-empty',
          candidate_id: 'cand-1',
          user_id: 'u1',
          chunk_text: 'no embedding',
          embedding: null,
        })
        .execute();

      const matches = db
        .rpc('match_resume_chunks', {
          query_embedding: [1, 0],
          match_threshold: 0.5,
          match_count: 2,
          filter_user_id: 'u1',
        })
        .execute().data as Array<Record<string, unknown>>;

      assert.deepEqual(
        matches.map((match) => match.id),
        ['chunk-a', 'chunk-b'],
      );
      assert.equal(matches[0]?.candidate_name, 'Ada');
      assert.equal(matches[0]?.full_name, 'Ada');
      assert.ok(Number(matches[0]?.similarity) > 0.99);
      assert.ok(Number(matches[1]?.similarity) > 0.9);

      const filtered = db
        .rpc('match_resume_chunks', {
          query_embedding: [1, 0],
          match_threshold: 0,
          match_count: 5,
          filter_candidate_id: 'cand-2',
        })
        .execute().data as Array<Record<string, unknown>>;
      assert.deepEqual(
        filtered.map((match) => match.id),
        ['chunk-b'],
      );
    } finally {
      db.close();
    }
  });

  it('rejects unsupported RPCs instead of silently returning nothing', () => {
    const db = new FallbackDatabase(':memory:');
    try {
      assert.throws(
        () => db.rpc('get_analytics_summary', { p_user_id: 'u1' }).execute(),
        /Unsupported SQLite fallback RPC: get_analytics_summary/,
      );
    } finally {
      db.close();
    }
  });
});
