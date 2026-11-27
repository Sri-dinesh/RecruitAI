import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import type { ChatJobManager } from '../src/jobs/index.js';
import type { CampaignService } from '../src/services/campaign-service.js';

/**
 * Phase 23 SSE lifecycle.
 *
 * A stalled job stream must emit keepalive comments (so proxies do not drop it)
 * and must eventually close instead of pinning a connection slot forever. The
 * fake manager never yields an event, so only the heartbeat/idle timer can end
 * the response.
 */

const USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';

function stalledManager(): ChatJobManager {
  return {
    createJob: async () => {
      throw new Error('not used');
    },
    startJob: async () => undefined,
    getJob: async (jobId, userId) =>
      ({ job_id: jobId, user_id: userId, status: 'running' }) as never,
    streamEvents: async function* (_jobId, _userId, signal) {
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      // No event frames: the route's idle timer must close the stream.
      yield* [] as string[];
    },
    close: async () => undefined,
  };
}

describe('SSE heartbeat and idle timeout', () => {
  it('emits keepalives and closes an idle stream', async () => {
    const config = loadConfig({
      USE_LOCAL_AUTH: 'true',
      LOCAL_DEV_USER_ID: USER_ID,
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      CHAT_SSE_HEARTBEAT_SECONDS: '1',
      CHAT_SSE_IDLE_TIMEOUT_SECONDS: '2',
    });
    const app = createApp({
      config,
      campaignService: {} as CampaignService,
      chatJobManager: stalledManager(),
    });

    const startedAt = Date.now();
    const response = await request(app).get('/api/chat/jobs/stalled/stream').expect(200);
    const elapsed = Date.now() - startedAt;

    assert.match(String(response.headers['content-type']), /text\/event-stream/);
    assert.match(response.text, /: keepalive/);
    // The idle timer ends the stream instead of waiting for the client.
    assert.doesNotMatch(response.text, /event: complete/);
    assert.ok(elapsed >= 1_000, `stream closed too early (${elapsed}ms)`);
    assert.ok(elapsed < 10_000, `stream did not close after idle timeout (${elapsed}ms)`);
  });
});
