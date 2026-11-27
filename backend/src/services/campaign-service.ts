import { randomUUID } from 'node:crypto';

import { getConfig, type AppConfig } from '../config/index.js';
import { createWorkspaceStore, type WorkspaceStore } from '../db/workspace-store.js';
import { buildRecruitGraph } from '../graph/builder.js';
import { getGraphDeps, type GraphDeps } from '../graph/deps.js';
import type { RecruitState, ScheduledInterview } from '../graph/state.js';
import { candidateSchema } from '../schemas/candidate.js';
import { jobDescriptionSchema } from '../schemas/jd.js';
import { clearTelemetryContext, getAllLogs, setTelemetryContext } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';
import { runWithTraceparent, withSpan } from '../telemetry/tracing.js';
import {
  persistApplications,
  persistChatMessage,
  persistInterviews,
  persistJob,
  updateSessionMetadata,
} from './persistence.js';

const logger = createLogger('recruitai.campaign_service');

/**
 * Port of `backend/app/services/campaign_service.py`.
 *
 * Session creation, context hydration and single-turn agent execution. All
 * reads and writes go through `WorkspaceStore`, keeping every query
 * tenant-scoped on both Drizzle/PostgreSQL and the SQLite fallback.
 *
 * The graph itself lives in `src/graph` and takes an injectable `GraphDeps`
 * bundle, so `executeAgentTurn` can be exercised without Gemini, Tavily or
 * Postgres.
 */

export interface CampaignServiceOptions {
  readonly config?: AppConfig;
  readonly store?: WorkspaceStore;
  /** Injectable clock; unused by hydration but kept for parity with tests. */
  readonly now?: () => Date;
  /** Injectable graph dependencies (tests / DI); defaults to the singleton. */
  readonly graphDeps?: GraphDeps;
}

export interface HydrateChatContextInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly jd: Record<string, unknown> | null;
  readonly resumes: readonly Record<string, unknown>[];
  readonly historyItems: readonly unknown[];
}

export interface HydratedChatContext {
  readonly jd: Record<string, unknown> | null;
  readonly resumes: Record<string, unknown>[];
  readonly history: Array<{ role: string; content: string }>;
}

export interface ExecuteAgentTurnInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly message: string;
  readonly jd: Record<string, unknown> | null;
  readonly resumes: readonly Record<string, unknown>[];
  readonly shortlist?: readonly Record<string, unknown>[] | null;
  readonly history?: readonly { role: string; content: string }[];
  readonly pendingConfirmation?: Record<string, unknown> | null;
  readonly lastIntent?: string | null;
  readonly scheduledInterviews?: readonly Record<string, unknown>[] | null;
  readonly focusedCandidateId?: string | null;
  /** W3C trace context serialized at enqueue time (async chat jobs). */
  readonly traceparent?: string | null;
}

export interface AgentTurnResult {
  readonly response: string;
  readonly jd_structured: Record<string, unknown> | null;
  readonly resumes: Record<string, unknown>[];
  readonly last_shortlist: Record<string, unknown>[] | null;
  readonly pending_confirmation: Record<string, unknown> | null;
  readonly last_intent: string | null;
  readonly conversation_history: Array<{ role: string; content: string }>;
  readonly router_logs: Record<string, unknown>[];
  readonly scheduled_interviews: Record<string, unknown>[] | null;
  readonly session_id: string;
}

const DEFAULT_AGENT_STEPS = ['Supervisor: Synthesized agent response'];

