import { getTavilyService, type TavilyService } from '../services/tavily.js';

/**
 * Port of `backend/app/tools/skill_trend_tool.py`.
 *
 * Python declares this as a LangChain `@tool`; the migration deliberately does
 * not add LangChain. The function below is the portable behavior, and the
 * `skillTrendTool` descriptor keeps the same `name`/`description`/`invoke`
 * surface for callers that treated tools as objects.
 */

export interface SkillTrendToolOptions {
  readonly tavilyService?: TavilyService;
}

/** Search trending skills for a role and return the rendered markdown. */
export async function searchSkillTrends(
  role: string,
  options: SkillTrendToolOptions = {},
): Promise<string> {
  const service = options.tavilyService ?? getTavilyService();
  const trends = await service.getSkillTrends(role);
  return trends.toMarkdown();
}

export const skillTrendTool = {
  name: 'search_skill_trends',
  description: 'Search for trending skills for a given developer/engineering role using Tavily.',
  invoke: searchSkillTrends,
} as const;
