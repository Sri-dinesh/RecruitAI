import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import type { Database } from '../src/db/client.js';
import { clearAllChunks, insertResumeChunks, queryTopK } from '../src/db/vector.js';

const dialect = new PgDialect();

describe('pgvector integration path', () => {
  it('no-ops when there are no chunks', async () => {
    const inserted: unknown[] = [];
    const fake = {
      insert: () => ({
        values: async (rows: unknown) => {
          inserted.push(rows);
        },
      }),
    } as unknown as Database;
    assert.equal(await insertResumeChunks(fake, []), 0);
    assert.equal(inserted.length, 0);
  });

  it('inserts a batch with chunk_index defaults and plain number arrays', async () => {
    const inserted: Array<Array<Record<string, unknown>>> = [];
    const fake = {
      insert: () => ({
        values: async (rows: Array<Record<string, unknown>>) => {
          inserted.push(rows);
        },
      }),
    } as unknown as Database;

    const count = await insertResumeChunks(fake, [
      {
        candidateId: 'candidate-1',
        userId: 'user-1',
        chunkText: 'first',
        embedding: [0.1, 0.2],
      },
      {
        candidateId: 'candidate-1',
        userId: 'user-1',
        chunkText: 'second',
        chunkIndex: 4,
        embedding: [0.3, 0.4],
      },
    ]);

    assert.equal(count, 2);
    assert.deepEqual(inserted[0], [
      {
        candidateId: 'candidate-1',
        userId: 'user-1',
        chunkText: 'first',
        chunkIndex: 0,
        embedding: [0.1, 0.2],
      },
      {
        candidateId: 'candidate-1',
        userId: 'user-1',
        chunkText: 'second',
        chunkIndex: 4,
        embedding: [0.3, 0.4],
      },
    ]);
  });

  it('delegates top-k search to match_resume_chunks', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const fake = {
      execute: async (query: Parameters<Database['execute']>[0]) => {
        const { sql, params } = dialect.sqlToQuery(query as never);
        calls.push({ sql, params });
        return {
          rows: [
            {
              id: 'chunk-1',
              candidate_id: 'candidate-1',
              full_name: 'Ada',
              chunk_text: 'text',
              similarity: '0.88',
            },
          ],
        };
      },
    } as unknown as Database;

    const matches = await queryTopK(fake, {
      queryEmbedding: [1, 0],
      k: 2,
      threshold: 0.5,
      userId: 'user-1',
    });

    assert.deepEqual(matches, [
      {
        id: 'chunk-1',
        candidate_id: 'candidate-1',
        full_name: 'Ada',
        chunk_text: 'text',
        similarity: 0.88,
      },
    ]);
    assert.match(calls[0]?.sql ?? '', /public\.match_resume_chunks/);
    assert.deepEqual(calls[0]?.params, ['[1,0]', 0.5, 2, null, 'user-1']);
  });

  it('deletes all chunks and scopes the predicate to a tenant when given one', async () => {
    const predicates: unknown[] = [];
    const fake = {
      delete: () => ({
        where: async (predicate: unknown) => {
          predicates.push(predicate);
        },
      }),
    } as unknown as Database;

    await clearAllChunks(fake);
    await clearAllChunks(fake, 'user-1');

    assert.equal(predicates.length, 2);
    const globalQuery = dialect.sqlToQuery(predicates[0] as never);
    const scopedQuery = dialect.sqlToQuery(predicates[1] as never);
    assert.match(globalQuery.sql, /chunk_text/);
    assert.doesNotMatch(globalQuery.sql, /user_id/);
    assert.match(scopedQuery.sql, /user_id/);
    assert.deepEqual(scopedQuery.params, ['', 'user-1']);
  });
});
