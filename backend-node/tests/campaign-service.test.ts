import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import { createSqliteWorkspaceStore, type WorkspaceStore } from '../src/db/workspace-store.js';
import { CampaignService } from '../src/services/campaign-service.js';

const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';
const OTHER_USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '44444444-4444-4444-8444-444444444444';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  storeTransform?: (store: WorkspaceStore) => WorkspaceStore,
): Promise<T> {
  const cfg = config();
  const db = new FallbackDatabase(':memory:', cfg);
  try {
    const base = createSqliteWorkspaceStore(db);
    const store = storeTransform ? storeTransform(base) : base;
    const service = new CampaignService({ config: cfg, store });
    return await fn({ db, store, service });
  } finally {
    db.close();
  }
}

function sessionRow(db: FallbackDatabase, id: string): Record<string, unknown> | undefined {
  return db.table('chat_sessions').select().eq('id', id).execute().data[0];
}

function candidateMetadata(index: number): Record<string, unknown> {
  return {
    skills: [`Skill${index}`],
    work_experience: [],
    education: [],
    experience_years: index,
    location: `City ${index}`,
    match_score: index,
    matched_skills: [`Skill${index}`],
    gaps: [],
    red_flags: [],
  };
}

describe('CampaignService.ensureSessionExists', () => {
  it('creates a session with a generated UUID and the default title', async () => {
    await withService(async ({ db, service }) => {
      const sessionId = await service.ensureSessionExists(USER_ID, null);

      assert.match(sessionId, UUID_RE);
      const row = sessionRow(db, sessionId);
      assert.equal(row?.user_id, USER_ID);
      assert.equal(row?.title, 'New Hiring Campaign');
      assert.equal(db.table('chat_sessions').select().execute().data.length, 1);
    });
  });

  it('reuses an existing session without inserting a duplicate', async () => {
    await withService(async ({ db, store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Existing Campaign' });

      const sessionId = await service.ensureSessionExists(USER_ID, SESSION);

      assert.equal(sessionId, SESSION);
      assert.equal(db.table('chat_sessions').select().execute().data.length, 1);
      assert.equal(sessionRow(db, SESSION)?.title, 'Existing Campaign');
    });
  });

  it('creates the row when the supplied id is unknown', async () => {
    await withService(async ({ db, service }) => {
      const sessionId = await service.ensureSessionExists(USER_ID, SESSION);

      assert.equal(sessionId, SESSION);
      assert.equal(sessionRow(db, SESSION)?.title, 'New Hiring Campaign');
    });
  });

  it('scopes lookup by tenant and keeps the id when the insert conflicts', async () => {
    await withService(async ({ store, service }) => {
      // Same session id belongs to another tenant; the tenant-scoped lookup
      // misses it and the insert is rejected, but the id is still returned.
      await store
        .insertSession({ id: SESSION, userId: OTHER_USER, title: 'Other Campaign' })
        .catch(() => undefined);

      const sessionId = await service.ensureSessionExists(USER_ID, SESSION);
      assert.equal(sessionId, SESSION);
    });
  });

  it('logs and returns the id when the store fails', async () => {
    await withService(
      async ({ service }) => {
        const sessionId = await service.ensureSessionExists(USER_ID, SESSION);
        assert.equal(sessionId, SESSION);
      },
      (store) => ({
        ...store,
        sessionExists: async () => {
          throw new Error('database down');
        },
      }),
    );
  });
});

describe('CampaignService.hydrateChatContext', () => {
  it('hydrates the JD from the session job when the payload omits it', async () => {
    await withService(async ({ store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });
      await store.insertJob({
        id: JOB_ID,
        userId: USER_ID,
        title: 'Senior Engineer',
        rawJd: 'raw text',
        jdStructured: { role: 'Senior Engineer', required_skills: ['Python'] },
        status: 'active',
      });
      await store.bindJobToSession(USER_ID, SESSION, JOB_ID, 'Hiring: Senior Engineer');

      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: null,
        resumes: [],
        historyItems: [],
      });

      assert.deepEqual(context.jd, { role: 'Senior Engineer', required_skills: ['Python'] });
    });
  });

  it('treats an empty supplied JD as missing, matching Python truthiness', async () => {
    await withService(async ({ store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });
      await store.insertJob({
        id: JOB_ID,
        userId: USER_ID,
        title: 'Senior Engineer',
        rawJd: '',
        jdStructured: { role: 'Senior Engineer' },
        status: 'active',
      });
      await store.bindJobToSession(USER_ID, SESSION, JOB_ID, 'Hiring: Senior Engineer');

      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: {},
        resumes: [],
        historyItems: [],
      });

      assert.deepEqual(context.jd, { role: 'Senior Engineer' });
    });
  });

  it('prefers a supplied JD and skips the database lookup', async () => {
    await withService(
      async ({ service }) => {
        const supplied = { role: 'Supplied Role' };
        const context = await service.hydrateChatContext({
          userId: USER_ID,
          sessionId: SESSION,
          jd: supplied,
          resumes: [],
          historyItems: [],
        });
        assert.equal(context.jd, supplied);
      },
      (store) => ({
        ...store,
        findSessionJobId: async () => {
          throw new Error('should not be called');
        },
      }),
    );
  });

  it('returns a null JD when the session has no job', async () => {
    await withService(async ({ service }) => {
      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: null,
        resumes: [],
        historyItems: [],
      });
      assert.equal(context.jd, null);
    });
  });

  it('hydrates candidate resumes from the database, capped at 50', async () => {
    await withService(async ({ store, service }) => {
      for (let index = 0; index < 55; index += 1) {
        await store.insertCandidate({
          id: `candidate-${index}`,
          userId: USER_ID,
          fullName: `Candidate ${index}`,
          email: `c${index}@example.com`,
          phone: null,
          rawResumeText: `Resume ${index}`,
          metadata: candidateMetadata(index),
        });
      }
      // Another tenant's candidates must never leak in.
      await store.insertCandidate({
        id: 'other-candidate',
        userId: OTHER_USER,
        fullName: 'Other Tenant',
        email: 'other@example.com',
        phone: null,
        rawResumeText: 'Other',
        metadata: candidateMetadata(99),
      });

      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: null,
        resumes: [],
        historyItems: [],
      });

      assert.equal(context.resumes.length, 50);
      const first = context.resumes[0] as Record<string, unknown>;
      assert.equal(first.candidate_id, 'candidate-0');
      assert.equal(first.name, 'Candidate 0');
      assert.equal(first.email, 'c0@example.com');
      assert.equal(first.raw_text, 'Resume 0');
      assert.deepEqual(first.skills, ['Skill0']);
      assert.deepEqual(first.work_experience, []);
      assert.deepEqual(first.education, []);
      assert.equal(first.experience_years, 0);
      assert.equal(first.location, 'City 0');
      assert.equal(first.match_score, 0);
      assert.deepEqual(first.matched_skills, ['Skill0']);
      assert.deepEqual(first.gaps, []);
      assert.deepEqual(first.red_flags, []);
      assert.ok(!context.resumes.some((row) => row.candidate_id === 'other-candidate'));
    });
  });

  it('defaults missing candidate metadata fields like Python `.get`', async () => {
    await withService(async ({ store, service }) => {
      await store.insertCandidate({
        id: 'sparse-candidate',
        userId: USER_ID,
        fullName: 'Sparse Candidate',
        email: null,
        phone: null,
        rawResumeText: null,
        metadata: {},
      });

      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: null,
        resumes: [],
        historyItems: [],
      });

      assert.deepEqual(context.resumes, [
        {
          candidate_id: 'sparse-candidate',
          name: 'Sparse Candidate',
          email: null,
          phone: null,
          raw_text: null,
          skills: [],
          work_experience: [],
          education: [],
          experience_years: 0,
          location: null,
          match_score: null,
          matched_skills: [],
          gaps: [],
          red_flags: [],
        },
      ]);
    });
  });

  it('keeps supplied resumes and does not read candidates', async () => {
    await withService(
      async ({ service }) => {
        const resumes = [{ candidate_id: 'payload-1', name: 'Payload Candidate' }];
        const context = await service.hydrateChatContext({
          userId: USER_ID,
          sessionId: SESSION,
          jd: null,
          resumes,
          historyItems: [],
        });
        assert.deepEqual(context.resumes, resumes);
      },
      (store) => ({
        ...store,
        listCandidates: async () => {
          throw new Error('should not be called');
        },
      }),
    );
  });

  it('keeps supplied history and normalizes missing fields', async () => {
    await withService(
      async ({ service }) => {
        const context = await service.hydrateChatContext({
          userId: USER_ID,
          sessionId: SESSION,
          jd: null,
          resumes: [],
          historyItems: [
            { role: 'assistant', content: 'Hello' },
            { content: 'Only content' },
            { role: 'user' },
            'not-a-message',
          ],
        });

        assert.deepEqual(context.history, [
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'Only content' },
          { role: 'user', content: '' },
        ]);
      },
      (store) => ({
        ...store,
        listChatMessages: async () => {
          throw new Error('should not be called');
        },
      }),
    );
  });

  it('hydrates the last 20 messages in ascending order', async () => {
    await withService(async ({ db, store, service }) => {
      await store.insertSession({ id: SESSION, userId: USER_ID, title: 'Campaign' });
      for (let index = 0; index < 25; index += 1) {
        db.table('chat_messages')
          .insert({
            id: `message-${index}`,
            session_id: SESSION,
            user_id: USER_ID,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${index}`,
            created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
          })
          .execute();
      }
      // Another tenant's message on the same session id must not leak.
      db.table('chat_messages')
        .insert({
          id: 'other-message',
          session_id: SESSION,
          user_id: OTHER_USER,
          role: 'user',
          content: 'Other tenant',
          created_at: new Date(Date.UTC(2025, 0, 1)).toISOString(),
        })
        .execute();

      const context = await service.hydrateChatContext({
        userId: USER_ID,
        sessionId: SESSION,
        jd: null,
        resumes: [],
        historyItems: [],
      });

      assert.equal(context.history.length, 20);
      assert.equal(context.history[0]?.content, 'Message 0');
      assert.equal(context.history.at(-1)?.content, 'Message 19');
      assert.equal(context.history[0]?.role, 'user');
      assert.equal(context.history[1]?.role, 'assistant');
    });
  });

  it('swallows database errors and returns what it has', async () => {
    await withService(
      async ({ service }) => {
        const context = await service.hydrateChatContext({
          userId: USER_ID,
          sessionId: SESSION,
          jd: null,
          resumes: [],
          historyItems: [],
        });

        assert.equal(context.jd, null);
        assert.deepEqual(context.resumes, []);
        assert.deepEqual(context.history, []);
      },
      (store) => ({
        ...store,
        findSessionJobId: async () => {
          throw new Error('jobs down');
        },
        listCandidates: async () => {
          throw new Error('candidates down');
        },
        listChatMessages: async () => {
          throw new Error('messages down');
        },
      }),
    );
  });
});
