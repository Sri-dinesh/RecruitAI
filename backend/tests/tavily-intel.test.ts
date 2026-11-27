import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TavilyService } from '../src/services/tavily.js';

/**
 * Offline and live paths for the Phase 13 intelligence methods. The live-job
 * path is covered by `tests/tavily.test.ts`; these tests pin the salary,
 * trend, and recruiter-intel contracts used by the graph nodes.
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TavilyService salary benchmarks', () => {
  it('falls back to the curated India benchmark without a key', async () => {
    const service = new TavilyService({ apiKey: '' });

    const result = await service.getSalaryBenchmark('Senior Full Stack Engineer', 'India');

    assert.equal(result.role, 'Senior Full Stack Engineer');
    assert.equal(result.location, 'India');
    assert.equal(result.minSalary, 1_500_000);
    assert.equal(result.medianSalary, 2_250_000);
    assert.equal(result.maxSalary, 3_000_000);
    assert.equal(result.currency, 'INR');
    assert.equal(result.isLive, false);
    assert.equal(result.cached, false);
    assert.equal(result.citations[0]?.title, 'RecruitAI Industry Baseline Dataset');
    assert.equal(result.citations[0]?.url, '');
    assert.deepEqual(result.experienceBreakdown, {
      'Entry / Associate (0-2 yrs)': '975,000 - 1,500,000 INR',
      'Mid-Level Professional (3-5 yrs)': '1,500,000 - 2,175,000 INR',
      'Senior Specialist (5-8 yrs)': '2,175,000 - 3,000,000 INR',
      'Lead / Staff / Principal (8+ yrs)': '3,000,000 - 4,050,000 INR',
    });

    const markdown = result.toMarkdown();
    assert.match(markdown, /🟠 \*\*\[OFFLINE DATA - CACHED BENCHMARK\]\*\*/);
    assert.match(
      markdown,
      /### 💼 Market Compensation Report: \*\*Senior Full Stack Engineer\*\* \(India\)/,
    );
    assert.match(
      markdown,
      /`1,500,000 - 3,000,000 INR` per annum \| Median: \*\*2,250,000 INR\*\*/,
    );
  });

  it('uses the default Indian baseline for an unknown role', async () => {
    const service = new TavilyService({ apiKey: '' });
    const result = await service.getSalaryBenchmark('Data Scientist', 'India');

    assert.equal(result.minSalary, 1_200_000);
    assert.equal(result.medianSalary, 1_850_000);
    assert.equal(result.maxSalary, 2_500_000);
    assert.equal(result.currency, 'INR');
  });

  it('matches a curated role regardless of location, keeping its currency', async () => {
    const service = new TavilyService({ apiKey: '' });
    const result = await service.getSalaryBenchmark('Senior Full Stack Engineer', 'US');

    assert.equal(result.minSalary, 1_200_000);
    assert.equal(result.maxSalary, 1_800_000);
    assert.equal(result.currency, 'USD');
  });

  it('parses a live LPA answer and reports live data', async () => {
    const queries: string[] = [];
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { query: string };
        queries.push(body.query);
        return jsonResponse({
          answer: 'Senior engineers earn 15 LPA - 30 LPA depending on experience.',
          results: [
            {
              title: 'Levels.fyi compensation',
              url: 'https://www.levels.fyi/t/software-engineer',
              content: '15 LPA to 30 LPA',
            },
          ],
        });
      },
    });

    const result = await service.getSalaryBenchmark('Backend Engineer', 'India');

    assert.equal(result.isLive, true);
    assert.equal(result.cached, false);
    assert.equal(result.minSalary, 1_500_000);
    assert.equal(result.maxSalary, 3_000_000);
    assert.equal(result.medianSalary, 2_250_000);
    assert.equal(result.currency, 'INR');
    assert.equal(result.citations[0]?.title, 'Levels.fyi compensation');
    assert.match(queries[0] ?? '', /Backend Engineer in India 2026/);
    assert.match(result.toMarkdown(), /🟢 \*\*\[LIVE DATA - TAVILY REAL-TIME SEARCH\]\*\*/);
  });

  it('serves the cached benchmark on a second call', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-test',
      now: () => 1_000,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ answer: '$120,000 - $180,000', results: [] });
      },
    });

    const first = await service.getSalaryBenchmark('Platform Engineer', 'US');
    const second = await service.getSalaryBenchmark('Platform Engineer', 'US');

    assert.equal(calls, 1);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.minSalary, 120_000);
    assert.equal(second.maxSalary, 180_000);
    assert.equal(second.currency, 'USD');
  });

  it('falls back offline when the live API errors', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ detail: 'upstream down' }, 500);
      },
    });

    const result = await service.getSalaryBenchmark('Senior Full Stack Engineer', 'India');

    assert.equal(calls, 2); // domain-targeted call + unrestricted retry
    assert.equal(result.isLive, false);
    assert.equal(result.minSalary, 1_500_000);
  });
});

