import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { loadConfig } from '../src/config/index.js';
import { createDatabase } from '../src/db/client.js';

/**
 * Opt-in proof for the Phase 22 pool-saturation budget.
 *
 * The unit tests assert the pool *options*; this test exercises a real
 * PostgreSQL server and verifies the two properties the plan asks for:
 * connections stay capped at `PG_POOL_MAX`, and requests that queue behind a
 * saturated pool still finish instead of stalling.
 *
 *   DATABASE_INTEGRATION_URL=postgres://postgres@127.0.0.1:55432/recruitai_test \
 *     npm run test:integration:postgres
 *
 * It needs no tables: the load is `pg_sleep` plus `pg_stat_activity`.
 */
const DATABASE_URL = process.env.DATABASE_INTEGRATION_URL ?? '';
const skip = DATABASE_URL ? false : 'set DATABASE_INTEGRATION_URL to a disposable Postgres';
const POOL_MAX = 2;
const CONCURRENCY = 40;
const SLEEP_SECONDS = 0.2;

describe('Postgres pool saturation', { skip }, () => {
  it('caps connections and drains queued queries instead of stalling', async () => {
    const config = loadConfig({
      DATABASE_URL,
      PG_POOL_MAX: String(POOL_MAX),
      PG_READ_POOL_MAX: String(POOL_MAX),
      // Generous enough that a correct pool always queues-and-serves rather
      // than timing out while the sleepers hold both slots.
      PG_CONNECTION_TIMEOUT_MS: '15000',
      PG_IDLE_TIMEOUT_MS: '1000',
    });
    const handle = createDatabase(config, 'primary');

    const observed = { maxTotal: 0, maxWaiting: 0 };
    const sampler = setInterval(() => {
      observed.maxTotal = Math.max(observed.maxTotal, handle.pool.totalCount);
      observed.maxWaiting = Math.max(observed.maxWaiting, handle.pool.waitingCount);
    }, 5);

    try {
      assert.equal(handle.pool.options.max, POOL_MAX);

      const startedAt = Date.now();
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, index) =>
          handle.db.execute(sql`select pg_sleep(${SLEEP_SECONDS}), ${index} as seq`),
        ),
      );
      const elapsedMs = Date.now() - startedAt;

      assert.equal(results.length, CONCURRENCY);
      assert.ok(
        observed.maxTotal <= POOL_MAX,
        `pool opened ${observed.maxTotal} connections with PG_POOL_MAX=${POOL_MAX}`,
      );
      assert.ok(
        observed.maxWaiting > 0,
        'expected callers to queue at peak saturation; the pool never reached its cap',
      );
      // 40 x 200ms over 2 slots is ~4s; a stall would blow far past this.
      assert.ok(elapsedMs < 12_000, `saturated pool took ${elapsedMs}ms to drain`);

      const counted = await handle.db.execute<{ count: number }>(
        sql`select count(*)::int as count
            from pg_stat_activity
            where datname = current_database()`,
      );
      const count = counted.rows[0]?.count ?? 0;
      assert.ok(
        Number(count) <= POOL_MAX,
        `Postgres saw ${count} app connections with PG_POOL_MAX=${POOL_MAX}`,
      );

      const stats = {
        totalCount: handle.pool.totalCount,
        idleCount: handle.pool.idleCount,
        waitingCount: handle.pool.waitingCount,
      };
      assert.ok(stats.totalCount <= POOL_MAX, JSON.stringify(stats));
      assert.equal(stats.waitingCount, 0, JSON.stringify(stats));
    } finally {
      clearInterval(sampler);
      await handle.pool.end();
    }
  });
});
