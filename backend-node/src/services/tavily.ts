import { getConfig } from '../config/index.js';
import { createLogger } from '../telemetry/logger.js';

/**
 * Job-board subset of `backend/app/services/tavily_service.py`.
 *
 * Phase 9 only needs live JD discovery (`search_live_jobs`): the salary, trend
 * and recruiter-intel helpers are ported with the tools/RAG phases. The TTL
 * cache, availability rules and result filtering match the Python service.
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

export interface LiveJob {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly source: string;
}

export interface TavilyServiceOptions {
  readonly apiKey?: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  /** Epoch milliseconds clock, injectable for cache tests. */
  readonly now?: () => number;
}

interface CacheEntry {
  readonly data: LiveJob[];
  readonly expiresAt: number;
}

interface TavilySearchResponse {
  results?: Array<Record<string, unknown>>;
}

export class TavilyService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;

  constructor(options: TavilyServiceOptions = {}) {
    this.apiKey = options.apiKey ?? getConfig().llm.tavilyApiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_TAVILY_BASE_URL).replace(/\/$/, '');
    this.now = options.now ?? Date.now;
  }

  /** True when a non-placeholder Tavily key is configured. */
  isAvailable(): boolean {
    const key = (this.apiKey ?? '').trim();
    return Boolean(key) && !key.includes('your_tavily') && !key.startsWith('placeholder');
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getCache(key: string): LiveJob[] | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() < entry.expiresAt) {
      return entry.data;
    }
    this.cache.delete(key);
    return undefined;
  }

  private setCache(key: string, data: LiveJob[], ttlSeconds = 3600): void {
    if (this.cache.size > 200) {
      const now = this.now();
      for (const [cacheKey, entry] of this.cache) {
        if (entry.expiresAt <= now) {
          this.cache.delete(cacheKey);
        }
      }
    }
    this.cache.set(key, { data, expiresAt: this.now() + ttlSeconds * 1000 });
  }

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
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const locationClause = location ? `in ${location}` : '';
      const searchQuery =
        `job description requirements responsibilities for ${query} ${locationClause} ` +
        'hiring 2026';

      const response = await this.fetchImpl(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: searchQuery,
          search_depth: 'advanced',
          include_domains: JOB_BOARD_DOMAINS,
          max_results: maxResults,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error (${response.status})`);
      }

      const payload = (await response.json()) as TavilySearchResponse;
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
        this.setCache(cacheKey, jobs, 3600);
      }
      return jobs;
    } catch (error) {
      logger.warn(`Tavily live job search failed: ${errorMessage(error)}`, {
        status: 'failed',
      });
      return [];
    }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
