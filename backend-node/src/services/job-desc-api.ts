import type { JobDescription } from '../schemas/jd.js';
import { parseStructuredJd, type JdLlmFunc } from './jd-parser.js';
import { getTavilyService, type TavilyService } from './tavily.js';
import { createLogger } from '../telemetry/logger.js';
import { pythonTitle } from './parsing-utils.js';

/**
 * Port of `backend/app/services/job_desc_api.py`.
 *
 * Live discovery goes through Tavily; any failure falls back to the same
 * deterministic mock JDs as Python.
 */

const logger = createLogger('recruitai.job_desc_api');

/** High-quality mock JD used when live discovery is unavailable. */
export function getMockJd(query: string): JobDescription {
  const queryLower = query.toLowerCase();
  let role: string;
  let skills: string[];
  let experienceYears: number;
  let text: string;

  if (queryLower.includes('front') || queryLower.includes('react') || queryLower.includes('ui')) {
    role = 'Frontend Engineer';
    skills = ['React', 'TypeScript', 'HTML5', 'CSS3', 'Tailwind CSS', 'Next.js'];
    experienceYears = 3;
    text =
      'We are looking for a skilled Frontend Engineer with 3+ years of experience. ' +
      'You will build responsive, interactive web applications using React, Next.js, and TypeScript. ' +
      'Experience with Tailwind CSS and performance optimization is highly preferred.';
  } else if (
    queryLower.includes('back') ||
    queryLower.includes('python') ||
    queryLower.includes('django') ||
    queryLower.includes('api')
  ) {
    role = 'Backend Python Developer';
    skills = ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'Redis', 'REST APIs'];
    experienceYears = 4;
    text =
      'We are seeking a Backend Python Developer to join our core engineering team. ' +
      'You will design and implement scalable microservices using FastAPI/Django, PostgreSQL, and Docker. ' +
      'Experience with pgvector or semantic search is a plus.';
  } else {
    role = `Software Engineer (${pythonTitle(query)})`;
    skills = ['Python', 'JavaScript', 'SQL', 'Git', 'Docker', 'Cloud Services'];
    experienceYears = 2;
    text =
      `We are looking for a versatile Software Engineer interested in working on ${query}. ` +
      'You should have 2+ years of experience with software development, good communication skills, ' +
      'and a strong desire to learn new backend and frontend technologies.';
  }

  return {
    role,
    required_skills: skills,
    experience_years: experienceYears,
    raw_text: text,
    tone: 'professional',
    company_name: null,
    department: null,
    location: null,
    employment_type: null,
    salary_range: null,
    education_requirements: null,
    preferred_skills: [],
    responsibilities: [],
    qualifications: [],
    benefits: [],
    industry: null,
    summary: null,
  };
}

export interface FetchLiveJdOptions {
  readonly location?: string;
  readonly useTavily?: boolean;
  /** Injectable service for tests; defaults to the process singleton. */
  readonly tavilyService?: TavilyService;
  /** Injectable extraction helper for tests. */
  readonly llmFunc?: JdLlmFunc;
}

/**
 * Fetch a real-time JD via Tavily, falling back to the deterministic mock.
 */
export async function fetchLiveJobDescription(
  query: string,
  options: FetchLiveJdOptions = {},
): Promise<JobDescription> {
  const useTavily = options.useTavily ?? true;
  const tavily = options.tavilyService ?? getTavilyService();

  if (useTavily && tavily.isAvailable()) {
    try {
      const jobs = await tavily.searchLiveJobs(query, options.location, 3);
      const first = jobs[0];
      if (first) {
        return mapRawJobToJd(
          {
            title: first.title || query,
            description: first.description,
            company: 'Top Industry Employer',
            location: options.location ?? 'Remote',
          },
          'Tavily',
          options.llmFunc,
        );
      }
    } catch (error) {
      logger.warn(
        `[Tavily] Live job search failed: ${errorMessage(error)}. Falling back to mock JD.`,
        {
          status: 'failed',
        },
      );
    }
  }

  logger.info(`Using local mock fallback job description for query '${query}'`, {
    status: 'fallback',
  });
  return getMockJd(query);
}

/** Map a raw live-search job into a `JobDescription`. */
export async function mapRawJobToJd(
  jobData: Record<string, unknown>,
  _sourceName: string,
  llmFunc?: JdLlmFunc,
): Promise<JobDescription> {
  const title = firstString(jobData.title, jobData.job_title) || 'Software Engineer';
  const description = firstString(jobData.description, jobData.job_description) || '';
  const company = firstString(jobData.company_name, jobData.company) || 'Top Industry Employer';
  const location = firstString(jobData.location) || 'Remote';

  const fullText =
    `Job Title: ${title}\nCompany: ${company}\nLocation: ${location}\n` +
    `Description:\n${description}`;

  const jd = await parseStructuredJd(fullText, '', llmFunc);
  if (!jd.company_name || jd.company_name === 'Unknown Company') {
    jd.company_name = company;
  }
  if (!jd.location) {
    jd.location = location;
  }
  return jd;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
