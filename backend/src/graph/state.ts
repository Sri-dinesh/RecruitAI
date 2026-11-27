import type { Candidate } from '../schemas/candidate.js';
import type { JobDescription } from '../schemas/jd.js';

/**
 * Port of `backend/app/graph/state.py::RecruitState` (TypedDict, total=False).
 *
 * Every field is optional because LangGraph starts from a partial state and
 * nodes merge in only what they change. Lists and objects stay plain JSON
 * values: Python's Pydantic models are already frozen at the service boundary
 * and need no `model_dump()` step in TypeScript.
 */

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp?: string | null;
}

export interface ScheduledInterview {
  candidate_id?: string | null;
  candidate_name?: string | null;
  slot?: string | null;
  booked_at?: string | null;
  mode?: string | null;
  duration_minutes?: number | null;
  [key: string]: unknown;
}

export type PendingConfirmation = Record<string, unknown>;

export interface RecruitState {
  jd_structured?: JobDescription | null;
  resumes?: Candidate[];
  conversation_history?: ConversationMessage[];
  last_shortlist?: Candidate[] | null;
  pending_confirmation?: PendingConfirmation | null;
  last_intent?: string | null;
  scheduled_interviews?: ScheduledInterview[] | null;
  user_id?: string | null;
  /** Candidate(s) in focus, resolved fresh each turn. */
  active_candidate_id?: string | null;
  active_candidate_ids?: string[] | null;
  /** Client-provided focus (open inspector / @-mention). */
  focused_candidate_id?: string | null;
  /** Optional metadata consumed by the chat response (Python defaults them). */
  agent_steps?: string[] | null;
  suggested_followups?: string[] | null;
}

/** Conversation history is always present in node code; Python defaults to `[]`. */
export function historyOf(state: RecruitState): ConversationMessage[] {
  return state.conversation_history ?? [];
}

/** Resumes are always present in node code; Python defaults to `[]`. */
export function resumesOf(state: RecruitState): Candidate[] {
  return state.resumes ?? [];
}

/** The latest user message, or an empty string when history is empty. */
export function latestUserMessage(state: RecruitState): string {
  const history = historyOf(state);
  return history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
}
