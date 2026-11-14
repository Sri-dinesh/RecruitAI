import { randomUUID } from 'node:crypto';

import { getConfig, type AppConfig } from '../config/index.js';
import { createWorkspaceStore, type WorkspaceStore } from '../db/workspace-store.js';
import { createLogger } from '../telemetry/logger.js';

const logger = createLogger('recruitai.campaign_service');

/**
 * Port of the hydration half of `backend/app/services/campaign_service.py`.
 *
 * `execute_agent_turn` stays with Phase 13 because it needs the LangGraph
 * agent. Session creation and context hydration are independent of the graph,
 * so the Phase 14 chat route can call them unchanged.
 *
 * All reads go through `WorkspaceStore`, keeping every query tenant-scoped and
 * available on both Drizzle/PostgreSQL and the SQLite fallback.
 */

export interface CampaignServiceOptions {
  readonly config?: AppConfig;
  readonly store?: WorkspaceStore;
  /** Injectable clock; unused by hydration but kept for parity with tests. */
  readonly now?: () => Date;
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
  private store: WorkspaceStore | undefined;

  constructor(options: CampaignServiceOptions = {}) {
    this.config = options.config ?? getConfig();
    this.store = options.store;
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
}

/** Build the campaign hydration service used by the chat route. */
export function createCampaignService(options: CampaignServiceOptions = {}): CampaignService {
  return new CampaignService(options);
}
