import { jobDescriptionSchema } from '../../schemas/jd.js';
import { historyOf, resumesOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/hitl_confirm_node.py`.
 *
 * Human-in-the-loop gate for critical actions. The first call proposes the
 * action and stores it in `pending_confirmation`; the next reply is interpreted
 * as yes / no / edit and mutates the shortlist or active JD accordingly.
 */

const CONFIRM_REPLIES: ReadonlySet<string> = new Set(['yes', 'confirm', 'y', 'go ahead', 'sure']);

const REJECT_REPLIES: ReadonlySet<string> = new Set(['no', 'cancel', 'n', 'discard']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function hitlConfirmNode(state: RecruitState): Partial<RecruitState> {
  const history = historyOf(state);
  const userMessage =
    history.length > 0 ? (history[history.length - 1]?.content ?? '').trim().toLowerCase() : '';
  const pendingRecord = asRecord(state.pending_confirmation);
  // Python's `if not pending` also treats an empty dict as "no pending gate".
  const pending = pendingRecord && Object.keys(pendingRecord).length > 0 ? pendingRecord : null;

  // --- Case 1: initiating a confirmation request ---
  if (!pending) {
    const shortlist = state.last_shortlist ?? null;
    if (!shortlist || shortlist.length === 0) {
      return {
        conversation_history: [
          ...history,
          {
            role: 'assistant',
            content:
              'No shortlist has been screened yet. Please ask me to screen candidates first.',
          },
        ],
      };
    }

    const names = shortlist.map((candidate) => candidate.name);
    const pendingData = {
      action: 'finalize_shortlist',
      payload: shortlist.map((candidate) => candidate.candidate_id),
    };

    const confirmMessage =
      `You're about to finalize ${shortlist.length} candidates: ${names.join(', ')}.\n` +
      'Confirm? (yes/no/edit)';

    return {
      pending_confirmation: pendingData,
      conversation_history: [...history, { role: 'assistant', content: confirmMessage }],
    };
  }

  // --- Case 2: processing the user's reply ---
  const action = typeof pending.action === 'string' ? pending.action : '';
  const payload = stringIds(pending.payload);

  // 2.1 Confirmation.
  if (CONFIRM_REPLIES.has(userMessage)) {
    if (action === 'finalize_shortlist') {
      const resumes = resumesOf(state);
      const committedNames: string[] = [];
      for (const candidateId of payload) {
        const candidate = resumes.find((entry) => entry.candidate_id === candidateId);
        if (candidate) {
          committedNames.push(candidate.name);
        }
      }

      const content =
        `[SUCCESS] **Shortlist Finalized**: Locked in ${committedNames.length} candidates: ` +
        `${committedNames.join(', ')}.`;
      return {
        pending_confirmation: null,
        conversation_history: [...history, { role: 'assistant', content }],
      };
    }

    if (action === 'replace_jd') {
      const newJd = jobDescriptionSchema.parse(asRecord(pending.payload) ?? {});
      const content = `[SUCCESS] **Job Description Updated**: Successfully set active JD to **${newJd.role}**.`;
      return {
        jd_structured: newJd,
        pending_confirmation: null,
        conversation_history: [...history, { role: 'assistant', content }],
      };
    }
  }

  // 2.2 Rejection.
  if (REJECT_REPLIES.has(userMessage)) {
    return {
      pending_confirmation: null,
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `[CANCELLED]: Proposed changes for '${action}' have been discarded.`,
        },
      ],
    };
  }

  // 2.3 Edits / specific exclusions.
  if (
    userMessage.includes('edit') ||
    userMessage.includes('remove') ||
    userMessage.includes('exclude') ||
    userMessage.includes('except')
  ) {
    if (action === 'finalize_shortlist') {
      const resumes = resumesOf(state);
      const shortlist = state.last_shortlist ?? [];
      const newPayload: string[] = [];
      let excludedAny = false;

      for (const candidateId of payload) {
        const candidate = resumes.find((entry) => entry.candidate_id === candidateId);
        if (!candidate) {
          continue;
        }

        const firstName = candidate.name.split(/\s+/)[0]?.toLowerCase() ?? '';
        const fullName = candidate.name.toLowerCase();
        const excluded =
          userMessage.includes(`remove ${firstName}`) ||
          userMessage.includes(`remove ${fullName}`) ||
          userMessage.includes(`exclude ${firstName}`) ||
          userMessage.includes(`except ${firstName}`);

        if (excluded) {
          excludedAny = true;
          continue;
        }
        newPayload.push(candidateId);
      }

      if (excludedAny) {
        const newShortlist = shortlist.filter((candidate) =>
          newPayload.includes(candidate.candidate_id),
        );
        const names = newShortlist.map((candidate) => candidate.name);
        return {
          last_shortlist: newShortlist,
          pending_confirmation: { action: 'finalize_shortlist', payload: newPayload },
          conversation_history: [
            ...history,
            {
              role: 'assistant',
              content:
                `Updated shortlist. You're about to finalize ${newShortlist.length} candidates: ` +
                `${names.join(', ')}.\nConfirm? (yes/no/edit)`,
            },
          ],
        };
      }
    }

    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            "Please reply with 'yes' to confirm, 'no' to cancel, or specify edits " +
            "(e.g. 'remove Bob' for the shortlist).",
        },
      ],
    };
  }

  // 2.4 Unrecognised reply.
  return {
    conversation_history: [
      ...history,
      {
        role: 'assistant',
        content:
          "I didn't quite catch that. Please reply with 'yes' to confirm, 'no' to cancel, " +
          "or specify edits (e.g. 'remove Bob').",
      },
    ],
  };
}
