import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandQuery, rerankChunks } from '../src/rag/advanced-rag.js';

/**
 * The LLM-backed success paths run inside `screenNode` integration tests; here
 * we pin the deterministic fallbacks that keep screening alive without a key.
 */

describe('expandQuery', () => {
  it('returns the original query when the LLM is unavailable', async () => {
    const query = 'python backend engineer';
    assert.equal(await expandQuery(query), query);
  });

  it('accepts JD context without changing the fallback', async () => {
    const query = 'senior full stack';
    assert.equal(
      await expandQuery(query, {
        role: 'Senior Full Stack Engineer',
        required_skills: ['TypeScript', 'FastAPI'],
        experience_years: 5,
      }),
      query,
    );
  });
});

describe('rerankChunks', () => {
  const chunks = [
    { chunk_text: 'Built FastAPI services', id: 'a' },
    { chunk_text: 'Led a React migration', id: 'b' },
    { chunk_text: 'Managed Kubernetes clusters', id: 'c' },
    { chunk_text: 'Wrote SQL reports', id: 'd' },
  ];

  it('returns an empty list for empty input', async () => {
    assert.deepEqual(await rerankChunks('anything', []), []);
  });

  it('falls back to score 1.0, keeps retrieval order and slices to topN', async () => {
    const result = await rerankChunks('python', chunks, 3);

    assert.deepEqual(
      result.map((chunk) => chunk.id),
      ['a', 'b', 'c'],
    );
    assert.deepEqual(
      result.map((chunk) => chunk.rerank_score),
      [1, 1, 1],
    );
  });

  it('copies chunks instead of mutating the caller objects', async () => {
    const original = { chunk_text: 'Python', id: 'a' } as Record<string, unknown>;
    await rerankChunks('python', [original], 3);

    assert.deepEqual(original, { chunk_text: 'Python', id: 'a' });
  });

  it('returns every chunk when topN exceeds the input length', async () => {
    const result = await rerankChunks('python', chunks, 10);
    assert.equal(result.length, 4);
    assert.equal(result[0]?.chunk_text, 'Built FastAPI services');
  });
});
