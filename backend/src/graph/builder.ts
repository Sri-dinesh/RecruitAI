import {
  ENTITY_INTENTS,
  resolveCandidateWithMemory,
  resolveCandidatesWithMemory,
  routeAndLog,
} from './router.js';
import { getGraphDeps, type GraphDeps } from './deps.js';
import { END, StateGraph, type CompiledGraph } from './runtime.js';
import type { RecruitState } from './state.js';
import { historyOf } from './state.js';

import { candidateQaNode } from './nodes/candidate-qa-node.js';
import { compareNode } from './nodes/compare-node.js';
import { countNode } from './nodes/count-node.js';
import { emailNode } from './nodes/email-node.js';
import { fetchJdApiNode } from './nodes/fetch-jd-api-node.js';
import { hitlConfirmNode } from './nodes/hitl-confirm-node.js';
import { interviewQgenNode } from './nodes/interview-qgen-node.js';
import { jdRewriteNode } from './nodes/jd-rewrite-node.js';
import { parseJdNode } from './nodes/parse-jd-node.js';
import { redflagsNode } from './nodes/redflags-node.js';
import { salaryNode } from './nodes/salary-node.js';
import { scheduleNode } from './nodes/schedule-node.js';
import { screenNode } from './nodes/screen-node.js';
import { trendNode } from './nodes/trend-node.js';
import { webIntelNode } from './nodes/web-intel-node.js';

/**
 * Port of `backend/app/graph/builder.py`.
 *
 * Topology is unchanged from the Python LangGraph build: one entry point
 * (`supervisor_agent`), a single conditional jump to one of four specialist
 * groups or `hitl_confirm`/`fallback`, and every branch ending at `END`. The
 * runtime lives in `./runtime.ts` so the graph is testable without the
 * LangGraph package.
 */

const CONFIRMATION_REPLIES: ReadonlySet<string> = new Set([
  'yes',
  'confirm',
  'y',
  'go ahead',
  'sure',
  'no',
  'cancel',
  'n',
  'discard',
  'edit',
]);

const SLOT_REPLY_RE = /^(?:slot|option|number|pick|choose|select|go with)?\s*\d+\b/;

const INTERVIEW_FOLLOWUP_RE =
  /\b(for|with|about|candidate|top|all|everyone|everybody|both|jd|job description|role)\b/;
const EMAIL_FOLLOWUP_RE = /\b(for|with|about|candidate|top|all|everyone)\b/;

const FALLBACK_MESSAGE =
  "I didn't quite understand your request, or it might be outside my current capabilities. " +
  "I'm an AI recruitment assistant. Here are some of the things I can help you with:\n" +
  "1. Load a Job Description and candidate resumes (e.g. 'load JD and resumes')\n" +
  "2. Count loaded resumes (e.g. 'how many candidates do we have?')\n" +
  "3. Screen and rank candidates against the JD (e.g. 'screen candidates')\n" +
  "4. Rewrite or polish the JD (e.g. 'rewrite this JD for a startup')\n" +
  "5. Generate interview prep questions (e.g. 'interview questions for Alice' or 'questions for the JD')\n" +
  "6. Check market salary ranges (e.g. 'salary range for this role')\n" +
  "7. Finalize candidate shortlists (e.g. 'finalize the shortlist')\n\n" +
  'Could you please rephrase or clarify your request?';

/**
 * Supervisor Agent: classifies the turn, resolves conversational memory, and
 * decides whether the message answers a pending confirmation or starts a new
 * task.
 */
export async function supervisorAgentNode(state: RecruitState): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const cleanedMessage = userMessage.toLowerCase().trim();

  // 1. Classify the query (rules first, then the LLM at >= 0.6 confidence).
  const classification = await routeAndLog(userMessage, state);
  let intent = classification.intent;
  const { confidence, resolvedCandidate } = classification;

  // 2. Resolve who this turn is about. Explicit references win; otherwise
  //    pronouns / bare follow-ups inherit focus -> history -> prior turn.
  let memoryCandidate = resolveCandidateWithMemory(userMessage, state, intent);
  let memoryCandidates = resolveCandidatesWithMemory(userMessage, state);
  if (memoryCandidates.length === 0) {
    let previousIds = state.active_candidate_ids ?? [];
    const previousSingle = state.active_candidate_id ?? null;
    if (previousSingle && !previousIds.includes(previousSingle)) {
      previousIds = [previousSingle, ...previousIds];
    }
    memoryCandidates = previousIds;
  }
  if (!memoryCandidate) {
    memoryCandidate = state.active_candidate_id ?? null;
  }

  // 2b. Generic follow-up continuation: a bare follow-up for an entity intent
  //     keeps the memorized candidate instead of falling through to ask-backs.
  if (history.length >= 2) {
    const previous = history[history.length - 2];
    const lastAssistantMessage =
      previous?.role === 'assistant' ? previous.content.toLowerCase() : '';

    if (
      lastAssistantMessage.includes(
        'which candidate would you like to generate interview questions for',
      ) ||
      lastAssistantMessage.includes('interview questions')
    ) {
      if (resolvedCandidate || memoryCandidate || INTERVIEW_FOLLOWUP_RE.test(cleanedMessage)) {
        intent = 'interview_questions';
      }
    } else if (
      lastAssistantMessage.includes("couldn't identify a candidate to draft the email for") ||
      lastAssistantMessage.includes('draft the email')
    ) {
      if (resolvedCandidate || memoryCandidate || EMAIL_FOLLOWUP_RE.test(cleanedMessage)) {
        intent = 'email';
      }
    } else if (
      lastAssistantMessage.includes('which candidate would you like to check red flags for')
    ) {
      if (resolvedCandidate || memoryCandidate || EMAIL_FOLLOWUP_RE.test(cleanedMessage)) {
        intent = 'redflags';
      }
    }
  }

  // 3. A high-confidence new command discards a stale pending confirmation.
  let pending = state.pending_confirmation ?? null;
  const isConfirmationReply =
    CONFIRMATION_REPLIES.has(cleanedMessage) || SLOT_REPLY_RE.test(cleanedMessage);

  if (pending !== null && !isConfirmationReply && confidence >= 0.85) {
    pending = null;
  }

  if (pending !== null) {
    const action = typeof pending.action === 'string' ? pending.action : '';
    intent = action === 'schedule_interview' ? 'schedule' : 'finalize_shortlist';
  }

  return {
    last_intent: intent,
    pending_confirmation: pending,
    active_candidate_id: memoryCandidate,
    active_candidate_ids: memoryCandidates,
  };
}

