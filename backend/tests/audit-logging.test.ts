import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import request from 'supertest';

import { CANDIDATE_ONE, USER_ID, seedCandidate, withPhase15 } from './phase15-helpers.js';

afterEach(() => {
  mock.restoreAll();
});

function parse(line: string | undefined): Record<string, unknown> {
  assert.ok(line);
  return JSON.parse(line) as Record<string, unknown>;
}

describe('sensitive action audit logging', () => {
  it('audit-logs candidate erasure with request and tenant identity', async () => {
    await withPhase15(async ({ app, db }) => {
      seedCandidate(db, { id: CANDIDATE_ONE });

      const lines: string[] = [];
      mock.method(console, 'log', (...args: unknown[]) => {
        lines.push(String(args[0]));
      });

      await request(app)
        .delete(`/api/privacy/candidates/${CANDIDATE_ONE}`)
        .set('X-Request-ID', 'audit-erasure')
        .expect(200);

      const record = lines
        .map((line) => parse(line))
        .find((entry) => entry['audit_action'] === 'GDPR_ERASURE');
      assert.ok(record, 'expected a GDPR_ERASURE audit record');
      assert.equal(record['request_id'], 'audit-erasure');
      assert.equal(record['user_id'], USER_ID);
      assert.equal(record['tenant_id'], USER_ID);
      assert.equal(record['candidate_id'], CANDIDATE_ONE);
      assert.equal(record['status'], 'purged');
    });
  });

  it('audit-logs account erasure', async () => {
    await withPhase15(async ({ app }) => {
      const lines: string[] = [];
      mock.method(console, 'log', (...args: unknown[]) => {
        lines.push(String(args[0]));
      });

      await request(app).delete('/api/privacy/user/account').expect(200);

      const record = lines
        .map((line) => parse(line))
        .find((entry) => entry['audit_action'] === 'GDPR_ACCOUNT_ERASURE');
      assert.ok(record, 'expected a GDPR_ACCOUNT_ERASURE audit record');
      assert.equal(record['user_id'], USER_ID);
      assert.ok(String(record['request_id']).length > 0);
    });
  });

  it('audit-logs workspace resets', async () => {
    await withPhase15(async ({ app }) => {
      const lines: string[] = [];
      mock.method(console, 'log', (...args: unknown[]) => {
        lines.push(String(args[0]));
      });

      await request(app).post('/api/sessions/reset-all').expect(200);

      const record = lines
        .map((line) => parse(line))
        .find((entry) => entry['audit_action'] === 'WORKSPACE_RESET');
      assert.ok(record, 'expected a WORKSPACE_RESET audit record');
      assert.equal(record['user_id'], USER_ID);
      assert.equal(record['action'], 'reset_all_data');
    });
  });
});
