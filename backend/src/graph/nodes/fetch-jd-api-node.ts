import { fetchLiveJobDescription } from '../../services/job-desc-api.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/fetch_jd_api_node.py`.
 *
 * Extracts the role/location search parameters with the LLM (heuristic
 * fallback on failure), fetches a live JD through Tavily, and replaces the
 * active JD.
 */

const EXTRACT_SYSTEM_INSTRUCTION =
  'You are an expert HR assistant. Extract the job search query (e.g., job role title like ' +
  "'Frontend Developer', 'Python Engineer') and location (optional) from the user's request. " +
  'Return a JSON object: {"query": "role_name", "location": "location_name_or_null"}.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function fetchJdApiNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';

  let query = 'Software Engineer';
  let location: string | null = null;

  try {
    const response = await deps.callLlm(`User Request: "${userMessage}"\n\nJSON Response:`, {
      systemInstruction: EXTRACT_SYSTEM_INSTRUCTION,
      jsonMode: true,
    });
    const data = asRecord(deps.parseJsonSafely(response.text));
    if (typeof data?.query === 'string' && data.query.length > 0) {
      query = data.query;
    }
    if (typeof data?.location === 'string') {
      location = data.location;
    }
  } catch {
    // Quick heuristic fallback: take everything after "for"/"of".
    const words = userMessage.split(/\s+/);
    for (let index = 0; index < words.length; index += 1) {
      const word = (words[index] ?? '').toLowerCase();
      if ((word === 'for' || word === 'of') && index + 1 < words.length) {
        query = words.slice(index + 1).join(' ');
        break;
      }
    }
  }

  try {
    const jdStructured = await fetchLiveJobDescription(query, {
      ...(location ? { location } : {}),
      useTavily: true,
      tavilyService: deps.getTavily(),
    });

    const successMessage =
      `Successfully fetched live Job Description for **${jdStructured.role}** via API.\n\n` +
      `**Required Skills:** ${jdStructured.required_skills.join(', ')}\n` +
      `**Experience:** ${jdStructured.experience_years}+ years\n\n` +
      '### Job Description Details:\n' +
      '```text\n' +
      `${jdStructured.raw_text ?? ''}\n` +
      '```';

    return {
      jd_structured: jdStructured,
      conversation_history: [...history, { role: 'assistant', content: successMessage }],
    };
  } catch (error) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Failed to fetch live job description for '${query}' due to: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}