describe('TavilyService skill trends', () => {
  it('falls back to curated role trends without a key', async () => {
    const service = new TavilyService({ apiKey: '' });
    const result = await service.getSkillTrends('Python Developer');

    assert.equal(result.role, 'Python Developer');
    assert.equal(result.isLive, false);
    assert.deepEqual(result.trendingSkills, [
      'FastAPI',
      'LangChain',
      'Pydantic v2',
      'Polars',
      'Asyncio',
      'OpenTelemetry',
      'PostgreSQL',
      'Docker',
    ]);
    assert.deepEqual(result.emergingTech, [
      'LangGraph / Multi-Agent Systems',
      'Local SLM Inference',
      'OpenTelemetry Tracing',
    ]);
    assert.match(result.toMarkdown(), /### 📈 2026 Tech Market Trends: \*\*Python Developer\*\*/);
  });

  it('selects role-specific defaults', async () => {
    const service = new TavilyService({ apiKey: '' });
    const frontend = await service.getSkillTrends('Frontend Engineer');
    const devops = await service.getSkillTrends('DevOps Engineer');
    const generic = await service.getSkillTrends('Engineering Manager');

    assert.equal(frontend.trendingSkills[0], 'React 19');
    assert.equal(devops.trendingSkills[0], 'Kubernetes');
    assert.deepEqual(generic.trendingSkills, [
      'Cloud-native Microservices',
      'CI/CD Automation',
      'GenAI Integration',
      'Observability',
      'API-First Architecture',
    ]);
  });

  it('parses live trend text and caches it', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({
          answer: 'FastAPI and Kubernetes dominate modern backends.',
          results: [
            {
              title: 'GitHub Octoverse',
              url: 'https://github.com/octoverse',
              content: 'FastAPI Kubernetes growth',
            },
          ],
        });
      },
    });

    const first = await service.getSkillTrends('Backend Engineer');
    const second = await service.getSkillTrends('Backend Engineer');

    assert.equal(calls, 1);
    assert.equal(first.isLive, true);
    assert.equal(first.cached, false);
    assert.deepEqual(first.trendingSkills, ['FastAPI', 'Kubernetes']);
    assert.equal(first.emergingTech.length, 4);
    assert.equal(first.citations[0]?.url, 'https://github.com/octoverse');
    assert.equal(second.cached, true);
  });

  it('falls back to curated trends when the live API errors', async () => {
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async () => jsonResponse({ detail: 'down' }, 503),
    });

    const result = await service.getSkillTrends('Python Developer');
    assert.equal(result.isLive, false);
    assert.equal(result.trendingSkills[0], 'FastAPI');
  });
});

describe('TavilyService recruiter web intelligence', () => {
  it('returns the offline notice without a key', async () => {
    const service = new TavilyService({ apiKey: '' });
    const result = await service.searchRecruiterIntel('Stripe growth');

    assert.equal(result.isLive, false);
    assert.equal(
      result.answer,
      "Could not retrieve real-time web intelligence for 'Stripe growth'. " +
        'Please ensure internet connectivity and a valid TAVILY_API_KEY.',
    );
    assert.deepEqual(result.citations, []);
    assert.match(result.toMarkdown(), /### 🌐 Web Intelligence: \*"Stripe growth"\*/);
  });

  it('passes a live answer through with citations and caches it', async () => {
    let calls = 0;
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { query: string; search_depth: string };
        assert.equal(body.query, 'Stripe');
        assert.equal(body.search_depth, 'advanced');
        return jsonResponse({
          answer: 'Stripe is a payments infrastructure company.',
          results: [
            {
              title: 'Stripe Docs',
              url: 'https://stripe.com/docs',
              content: 'Stripe builds economic infrastructure for the internet.',
            },
          ],
        });
      },
    });

    const first = await service.searchRecruiterIntel('Stripe', 'advanced');
    const second = await service.searchRecruiterIntel('Stripe', 'advanced');

    assert.equal(calls, 1);
    assert.equal(first.isLive, true);
    assert.equal(first.cached, false);
    assert.equal(first.answer, 'Stripe is a payments infrastructure company.');
    assert.equal(first.citations[0]?.title, 'Stripe Docs');
    assert.match(first.toMarkdown(), /#### 🔍 Sources/);
    assert.equal(second.cached, true);
  });

  it('synthesises an answer from results when the API returns none', async () => {
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async () =>
        jsonResponse({
          answer: '',
          results: [
            { title: 'Company A', url: 'https://a.example.com', content: 'A builds APIs.' },
            { title: 'Company B', url: 'https://b.example.com', content: 'B builds data tools.' },
          ],
        }),
    });

    const result = await service.searchRecruiterIntel('FastAPI vendors');

    assert.equal(result.isLive, true);
    assert.equal(
      result.answer,
      '- **Company A**: A builds APIs.\n\n- **Company B**: B builds data tools.',
    );
    assert.equal(result.citations.length, 2);
  });

  it('falls back offline when the live API errors', async () => {
    const service = new TavilyService({
      apiKey: 'tvly-test',
      fetchImpl: async () => jsonResponse({ detail: 'down' }, 500),
    });

    const result = await service.searchRecruiterIntel('Stripe');
    assert.equal(result.isLive, false);
    assert.match(result.answer, /Could not retrieve real-time web intelligence/);
  });
});
