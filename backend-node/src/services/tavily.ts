import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createTtlCache, type TtlCache } from '../cache/ttl-cache.js';
import { getConfig } from '../config/index.js';
import { getSharedRedisStore } from '../redis/client.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Port of `backend/app/services/tavily_service.py`.
 *
 * One service owns all live web intelligence:
 * - `searchLiveJobs` for JD discovery (Phase 9 route);
 * - `getSalaryBenchmark` for compensation intelligence;
 * - `getSkillTrends` for market skill demand;
 * - `searchRecruiterIntel` for general recruiter research.
 *
 * The Python service wraps `TavilyClient`; this port posts to the REST API with
 * `fetch`, keeping the same targeted domains, TTL cache, and offline
 * fallbacks. All fallbacks are deterministic so agent nodes work without a
 * key or network.
 */

const logger = createLogger('recruitai.tavily');

export const DEFAULT_TAVILY_BASE_URL = 'https://api.tavily.com';

/** Targeted job platforms for live posting discovery. */
export const JOB_BOARD_DOMAINS = [
  'linkedin.com',
  'boards.greenhouse.io',
  'jobs.lever.co',
  'jobs.ashbyhq.com',
  'wellfound.com',
  'indeed.com',
] as const;

/** Curated domains for salary and compensation intelligence. */
export const SALARY_DOMAINS = [
  'levels.fyi',
  'glassdoor.com',
  'glassdoor.co.in',
  'ambitionbox.com',
  'payscale.com',
  'indeed.com',
  'salary.com',
  'wellfound.com',
] as const;

/** Curated domains for developer trends and tech stacks. */
export const TECH_TREND_DOMAINS = [
  'github.com',
  'stackoverflow.com',
  'roadmap.sh',
  'thoughtworks.com',
  'techcrunch.com',
  'news.ycombinator.com',
] as const;

export interface LiveJob {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly source: string;
}

