import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig, type AppConfig } from '../src/config/index.js';
import type { WorkspaceQueryStore } from '../src/db/workspace-query-store.js';
import { createRetentionScheduler } from '../src/jobs/retention-scheduler.js';
import type { PrivacyService } from '../src/services/privacy-service.js';
import { createLogger } from '../src/telemetry/logger.js';
import {
  OTHER_USER_ID,
  SESSION_ONE,
  USER_ID,
  daysAgo,
  seedCandidate,
  seedChatMessage,
  seedSession,
  withPhase15,
} from './phase15-helpers.js';

const quietLogger = createLogger({ name: 'retention-test', sink: () => {} });

function retentionConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    USE_LOCAL_AUTH: 'true',
    LOCAL_DEV_USER_ID: USER_ID,
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
    RETENTION_JOB_ENABLED: 'true',
    ...overrides,
  });
}

const CANDIDATE_OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANDIDATE_NEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CANDIDATE_OTHER_OLD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function seedRetentionFixture(db: Parameters<Parameters<typeof withPhase15>[0]>[0]['db']): void {
  // The sweep enumerates the users table, so the second tenant needs a row.
  db.table('users')
    .insert({
      id: OTHER_USER_ID,
      email: `${OTHER_USER_ID}@recruitai.local`,
      full_name: 'Other Recruiter',
      role: 'recruiter',
      credits_balance: 10,
      preferences: '{}',
    })
    .execute();
  seedSession(db, { id: SESSION_ONE });
  seedCandidate(db, {
    id: CANDIDATE_OLD,
    createdAt: daysAgo(200),
    rawResumeText: 'old resume',
  });
  seedCandidate(db, {
    id: CANDIDATE_NEW,
    createdAt: daysAgo(1),
    rawResumeText: 'fresh resume',
  });
  seedCandidate(db, {
    id: CANDIDATE_OTHER_OLD,
    userId: OTHER_USER_ID,
    createdAt: daysAgo(200),
    rawResumeText: 'other old resume',
  });

  seedChatMessage(db, {
    id: 'old-own',
    sessionId: SESSION_ONE,
    content: 'old chat',
    createdAt: daysAgo(400),
  });
  seedChatMessage(db, {
    id: 'new-own',
    sessionId: SESSION_ONE,
    content: 'new chat',
    createdAt: daysAgo(1),
  });
  seedChatMessage(db, {
    id: 'old-other',
    sessionId: SESSION_ONE,
    userId: OTHER_USER_ID,
    content: 'other old chat',
    createdAt: daysAgo(400),
  });
}

