import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config/index.js';
import { chunkResume } from '../src/rag/chunking.js';
import {
  EMBEDDING_DIM,
  embedText,
  embedTexts,
  fallbackDeterministicVector,
} from '../src/rag/embeddings.js';
import { redactPiiForEmbedding } from '../src/rag/redaction.js';

function noKeyConfig() {
  return loadConfig({ GEMINI_API_KEY: '', GOOGLE_API_KEY: '' });
}

function keyConfig() {
  return loadConfig({ GEMINI_API_KEY: 'test-key', GOOGLE_API_KEY: '' });
}

describe('chunkResume', () => {
  it('keeps paragraphs together while they fit the window', () => {
    const chunks = chunkResume('alpha beta\ngamma delta', 'c1', 'Ada');
    assert.deepEqual(chunks, [
      { candidate_id: 'c1', candidate_name: 'Ada', chunk_text: 'alpha beta gamma delta' },
    ]);
  });

  it('splits on the word limit and carries the overlap into the next chunk', () => {
    const chunks = chunkResume('one two three\n\nfour five six', 'c1', 'Ada', 4, 1);
    assert.deepEqual(
      chunks.map((chunk) => chunk.chunk_text),
      ['one two three', 'three four five six'],
    );
  });

  it('force-splits a paragraph larger than the window', () => {
    const chunks = chunkResume('a b c d e f g h i', 'c1', 'Ada', 4, 1);
    assert.deepEqual(
      chunks.map((chunk) => chunk.chunk_text),
      ['a b c d', 'd e f g', 'g h i'],
    );
  });

  it('returns no chunks for empty text', () => {
    assert.deepEqual(chunkResume('', 'c1', 'Ada'), []);
  });
});

describe('redactPiiForEmbedding', () => {
  it('removes emails, phones, URLs, addresses and the candidate name', () => {
    const text =
      'Ada Lovelace, ada@example.com, +1 415 555 2671, https://example.com/profile, ' +
      '123 Main Street, 94105. <candidate_resume>';
    const sanitized = redactPiiForEmbedding(text, 'Ada Lovelace');

    assert.doesNotMatch(sanitized, /ada@example\.com/);
    assert.doesNotMatch(sanitized, /555/);
    assert.doesNotMatch(sanitized, /https:\/\/example\.com/);
    assert.doesNotMatch(sanitized, /Main Street/);
    assert.doesNotMatch(sanitized, /Ada Lovelace/);
    assert.doesNotMatch(sanitized, /<candidate_resume/);
    assert.match(sanitized, /\[REDACTED_EMAIL\]/);
    assert.match(sanitized, /\[REDACTED_PHONE\]/);
    assert.match(sanitized, /\[REDACTED_URL\]/);
    assert.match(sanitized, /\[REDACTED_LOCATION\]/);
    assert.match(sanitized, /\[CANDIDATE_ANONYMOUS\]/);
    assert.match(sanitized, /&lt;candidate_resume/);
  });

  it('keeps four-digit years and short digit groups', () => {
    const sanitized = redactPiiForEmbedding('Graduated in 2024 with 12 projects.');
    assert.match(sanitized, /2024/);
    assert.match(sanitized, /12 projects/);
  });

  it('returns an empty string for empty input', () => {
    assert.equal(redactPiiForEmbedding(''), '');
  });
});

describe('embeddings', () => {
  it('returns the zero vector for blank text', async () => {
    const zero = await embedText('   ', { config: noKeyConfig() });
    assert.equal(zero.length, EMBEDDING_DIM);
    assert.ok(zero.every((value) => value === 0));
  });

  it('falls back to a reproducible normalized vector when no key is set', async () => {
    const first = await embedText('Ada Lovelace Python', { config: noKeyConfig() });
    const second = await embedText('Ada Lovelace Python', { config: noKeyConfig() });

    assert.equal(first.length, EMBEDDING_DIM);
    assert.deepEqual(first, second);
    assert.deepEqual(first, fallbackDeterministicVector('Ada Lovelace Python'));
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-5);
  });

  it('calls Gemini with redacted text, 384 dimensions and the API key', async () => {
    let url = '';
    let body: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), {
        status: 200,
      });
    };

    const values = await embedText('Ada ada@example.com Python', {
      config: keyConfig(),
      fetchImpl,
      baseUrl: 'https://gemini.test/v1beta',
    });

    assert.deepEqual(values, [0.1, 0.2, 0.3]);
    assert.match(url, /gemini-embedding-2:embedContent\?key=test-key$/);
    assert.equal(body.outputDimensionality, EMBEDDING_DIM);
    const content = body.content as { parts: Array<{ text: string }> };
    assert.equal(content.parts[0]?.text, 'Ada [REDACTED_EMAIL] Python');
    assert.equal(body.model, 'models/gemini-embedding-2');
  });

  it('falls back to the deterministic vector when Gemini fails', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 500, message: 'boom' } }), {
        status: 500,
      });

    const values = await embedText('Ada Lovelace', { config: keyConfig(), fetchImpl });
    assert.deepEqual(values, fallbackDeterministicVector('Ada Lovelace'));
  });

  it('embeds many texts in order and returns an empty list for no input', async () => {
    assert.deepEqual(await embedTexts([], { config: noKeyConfig() }), []);

    const texts = ['alpha', 'beta', 'gamma'];
    const values = await embedTexts(texts, { config: noKeyConfig() });
    assert.equal(values.length, 3);
    assert.deepEqual(values[0], fallbackDeterministicVector('alpha'));
    assert.deepEqual(values[2], fallbackDeterministicVector('gamma'));
  });
});
