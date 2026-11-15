import { historyOf, resumesOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/count_node.py`.
 * Pure state inspection; intentionally never calls the LLM.
 */
export function countNode(state: RecruitState): Partial<RecruitState> {
  const history = historyOf(state);
  const resumes = resumesOf(state);
  const count = resumes.length;

  const content =
    count === 0
      ? '0 — no resumes have been loaded yet. Point me to a folder or paste JD + resumes to start.'
      : `There are currently ${count} candidate resumes loaded in the system.`;

  return {
    conversation_history: [...history, { role: 'assistant', content }],
  };
}
