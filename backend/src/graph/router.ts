import { callLlm, parseJsonSafely } from '../llm/router.js';
import { incrementTurn, logEvent } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';
import type { Candidate } from '../schemas/candidate.js';
import { historyOf } from './state.js';
import type { RecruitState } from './state.js';

/**
 * Port of `backend/app/graph/router_node.py`.
 *
 * The supervisor blends two classifiers: deterministic regex rules that cover
 * the common commands at confidence 1.0, and an LLM fallback whose answer is
 * discarded below 0.6 so the fallback node can ask for clarification. The
 * same module also owns conversational entity memory, which keeps multi-turn
 * follow-ups ("send mail" after discussing Alex) anchored to a candidate.
 */

const logger = createLogger('recruitai.router_node');

export type Intent =
  | 'load_context'
  | 'screen'
  | 'rewrite_jd'
  | 'interview_questions'
  | 'salary'
  | 'finalize_shortlist'
  | 'compare'
  | 'email'
  | 'trend'
  | 'schedule'
  | 'redflags'
  | 'fetch_jd_api'
  | 'query_candidate'
  | 'web_intel'
  | 'count'
  | 'other';

export interface RuleClassification {
  readonly intent: Intent;
  readonly confidence: number;
}

export interface LlmClassification {
  readonly intent: Intent;
  readonly confidence: number;
  readonly provider: string;
  readonly latencyMs: number;
}

export interface RouteResult {
  readonly intent: Intent;
  readonly confidence: number;
  readonly resolvedCandidate: string | null;
}

export const VALID_INTENTS: ReadonlySet<string> = new Set([
  'load_context',
  'screen',
  'rewrite_jd',
  'interview_questions',
  'salary',
  'compare',
  'email',
  'trend',
  'schedule',
  'redflags',
  'fetch_jd_api',
  'query_candidate',
  'web_intel',
  'other',
  'count',
  'finalize_shortlist',
]);

/** Intents that operate on a candidate entity; bare follow-ups inherit memory. */
export const ENTITY_INTENTS: ReadonlySet<string> = new Set([
  'email',
  'schedule',
  'interview_questions',
  'redflags',
  'compare',
  'query_candidate',
]);

const PRONOUN_RE =
  /\b(him|her|them|they|he|she|it|this person|that person|that candidate|those two|those candidates|both of them|the person|the candidate)\b/;

const PLURAL_RE =
  /\b(them|they|those two|those candidates|both of them|all of them|everyone|everybody|all candidates|both|all|them all)\b/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isIntent(value: string): value is Intent {
  return VALID_INTENTS.has(value);
}

/**
 * Quick regex classification for high-confidence intents.
 * Returns `null` when no rule matches, exactly like Python.
 */
