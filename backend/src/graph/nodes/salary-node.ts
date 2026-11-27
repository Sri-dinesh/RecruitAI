import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/salary_node.py`.
 *
 * Resolves role/location/seniority from the query or active JD and renders the
 * Tavily compensation briefing with a live/offline status tag.
 */

export async function salaryNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const jd = state.jd_structured ?? null;
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const userMessageLower = userMessage.toLowerCase();

  // 1. Resolve the role title.
  let role: string | null = null;
  const match =
    /(?:salary|compensation|pay|rate|package)\s+(?:expectations|range|for|of)?\s+([a-zA-Z\s-]+)/i.exec(
      userMessage,
    );
  if (match?.[1]) {
    const extracted = match[1].trim();
    // Drop trailing query tokens like 'in india', 'in us', '2026'.
    const cleaned = extracted
      .replace(/\b(in|for|at|around|202\d|india|us|usa|uk)\b.*$/i, '')
      .trim();
    if (cleaned.length > 2) {
      role = cleaned;
    }
  }

  if (!role && jd) {
    role = jd.role;
  }

  if (!role) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            "I need a Job Description loaded first to benchmark salary, or you can ask me explicitly (e.g. 'what is the salary for a Technical Recruiter?').",
        },
      ],
    };
  }

  // 2. Resolve the location.
  let location = 'India';
  if (
    ['us', 'united states', 'america', 'usa', 'nyc', 'sf', 'california', 'texas'].some((token) =>
      userMessageLower.includes(token),
    )
  ) {
    location = 'US';
  } else if (['uk', 'united kingdom', 'london'].some((token) => userMessageLower.includes(token))) {
    location = 'UK';
  } else if (
    ['india', 'inr', 'bangalore', 'bengaluru', 'delhi', 'mumbai', 'hyderabad', 'pune'].some(
      (token) => userMessageLower.includes(token),
    )
  ) {
    location = 'India';
  }

  // 3. Detect experience level.
  const experienceMatch = /\b(entry|junior|mid|senior|lead|staff|principal)\b/.exec(
    userMessageLower,
  );
  const experienceLevel = experienceMatch?.[1]
    ? `${experienceMatch[1][0]?.toUpperCase() ?? ''}${experienceMatch[1].slice(1)}`
    : null;

  // 4. Query the Tavily service.
  const benchmark = await deps.getTavily().getSalaryBenchmark(role, location, experienceLevel);

  const statusTag = benchmark.isLive
    ? '**[LIVE DATA - TAVILY REAL-TIME SEARCH]**'
    : '**[OFFLINE DATA - CACHED FALLBACK]**';

  const response =
    `### Salary Benchmark: **${role}** (${location})\n` +
    `Source Status: ${statusTag}\n\n` +
    benchmark.toMarkdown();

  return {
    conversation_history: [...history, { role: 'assistant', content: response }],
  };
}
