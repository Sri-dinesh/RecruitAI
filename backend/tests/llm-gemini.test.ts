import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  invokeGemini,
  type GeminiRequest,
} from '../src/llm/gemini.js';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recordingFetch(response: Response, calls: FetchCall[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  }) as typeof fetch;
}

describe('invokeGemini', () => {
  it('posts the translated generateContent body and returns LangChain-shaped output', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = recordingFetch(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 4,
          totalTokenCount: 14,
        },
      }),
      calls,
    );

    const request: GeminiRequest = {
      model: 'gemini-2.5-flash-lite',
      prompt: 'Say hello',
      apiKey: 'test-key',
      systemInstruction: 'Be terse.',
      jsonMode: true,
      fetchImpl,
    };
    const response = await invokeGemini(request);

    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.ok(call);
    assert.equal(
      call.url,
      `${DEFAULT_GEMINI_BASE_URL}/models/gemini-2.5-flash-lite:generateContent?key=test-key`,
    );
    assert.equal(call.init.method, 'POST');

    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Say hello' }] }]);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Be terse.' }] });
    assert.deepEqual(body.generationConfig, {
      temperature: 0,
      responseMimeType: 'application/json',
    });

    assert.equal(response.content, 'hello world');
    assert.deepEqual(response.usage_metadata, {
      input_tokens: 10,
      output_tokens: 4,
      prompt_token_count: 10,
      candidates_token_count: 4,
      total_token_count: 14,
    });
    assert.deepEqual(response.response_metadata, { model: 'gemini-2.5-flash-lite' });
  });

  it('omits the JSON mime type and system instruction when not requested', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = recordingFetch(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      calls,
    );

    const response = await invokeGemini({
      model: 'gemini-3.5-flash',
      prompt: 'plain',
      apiKey: 'key with spaces',
      fetchImpl,
      baseUrl: 'https://example.test/v1beta/',
    });

    const [call] = calls;
    assert.ok(call);
    assert.equal(
      call.url,
      'https://example.test/v1beta/models/gemini-3.5-flash:generateContent?key=key%20with%20spaces',
    );
    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    assert.deepEqual(body.generationConfig, { temperature: 0 });
    assert.equal(body.systemInstruction, undefined);
    assert.equal(response.content, 'ok');
    assert.equal(response.usage_metadata, undefined);
    assert.equal(DEFAULT_GEMINI_TIMEOUT_MS, 30_000);
  });

  it('normalises HTTP failures with the provider status and message', async () => {
    const fetchImpl = recordingFetch(
      jsonResponse({ error: { code: 429, message: 'Resource exhausted' } }, 429),
      [],
    );

    await assert.rejects(
      invokeGemini({ model: 'm', prompt: 'p', apiKey: 'k', fetchImpl }),
      /Gemini API error \(429\): Resource exhausted/,
    );
  });

  it('reports blocked prompts and empty candidate lists', async () => {
    const blocked = recordingFetch(jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }), []);
    await assert.rejects(
      invokeGemini({ model: 'm', prompt: 'p', apiKey: 'k', fetchImpl: blocked }),
      /Gemini response blocked: SAFETY/,
    );

    const empty = recordingFetch(jsonResponse({ candidates: [] }), []);
    await assert.rejects(
      invokeGemini({ model: 'm', prompt: 'p', apiKey: 'k', fetchImpl: empty }),
      /Gemini response contained no candidates\./,
    );
  });

  it('aborts after the configured timeout', async () => {
    const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })) as typeof fetch;

    await assert.rejects(
      invokeGemini({ model: 'm', prompt: 'p', apiKey: 'k', fetchImpl: hangingFetch, timeoutMs: 5 }),
      /Gemini request timed out after 5ms/,
    );
  });
});
