import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/web_intel_node.py`.
 *
 * Strips conversational prefixes from the request and runs a live recruiter
 * web search through Tavily, tagging the source as live or offline.
 */

const PREFIX_PATTERN =
  /^(?:please\s+)?(?:search(?:\s+the\s+web|\s+online|\s+for)?|look\s+up|google|find\s+info\s+on|tell\s+me\s+about)\s+/i;

/** Remove "search the web for", "look up", "google", ... from the request. */
export function cleanWebQuery(message: string): string {
  const query = message.trim();
  const cleaned = query.replace(PREFIX_PATTERN, '').trim();
  return cleaned.length > 2 ? cleaned : query;
}

export async function webIntelNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const searchQuery = cleanWebQuery(userMessage);

  const intel = await deps.getTavily().searchRecruiterIntel(searchQuery, 'advanced');
  const statusTag = intel.isLive
    ? '**[LIVE DATA - TAVILY WEB INTELLIGENCE]**'
    : '**[OFFLINE NOTICE]**';

  const response =
    '### 🌐 Web Intelligence Report\n' + `Source Status: ${statusTag}\n\n` + intel.toMarkdown();

  return {
    conversation_history: [...history, { role: 'assistant', content: response }],
  };
}