export function ruleBasedClassify(query: string): RuleClassification | null {
  const q = (query ?? '').toLowerCase().trim();

  // 0. Numeric selection mappings (from fallback option lists).
  const numeric = q.replace(/^\.+|\.+$/g, '');
  if (numeric === '1' || numeric === 'one') {
    return { intent: 'load_context', confidence: 1.0 };
  }
  if (numeric === '2' || numeric === 'two') {
    return { intent: 'count', confidence: 1.0 };
  }
  if (numeric === '3' || numeric === 'three') {
    return { intent: 'screen', confidence: 1.0 };
  }
  if (numeric === '4' || numeric === 'four') {
    return { intent: 'rewrite_jd', confidence: 1.0 };
  }
  if (numeric === '5' || numeric === 'five') {
    return { intent: 'interview_questions', confidence: 1.0 };
  }
  if (numeric === '6' || numeric === 'six') {
    return { intent: 'salary', confidence: 1.0 };
  }
  if (numeric === '7' || numeric === 'seven') {
    return { intent: 'finalize_shortlist', confidence: 1.0 };
  }

  // Candidate details / skills / projects.
  if (
    /\b(skills|projects?|experience|education|background|roles?|tech stack|details?|info)\b.*\b(of|for|about)\b/.test(
      q,
    ) ||
    /\bwhat (skills|projects?|experience|education|background|roles?)\b/.test(q) ||
    /\b(tell me about|who is|show details|describe)\b/.test(q)
  ) {
    return { intent: 'query_candidate', confidence: 1.0 };
  }

  // 1. load_context.
  if (
    /\b(load|parse|read|ingest|import)\b.*\b(jd|job description|resume|cv|candidate|resumes|context)\b/.test(
      q,
    ) ||
    /\b(jd|job description|resume|cv|candidate|resumes|context)\b.*\b(load|parse|read|ingest|import)\b/.test(
      q,
    )
  ) {
    return { intent: 'load_context', confidence: 1.0 };
  }

  // 2. count.
  if (/\b(how many|count of|number of|how many (candidates|resumes|applicants))\b/.test(q)) {
    return { intent: 'count', confidence: 1.0 };
  }

  // 3. screen.
  if (
    /\b(screen|rank|evaluate|find top|get top|top candidate|filter|match)\b.*\b(candidate|resume|applicant|resumes)\b/.test(
      q,
    ) ||
    /\b(candidate|resume|applicant|resumes)\b.*\b(screen|rank|evaluate|find top|get top|top candidate|filter|match)\b/.test(
      q,
    ) ||
    q === 'screen' ||
    q === 'screen candidates' ||
    q === 'rank candidates'
  ) {
    return { intent: 'screen', confidence: 1.0 };
  }

  // 4. finalize_shortlist.
  if (/\b(finalize|lock in|go with these|finalize shortlist)\b/.test(q)) {
    return { intent: 'finalize_shortlist', confidence: 1.0 };
  }

  // 5. compare.
  if (/\b(compare|side.by.side|vs|versus)\b/.test(q)) {
    return { intent: 'compare', confidence: 1.0 };
  }

  // 6. email / outreach ("mail" covers "send mail", "mail them", "mail Alex").
  if (/\b(e-?mail|draft|send e-?mail|send mail|write e-?mail|outreach)\b/.test(q)) {
    return { intent: 'email', confidence: 1.0 };
  }

  // 7. skill trend.
  if (/\b(trend|trending|in.demand|market skill|skill trend)\b/.test(q)) {
    return { intent: 'trend', confidence: 1.0 };
  }

  // 8. schedule / calendar.
  if (/\b(schedule|calendar|book|interview time|slot)\b/.test(q)) {
    return { intent: 'schedule', confidence: 1.0 };
  }

  // 9. red flags.
  if (/\b(red flag|gap|inconsistent|suspicious|resume issue)\b/.test(q)) {
    return { intent: 'redflags', confidence: 1.0 };
  }

  // 10. fetch live JD.
  if (
    /\b(fetch|get|pull|search|benchmark)\b.*\b(jd|job description|jobs)\b.*\b(api|internet|web|online|live|tavily)\b/.test(
      q,
    ) ||
    /\b(api|internet|web|online|live|tavily)\b.*\b(fetch|get|pull|search|benchmark)\b.*\b(jd|job description|jobs)\b/.test(
      q,
    )
  ) {
    return { intent: 'fetch_jd_api', confidence: 1.0 };
  }

  // 11. rewrite_jd.
  if (
    /\b(rewrite|polish|improve|startup tone)\b.*\b(jd|job description|role)\b/.test(q) ||
    /\b(jd|job description)\b.*\b(rewrite|polish|improve|startup tone)\b/.test(q)
  ) {
    return { intent: 'rewrite_jd', confidence: 1.0 };
  }

  // 12. interview_questions.
  if (
    /\b(interview|prep|preparation|practice)\b.*\b(question|questions|prep)\b/.test(q) ||
    /\b(question|questions)\b.*\b(interview|prep|candidate)\b/.test(q)
  ) {
    return { intent: 'interview_questions', confidence: 1.0 };
  }

  // 13. salary.
  if (
    /\b(salary|compensation|market pay|pay range|salary range|package|remuneration|ctc)\b/.test(q)
  ) {
    return { intent: 'salary', confidence: 1.0 };
  }

  // 14. web_intel.
  if (
    /\b(search the web|search online|look up on web|web search|market intelligence|search internet)\b/.test(
      q,
    )
  ) {
    return { intent: 'web_intel', confidence: 1.0 };
  }

  // 15. simple greeting or fallback.
  if (['hi', 'hello', 'hey', 'who are you', 'help'].includes(q)) {
    return { intent: 'other', confidence: 1.0 };
  }

  return null;
}

