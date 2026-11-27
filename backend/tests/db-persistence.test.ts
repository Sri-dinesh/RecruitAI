import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import type { Candidate } from '../src/schemas/candidate.js';
import type { JobDescription } from '../src/schemas/jd.js';
import {
  persistApplications,
  persistChatMessage,
  persistInterviews,
  persistJob,
  persistSessionCandidate,
  updateSessionMetadata,
} from '../src/services/persistence.js';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';

function jobDescription(overrides: Partial<JobDescription> = {}): JobDescription {
  return {
    role: 'Senior Engineer',
    required_skills: ['typescript'],
    experience_years: 5,
    raw_text: '',
    tone: 'professional',
    company_name: null,
    department: null,
    location: null,
    employment_type: null,
    salary_range: null,
    education_requirements: null,
    preferred_skills: [],
    responsibilities: [],
    qualifications: [],
    benefits: [],
    industry: null,
    summary: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    candidate_id: CANDIDATE_ID,
    name: 'Ada Lovelace',
    raw_text: null,
    match_score: 88.5,
    matched_skills: ['typescript'],
    gaps: ['kubernetes'],
    experience_years: 6,
    red_flags: null,
    email: null,
    phone: null,
    location: null,
    headline: null,
    summary: 'Strong fit',
    skills: [],
    work_experience: [],
    education: [],
    certifications: [],
    links: [],
    languages: [],
    consent_at: null,
    consent_version: '1.0',
    source: 'direct_upload',
    ...overrides,
  };
}

async function withDb<T>(
  fn: (db: FallbackDatabase, store: WorkspaceStore) => Promise<T> | T,
): Promise<T> {
  const db = new FallbackDatabase(':memory:');
  try {
    return await fn(db, createSqliteWorkspaceStore(db));
  } finally {
    db.close();
  }
}

