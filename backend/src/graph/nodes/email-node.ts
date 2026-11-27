import { draftRecruiterEmail } from '../../tools/email-tool.js';
import { resolveCandidateWithMemory } from '../router.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/email_node.py`.
 *
 * Resolves the candidate from conversational memory, extracts the action from
 * the message, and renders the draft in the same fenced block the Python node
 * returns.
 */

function extractCandidateName(query: string, state: RecruitState): string | null {
  const resumes = state.resumes ?? state.last_shortlist ?? [];

  // Supervisor already memory-resolved this turn; trust it first.
  const activeId = state.active_candidate_id ?? null;
  if (activeId) {
    const candidate = resumes.find((entry) => entry.candidate_id === activeId);
    if (candidate) {
      return candidate.name;
    }
  }

  const resolvedId = resolveCandidateWithMemory(query, state, 'email');
  if (resolvedId) {
    const candidate = resumes.find((entry) => entry.candidate_id === resolvedId);
    if (candidate) {
      return candidate.name;
    }
  }

  // Attempt regex extraction of any capitalized name pattern.
  const match = /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/.exec(query);
  return match?.[1] ?? null;
}

function extractAction(query: string): string {
  const q = query.toLowerCase();
  if (['reject', 'decline', 'not moving forward', 'no'].some((keyword) => q.includes(keyword))) {
    return 'rejection';
  }
  if (['offer', 'hire', 'accept'].some((keyword) => q.includes(keyword))) {
    return 'offer';
  }
  return 'interview invite';
}

function titleCaseAction(action: string): string {
  return action
    .split(' ')
    .map((word) => (word.length > 0 ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}` : word))
    .join(' ');
}

export async function emailNode(state: RecruitState): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const jd = state.jd_structured ?? null;

  const role = jd?.role ?? 'the position';
  const candidateName = extractCandidateName(userMessage, state);

  if (!candidateName) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            "I couldn't identify a candidate to draft the email for. " +
            "Please mention the candidate's name (e.g. 'draft an interview invite email for Alice').",
        },
      ],
    };
  }

  const action = extractAction(userMessage);

  let emailDraft: string;
  try {
    emailDraft = await draftRecruiterEmail(candidateName, role, action);
  } catch (error) {
    emailDraft =
      `Subject: ${titleCaseAction(action)} - ${role} Position\n\n` +
      `Dear ${candidateName},\n\n` +
      `Please note this is a fallback draft due to: ${
        error instanceof Error ? error.message : String(error)
      }\n\n` +
      'Best regards,\nThe Recruiting Team';
  }

  const response =
    `### ✉️ Email Draft: **${titleCaseAction(action)}** for **${candidateName}**\n\n` +
    `\`\`\`\n${emailDraft}\n\`\`\`\n\n` +
    '*Review and customize before sending.*';

  return {
    conversation_history: [...history, { role: 'assistant', content: response }],
  };
}
