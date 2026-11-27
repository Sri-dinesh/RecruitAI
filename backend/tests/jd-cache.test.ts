import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryTtlCache } from '../src/cache/ttl-cache.js';
import { loadConfig } from '../src/config/index.js';
import { computeJdCacheKey, IngestionService } from '../src/services/ingestion-service.js';
import { jobDescriptionSchema, type JobDescription } from '../src/schemas/jd.js';

/**
 * Phase 23 JD parsed-structure cache.
 *
 * The parser is deterministic for a given raw text + filename, so identical
 * uploads must reuse the structured result while distinct content keeps its
 * own key and TTL expiry self-heals a missed invalidation.
 */

function jd(role: string): JobDescription {
  return jobDescriptionSchema.parse({ role, required_skills: ['typescript'] });
}

describe('JD parsed-structure cache', () => {
  it('reuses the parsed structure for identical content', async () => {
    let now = 1_000;
    let loads = 0;
    const cache = new InMemoryTtlCache({ now: () => now });
    const service = new IngestionService({
      config: loadConfig({ CACHE_JD_PARSE_TTL_SECONDS: '60' }),
      jdCache: cache,
      parseJdImpl: async () => {
        loads += 1;
        return jd(`Engineer ${loads}`);
      },
    });

    const first = await service.parseJobDescription('Senior TypeScript role', 'jd.txt');
    const second = await service.parseJobDescription('Senior TypeScript role', 'jd.txt');

    assert.equal(loads, 1);
    assert.deepEqual(second, first);

    // Identical text with a different filename is a different parser input.
    await service.parseJobDescription('Senior TypeScript role', 'other.txt');
    assert.equal(loads, 2);

    // Distinct content is never served from another key.
    await service.parseJobDescription('Product designer role', 'jd.txt');
    assert.equal(loads, 3);

    // TTL expiry re-parses rather than pinning a stale structure forever.
    now += 61_000;
    await service.parseJobDescription('Senior TypeScript role', 'jd.txt');
    assert.equal(loads, 4);
  });

  it('bypasses the cache when disabled', async () => {
    let loads = 0;
    const service = new IngestionService({
      config: loadConfig({ CACHE_JD_PARSE_ENABLED: 'false' }),
      parseJdImpl: async () => {
        loads += 1;
        return jd('Engineer');
      },
    });

    await service.parseJobDescription('Same JD', 'jd.txt');
    await service.parseJobDescription('Same JD', 'jd.txt');
    assert.equal(loads, 2);
  });

  it('ignores a corrupt cached value and reparses', async () => {
    let loads = 0;
    const cache = new InMemoryTtlCache();
    const service = new IngestionService({
      config: loadConfig({}),
      jdCache: cache,
      parseJdImpl: async () => {
        loads += 1;
        return jd('Engineer');
      },
    });

    await cache.set(computeJdCacheKey('JD body', 'jd.txt'), { role: 123 }, 60);
    const parsed = await service.parseJobDescription('JD body', 'jd.txt');

    assert.equal(loads, 1);
    assert.equal(parsed.role, 'Engineer');
  });
});
