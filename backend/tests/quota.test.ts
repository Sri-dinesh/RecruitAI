import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requireCandidateQuota } from '../src/services/quota.js';
import {
  DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
  InsufficientCreditsError,
  OUTREACH_QUOTA_MESSAGE,
} from '../src/types/errors.js';

describe('requireCandidateQuota', () => {
  it('returns the balance when credits remain', () => {
    assert.equal(requireCandidateQuota(1), 1);
    assert.equal(requireCandidateQuota(42), 42);
  });

  it('throws the 402 error when the balance is exhausted', () => {
    for (const balance of [0, -1]) {
      assert.throws(
        () => requireCandidateQuota(balance),
        (error: unknown) => {
          assert.ok(error instanceof InsufficientCreditsError);
          assert.equal(error.statusCode, 402);
          assert.deepEqual(error.detail, {
            error: 'INSUFFICIENT_CREDITS',
            message: DEFAULT_INSUFFICIENT_CREDITS_MESSAGE,
            upgrade_url: '/pricing',
          });
          return true;
        },
      );
    }
  });

  it('propagates a route-specific message', () => {
    assert.throws(
      () => requireCandidateQuota(0, OUTREACH_QUOTA_MESSAGE),
      (error: unknown) =>
        error instanceof InsufficientCreditsError &&
        error.detail.message === OUTREACH_QUOTA_MESSAGE,
    );
  });
});