export interface Citation {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface TavilyServiceOptions {
  readonly apiKey?: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  /** Epoch milliseconds clock, injectable for cache tests. */
  readonly now?: () => number;
  /** Cache injection (tests); defaults to Redis when configured, else local. */
  readonly cache?: TtlCache;
}

interface TavilySearchResponse {
  answer?: string;
  results?: Array<Record<string, unknown>>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatNumber(value: number): string {
  return Math.trunc(value).toLocaleString('en-US');
}

function citationTitle(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function citationSnippet(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildCitations(
  results: readonly Record<string, unknown>[],
  fallbackTitle: string,
): Citation[] {
  return results
    .filter((result) => typeof result.url === 'string' && result.url.length > 0)
    .map((result) => ({
      title: citationTitle(result.title, fallbackTitle),
      url: String(result.url),
      snippet: citationSnippet(result.content),
    }));
}

/** Structured compensation benchmark report. */
export class SalaryBenchmarkResult {
  constructor(
    readonly role: string,
    readonly location: string,
    readonly summary: string,
    readonly experienceLevel: string | null = null,
    readonly minSalary: number | null = null,
    readonly medianSalary: number | null = null,
    readonly maxSalary: number | null = null,
    readonly currency = 'INR',
    readonly experienceBreakdown: Readonly<Record<string, string>> = {},
    readonly citations: readonly Citation[] = [],
    readonly recommendations: readonly string[] = [],
    readonly isLive = false,
    readonly cached = false,
  ) {}

  /** Render an industry-grade recruiter compensation briefing. */
  toMarkdown(): string {
    const badge = this.isLive
      ? '🟢 **[LIVE DATA - TAVILY REAL-TIME SEARCH]**'
      : '🟠 **[OFFLINE DATA - CACHED BENCHMARK]**';
    const lines = [
      `${badge}\n`,
      `### 💼 Market Compensation Report: **${this.role}** (${this.location})`,
      `*${this.summary}*\n`,
    ];

    if (this.minSalary && this.maxSalary) {
      const median = this.medianSalary
        ? ` | Median: **${formatNumber(this.medianSalary)} ${this.currency}**`
        : '';
      lines.push(
        `**Benchmark Range:** \`${formatNumber(this.minSalary)} - ${formatNumber(this.maxSalary)} ${this.currency}\` per annum${median}\n`,
      );
    }

    if (Object.keys(this.experienceBreakdown).length > 0) {
      lines.push('#### 📊 Compensation by Experience Tier');
      for (const [tier, comp] of Object.entries(this.experienceBreakdown)) {
        lines.push(`- **${tier}:** ${comp}`);
      }
      lines.push('');
    }

    if (this.recommendations.length > 0) {
      lines.push('#### 💡 Hiring & Negotiation Strategy');
      for (const recommendation of this.recommendations) {
        lines.push(`- ${recommendation}`);
      }
      lines.push('');
    }

    if (this.citations.length > 0) {
      lines.push('#### 🔗 Verified Sources & Market References');
      for (const citation of this.citations.slice(0, 4)) {
        lines.push(citation.url ? `- [${citation.title}](${citation.url})` : `- ${citation.title}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  asCached(): SalaryBenchmarkResult {
    return new SalaryBenchmarkResult(
      this.role,
      this.location,
      this.summary,
      this.experienceLevel,
      this.minSalary,
      this.medianSalary,
      this.maxSalary,
      this.currency,
      this.experienceBreakdown,
      this.citations,
      this.recommendations,
      this.isLive,
      true,
    );
  }
}

/** Structured developer skill and technology trend analysis. */
export class SkillTrendResult {
  constructor(
    readonly role: string,
    readonly summary: string,
    readonly trendingSkills: readonly string[] = [],
    readonly emergingTech: readonly string[] = [],
    readonly decliningOrLegacy: readonly string[] = [],
    readonly citations: readonly Citation[] = [],
    readonly isLive = false,
    readonly cached = false,
  ) {}

  toMarkdown(): string {
    const lines = [`### 📈 2026 Tech Market Trends: **${this.role}**`, `*${this.summary}*\n`];

    if (this.trendingSkills.length > 0) {
      lines.push('#### 🔥 Top Trending & In-Demand Skills');
      for (const skill of this.trendingSkills) {
        lines.push(`- **${skill}**`);
      }
      lines.push('');
    }

    if (this.emergingTech.length > 0) {
      lines.push('#### 🚀 Emerging Libraries & Frameworks (Fast Adoption)');
      for (const tech of this.emergingTech) {
        lines.push(`- ${tech}`);
      }
      lines.push('');
    }

    if (this.decliningOrLegacy.length > 0) {
      lines.push('#### ⚠️ Declining / Niche Skills');
      for (const skill of this.decliningOrLegacy) {
        lines.push(`- ${skill}`);
      }
      lines.push('');
    }

    if (this.citations.length > 0) {
      lines.push('#### 📚 Market Research Citations');
      for (const citation of this.citations.slice(0, 4)) {
        lines.push(citation.url ? `- [${citation.title}](${citation.url})` : `- ${citation.title}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  asCached(): SkillTrendResult {
    return new SkillTrendResult(
      this.role,
      this.summary,
      this.trendingSkills,
      this.emergingTech,
      this.decliningOrLegacy,
      this.citations,
      this.isLive,
      true,
    );
  }
}

/** Structured general web intelligence report for recruiters. */
export class WebIntelResult {
  constructor(
    readonly query: string,
    readonly answer: string,
    readonly citations: readonly Citation[] = [],
    readonly isLive = false,
    readonly cached = false,
  ) {}

  toMarkdown(): string {
    const lines = [`### 🌐 Web Intelligence: *"${this.query}"*\n`, `${this.answer}\n`];
    if (this.citations.length > 0) {
      lines.push('#### 🔍 Sources');
      for (const citation of this.citations.slice(0, 4)) {
        lines.push(
          citation.url
            ? `- [${citation.title}](${citation.url}): ${citation.snippet.slice(0, 160)}...`
            : `- ${citation.title}`,
        );
      }
    }
    return lines.join('\n').trim();
  }

  asCached(): WebIntelResult {
    return new WebIntelResult(this.query, this.answer, this.citations, this.isLive, true);
  }
}

const FALLBACK_SALARY_FILE = fileURLToPath(
  new URL('../../data/salary_fallback.json', import.meta.url),
);

interface SalaryFallbackEntry {
  role: string;
  location: string;
  min_salary: number;
  max_salary: number;
  currency: string;
  period?: string;
}

interface CachedSalary {
  readonly kind: 'salary';
  readonly role: string;
  readonly location: string;
  readonly summary: string;
  readonly experienceLevel: string | null;
  readonly minSalary: number | null;
  readonly medianSalary: number | null;
  readonly maxSalary: number | null;
  readonly currency: string;
  readonly experienceBreakdown: Readonly<Record<string, string>>;
  readonly citations: readonly Citation[];
  readonly recommendations: readonly string[];
  readonly isLive: boolean;
}

interface CachedTrends {
  readonly kind: 'trends';
  readonly role: string;
  readonly summary: string;
  readonly trendingSkills: readonly string[];
  readonly emergingTech: readonly string[];
  readonly decliningOrLegacy: readonly string[];
  readonly citations: readonly Citation[];
  readonly isLive: boolean;
}

interface CachedIntel {
  readonly kind: 'intel';
  readonly query: string;
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly isLive: boolean;
}

function salaryToCache(value: SalaryBenchmarkResult): CachedSalary {
  return {
    kind: 'salary',
    role: value.role,
    location: value.location,
    summary: value.summary,
    experienceLevel: value.experienceLevel,
    minSalary: value.minSalary,
    medianSalary: value.medianSalary,
    maxSalary: value.maxSalary,
    currency: value.currency,
    experienceBreakdown: value.experienceBreakdown,
    citations: value.citations,
    recommendations: value.recommendations,
    isLive: value.isLive,
  };
}

function salaryFromCache(value: CachedSalary): SalaryBenchmarkResult {
  return new SalaryBenchmarkResult(
    value.role,
    value.location,
    value.summary,
    value.experienceLevel,
    value.minSalary,
    value.medianSalary,
    value.maxSalary,
    value.currency,
    value.experienceBreakdown,
    value.citations,
    value.recommendations,
    value.isLive,
    false,
  );
}

function trendsToCache(value: SkillTrendResult): CachedTrends {
  return {
    kind: 'trends',
    role: value.role,
    summary: value.summary,
    trendingSkills: value.trendingSkills,
    emergingTech: value.emergingTech,
    decliningOrLegacy: value.decliningOrLegacy,
    citations: value.citations,
    isLive: value.isLive,
  };
}

function trendsFromCache(value: CachedTrends): SkillTrendResult {
  return new SkillTrendResult(
    value.role,
    value.summary,
    value.trendingSkills,
    value.emergingTech,
    value.decliningOrLegacy,
    value.citations,
    value.isLive,
    false,
  );
}

function intelToCache(value: WebIntelResult): CachedIntel {
  return {
    kind: 'intel',
    query: value.query,
    answer: value.answer,
    citations: value.citations,
    isLive: value.isLive,
  };
}

function intelFromCache(value: CachedIntel): WebIntelResult {
  return new WebIntelResult(value.query, value.answer, value.citations, value.isLive, false);
}

function isCachedKind<T extends { kind: string }>(value: unknown, kind: T['kind']): value is T {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === kind;
}

export class TavilyService {
  private readonly cache: TtlCache;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;

  constructor(options: TavilyServiceOptions = {}) {
    this.apiKey = options.apiKey ?? getConfig().llm.tavilyApiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_TAVILY_BASE_URL).replace(/\/$/, '');
    this.now = options.now ?? Date.now;
    this.cache =
      options.cache ??
      createTtlCache({
        store: getSharedRedisStore(),
        namespace: 'tavily',
        now: this.now,
      });
  }

  /** True when a non-placeholder Tavily key is configured. */
  isAvailable(): boolean {
    const key = (this.apiKey ?? '').trim();
    return Boolean(key) && !key.includes('your_tavily') && !key.startsWith('placeholder');
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  private async getCache<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  private async setCache(key: string, data: unknown, ttlSeconds = 7200): Promise<void> {
    await this.cache.set(key, data, ttlSeconds);
  }

  /** POST to `/search`, attaching the API key the same way TavilyClient does. */
  private async search(body: Readonly<Record<string, unknown>>): Promise<TavilySearchResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, ...body }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error (${response.status})`);
    }

    return (await response.json()) as TavilySearchResponse;
  }

  // ─── 1. Salary & Compensation Intelligence ─────────────────────────────────

  /** Salary benchmark with domain targeting, answer synthesis and tiers. */
  async getSalaryBenchmark(
    role: string,
    location = 'India',
    experienceLevel?: string | null,
  ): Promise<SalaryBenchmarkResult> {
    const cacheKey = `salary:${role.toLowerCase()}:${location.toLowerCase()}:${String(
      experienceLevel ?? 'none',
    ).toLowerCase()}`;
    const cached = await this.getCache<CachedSalary>(cacheKey);
    if (isCachedKind<CachedSalary>(cached, 'salary')) {
      return salaryFromCache(cached).asCached();
    }

    if (this.isAvailable()) {
      try {
        const experienceClause = experienceLevel
          ? `for ${experienceLevel} level`
          : 'across experience levels';
        const query =
          `exact salary range compensation benchmarks for ${role} in ${location} 2026 ` +
          experienceClause;

        let payload: TavilySearchResponse;
        try {
          payload = await this.search({
            query,
            search_depth: 'advanced',
            include_answer: 'advanced',
            include_domains: SALARY_DOMAINS,
            max_results: 5,
          });
        } catch {
          // Domain filter can be too restrictive; retry unrestricted.
          payload = await this.search({
            query,
            search_depth: 'advanced',
            include_answer: 'advanced',
            max_results: 5,
          });
        }

        let answer = typeof payload.answer === 'string' ? payload.answer : '';
        const results = payload.results ?? [];
        const citations = buildCitations(results, 'Compensation Data Source');
        const { min, max, median, currency } = this.extractSalaryNumbers(answer, results, location);
        const tiers = this.generateExperienceTiers(min, max, currency);
        const recommendations = this.generateSalaryRecommendations(
          role,
          location,
          min,
          max,
          currency,
        );

        if (!answer && results.length > 0) {
          answer =
            `According to real-time market data across ${results.length} sources, ${role} roles ` +
            `in ${location} offer competitive compensation aligned with technical depth and seniority.`;
        }

        const benchmark = new SalaryBenchmarkResult(
          role,
          location,
          answer || `Compensation benchmarks for ${role} in ${location}.`,
          experienceLevel ?? null,
          min,
          median,
          max,
          currency,
          tiers,
          citations,
          recommendations,
          true,
          false,
        );

        await this.setCache(cacheKey, salaryToCache(benchmark), 7200);
        return benchmark;
      } catch (error) {
        logger.warn(
          `Tavily live salary search failed: ${errorMessage(error)}. Falling back to offline benchmarks.`,
          { status: 'fallback' },
        );
      }
    }

    return this.getFallbackSalary(role, location, experienceLevel);
  }

  private extractSalaryNumbers(
    answer: string,
    results: readonly Record<string, unknown>[],
    location: string,
  ): { min: number | null; max: number | null; median: number | null; currency: string } {
    const currency = [
      'india',
      'inr',
      'bengaluru',
      'bangalore',
      'delhi',
      'mumbai',
      'hyderabad',
      'pune',
    ].some((token) => location.toLowerCase().includes(token))
      ? 'INR'
      : 'USD';

    const combined =
      `${answer} ` +
      results.map((result) => (typeof result.content === 'string' ? result.content : '')).join(' ');

    // ₹10,00,000 - ₹25,00,000 or 10 LPA - 25 LPA
    const lakhMatches = [...combined.matchAll(/(\d+(?:\.\d+)?)\s*(?:lakh|lpa|lac)/gi)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value <= 150)
      .map((value) => Math.trunc(value * 100000))
      .sort((left, right) => left - right);

    if (lakhMatches.length > 0) {
      const min = lakhMatches[0] as number;
      const max =
        lakhMatches.length > 1
          ? (lakhMatches[lakhMatches.length - 1] as number)
          : Math.trunc(min * 1.6);
      return { min, max, median: Math.trunc((min + max) / 2), currency: 'INR' };
    }

    // $120,000 - $180,000
    const dollarMatches = [...combined.matchAll(/\$\s*(\d{2,3}(?:,\d{3})+|\d{5,6})/g)]
      .map((match) => Number(String(match[1]).replaceAll(',', '')))
      .filter((value) => Number.isFinite(value) && value >= 30000 && value <= 600000)
      .sort((left, right) => left - right);

    if (dollarMatches.length > 0) {
      const min = dollarMatches[0] as number;
      const max =
        dollarMatches.length > 1
          ? (dollarMatches[dollarMatches.length - 1] as number)
          : Math.trunc(min * 1.5);
      return { min, max, median: Math.trunc((min + max) / 2), currency: 'USD' };
    }

    // ₹12,00,000
    const rupeeMatches = [
      ...combined.matchAll(/(?:₹|rs\.?|inr)\s*(\d{1,2}(?:,\d{2,3})+|\d{6,7})/gi),
    ]
      .map((match) => Number(String(match[1]).replaceAll(',', '')))
      .filter((value) => Number.isFinite(value) && value >= 200000 && value <= 15000000)
      .sort((left, right) => left - right);

    if (rupeeMatches.length > 0) {
      const min = rupeeMatches[0] as number;
      const max =
        rupeeMatches.length > 1
          ? (rupeeMatches[rupeeMatches.length - 1] as number)
          : Math.trunc(min * 1.7);
      return { min, max, median: Math.trunc((min + max) / 2), currency: 'INR' };
    }

    if (currency === 'INR') {
      return { min: 1200000, max: 2800000, median: 1900000, currency: 'INR' };
    }
    return { min: 110000, max: 175000, median: 140000, currency: 'USD' };
  }

  private generateExperienceTiers(
    minSalary: number | null,
    maxSalary: number | null,
    currency: string,
  ): Record<string, string> {
    if (!minSalary || !maxSalary) {
      return {};
    }

    const spread = maxSalary - minSalary;
    const juniorMin = Math.max(Math.trunc(minSalary * 0.65), currency === 'INR' ? 300000 : 65000);
    const juniorMax = minSalary;
    const midMin = minSalary;
    const midMax = Math.trunc(minSalary + spread * 0.45);
    const seniorMin = midMax;
    const seniorMax = maxSalary;
    const leadMin = maxSalary;
    const leadMax = Math.trunc(maxSalary * 1.35);

    return {
      'Entry / Associate (0-2 yrs)': `${formatNumber(juniorMin)} - ${formatNumber(juniorMax)} ${currency}`,
      'Mid-Level Professional (3-5 yrs)': `${formatNumber(midMin)} - ${formatNumber(midMax)} ${currency}`,
      'Senior Specialist (5-8 yrs)': `${formatNumber(seniorMin)} - ${formatNumber(seniorMax)} ${currency}`,
      'Lead / Staff / Principal (8+ yrs)': `${formatNumber(leadMin)} - ${formatNumber(leadMax)} ${currency}`,
    };
  }

  private generateSalaryRecommendations(
    _role: string,
    _location: string,
    minSalary: number | null,
    maxSalary: number | null,
    currency: string,
  ): string[] {
    return [
      `Target mid-point offer at approx. **${formatNumber(
        Math.trunc(((minSalary ?? 0) + (maxSalary ?? 0)) / 2),
      )} ${currency}** for strong candidates meeting core technical criteria.`,
      'Top tier candidates with modern cloud-native or AI pipeline experience typically demand a 15-25% premium above the 75th percentile.',
      'Consider offering performance equity or flexible hybrid arrangements if competing against tier-1 tech firms.',
    ];
  }

  private readFallbackSalary(): SalaryFallbackEntry[] {
    try {
      const parsed = JSON.parse(readFileSync(FALLBACK_SALARY_FILE, 'utf8')) as unknown;
      return Array.isArray(parsed) ? (parsed as SalaryFallbackEntry[]) : [];
    } catch (error) {
      logger.error(`Failed to read fallback salary JSON: ${errorMessage(error)}`, {
        status: 'failed',
      });
      return [];
    }
  }

  private getFallbackSalary(
    role: string,
    location: string,
    experienceLevel?: string | null,
  ): SalaryBenchmarkResult {
    let minSalary = 1200000;
    let maxSalary = 2500000;
    let currency = location.toLowerCase().includes('india') ? 'INR' : 'USD';

    const data = this.readFallbackSalary();
    const roleLower = role.toLowerCase();
    let matched = data.find(
      (entry) =>
        (entry.role.toLowerCase().includes(roleLower) ||
          roleLower.includes(entry.role.toLowerCase())) &&
        entry.location.toLowerCase() === location.toLowerCase(),
    );

    if (!matched) {
      matched = data.find(
        (entry) =>
          entry.role.toLowerCase().includes(roleLower) ||
          roleLower.includes(entry.role.toLowerCase()),
      );
    }

    if (matched) {
      minSalary = matched.min_salary;
      maxSalary = matched.max_salary;
      currency = matched.currency || currency;
    }

    const medianSalary = Math.trunc((minSalary + maxSalary) / 2);
    const tiers = this.generateExperienceTiers(minSalary, maxSalary, currency);
    const recommendations = this.generateSalaryRecommendations(
      role,
      location,
      minSalary,
      maxSalary,
      currency,
    );

    return new SalaryBenchmarkResult(
      role,
      location,
      `Cached market compensation estimate for ${role} in ${location} based on verified baseline data.`,
      experienceLevel ?? null,
      minSalary,
      medianSalary,
      maxSalary,
      currency,
      tiers,
      [
        {
          title: 'RecruitAI Industry Baseline Dataset',
          url: '',
          snippet: 'Aggregated benchmark cache',
        },
      ],
      recommendations,
      false,
      false,
    );
  }

  // ─── 2. Skill Demand & Tech Stack Trends ───────────────────────────────────

  /** Live skill trends for a role, with curated fallbacks. */
  async getSkillTrends(role: string): Promise<SkillTrendResult> {
    const cacheKey = `trends:${role.toLowerCase()}`;
    const cached = await this.getCache<CachedTrends>(cacheKey);
    if (isCachedKind<CachedTrends>(cached, 'trends')) {
      return trendsFromCache(cached).asCached();
    }

    if (this.isAvailable()) {
      try {
        const query = `top trending skills technologies frameworks in demand for ${role} developers 2026`;
        const payload = await this.search({
          query,
          search_depth: 'advanced',
          include_answer: 'advanced',
          include_domains: TECH_TREND_DOMAINS,
          max_results: 6,
        });

        const answer = typeof payload.answer === 'string' ? payload.answer : '';
        const results = payload.results ?? [];
        const citations = buildCitations(results, 'Tech Market Source');

        const sourceText =
          `${answer} ` +
          results
            .map((result) => (typeof result.content === 'string' ? result.content : ''))
            .join(' ');
        const { trending, emerging, declining } = this.categorizeSkillsFromText(sourceText);

        const resolvedTrending = trending.length > 0 ? trending : this.getDefaultRoleTrends(role);

        const trendResult = new SkillTrendResult(
          role,
          answer ||
            `Current 2026 market demand highlights a strong shift towards modern architectures and AI integration for ${role}.`,
          resolvedTrending.slice(0, 8),
          emerging.length > 0
            ? emerging.slice(0, 5)
            : [
                'Generative AI / LLM Tools',
                'OpenTelemetry',
                'Vector Databases',
                'Serverless Edge Functions',
              ],
          declining.length > 0
            ? declining.slice(0, 4)
            : ['Monolithic jQuery Architectures', 'Manual Deployments', 'Legacy XML APIs'],
          citations,
          true,
          false,
        );

        await this.setCache(cacheKey, trendsToCache(trendResult), 21600);
        return trendResult;
      } catch (error) {
        logger.warn(
          `Tavily live trend search failed: ${errorMessage(error)}. Falling back to cached trends.`,
          { status: 'fallback' },
        );
      }
    }

    return this.getFallbackTrends(role);
  }

  private categorizeSkillsFromText(text: string): {
    trending: string[];
    emerging: string[];
    declining: string[];
  } {
    const knownTechPool = [
      'FastAPI',
      'LangChain',
      'LangGraph',
      'LlamaIndex',
      'Pydantic v2',
      'Ruff',
      'Polars',
      'DuckDB',
      'Modal',
      'OpenTelemetry',
      'Docker',
      'Kubernetes',
      'React 19',
      'Next.js 15',
      'TypeScript 5',
      'Bun',
      'Vite',
      'TanStack Query',
      'Tailwind CSS v4',
      'Zod',
      'Supabase',
      'Drizzle ORM',
      'PostgreSQL',
      'pgvector',
      'vLLM',
      'Ollama',
      'CrewAI',
      'Terraform',
      'ArgoCD',
      'eBPF',
      'Kafka',
      'Redis',
      'GraphQL',
      'Apache Spark',
      'dbt',
      'Snowflake',
    ];

    const textLower = text.toLowerCase();
    const trending = knownTechPool.filter((tech) => textLower.includes(tech.toLowerCase()));
    const emerging = [
      'Agentic Workflows (LangGraph)',
      'DSPy / Prompt Optimization',
      'Local SLMs (Ollama / vLLM)',
      'pgvector / Hybrid Search',
    ];
    const declining = ['Legacy SOAP APIs', 'AngularJS (1.x)', 'Subversion (SVN)', 'Grunt / Gulp'];

    return { trending, emerging, declining };
  }

  private getDefaultRoleTrends(role: string): string[] {
    const roleLower = role.toLowerCase();
    if (roleLower.includes('python')) {
      return [
        'FastAPI',
        'LangChain',
        'Pydantic v2',
        'Polars',
        'Asyncio',
        'OpenTelemetry',
        'PostgreSQL',
        'Docker',
      ];
    }
    if (roleLower.includes('front') || roleLower.includes('react')) {
      return [
        'React 19',
        'Next.js 15',
        'TypeScript 5',
        'Tailwind CSS v4',
        'TanStack Query',
        'Vite',
        'Zod',
        'Server Components',
      ];
    }
    if (roleLower.includes('full')) {
      return [
        'Next.js',
        'FastAPI',
        'TypeScript',
        'PostgreSQL',
        'Docker',
        'Supabase',
        'TanStack Query',
        'Tailwind CSS',
      ];
    }
    if (roleLower.includes('devops') || roleLower.includes('cloud')) {
      return [
        'Kubernetes',
        'Terraform',
        'ArgoCD',
        'OpenTelemetry',
        'GitHub Actions',
        'AWS CDK',
        'Docker',
        'eBPF',
      ];
    }
    if (roleLower.includes('ai') || roleLower.includes('ml')) {
      return [
        'LangGraph',
        'LlamaIndex',
        'vLLM',
        'Hugging Face',
        'PyTorch',
        'pgvector',
        'FastAPI',
        'Modal',
      ];
    }
    return [
      'Cloud-native Microservices',
      'CI/CD Automation',
      'GenAI Integration',
      'Observability',
      'API-First Architecture',
    ];
  }

  private getFallbackTrends(role: string): SkillTrendResult {
    return new SkillTrendResult(
      role,
      `Cached market trend insights for ${role} reflecting modern industry demand.`,
      this.getDefaultRoleTrends(role),
      ['LangGraph / Multi-Agent Systems', 'Local SLM Inference', 'OpenTelemetry Tracing'],
      ['Legacy Monoliths', 'Manual QA Scripts', 'Old Sync Frameworks'],
      [
        {
          title: 'RecruitAI Skill Benchmark Database',
          url: '',
          snippet: 'Curated tech skills cache',
        },
      ],
      false,
      false,
    );
  }

  // ─── 3. Live Job Market & JD Discovery ─────────────────────────────────────

  /**
   * Discover active job postings. Returns `[]` when the key is missing or the
   * upstream call fails, exactly like Python's offline fallback.
   */
  async searchLiveJobs(query: string, location?: string, maxResults = 5): Promise<LiveJob[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const locationKey = location === undefined ? 'none' : location.toLowerCase();
    const cacheKey = `jobs:${query.toLowerCase()}:${locationKey}`;
    const cached = await this.getCache<LiveJob[]>(cacheKey);
    if (Array.isArray(cached)) {
      return cached;
    }

    try {
      const locationClause = location ? `in ${location}` : '';
      const searchQuery =
        `job description requirements responsibilities for ${query} ${locationClause} ` +
        'hiring 2026';

      const payload = await this.search({
        query: searchQuery,
        search_depth: 'advanced',
        include_domains: JOB_BOARD_DOMAINS,
        max_results: maxResults,
      });

      const jobs: LiveJob[] = [];
      for (const result of payload.results ?? []) {
        const title = typeof result.title === 'string' ? result.title : '';
        const content = typeof result.content === 'string' ? result.content : '';
        const url = typeof result.url === 'string' ? result.url : '';
        if (content.length > 100) {
          jobs.push({ title, description: content, url, source: 'Tavily Live Search' });
        }
      }

      if (jobs.length > 0) {
        await this.setCache(cacheKey, jobs, 3600);
      }
      return jobs;
    } catch (error) {
      logger.warn(`Tavily live job search failed: ${errorMessage(error)}`, {
        status: 'failed',
      });
      return [];
    }
  }

  // ─── 4. Recruiter Web Intelligence ─────────────────────────────────────────

  /** General web intelligence for recruiter research. */
  async searchRecruiterIntel(query: string, searchDepth = 'advanced'): Promise<WebIntelResult> {
    const cacheKey = `intel:${query.toLowerCase()}`;
    const cached = await this.getCache<CachedIntel>(cacheKey);
    if (isCachedKind<CachedIntel>(cached, 'intel')) {
      return intelFromCache(cached).asCached();
    }

    if (this.isAvailable()) {
      try {
        const payload = await this.search({
          query,
          search_depth: searchDepth === 'advanced' ? 'advanced' : 'basic',
          include_answer: 'advanced',
          max_results: 4,
        });

        let answer = typeof payload.answer === 'string' ? payload.answer : '';
        const results = payload.results ?? [];
        const citations = buildCitations(results, 'Web Source');

        if (!answer && results.length > 0) {
          answer = results
            .slice(0, 3)
            .map((result) => {
              const title = typeof result.title === 'string' ? result.title : '';
              const content = typeof result.content === 'string' ? result.content : '';
              return `- **${title}**: ${content}`;
            })
            .join('\n\n');
        }

        const intel = new WebIntelResult(
          query,
          answer || `No direct web intelligence summary found for '${query}'.`,
          citations,
          true,
          false,
        );

        await this.setCache(cacheKey, intelToCache(intel), 3600);
        return intel;
      } catch (error) {
        logger.warn(`Tavily web intel search failed: ${errorMessage(error)}`, {
          status: 'failed',
        });
      }
    }

    return new WebIntelResult(
      query,
      `Could not retrieve real-time web intelligence for '${query}'. Please ensure internet connectivity and a valid TAVILY_API_KEY.`,
      [],
      false,
      false,
    );
  }
}

let singleton: TavilyService | undefined;

/** Process-wide service mirroring `get_tavily_service()`. */
export function getTavilyService(): TavilyService {
  singleton ??= new TavilyService();
  return singleton;
}

/** Test helper: drop the memoised singleton. */
export function resetTavilyServiceForTests(): void {
  singleton = undefined;
}