/** JD Agent: loading, parsing, rewriting and live fetching. */
export async function jdAgentNode(
  state: RecruitState,
  deps: GraphDeps,
): Promise<Partial<RecruitState>> {
  switch (state.last_intent) {
    case 'load_context':
      return parseJdNode(state, deps);
    case 'rewrite_jd':
      return jdRewriteNode(state, deps);
    case 'fetch_jd_api':
      return fetchJdApiNode(state, deps);
    default:
      return {};
  }
}

/** Screening & RAG Agent: counts, screening, comparison, red flags and QA. */
export async function screeningAgentNode(
  state: RecruitState,
  deps: GraphDeps,
): Promise<Partial<RecruitState>> {
  switch (state.last_intent) {
    case 'screen':
      return screenNode(state, deps);
    case 'count':
      return countNode(state);
    case 'compare':
      return compareNode(state);
    case 'redflags':
      return redflagsNode(state);
    case 'query_candidate':
      return candidateQaNode(state, deps);
    default:
      return {};
  }
}

/** Interview & Salary Agent: questions, salary, email, trends, schedule, web. */
export async function interviewSalaryAgentNode(
  state: RecruitState,
  deps: GraphDeps,
): Promise<Partial<RecruitState>> {
  switch (state.last_intent) {
    case 'interview_questions':
      return interviewQgenNode(state, deps);
    case 'salary':
      return salaryNode(state, deps);
    case 'email':
      return emailNode(state);
    case 'trend':
      return trendNode(state, deps);
    case 'schedule':
      return scheduleNode(state, deps);
    case 'web_intel':
      return webIntelNode(state, deps);
    default:
      return {};
  }
}

/** Graceful safety net for unclassified or out-of-scope requests. */
export function fallbackNode(state: RecruitState): Partial<RecruitState> {
  return {
    conversation_history: [...historyOf(state), { role: 'assistant', content: FALLBACK_MESSAGE }],
    last_intent: 'other',
  };
}

/** Supervisor conditional routing. */
export function routeToSubagent(state: RecruitState): string {
  switch (state.last_intent) {
    case 'load_context':
    case 'rewrite_jd':
    case 'fetch_jd_api':
      return 'jd_agent';
    case 'screen':
    case 'count':
    case 'compare':
    case 'redflags':
    case 'query_candidate':
      return 'screening_agent';
    case 'interview_questions':
    case 'salary':
    case 'email':
    case 'trend':
    case 'schedule':
    case 'web_intel':
      return 'interview_salary_agent';
    case 'finalize_shortlist':
      return 'hitl_confirm';
    default:
      return 'fallback';
  }
}

/** Node names in registration order (Python's builder order). */
export const GRAPH_NODE_NAMES = [
  'supervisor_agent',
  'jd_agent',
  'screening_agent',
  'interview_salary_agent',
  'hitl_confirm',
  'fallback',
] as const;

/** Intents that keep entity memory across bare follow-ups (re-exported). */
export { ENTITY_INTENTS };

/**
 * Build and compile the multi-agent graph with an injectable dependency bundle.
 * Each call returns an independent compiled graph so tests can vary deps.
 */
export function buildRecruitGraph(deps: GraphDeps = getGraphDeps()): CompiledGraph<RecruitState> {
  const builder = new StateGraph<RecruitState>();

  builder.addNode('supervisor_agent', (state) => supervisorAgentNode(state));
  builder.addNode('jd_agent', (state) => jdAgentNode(state, deps));
  builder.addNode('screening_agent', (state) => screeningAgentNode(state, deps));
  builder.addNode('interview_salary_agent', (state) => interviewSalaryAgentNode(state, deps));
  builder.addNode('hitl_confirm', (state) => hitlConfirmNode(state));
  builder.addNode('fallback', (state) => fallbackNode(state));

  builder.setEntryPoint('supervisor_agent');

  builder.addConditionalEdges('supervisor_agent', routeToSubagent, {
    jd_agent: 'jd_agent',
    screening_agent: 'screening_agent',
    interview_salary_agent: 'interview_salary_agent',
    hitl_confirm: 'hitl_confirm',
    fallback: 'fallback',
  });

  builder.addEdge('jd_agent', END);
  builder.addEdge('screening_agent', END);
  builder.addEdge('interview_salary_agent', END);
  builder.addEdge('hitl_confirm', END);
  builder.addEdge('fallback', END);

  return builder.compile();
}

let compiled: CompiledGraph<RecruitState> | undefined;

/** Process-wide graph built from the default dependency bundle. */
export function getRecruitGraph(): CompiledGraph<RecruitState> {
  compiled ??= buildRecruitGraph();
  return compiled;
}

/** Test helper: drop the memoised graph so dependency changes take effect. */
export function resetRecruitGraphForTests(): void {
  compiled = undefined;
}
