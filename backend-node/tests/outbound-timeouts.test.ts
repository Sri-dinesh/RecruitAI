import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryTtlCache } from '../src/cache/ttl-cache.js';
import { loadConfig } from '../src/config/index.js';
import { fetchWithTimeout } from '../src/services/http.js';
import { PaymentService } from '../src/services/payment-service.js';
import { TavilyService } from '../src/services/tavily.js';

/**
 * Phase 23 outbound-call deadlines.
 *
 * A provider that accepts a connection and never answers used to pin a request
 * forever. These tests exercise the shared abort helper and verify both
 * third-party clients attach a deadline signal.
 */

function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

describe('fetchWithTimeout', () => {
  it('aborts a hung request at the deadline', async () => {
    await assert.rejects(
      fetchWithTimeout(hangingFetch(), 'https://example.test', {}, 25),
      /abort/i,
    );
  });

  it('passes a deadline signal to the underlying fetch', async () => {
    const response = new Response('ok', { status: 200 });
    let signal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      signal = init?.signal;
      return response;
    };

    const result = await fetchWithTimeout(fetchImpl, 'https://example.test', {}, 1_000);
    assert.equal(result, response);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal?.aborted, false);
  });

  it('also honours a caller-supplied abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      return new Response('never');
    };

    await assert.rejects(
      fetchWithTimeout(fetchImpl, 'https://example.test', { signal: controller.signal }, 1_000),
      /abort/i,
    );
  });
});

describe('third-party clients attach deadlines', () => {
  it('Tavily sends an abort signal on every search', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ answer: '', results: [] }), { status: 200 });
    };
    const service = new TavilyService({
      apiKey: 'test-key',
      fetchImpl,
      timeoutMs: 1_000,
      cache: new InMemoryTtlCache(),
    });

    await service.getSalaryBenchmark('Engineer', 'India');
    assert.ok(signal instanceof AbortSignal);
  });

  it('Razorpay order creation sends an abort signal', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      signal = init?.signal;
      return new Response(JSON.stringify({ id: 'order_123', amount: 149_900, currency: 'INR' }), {
        status: 200,
      });
    };
    const service = new PaymentService({
      config: loadConfig({
        RAZORPAY_KEY_ID: 'rzp_test_key',
        RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      }),
      fetchImpl,
      timeoutMs: 1_000,
    });

    const order = await service.createOrder('starter', 'user-id');
    assert.equal(order.order_id, 'order_123');
    assert.ok(signal instanceof AbortSignal);
  });
});
