import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_TAVILY_BASE_URL,
  JOB_BOARD_DOMAINS,
  TavilyService,
  getTavilyService,
  resetTavilyServiceForTests,
} from '../src/services/tavily.js';

const JOB = {
  title: 'Senior Backend Engineer',
  content:
    'We are hiring a Senior Backend Engineer with deep Python, FastAPI, PostgreSQL and Docker experience ' +
    'to build and operate high-throughput platform services.',
  url: 'https://boards.greenhouse.io/acme/jobs/123',
};

describe('TavilyService availability', () => {
  it('is unavailable for empty, placeholder or unconfigured keys', () => {
    assert.equal(new TavilyService({ apiKey: '' }).isAvailable(), false);
    assert.equal(new TavilyService({ apiKey: 'your_tavily_key' }).isAvailable(), false);
    assert.equal(new TavilyService({ apiKey: 'placeholder-key' }).isAvailable(), false);
    assert.equal(new TavilyService({ apiKey: '   ' }).isAvailable(), false);
  });

  it('is available for a real-looking key', () => {
    assert.equal(new TavilyService({ apiKey: 'tvly-live-key' }).isAvailable(), true);
  });

  it('returns no jobs when unavailable without calling the network', async () => {
    let called = false;
    const service = new TavilyService({
      apiKey: '',
      fetchImpl: async () => {
        called = true;
        return Response.json({ results: [JOB] });
      },
    });

    assert.deepEqual(await service.searchLiveJobs('python'), []);
    assert.equal(called, false);
  });
});

describe('TavilyService.searchLiveJobs', () => {
  it('posts a targeted advanced search and filters short results', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> = {};

    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          results: [
            JOB,
            { title: 'Too short', content: 'short', url: 'https://example.com' },
            { title: 'No content', url: 'https://example.com/2' },
          ],
        });
      },
    });

    const jobs = await service.searchLiveJobs('python', 'Berlin', 3);

    assert.equal(requestUrl, `${DEFAULT_TAVILY_BASE_URL}/search`);
    assert.equal(requestBody.api_key, 'tvly-live-key');
    assert.equal(requestBody.search_depth, 'advanced');
    assert.deepEqual(requestBody.include_domains, [...JOB_BOARD_DOMAINS]);
    assert.equal(requestBody.max_results, 3);
    assert.match(String(requestBody.query), /job description requirements/);
    assert.match(String(requestBody.query), /python/);
    assert.match(String(requestBody.query), /in Berlin/);
    assert.match(String(requestBody.query), /hiring 2026/);

    assert.deepEqual(jobs, [
      {
        title: JOB.title,
        description: JOB.content,
        url: JOB.url,
        source: 'Tavily Live Search',
      },
    ]);
  });

  it('omits the location clause when none is provided', async () => {
    let query = '';
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { query: string };
        query = body.query;
        return Response.json({ results: [] });
      },
    });

    await service.searchLiveJobs('python');

    assert.doesNotMatch(query, /in undefined/);
    assert.match(query, /python {2}hiring 2026/);
  });

  it('serves repeated queries from the 1 hour cache', async () => {
    let calls = 0;
    let now = 1_000_000;
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      now: () => now,
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ results: [JOB] });
      },
    });

    const first = await service.searchLiveJobs('python', 'Remote');
    now += 3_599_000;
    const second = await service.searchLiveJobs('python', 'Remote');

    assert.equal(calls, 1);
    assert.deepEqual(second, first);
  });

  it('refreshes the cache after the TTL expires', async () => {
    let calls = 0;
    let now = 1_000_000;
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      now: () => now,
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ results: [JOB] });
      },
    });

    await service.searchLiveJobs('python', 'Remote');
    now += 3_601_000;
    await service.searchLiveJobs('python', 'Remote');

    assert.equal(calls, 2);
  });

  it('does not cache empty result sets', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ results: [] });
      },
    });

    await service.searchLiveJobs('python');
    await service.searchLiveJobs('python');

    assert.equal(calls, 2);
  });

  it('clearCache forces a refetch', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ results: [JOB] });
      },
    });

    await service.searchLiveJobs('python');
    service.clearCache();
    await service.searchLiveJobs('python');

    assert.equal(calls, 2);
  });

  it('returns [] when the API responds with an error status', async () => {
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async () => new Response('quota exceeded', { status: 429 }),
    });

    assert.deepEqual(await service.searchLiveJobs('python'), []);
  });

  it('returns [] when the request throws', async () => {
    const service = new TavilyService({
      apiKey: 'tvly-live-key',
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });

    assert.deepEqual(await service.searchLiveJobs('python'), []);
  });
});

describe('getTavilyService', () => {
  it('returns a memoised singleton', () => {
    resetTavilyServiceForTests();
    const first = getTavilyService();
    const second = getTavilyService();

    assert.equal(first, second);

    resetTavilyServiceForTests();
    assert.notEqual(getTavilyService(), first);
  });
});
