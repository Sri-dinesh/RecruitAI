import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HotReadCache } from '../src/cache/hot-read-cache.js';
import { InMemoryTtlCache } from '../src/cache/ttl-cache.js';
import { loadConfig } from '../src/config/index.js';

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';

describe('hot-read cache', () => {
  it('deduplicates analytics loads per endpoint and query key', async () => {
    let now = 1_000;
    const cache = new HotReadCache({
      config: loadConfig({ CACHE_ANALYTICS_TTL_SECONDS: '30' }),
      cache: new InMemoryTtlCache({ now: () => now }),
    });
    let loads = 0;
    const loader = async (): Promise<{ count: number }> => {
      loads += 1;
      return { count: loads };
    };

    assert.deepEqual(await cache.analytics(USER, 'summary', loader), { count: 1 });
    assert.deepEqual(await cache.analytics(USER, 'summary', loader), { count: 1 });
    assert.equal(loads, 1);

    // A different query key is a different payload.
    assert.deepEqual(await cache.analytics(USER, 'top-skills:12', loader), { count: 2 });

    // TTL expiry self-heals without an explicit invalidation.
    now += 31_000;
    assert.deepEqual(await cache.analytics(USER, 'summary', loader), { count: 3 });
  });

  it('never caches when hot reads are disabled', async () => {
    const cache = new HotReadCache({
      config: loadConfig({ CACHE_HOT_READS_ENABLED: 'false' }),
      cache: new InMemoryTtlCache(),
    });
    let loads = 0;
    const loader = async (): Promise<number> => {
      loads += 1;
      return loads;
    };
    assert.equal(await cache.credits(USER, loader), 1);
    assert.equal(await cache.credits(USER, loader), 2);
    assert.equal(loads, 2);
  });

  it('caches missing balances without turning them into zero', async () => {
    const cache = new HotReadCache({
      config: loadConfig({}),
      cache: new InMemoryTtlCache(),
    });
    let loads = 0;
    const loader = async (): Promise<number | undefined> => {
      loads += 1;
      return undefined;
    };
    assert.equal(await cache.credits(USER, loader), undefined);
    assert.equal(await cache.credits(USER, loader), undefined);
    assert.equal(loads, 1);
  });
});