/** Build the same application-state context Python injects into the prompt. */
function classificationContext(state?: RecruitState): string {
  if (!state) {
    return '';
  }

  const jd = state.jd_structured;
  const resumes = state.resumes ?? [];
  const history = historyOf(state);

  let context = 'Current Application State:\n';
  if (jd) {
    context += `- Active JD Role: ${jd.role}\n`;
  }
  if (resumes.length > 0) {
    context += `- Loaded Candidates: ${resumes.map((candidate) => candidate.name).join(', ')}\n`;
  }
  context += '\n';

  if (history.length > 1) {
    context += 'Recent conversation history:\n';
    const start = Math.max(history.length - 4, 0);
    const end = Math.max(history.length - 1, 0);
    for (const message of history.slice(start, end)) {
      context += `${message.role.toUpperCase()}: ${message.content}\n`;
    }
    context += '\n';
  }

  return context;
}

const LLM_SYSTEM_INSTRUCTION =
  'You are the routing and classification node for a recruitment agent. ' +
  "Classify the user's query into one of the following intents:\n" +
  "- load_context: Ingest or load a job description (JD) or candidate resumes (e.g. 'here is the JD', 'load resumes')\n" +
  "- screen: Rank/evaluate candidates against the JD (e.g. 'who matches best', 'rank applicants', 'screen candidates')\n" +
  "- rewrite_jd: Rewrite or edit the JD (e.g. 'rewrite this JD for a startup', 'shorten the job description')\n" +
  "- interview_questions: Generate prep questions for a candidate (e.g. 'interview questions for Alice', 'prep questions for the top candidate')\n" +
  "- salary: Get salary market benchmarks (e.g. 'what is the salary for this role', 'salary range in India')\n" +
  "- compare: Compare candidates side-by-side in a table (e.g. 'compare top candidates', 'show me a comparison table')\n" +
  "- email: Draft or send a recruiter email (e.g. 'draft an interview invite for Alice', 'write a rejection email for Bob')\n" +
  "- trend: Analyze trending skills or market demand (e.g. 'what skills are trending for Python developers', 'skill trends for this role')\n" +
  "- schedule: Schedule or book an interview slot (e.g. 'schedule an interview with Alice', 'book a meeting with the top candidate')\n" +
  "- redflags: Detect red flags or issues in resumes (e.g. 'check for red flags', 'any gaps in resumes', 'resume issues')\n" +
  "- fetch_jd_api: Fetch live job descriptions from external APIs (e.g. 'fetch JD for Frontend Developer via API', 'get job description for python from internet')\n" +
  "- query_candidate: Ask specific questions about candidate skills, projects, experience, education, or background (e.g. 'what are the skills of X', 'what projects did X work on')\n" +
  "- web_intel: Search the web for company background, tech stack vetting, market intelligence, or external info (e.g. 'search the web for...', 'tell me about Stripe')\n" +
  '- other: Greetings, chit-chat, clarify, or unclassified queries.\n\n' +
  'Return a JSON object: {"intent": "<intent>", "confidence": <float_0_to_1>}.';

