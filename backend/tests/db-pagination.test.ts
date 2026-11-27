import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import { FallbackDatabase } from '../src/db/fallback.js';
import {
  createWorkspaceQueryStore,
  resolveListLimit,
  resolveListOffset,
} from '../src/db/workspace-query-store.js';

const db = new FallbackDatabase(':memory:');
const store = createWorkspaceQueryStore({ fallback: db });

after(() => {
  db.close();
});

const USER = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';

function seedCandidate(id: string, createdAt: string): void {
  db.table('candidates')
    .insert({
      id,
      user_id: USER,
      full_name: `Candidate ${id}`,
      email: `${id}@example.test`,
      raw_resume_text: 'resume text',
      metadata: {},
      created_at: createdAt,
    })
    .execute();
}

describe('bounded list pagination', () => {
  it('clamps requested limits to the configured cap', () => {
    const config = loadConfig({ DB_LIST_MAX_LIMIT: '250' });
    assert.equal(resolveListLimit(config), 250);
    assert.equal(resolveListLimit(config, 10), 10);
    assert.equal(resolveListLimit(config, 10_000), 250);
    assert.equal(resolveListLimit(config, 0), 250);
    assert.equal(resolveListLimit(config, Number.NaN), 250);
  });

  it('treats negative offsets as zero', () => {
    assert.equal(resolveListOffset(), 0);
    assert.equal(resolveListOffset(-5), 0);
    assert.equal(resolveListOffset(3.9), 3);
  });

  it('applies LIMIT and OFFSET to candidate lists', async () => {
    seedCandidate('00000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z');
    seedCandidate('00000000-0000-4000-8000-000000000002', '2026-01-02T00:00:00Z');
    seedCandidate('00000000-0000-4000-8000-000000000003', '2026-01-03T00:00:00Z');

    const firstPage = await store.listCandidates(USER, { limit: 2 });
    assert.equal(firstPage.length, 2);
    assert.deepEqual(
      firstPage.map((row) => row['id']),
      ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
    );

    const secondPage = await store.listCandidates(USER, { limit: 2, offset: 2 });
    assert.deepEqual(
      secondPage.map((row) => row['id']),
      ['00000000-0000-4000-8000-000000000003'],
    );
  });

  it('caps a limit larger than DB_LIST_MAX_LIMIT', async () => {
    const cappedConfig = loadConfig({ DB_LIST_MAX_LIMIT: '1' });
    const capped = createWorkspaceQueryStore({ fallback: db, config: cappedConfig });
    const rows = await capped.listCandidates(USER, { limit: 500 });
    assert.equal(rows.length, 1);
  });

  it('paginates tenants with a keyset cursor', async () => {
    for (const id of [
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000002',
      'aaaaaaaa-0000-4000-8000-000000000003',
    ]) {
      db.table('users')
        .insert({ id, email: `${id}@example.test` })
        .execute();
    }

    const first = await store.listUserIds({
      limit: 1,
      after: '00000000-0000-4000-8000-000000000000',
    });
    assert.equal(first.length, 1);

    const next = await store.listUserIds({ limit: 2, after: first[0] ?? '' });
    assert.ok(next.length > 0);
    assert.ok(
      next.every((id) => id > (first[0] ?? '')),
      'keyset page must only contain ids after the cursor',
    );
  });

  it('counts retention rows without materialising them', async () => {
    const cutoff = '2026-02-01T00:00:00Z';
    seedCandidate('00000000-0000-4000-8000-000000000010', '2025-12-01T00:00:00Z');
    seedCandidate('00000000-0000-4000-8000-000000000011', '2025-12-02T00:00:00Z');
    const before = await store.countCandidatesBefore(USER, cutoff);
    assert.ok(before >= 2);
  });

  it('clears raw resume text in bounded batches', async () => {
    const cutoff = '2025-12-02T12:00:00Z';
    const firstBatch = await store.clearRawResumeTextBefore(USER, cutoff, 1);
    assert.equal(firstBatch, 1);
    const secondBatch = await store.clearRawResumeTextBefore(USER, cutoff, 1);
    assert.equal(secondBatch, 1);
    const exhausted = await store.clearRawResumeTextBefore(USER, cutoff, 1);
    assert.equal(exhausted, 0);
  });
});