describe('persistJob', () => {
  it('creates a job and updates it by user + title', async () => {
    await withDb(async (db, store) => {
      const jobId = await persistJob(store, 'u1', jobDescription({ raw_text: 'raw JD' }));
      assert.ok(jobId);

      const first = db.table('jobs').select().eq('id', jobId).execute().data[0];
      assert.equal(first?.title, 'Senior Engineer');
      assert.equal(first?.raw_jd, 'raw JD');
      assert.equal(first?.status, 'active');
      assert.deepEqual(first?.jd_structured, jobDescription({ raw_text: 'raw JD' }));

      const secondId = await persistJob(
        store,
        'u1',
        jobDescription({ raw_text: '' }),
        'fallback raw',
      );
      assert.equal(secondId, jobId);
      assert.equal(db.table('jobs').select().execute().data.length, 1);
      assert.equal(
        db.table('jobs').select().eq('id', jobId).execute().data[0]?.raw_jd,
        'fallback raw',
      );
    });
  });

  it('scopes the title lookup to the tenant', async () => {
    await withDb(async (db, store) => {
      const first = await persistJob(store, 'u1', jobDescription());
      const second = await persistJob(store, 'u2', jobDescription());
      assert.notEqual(first, second);
      assert.equal(db.table('jobs').select().execute().data.length, 2);
    });
  });

  it('returns null when the role is missing', async () => {
    await withDb(async (_db, store) => {
      assert.equal(await persistJob(store, 'u1', null), null);
      assert.equal(await persistJob(store, 'u1', jobDescription({ role: '' })), null);
    });
  });

  it('returns the generated id if only the insert fails, matching Python', async () => {
    mock.method(console, 'warn', () => {});
    try {
      const lookupFails = {
        findJobIdByTitle: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      assert.equal(await persistJob(lookupFails, 'u1', jobDescription()), null);

      const insertFails = {
        findJobIdByTitle: async () => undefined,
        insertJob: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      const jobId = await persistJob(insertFails, 'u1', jobDescription());
      assert.match(jobId ?? '', /^[0-9a-f-]{36}$/);
    } finally {
      mock.restoreAll();
    }
  });
});

describe('persistApplications', () => {
  it('upserts shortlisted applications and defaults null fields', async () => {
    await withDb(async (db, store) => {
      const jobId = await persistJob(store, 'u1', jobDescription());
      await persistApplications(store, 'u1', jobId, [
        candidate({ match_score: null, matched_skills: null, gaps: null, summary: null }),
      ]);

      const rows = db.table('applications').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.match_score, 0);
      assert.equal(rows[0]?.status, 'shortlisted');
      assert.deepEqual(rows[0]?.match_reasoning, {
        matched_skills: [],
        gaps: [],
        summary: null,
      });

      await persistApplications(store, 'u1', jobId, [candidate({ match_score: 95 })]);
      const updated = db.table('applications').select().execute().data;
      assert.equal(updated.length, 1);
      assert.equal(updated[0]?.match_score, 95);
    });
  });

  it('skips candidates without a real UUID and no-ops without a job', async () => {
    await withDb(async (db, store) => {
      await persistApplications(store, 'u1', 'job-1', [
        candidate({ candidate_id: '' }),
        candidate({ candidate_id: 'temp-123' }),
      ]);
      assert.equal(db.table('applications').select().execute().data.length, 0);

      await persistApplications(store, 'u1', null, [candidate()]);
      await persistApplications(store, 'u1', 'job-1', []);
      assert.equal(db.table('applications').select().execute().data.length, 0);
    });
  });
});

describe('persistInterviews', () => {
  async function seed(db: FallbackDatabase, store: WorkspaceStore): Promise<string> {
    db.table('candidates')
      .insert({ id: CANDIDATE_ID, user_id: 'u1', full_name: 'Ada Lovelace' })
      .execute();
    const jobId = await persistJob(store, 'u1', jobDescription());
    await persistApplications(store, 'u1', jobId, [candidate()]);
    return jobId ?? '';
  }

  it('resolves candidate and application, and never fabricates a slot', async () => {
    await withDb(async (db, store) => {
      const jobId = await seed(db, store);
      await persistInterviews(
        store,
        'u1',
        [{ candidate_name: 'Ada Lovelace', slot: '   ', duration_minutes: 45, mode: 'phone' }],
        jobId,
      );

      const rows = db.table('interviews').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.candidate_id, CANDIDATE_ID);
      assert.equal(
        rows[0]?.application_id,
        db.table('applications').select().execute().data[0]?.id,
      );
      assert.equal(rows[0]?.scheduled_at, null);
      assert.equal(rows[0]?.duration_minutes, 45);
      assert.equal(rows[0]?.mode, 'phone');
      assert.equal(rows[0]?.status, 'scheduled');
      assert.deepEqual(rows[0]?.feedback, { candidate_name: 'Ada Lovelace', booked_at: null });
    });
  });

  it('keeps a valid ISO slot and applies duration/mode defaults', async () => {
    await withDb(async (db, store) => {
      await seed(db, store);
      await persistInterviews(store, 'u1', [
        {
          candidate_id: CANDIDATE_ID,
          candidate_name: 'Ada Lovelace',
          slot: ' 2026-11-20T10:00:00.000Z ',
          duration: 60,
          application_id: 'app-explicit',
          booked_at: '2026-11-11T09:00:00.000Z',
        },
      ]);

      const row = db.table('interviews').select().execute().data[0];
      assert.equal(row?.scheduled_at, '2026-11-20T10:00:00.000Z');
      assert.equal(row?.duration_minutes, 60);
      assert.equal(row?.mode, 'video');
      assert.equal(row?.application_id, 'app-explicit');
      assert.deepEqual(row?.feedback, {
        candidate_name: 'Ada Lovelace',
        booked_at: '2026-11-11T09:00:00.000Z',
      });
    });
  });

  it('treats an unparseable slot as null', async () => {
    await withDb(async (db, store) => {
      await seed(db, store);
      await persistInterviews(store, 'u1', [
        { candidate_id: CANDIDATE_ID, slot: 'sometime next week' },
      ]);
      assert.equal(db.table('interviews').select().execute().data[0]?.scheduled_at, null);
    });
  });

  it('no-ops for an empty list and swallows write errors', async () => {
    await withDb(async (db, store) => {
      await persistInterviews(store, 'u1', []);
      assert.equal(db.table('interviews').select().execute().data.length, 0);
    });

    mock.method(console, 'warn', () => {});
    try {
      const store = {
        findCandidateIdByName: async () => CANDIDATE_ID,
        insertInterview: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      await persistInterviews(store, 'u1', [{ candidate_name: 'Ada' }]);
    } finally {
      mock.restoreAll();
    }
  });
});

describe('persistChatMessage', () => {
  it('stores messages with and without metadata', async () => {
    await withDb(async (db, store) => {
      await persistChatMessage(store, 'u1', 'session-1', 'user', 'hello', { intent: 'greet' });
      await persistChatMessage(store, 'u1', 'session-1', 'assistant', 'hi');

      const rows = db.table('chat_messages').select().execute().data;
      assert.equal(rows.length, 2);
      assert.deepEqual(rows[0]?.metadata, { intent: 'greet' });
      assert.equal(rows[1]?.metadata, null);
      assert.equal(rows[1]?.role, 'assistant');
    });
  });

  it('swallows write errors', async () => {
    mock.method(console, 'warn', () => {});
    try {
      const store = {
        insertChatMessage: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      await persistChatMessage(store, 'u1', 'session-1', 'user', 'hello');
    } finally {
      mock.restoreAll();
    }
  });
});

describe('persistSessionCandidate', () => {
  it('links a session and candidate that belong to the tenant', async () => {
    await withDb(async (db, store) => {
      db.table('chat_sessions').insert({ id: 'session-1', user_id: 'u1' }).execute();
      db.table('candidates').insert({ id: 'cand-1', user_id: 'u1', full_name: 'Ada' }).execute();

      assert.equal(await persistSessionCandidate(store, 'u1', 'session-1', 'cand-1'), true);
      assert.equal(await persistSessionCandidate(store, 'u1', 'session-1', 'cand-1'), true);
      const rows = db.table('session_candidates').select().execute().data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.session_id, 'session-1');
      assert.equal(rows[0]?.candidate_id, 'cand-1');
    });
  });

  it('refuses cross-tenant links', async () => {
    await withDb(async (db, store) => {
      db.table('chat_sessions').insert({ id: 'session-1', user_id: 'u1' }).execute();
      db.table('candidates').insert({ id: 'cand-1', user_id: 'u1', full_name: 'Ada' }).execute();

      assert.equal(await persistSessionCandidate(store, 'u2', 'session-1', 'cand-1'), false);
      assert.equal(db.table('session_candidates').select().execute().data.length, 0);
    });
  });

  it('swallows store errors and returns false', async () => {
    mock.method(console, 'warn', () => {});
    try {
      const store = {
        upsertSessionCandidate: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      assert.equal(await persistSessionCandidate(store, 'u1', 'session-1', 'cand-1'), false);
    } finally {
      mock.restoreAll();
    }
  });
});

describe('updateSessionMetadata', () => {
  it('updates metadata and clears transient state on later calls', async () => {
    await withDb(async (db, store) => {
      db.table('chat_sessions').insert({ id: 'session-1', user_id: 'u1' }).execute();

      await updateSessionMetadata(store, 'u1', 'session-1', {
        title: 'Hiring Ada',
        jobId: 'job-1',
        lastIntent: 'schedule',
        pendingConfirmation: { action: 'schedule' },
      });
      const updated = db.table('chat_sessions').select().eq('id', 'session-1').execute().data[0];
      assert.equal(updated?.title, 'Hiring Ada');
      assert.equal(updated?.job_id, 'job-1');
      assert.equal(updated?.last_intent, 'schedule');
      assert.deepEqual(updated?.pending_confirmation, { action: 'schedule' });

      await updateSessionMetadata(store, 'u1', 'session-1');
      const cleared = db.table('chat_sessions').select().eq('id', 'session-1').execute().data[0];
      assert.equal(cleared?.last_intent, null);
      assert.equal(cleared?.pending_confirmation, null);
      assert.equal(cleared?.title, 'Hiring Ada');
      assert.equal(cleared?.job_id, 'job-1');
    });
  });

  it('never updates another tenant session', async () => {
    await withDb(async (db, store) => {
      db.table('chat_sessions').insert({ id: 'session-1', user_id: 'u1' }).execute();
      await updateSessionMetadata(store, 'u2', 'session-1', { title: 'Hijacked' });
      const row = db.table('chat_sessions').select().eq('id', 'session-1').execute().data[0];
      assert.equal(row?.title, 'New Hiring Campaign');
      assert.equal(row?.last_intent, null);
    });
  });

  it('swallows write errors', async () => {
    mock.method(console, 'warn', () => {});
    try {
      const store = {
        updateSession: async () => {
          throw new Error('db down');
        },
      } as unknown as WorkspaceStore;
      await updateSessionMetadata(store, 'u1', 'session-1', { title: 'x' });
    } finally {
      mock.restoreAll();
    }
  });
});
