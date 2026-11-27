import type { Candidate } from '../../schemas/candidate.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/compare_node.py`.
 *
 * Builds a side-by-side markdown table of shortlisted candidates (or the named
 * candidates from the message), comparing score, matched skills, gaps and
 * experience.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCandidatesFromQuery(query: string, candidates: readonly Candidate[]): Candidate[] {
  const q = query.toLowerCase();
  const matched: Candidate[] = [];

  for (const candidate of candidates) {
    const firstName = candidate.name.split(/\s+/)[0]?.toLowerCase() ?? '';
    const fullName = candidate.name.toLowerCase();
    const firstNameMatches =
      firstName.length > 0 && new RegExp(`\\b${escapeRegExp(firstName)}\\b`).test(q);
    const fullNameMatches =
      fullName.length > 0 && new RegExp(`\\b${escapeRegExp(fullName)}\\b`).test(q);
    if (firstNameMatches || fullNameMatches) {
      matched.push(candidate);
    }
  }

  return matched.length > 0 ? matched : [...candidates];
}

export function compareNode(state: RecruitState): Partial<RecruitState> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';

  // Prefer the last shortlist; fall back to all loaded resumes.
  const candidates = state.last_shortlist ?? state.resumes ?? [];

  if (candidates.length === 0) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            'No candidates available to compare. Please screen candidates first or load resumes.',
        },
      ],
    };
  }

  const selected = resolveCandidatesFromQuery(userMessage, candidates);

  const tableLines = [
    '### 📊 Candidate Comparison Table\n',
    '| # | Name | Match Score | Matched Skills | Skill Gaps | Experience |',
    '|---|------|------------|----------------|------------|------------|',
  ];

  selected.forEach((candidate, index) => {
    const score =
      candidate.match_score !== null && candidate.match_score !== undefined
        ? `${Math.round(candidate.match_score)}/100`
        : 'N/A';
    const skills =
      candidate.matched_skills && candidate.matched_skills.length > 0
        ? candidate.matched_skills.join(', ')
        : '—';
    const gaps = candidate.gaps && candidate.gaps.length > 0 ? candidate.gaps.join(', ') : '—';
    const experience =
      candidate.experience_years !== null && candidate.experience_years !== undefined
        ? `${candidate.experience_years.toFixed(1)} yrs`
        : 'N/A';

    tableLines.push(
      `| ${index + 1} | **${candidate.name}** | ${score} | ${skills} | ${gaps} | ${experience} |`,
    );
  });

  let comparison = tableLines.join('\n');

  if (selected.length > 1 && selected.some((candidate) => candidate.match_score !== null)) {
    let best = selected[0] as Candidate;
    for (const candidate of selected) {
      if ((candidate.match_score ?? 0.0) > (best.match_score ?? 0.0)) {
        best = candidate;
      }
    }
    comparison += `\n\n> 🏆 **Top Candidate**: **${best.name}** with a score of **${Math.round(
      best.match_score ?? 0,
    )}/100**.`;
  }

  return {
    conversation_history: [...history, { role: 'assistant', content: comparison }],
  };
}