describe('RetentionScheduler', () => {
  it('previews counts without mutating any tenant', async () => {
    await withPhase15(async ({ db, store }) => {
      seedRetentionFixture(db);
      const scheduler = createRetentionScheduler({
        config: retentionConfig(),
        queryStore: store,
        logger: quietLogger,
      });

      const result = await scheduler.runOnce({ dryRun: true });

      assert.equal(result.status, 'completed');
      assert.equal(result.dry_run, true);
      assert.equal(result.tenants_failed, 0);
      // The fallback seeds local_dev_user_123, so the sweep visits it too.
      assert.ok(result.tenants_processed >= 3);
      assert.equal(result.summary.raw_resumes_cleared, 2);
      assert.equal(result.summary.chat_messages_purged, 2);

      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_OLD).execute().data[0]?.raw_resume_text,
        'old resume',
      );
      assert.equal(db.table('chat_messages').select().eq('id', 'old-own').execute().data.length, 1);
    });
  });

  it('sweeps every tenant without crossing tenant boundaries', async () => {
    await withPhase15(async ({ db, store }) => {
      seedRetentionFixture(db);
      const scheduler = createRetentionScheduler({
        config: retentionConfig(),
        queryStore: store,
        logger: quietLogger,
      });

      const first = await scheduler.runOnce();
      assert.equal(first.status, 'completed');
      assert.equal(first.summary.raw_resumes_cleared, 2);
      assert.equal(first.summary.chat_messages_purged, 2);

      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_OLD).execute().data[0]?.raw_resume_text,
        null,
      );
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_OTHER_OLD).execute().data[0]
          ?.raw_resume_text,
        null,
      );
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_NEW).execute().data[0]?.raw_resume_text,
        'fresh resume',
      );
      assert.deepEqual(
        db
          .table('chat_messages')
          .select()
          .execute()
          .data.map((row) => row['id'])
          .sort(),
        ['new-own'],
      );

      const second = await scheduler.runOnce();
      // Phase 22 sweeps only rows whose text is still set, so an already
      // cleared tenant reports 0 instead of re-counting rows Python would
      // re-match. Chat rows are already gone.
      assert.equal(second.summary.raw_resumes_cleared, 0);
      assert.equal(second.summary.chat_messages_purged, 0);
    });
  });

  it('restricts a run to one tenant when asked', async () => {
    await withPhase15(async ({ db, store }) => {
      seedRetentionFixture(db);
      const scheduler = createRetentionScheduler({
        config: retentionConfig(),
        queryStore: store,
        logger: quietLogger,
      });

      const result = await scheduler.runOnce({ userId: USER_ID });
      assert.equal(result.status, 'completed');
      assert.equal(result.tenant_scoped, true);
      assert.equal(result.tenants_processed, 1);
      assert.equal(result.summary.raw_resumes_cleared, 1);
      assert.equal(result.summary.chat_messages_purged, 1);

      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_OLD).execute().data[0]?.raw_resume_text,
        null,
      );
      // The other tenant's expired row is untouched.
      assert.equal(
        db.table('candidates').select().eq('id', CANDIDATE_OTHER_OLD).execute().data[0]
          ?.raw_resume_text,
        'other old resume',
      );
      assert.equal(
        db.table('chat_messages').select().eq('id', 'old-other').execute().data.length,
        1,
      );
    });
  });

  it('honours custom TTLs', async () => {
    await withPhase15(async ({ db, store }) => {
      seedRetentionFixture(db);
      const scheduler = createRetentionScheduler({
        config: retentionConfig({
          RETENTION_RAW_RESUME_TTL_DAYS: '0',
          RETENTION_CHAT_TTL_DAYS: '0',
        }),
        queryStore: store,
        logger: quietLogger,
      });

      const result = await scheduler.runOnce({ userId: USER_ID });
      assert.equal(result.summary.raw_resumes_cleared, 2);
      assert.equal(result.summary.chat_messages_purged, 2);
    });
  });

  it('does not start when the scheduler is disabled', () => {
    const scheduler = createRetentionScheduler({
      config: retentionConfig({ RETENTION_JOB_ENABLED: 'false' }),
      logger: quietLogger,
    });
    try {
      assert.equal(scheduler.start(), false);
      assert.equal(scheduler.scheduled, false);
    } finally {
      scheduler.stop();
    }
  });

  it('starts and stops the recurring timer once enabled', () => {
    const scheduler = createRetentionScheduler({
      config: retentionConfig(),
      logger: quietLogger,
      intervalSeconds: 3600,
    });
    try {
      assert.equal(scheduler.start(), true);
      assert.equal(scheduler.scheduled, true);
      assert.equal(scheduler.start(), false, 'a second start is a no-op');
      assert.equal(scheduler.stop(), true);
      assert.equal(scheduler.scheduled, false);
      assert.equal(scheduler.stop(), false);
    } finally {
      scheduler.stop();
    }
  });

  it('skips a tick while a sweep is already running', async () => {
    const config = retentionConfig();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const fakeService = {
      previewRetentionPolicy: async (userId: string) => {
        calls.push(userId);
        await gate;
        return { raw_resumes_cleared: 0, chat_messages_purged: 0 };
      },
      enforceRetentionPolicy: async (userId: string) => {
        calls.push(userId);
        await gate;
        return { raw_resumes_cleared: 0, chat_messages_purged: 0 };
      },
    } as unknown as PrivacyService;
    const fakeStore = {
      listUserIds: async () => ['tenant-a', 'tenant-b'],
    } as unknown as WorkspaceQueryStore;

    const scheduler = createRetentionScheduler({
      config,
      privacyService: fakeService,
      queryStore: fakeStore,
      logger: quietLogger,
    });

    const first = scheduler.runOnce({ dryRun: true });
    const second = await scheduler.runOnce({ dryRun: true });
    assert.equal(second.status, 'skipped');
    assert.equal(second.tenants_processed, 0);

    release?.();
    const completed = await first;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.tenants_processed, 2);
    assert.deepEqual(calls, ['tenant-a', 'tenant-b']);
    assert.equal(scheduler.running, false);
  });

  it('counts per-tenant failures and keeps sweeping', async () => {
    const config = retentionConfig();
    const failingService = {
      previewRetentionPolicy: async (userId: string) => {
        if (userId === 'tenant-b') {
          throw new Error('boom');
        }
        return { raw_resumes_cleared: 1, chat_messages_purged: 0 };
      },
      enforceRetentionPolicy: async () => ({ raw_resumes_cleared: 0, chat_messages_purged: 0 }),
    } as unknown as PrivacyService;
    const fakeStore = {
      listUserIds: async () => ['tenant-a', 'tenant-b', 'tenant-c'],
    } as unknown as WorkspaceQueryStore;

    const scheduler = createRetentionScheduler({
      config,
      privacyService: failingService,
      queryStore: fakeStore,
      logger: quietLogger,
    });

    const result = await scheduler.runOnce({ dryRun: true });
    assert.equal(result.status, 'completed');
    assert.equal(result.tenants_processed, 2);
    assert.equal(result.tenants_failed, 1);
    assert.equal(result.summary.raw_resumes_cleared, 2);
  });
});
