import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fetchLiveJobDescription, getMockJd, mapRawJobToJd } from '../src/services/job-desc-api.js';
import { TavilyService } from '../src/services/tavily.js';

describe('getMockJd', () => {
  it('returns the frontend mock for frontend queries', () => {
    const jd = getMockJd('Senior React UI engineer');

    assert.equal(jd.role, 'Frontend Engineer');
    assert.equal(jd.experience_years, 3);
    assert.deepEqual(jd.required_skills, [
      'React',
      'TypeScript',
      'HTML5',
      'CSS3',
      'Tailwind CSS',
      'Next.js',
    ]);
  });

  it('returns the backend mock for Python/API queries', () => {
    const jd = getMockJd('Python API developer');

    assert.equal(jd.role, 'Backend Python Developer');
    assert.equal(jd.experience_years, 4);
    assert.ok(jd.required_skills.includes('FastAPI'));
  });

  it('builds a title-cased role for other queries', () => {
    const jd = getMockJd('machine learning');

    assert.equal(jd.role, 'Software Engineer (Machine Learning)');
    assert.equal(jd.experience_years, 2);
    assert.match(jd.raw_text ?? '', /machine learning/);
  });
});

describe('mapRawJobToJd', () => {
  it('fills company and location when extraction leaves them empty', async () => {
    const jd = await mapRawJobToJd(
      {
        title: 'Senior Backend Engineer',
        description: 'Python, Docker and PostgreSQL experience required.',
        company: 'Globex',
        location: 'Berlin',
      },
      'Tavily',
      async () => {
        throw new Error('no llm');
      },
    );

    assert.equal(jd.role, 'Senior Backend Engineer');
    assert.equal(jd.company_name, 'Globex');
    assert.equal(jd.location, 'Berlin');
  });

  it('keeps extracted company and location when the model supplies them', async () => {
    const jd = await mapRawJobToJd(
      { title: 'Engineer', description: 'body', company: 'Fallback Co', location: 'Remote' },
      'Tavily',
      async () =>
        JSON.stringify({ role: 'Engineer', company_name: 'Model Co', location: 'Hybrid' }),
    );

    assert.equal(jd.company_name, 'Model Co');
    assert.equal(jd.location, 'Hybrid');
  });

  it('defaults missing title, company and location', async () => {
    const jd = await mapRawJobToJd({}, 'Tavily', async () => {
      throw new Error('no llm');
    });

    assert.equal(jd.role, 'Software Engineer');
    assert.equal(jd.company_name, 'Top Industry Employer');
    assert.equal(jd.location, 'Remote');
  });
});

describe('fetchLiveJobDescription', () => {
  function tavilyWith(fetchImpl: typeof fetch): TavilyService {
    return new TavilyService({ apiKey: 'tvly-test', fetchImpl });
  }

  it('maps the first live job when Tavily is available', async () => {
    const service = tavilyWith(async () =>
      Response.json({
        results: [
          {
            title: 'Senior Platform Engineer',
            content:
              'We are hiring a Senior Platform Engineer to own Kubernetes, Terraform and AWS infrastructure ' +
              'across our production platform, with on-call ownership and reliability responsibilities.',
            url: 'https://boards.greenhouse.io/acme',
          },
        ],
      }),
    );

    const jd = await fetchLiveJobDescription('platform engineer', {
      location: 'Remote',
      tavilyService: service,
      llmFunc: async () => {
        throw new Error('no llm');
      },
    });

    assert.equal(jd.role, 'Senior Platform Engineer');
    assert.equal(jd.company_name, 'Top Industry Employer');
    assert.equal(jd.location, 'Remote');
  });

  it('falls back to the mock JD when Tavily returns nothing', async () => {
    const service = tavilyWith(async () => Response.json({ results: [] }));

    const jd = await fetchLiveJobDescription('python backend', {
      tavilyService: service,
      llmFunc: async () => {
        throw new Error('no llm');
      },
    });

    assert.equal(jd.role, 'Backend Python Developer');
  });

  it('falls back to the mock JD when Tavily errors', async () => {
    const service = tavilyWith(async () => {
      throw new Error('network down');
    });

    const jd = await fetchLiveJobDescription('react frontend', {
      tavilyService: service,
      llmFunc: async () => {
        throw new Error('no llm');
      },
    });

    assert.equal(jd.role, 'Frontend Engineer');
  });

  it('skips Tavily when useTavily is false', async () => {
    let called = false;
    const service = tavilyWith(async () => {
      called = true;
      return Response.json({ results: [] });
    });

    const jd = await fetchLiveJobDescription('backend python', {
      useTavily: false,
      tavilyService: service,
    });

    assert.equal(called, false);
    assert.equal(jd.role, 'Backend Python Developer');
  });

  it('skips Tavily when no key is configured', async () => {
    let called = false;
    const service = new TavilyService({
      apiKey: 'your_tavily_key',
      fetchImpl: async () => {
        called = true;
        return Response.json({ results: [] });
      },
    });

    const jd = await fetchLiveJobDescription('frontend react', { tavilyService: service });

    assert.equal(called, false);
    assert.equal(jd.role, 'Frontend Engineer');
  });
});
