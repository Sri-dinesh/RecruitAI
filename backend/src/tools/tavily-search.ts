import { getTavilyService, type TavilyService } from '../services/tavily.js';

/**
 * Port of `backend/app/tools/tavily_search.py`.
 *
 * Returns `(resultText, isLive)` like the Python function: the rendered salary
 * briefing plus whether Tavily answered live or the cached fallback ran.
 */

export interface SalarySearchOptions {
  readonly tavilyService?: TavilyService;
}

export async function searchSalaryData(
  role: string,
  location = 'India',
  options: SalarySearchOptions = {},
): Promise<readonly [string, boolean]> {
  const service = options.tavilyService ?? getTavilyService();
  const benchmark = await service.getSalaryBenchmark(role, location);
  return [benchmark.toMarkdown(), benchmark.isLive] as const;
}