/** LLM classification fallback. Provider failures degrade to `other`/0.5. */
export async function llmClassify(query: string, state?: RecruitState): Promise<LlmClassification> {
  const context = classificationContext(state);
  const prompt = `${context}User Query: "${query}"\n\nJSON Response:`;

  try {
    const response = await callLlm(prompt, {
      systemInstruction: LLM_SYSTEM_INSTRUCTION,
      jsonMode: true,
    });
    const parsed = asRecord(parseJsonSafely(response.text));
    const rawIntent = typeof parsed?.intent === 'string' ? parsed.intent : 'other';
    const intent: Intent = isIntent(rawIntent) ? rawIntent : 'other';
    const rawConfidence = parsed?.confidence;
    const confidence =
      typeof rawConfidence === 'number' ? rawConfidence : Number(rawConfidence ?? 0.5);

    if (!Number.isFinite(confidence)) {
      return {
        intent: 'other',
        confidence: 0.5,
        provider: response.provider,
        latencyMs: response.latencyMs,
      };
    }

    return {
      intent,
      confidence,
      provider: response.provider,
      latencyMs: response.latencyMs,
    };
  } catch (error) {
    logger.warn(
      `Router LLM classification failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 'failed' },
    );
    return { intent: 'other', confidence: 0.5, provider: 'none', latencyMs: 0.0 };
  }
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s,.\-_]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministically resolve names, ordinals ("the top candidate") and the
 * single-candidate fallback against the shortlist or loaded resumes.
 */
export function resolveCandidateReference(query: string, state: RecruitState): string | null {
  const q = (query ?? '').toLowerCase().trim();
  const lastShortlist = state.last_shortlist ?? null;
  let allResumes = state.resumes ?? [];

  if (allResumes.length === 0 && lastShortlist) {
    allResumes = lastShortlist;
  }
  if (allResumes.length === 0) {
    return null;
  }

  // 1. Direct name match across the full name and individual tokens.
  for (const candidate of allResumes) {
    const nameLower = candidate.name.toLowerCase();
    if (nameLower && q.includes(nameLower)) {
      return candidate.candidate_id;
    }
    for (const part of nameTokens(candidate.name)) {
      if (new RegExp(`\\b${escapeRegExp(part)}\\b`).test(q)) {
        return candidate.candidate_id;
      }
    }
  }

  // 2. Ordinal mentions in the shortlist / loaded resumes.
  const candidatesList = lastShortlist ?? allResumes;
  if (candidatesList.length > 0) {
    if (/\b(top candidate|first candidate|best match|first one|number one|no\.? 1)\b/.test(q)) {
      return candidatesList[0]?.candidate_id ?? null;
    }
    if (
      candidatesList.length > 1 &&
      /\b(second candidate|second one|runner up|no\.? 2)\b/.test(q)
    ) {
      return candidatesList[1]?.candidate_id ?? null;
    }
    if (candidatesList.length > 2 && /\b(third candidate|third one|no\.? 3)\b/.test(q)) {
      return candidatesList[2]?.candidate_id ?? null;
    }
  }

  // 3. Fallback: one loaded candidate and a brief query.
  if (allResumes.length === 1 && q.split(/\s+/).filter(Boolean).length <= 4) {
    return allResumes[0]?.candidate_id ?? null;
  }

  return null;
}

/** All candidate ids referenced in text, in mention order (deduplicated). */
export function candidateIdsInText(text: string, resumes: readonly Candidate[]): string[] {
  if (!text || resumes.length === 0) {
    return [];
  }
  const q = text.toLowerCase();
  const ordered: string[] = [];

  for (const candidate of resumes) {
    const nameLower = candidate.name.toLowerCase();
    let matched = false;

    if (nameLower && q.includes(nameLower)) {
      matched = true;
    } else {
      for (const part of nameTokens(candidate.name)) {
        if (new RegExp(`\\b${escapeRegExp(part)}\\b`).test(q)) {
          matched = true;
          break;
        }
      }
    }

    if (matched && !ordered.includes(candidate.candidate_id)) {
      ordered.push(candidate.candidate_id);
    }
  }

  return ordered;
}

/** Recently mentioned candidate ids, newest first, skipping the current turn. */
export function mostRecentMentionedIds(
  history: RecruitState['conversation_history'],
  resumes: readonly Candidate[],
  limit = 2,
): string[] {
  if (!history || history.length === 0 || resumes.length === 0) {
    return [];
  }

  const seen: string[] = [];
  for (const message of [...history.slice(0, -1)].reverse()) {
    const content = typeof message?.content === 'string' ? message.content : '';
    for (const candidateId of candidateIdsInText(content, resumes)) {
      if (!seen.includes(candidateId)) {
        seen.push(candidateId);
        if (seen.length >= limit) {
          return seen;
        }
      }
    }
  }
  return seen;
}

/**
 * Memory-aware single-candidate resolution. Priority:
 * 1. explicit reference in the current message;
 * 2. pronoun/anaphora -> recent history, then focus, then active;
 * 3. bare follow-up for an entity intent -> focus, history, active;
 * 4. legacy single-candidate fallback.
 */
export function resolveCandidateWithMemory(
  query: string,
  state: RecruitState,
  intent?: string | null,
): string | null {
  const resumes = state.resumes ?? [];
  const history = historyOf(state);

  // 1. Explicit reference wins and is authoritative.
  const explicit = resolveCandidateReference(query, state);
  if (explicit) {
    return explicit;
  }

  const focused = state.focused_candidate_id ?? null;
  const active = state.active_candidate_id ?? null;
  const q = (query ?? '').toLowerCase().trim();
  const hasPronoun = PRONOUN_RE.test(q);
  const needsEntity = intent ? ENTITY_INTENTS.has(intent) : true;
  const isLoaded = (candidateId: string | null): boolean =>
    Boolean(candidateId) && resumes.some((candidate) => candidate.candidate_id === candidateId);

  // 2. Pronoun/anaphora -> history first, then focus.
  if (hasPronoun) {
    const recent = mostRecentMentionedIds(history, resumes, 1);
    if (recent.length > 0) {
      return recent[0] ?? null;
    }
    if (focused && isLoaded(focused)) {
      return focused;
    }
    if (active && isLoaded(active)) {
      return active;
    }
  }

  // 3. Bare follow-up for entity intents inherits memory silently.
  if (needsEntity) {
    if (focused && isLoaded(focused)) {
      return focused;
    }
    const recent = mostRecentMentionedIds(history, resumes, 1);
    if (recent.length > 0) {
      return recent[0] ?? null;
    }
    if (active && isLoaded(active)) {
      return active;
    }
  }

  // 4. Legacy fallback: single loaded candidate + very short query.
  if (resumes.length === 1 && q.split(/\s+/).filter(Boolean).length <= 4) {
    return resumes[0]?.candidate_id ?? null;
  }

  return null;
}

/**
 * Memory-aware multi-candidate resolution (compare flows, "mail them").
 * Returns ordered candidate ids, possibly empty.
 */
export function resolveCandidatesWithMemory(query: string, state: RecruitState): string[] {
  const resumes = state.resumes ?? [];
  const history = historyOf(state);
  if (resumes.length === 0) {
    return [];
  }

  // 1. All explicit mentions in the current message.
  const explicit = candidateIdsInText(query, resumes);
  if (explicit.length > 0) {
    return explicit;
  }

  const q = (query ?? '').toLowerCase().trim();

  // 2. Plural reference -> recent discussion set, then active set.
  if (PLURAL_RE.test(q)) {
    const recent = mostRecentMentionedIds(history, resumes, 4);
    if (recent.length > 0) {
      return recent;
    }
    const activeIds = (state.active_candidate_ids ?? []).filter((candidateId) =>
      resumes.some((candidate) => candidate.candidate_id === candidateId),
    );
    if (activeIds.length > 0) {
      return activeIds;
    }
  }

  // 3. Fall back to single memory.
  const single = resolveCandidateWithMemory(query, state);
  return single ? [single] : [];
}

/**
 * Route a message through rules, then the LLM, applying the 0.6 confidence
 * gate, resolving candidate references, and logging one telemetry event.
 */
export async function routeAndLog(query: string, state: RecruitState): Promise<RouteResult> {
  incrementTurn();

  const ruleResult = ruleBasedClassify(query);
  if (ruleResult) {
    logEvent(ruleResult.intent, {
      confidence: ruleResult.confidence,
      provider: 'rules',
      latencyMs: 0.0,
      node: 'router_node',
    });
    return {
      intent: ruleResult.intent,
      confidence: ruleResult.confidence,
      resolvedCandidate: resolveCandidateReference(query, state),
    };
  }

  const classification = await llmClassify(query, state);
  logEvent(classification.intent, {
    confidence: classification.confidence,
    provider: classification.provider,
    latencyMs: classification.latencyMs,
    node: 'router_node',
  });

  if (classification.confidence < 0.6) {
    // Route low-confidence answers to `other` so the fallback clarifies.
    return {
      intent: 'other',
      confidence: classification.confidence,
      resolvedCandidate: null,
    };
  }

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    resolvedCandidate: resolveCandidateReference(query, state),
  };
}