const DEFAULT_SUGGESTED_FOLLOWUPS = [
  'Compare our top candidates side-by-side',
  'Generate a technical interview rubric for this role',
  'Draft interview invitation email for the top candidate',
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `dict.get(key, default)` semantics: an explicit null stays null. */
function getOr(source: Record<string, unknown>, key: string, fallback: unknown): unknown {
  return Object.hasOwn(source, key) ? source[key] : fallback;
}

export class CampaignService {
  private readonly config: AppConfig;
  private readonly graphDeps: GraphDeps | undefined;
  private store: WorkspaceStore | undefined;

  constructor(options: CampaignServiceOptions = {}) {
    this.config = options.config ?? getConfig();
    this.store = options.store;
    this.graphDeps = options.graphDeps;
  }

  private getStore(): WorkspaceStore {
    this.store ??= createWorkspaceStore({ config: this.config });
    return this.store;
  }

  /**
   * Ensure a session row exists for the tenant, creating one when missing.
   * Failures are logged and still return the generated id, matching Python.
   */
  async ensureSessionExists(userId: string, sessionId?: string | null): Promise<string> {
    const resolved = sessionId || randomUUID();

    try {
      if (!(await this.getStore().sessionExists(userId, resolved))) {
        await this.getStore().insertSession({
          id: resolved,
          userId,
          title: 'New Hiring Campaign',
        });
      }
    } catch (error) {
      logger.warn(`[campaign_service] Failed to ensure session row: ${errorMessage(error)}`);
    }

    return resolved;
  }

  /**
   * Auto-hydrate JD, candidate resumes and conversation history from the
   * database when the payload omits them.
   *
   * Limits and defaults match Python: JD from the session's job, up to 50
   * candidate rows (no ordering), and the last 20 messages in ascending order.
   */
  async hydrateChatContext(input: HydrateChatContextInput): Promise<HydratedChatContext> {
    const { userId, sessionId } = input;
    let jd = input.jd;

    // 1. JD from the session's job. Python treats `None` and `{}` alike.
    if ((!jd || Object.keys(jd).length === 0) && sessionId) {
      try {
        const jobId = await this.getStore().findSessionJobId(userId, sessionId);
        if (jobId) {
          const structured = await this.getStore().findJobStructured(userId, jobId);
          if (structured && Object.keys(structured).length > 0) {
            jd = structured;
          }
        }
      } catch (error) {
        logger.warn(`[campaign_service] Auto-hydrate JD error: ${errorMessage(error)}`);
      }
    }

    // 2. Candidate resumes.
    const resumes = [...input.resumes];
    if (resumes.length === 0) {
      try {
        const rows = await this.getStore().listCandidates(userId, 50);
        for (const row of rows) {
          const metadata = row.metadata;
          resumes.push({
            candidate_id: row.id,
            name: row.fullName,
            email: row.email,
            phone: row.phone,
            raw_text: row.rawResumeText,
            skills: getOr(metadata, 'skills', []),
            work_experience: getOr(metadata, 'work_experience', []),
            education: getOr(metadata, 'education', []),
            experience_years: getOr(metadata, 'experience_years', 0),
            location: getOr(metadata, 'location', null),
            match_score: getOr(metadata, 'match_score', null),
            matched_skills: getOr(metadata, 'matched_skills', []),
            gaps: getOr(metadata, 'gaps', []),
            red_flags: getOr(metadata, 'red_flags', []),
          });
        }
      } catch (error) {
        logger.warn(`[campaign_service] Auto-hydrate candidates error: ${errorMessage(error)}`);
      }
    }

    // 3. Conversation history from the payload, then from the database.
    const history: Array<{ role: string; content: string }> = [];
    for (const item of input.historyItems) {
      if (isRecord(item)) {
        history.push({
          role: typeof item.role === 'string' ? item.role : 'user',
          content: typeof item.content === 'string' ? item.content : '',
        });
      }
    }

    if (history.length === 0 && sessionId) {
      try {
        history.push(...(await this.getStore().listChatMessages(userId, sessionId, 20)));
      } catch (error) {
        logger.warn(
          `[campaign_service] Auto-hydrate conversation history error: ${errorMessage(error)}`,
        );
      }
    }

    return { jd, resumes, history };
  }

  /**
   * Execute one agent turn end to end:
   * 1. persist the incoming user message;
   * 2. rebuild the typed state and run the multi-agent graph;
   * 3. persist artifacts best-effort (job, applications, interviews, assistant
   *    message, session metadata);
   * 4. return the serialized response payload the chat route expects.
   */
  async executeAgentTurn(input: ExecuteAgentTurnInput): Promise<AgentTurnResult> {
    // Async jobs run in a different process/async scope; resume the enqueueing
    // trace so HTTP -> enqueue -> agent nodes -> DB/external calls is one trace.
    return runWithTraceparent(input.traceparent ?? null, () =>
      withSpan('chat.agent_turn', () => this.executeAgentTurnInner(input), {
        'tenant.id': input.userId,
        'session.id': input.sessionId,
      }),
    );
  }

  private async executeAgentTurnInner(input: ExecuteAgentTurnInput): Promise<AgentTurnResult> {
    const { userId, sessionId, message } = input;
    const store = this.getStore();
    const graph = buildRecruitGraph(this.graphDeps ?? getGraphDeps());

    setTelemetryContext(userId, sessionId);

    try {
      // 1. Persist the user message (best effort, same as Python).
      await persistChatMessage(store, userId, sessionId, 'user', message);

      // 2. Reconstruct the typed models from the incoming JSON payload.
      const jdObject = input.jd ? jobDescriptionSchema.parse(input.jd) : null;
      const resumeObjects = input.resumes.map((resume) => candidateSchema.parse(resume));
      const shortlistObjects = input.shortlist
        ? input.shortlist.map((candidate) => candidateSchema.parse(candidate))
        : null;

      const conversation = [...(input.history ?? []), { role: 'user', content: message }];

      const initialState: RecruitState = {
        jd_structured: jdObject,
        resumes: resumeObjects,
        conversation_history: conversation,
        last_shortlist: shortlistObjects,
        pending_confirmation: input.pendingConfirmation ?? null,
        last_intent: input.lastIntent ?? null,
        scheduled_interviews: input.scheduledInterviews
          ? ([...input.scheduledInterviews] as ScheduledInterview[])
          : null,
        user_id: userId,
        focused_candidate_id: input.focusedCandidateId ?? null,
      };

      // 3. Run the agent graph.
      const result = await withSpan('agent.graph', () => graph.invoke(initialState));

      // 4. Serialize output models to plain JSON values.
      const jdValue = result.jd_structured ?? null;
      const responseJd = jdValue ? ({ ...jdValue } as Record<string, unknown>) : null;
      const responseResumes = (result.resumes ?? []).map(
        (candidate) => ({ ...candidate }) as Record<string, unknown>,
      );
      const responseShortlist = result.last_shortlist
        ? result.last_shortlist.map((candidate) => ({ ...candidate }) as Record<string, unknown>)
        : null;

      const history = result.conversation_history ?? [];
      const assistantContent =
        history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
      const responseHistory = history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      const logs = getAllLogs();

      // 5. Atomic, best-effort persistence.
      const jdRole = jdValue?.role ?? null;
      let jobId: string | null = null;
      if (jdValue && jdRole) {
        jobId = await persistJob(store, userId, jdValue, jdValue.raw_text ?? '');
      }

      if (jobId && result.last_shortlist) {
        await persistApplications(store, userId, jobId, result.last_shortlist);
      }

      if (result.scheduled_interviews && result.scheduled_interviews.length > 0) {
        await persistInterviews(store, userId, result.scheduled_interviews, jobId);
      }

      await persistChatMessage(store, userId, sessionId, 'assistant', assistantContent, {
        router_logs: logs,
        agent_steps: result.agent_steps ?? DEFAULT_AGENT_STEPS,
        suggested_followups: result.suggested_followups ?? DEFAULT_SUGGESTED_FOLLOWUPS,
      });

      const title = jdValue && jdRole ? `Hiring: ${jdRole}` : null;
      await updateSessionMetadata(store, userId, sessionId, {
        title,
        jobId,
        lastIntent: result.last_intent ?? null,
        pendingConfirmation: result.pending_confirmation ?? null,
      });

      return {
        response: assistantContent,
        jd_structured: responseJd,
        resumes: responseResumes,
        last_shortlist: responseShortlist,
        pending_confirmation: result.pending_confirmation ?? null,
        last_intent: result.last_intent ?? null,
        conversation_history: responseHistory,
        router_logs: logs,
        scheduled_interviews: result.scheduled_interviews
          ? result.scheduled_interviews.map(
              (interview) => ({ ...interview }) as Record<string, unknown>,
            )
          : null,
        session_id: sessionId,
      };
    } finally {
      clearTelemetryContext();
    }
  }
}

/** Build the campaign hydration service used by the chat route. */
export function createCampaignService(options: CampaignServiceOptions = {}): CampaignService {
  return new CampaignService(options);
}
