import { randomUUID } from 'node:crypto';

import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type DbRow,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import { createLogger } from '../telemetry/logger.js';
import { HttpError } from '../types/errors.js';

const logger = createLogger('recruitai.routes_sessions');

/** Port of `backend/app/api/routes_sessions.py`. */

export const RESET_RATE_LIMIT_SECONDS = 30;

/**
 * SEC-3/SEC-4 destructive-reset rate limit. Module scope mirrors Python's
 * `_LAST_RESET_REQUESTS`; tests clear it with `clearResetRateLimits()`.
 */
const LAST_RESET_REQUESTS = new Map<string, number>();

export function clearResetRateLimits(): void {
  LAST_RESET_REQUESTS.clear();
}

export interface SessionServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
  /** Seconds clock, for deterministic rate-limit tests. */
  readonly now?: () => number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Decode a JSON payload that may arrive as object (Drizzle) or string (SQLite). */
export function asJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function metadataSessionIds(metadata: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const single = metadata['session_id'];
  if (typeof single === 'string' && single) {
    ids.add(single);
  }
  for (const value of asJsonArray(metadata['session_ids'])) {
    if (typeof value === 'string' && value) {
      ids.add(value);
    }
  }
  return [...ids];
}

export class SessionService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;
  private readonly clock: () => number;

  constructor(options: SessionServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
    this.clock = options.now ?? (() => Date.now() / 1000);
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  async listSessions(userId: string): Promise<DbRow[]> {
    try {
      const store = this.getStore();
      const sessions = await store.listSessions(userId);
      const candidates = await store.listCandidates(userId);
      const applications = await store.listApplications(userId);

      const appsByJob = new Map<string, Set<string>>();
      for (const application of applications) {
        const jobId = application['job_id'];
        const candidateId = application['candidate_id'];
        if (typeof jobId === 'string' && jobId && typeof candidateId === 'string') {
          const set = appsByJob.get(jobId) ?? new Set<string>();
          set.add(candidateId);
          appsByJob.set(jobId, set);
        }
      }

      const sessionIds = sessions
        .map((session) => session['id'])
        .filter((id): id is string => typeof id === 'string');
      const ownedCandidateIds = new Set(
        candidates
          .map((candidate) => candidate['id'])
          .filter((id): id is string => typeof id === 'string'),
      );
      const links = await store.listSessionCandidatesForSessions(sessionIds);
      const sessionCandidatesMap = new Map<string, Set<string>>();
      for (const link of links) {
        const sessionId = link['session_id'];
        const candidateId = link['candidate_id'];
        // Join rows are not tenant-scoped themselves; only count candidates
        // this tenant actually owns.
        if (
          typeof sessionId === 'string' &&
          typeof candidateId === 'string' &&
          ownedCandidateIds.has(candidateId)
        ) {
          const set = sessionCandidatesMap.get(sessionId) ?? new Set<string>();
          set.add(candidateId);
          sessionCandidatesMap.set(sessionId, set);
        }
      }

      // Expand/contract backfill for legacy candidates that only have metadata
      // links. Python performs the same opportunistic upsert during list.
      for (const candidate of candidates) {
        const candidateId = candidate['id'];
        if (typeof candidateId !== 'string') {
          continue;
        }
        const metadata = asJsonObject(candidate['metadata']);
        for (const sessionId of metadataSessionIds(metadata)) {
          const existing = sessionCandidatesMap.get(sessionId);
          if (existing?.has(candidateId)) {
            continue;
          }
          const set = existing ?? new Set<string>();
          set.add(candidateId);
          sessionCandidatesMap.set(sessionId, set);
          try {
            await store.upsertSessionCandidate(sessionId, candidateId);
          } catch {
            // Python swallows backfill failures too; the response still counts it.
          }
        }
      }

      return sessions.map((session) => {
        const sessionId = typeof session['id'] === 'string' ? session['id'] : '';
        const jobId = session['job_id'];
        const ids = new Set(sessionCandidatesMap.get(sessionId) ?? []);
        if (typeof jobId === 'string') {
          for (const candidateId of appsByJob.get(jobId) ?? []) {
            ids.add(candidateId);
          }
        }
        // Python selects only these columns; extra store columns are internal.
        return {
          id: session['id'],
          title: session['title'],
          job_id: session['job_id'] ?? null,
          created_at: session['created_at'] ?? null,
          updated_at: session['updated_at'] ?? null,
          candidate_count: ids.size,
        };
      });
    } catch (error) {
      throw new HttpError(500, `Database error: ${errorMessage(error)}`);
    }
  }

  async createSession(userId: string): Promise<DbRow> {
    const sessionId = randomUUID();
    const title = 'New Hiring Campaign';
    const greetingText =
      'Hello! I am **RecruitAI**, your AI recruiting assistant. ' +
      'Start by loading a job description and candidate resumes, or select one of the quick start options below.';

    try {
      const store = this.getStore();
      await store.insertSession({ id: sessionId, userId, title });
      await store.insertChatMessage({
        sessionId,
        userId,
        role: 'assistant',
        content: greetingText,
      });

      return {
        id: sessionId,
        user_id: userId,
        title,
        created_at: new Date().toISOString(),
        candidate_count: 0,
        conversation_history: [{ role: 'assistant', content: greetingText }],
        resumes: [],
        scheduled_interviews: [],
      };
    } catch (error) {
      throw new HttpError(500, `Database error: ${errorMessage(error)}`);
    }
  }

  async resetAll(userId: string): Promise<{ success: true; message: string }> {
    const now = this.clock();
    const lastReset = LAST_RESET_REQUESTS.get(userId) ?? 0;
    if (now - lastReset < RESET_RATE_LIMIT_SECONDS) {
      const retryAfter = Math.trunc(RESET_RATE_LIMIT_SECONDS - (now - lastReset));
      throw new HttpError(
        429,
        `Reset rate limit exceeded. You may only reset your workspace once every ${Math.trunc(
          RESET_RATE_LIMIT_SECONDS,
        )} seconds. Retry in ${retryAfter}s.`,
        'Reset rate limit exceeded',
        { 'Retry-After': String(retryAfter) },
      );
    }

    LAST_RESET_REQUESTS.set(userId, now);
    logger.info(
      `[AUDIT] [WORKSPACE_RESET] user_id=${userId} timestamp=${now} action=reset_all_data`,
    );

    try {
      await this.getStore().resetWorkspace(userId);
      return {
        success: true,
        message: 'All recruitment workspace data successfully reset for fresh start.',
      };
    } catch (error) {
      throw new HttpError(500, `Database error during reset: ${errorMessage(error)}`);
    }
  }

  async getSessionDetails(userId: string, sessionId: string): Promise<DbRow> {
    try {
      const store = this.getStore();
      const sessionRow = await store.getSession(userId, sessionId);
      if (!sessionRow) {
        throw new HttpError(404, 'Campaign session not found.');
      }
      const jobId = sessionRow['job_id'];

      const messages = await store.listChatMessages(userId, sessionId);
      const history = messages.map((message) => {
        const item: Record<string, unknown> = {
          role: message['role'],
          content: message['content'],
          created_at: message['created_at'] ?? null,
          timestamp: message['created_at'] ?? null,
        };
        const metadata = message['metadata'];
        if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
          const record = metadata as Record<string, unknown>;
          if (record['agent_steps']) {
            item['agent_steps'] = record['agent_steps'];
          }
          if (record['suggested_followups']) {
            item['suggested_followups'] = record['suggested_followups'];
          }
        }
        return item;
      });

      let jdStructured: unknown = null;
      if (typeof jobId === 'string' && jobId) {
        const job = await store.getJobStructured(userId, jobId);
        if (job && job['jd_structured']) {
          jdStructured = job['jd_structured'];
        }
      }

      const candidates = await store.listCandidates(userId);
      const applications = await store.listApplications(userId);

      const appsForJob = new Map<string, DbRow>();
      const candidateIdsInJobApps = new Set<string>();
      for (const application of applications) {
        const candidateId = application['candidate_id'];
        if (
          typeof jobId === 'string' &&
          application['job_id'] === jobId &&
          typeof candidateId === 'string'
        ) {
          appsForJob.set(candidateId, application);
          candidateIdsInJobApps.add(candidateId);
        }
      }

      const relationalIds = new Set(await store.listSessionCandidates(sessionId));

      const candidatesList: DbRow[] = [];
      const sessionCandidateIds = new Set<string>();
      for (const candidate of candidates) {
        const candidateId = candidate['id'];
        if (typeof candidateId !== 'string') {
          continue;
        }
        const metadata = asJsonObject(candidate['metadata']);
        const metadataSessionIdList = asJsonArray(metadata['session_ids']);
        const belongs =
          relationalIds.has(candidateId) ||
          candidateIdsInJobApps.has(candidateId) ||
          metadata['session_id'] === sessionId ||
          metadataSessionIdList.includes(sessionId);
        if (!belongs) {
          continue;
        }

        sessionCandidateIds.add(candidateId);
        const application = appsForJob.get(candidateId) ?? {};
        const reasoning = asJsonObject(application['match_reasoning']);

        const status = application['status'] ?? metadata['status'] ?? 'new';
        const score =
          application['match_score'] !== null && application['match_score'] !== undefined
            ? application['match_score']
            : (metadata['match_score'] ?? null);
        const matched = reasoning['matched_skills'] ?? metadata['matched_skills'] ?? [];
        const gaps = reasoning['gaps'] ?? metadata['gaps'] ?? [];
        const redFlags = reasoning['red_flags'] ?? metadata['red_flags'] ?? [];
        const summary = reasoning['summary'] ?? metadata['summary'] ?? '';

        candidatesList.push({
          candidate_id: candidateId,
          name: candidate['full_name'],
          email: candidate['email'] ?? null,
          phone: candidate['phone'] ?? null,
          raw_text: candidate['raw_resume_text'] ?? null,
          status,
          match_score: score,
          skills: metadata['skills'] ?? [],
          work_experience: metadata['work_experience'] ?? [],
          education: metadata['education'] ?? [],
          experience_years: metadata['experience_years'] ?? 0,
          location: metadata['location'] ?? null,
          matched_skills: matched,
          gaps,
          red_flags: redFlags,
          summary,
          headline: metadata['headline'] ?? null,
          certifications: metadata['certifications'] ?? [],
          languages: metadata['languages'] ?? [],
          links: metadata['links'] ?? [],
        });
      }

      const shortlistList: DbRow[] = [];
      if (typeof jobId === 'string' && jobId) {
        const candidateById = new Map<string, DbRow>();
        for (const candidate of candidates) {
          if (typeof candidate['id'] === 'string') {
            candidateById.set(candidate['id'], candidate);
          }
        }
        for (const application of applications) {
          if (application['job_id'] !== jobId) {
            continue;
          }
          const candidateId = application['candidate_id'];
          const related =
            typeof candidateId === 'string' ? (candidateById.get(candidateId) ?? {}) : {};
          const candidateMeta = asJsonObject(related['metadata']);
          const reasoning = asJsonObject(application['match_reasoning']);
          shortlistList.push({
            candidate_id: candidateId,
            name: related['full_name'] ?? 'Candidate',
            match_score: application['match_score'] ?? null,
            matched_skills: reasoning['matched_skills'] ?? [],
            gaps: reasoning['gaps'] ?? [],
            summary: reasoning['summary'] ?? '',
            experience_years: candidateMeta['experience_years'] ?? 0,
          });
        }
      }

      const interviews = await store.listInterviews(userId);
      const candidateNameById = new Map<string, string>();
      for (const candidate of candidates) {
        if (typeof candidate['id'] === 'string' && typeof candidate['full_name'] === 'string') {
          candidateNameById.set(candidate['id'], candidate['full_name']);
        }
      }
      const scheduledInterviews: DbRow[] = [];
      for (const interview of interviews) {
        const candidateId = interview['candidate_id'];
        if (typeof candidateId === 'string' && !sessionCandidateIds.has(candidateId)) {
          continue;
        }

        let feedback = interview['feedback'];
        if (typeof feedback === 'string') {
          // Python: json.loads on success, `{"notes": <raw>}` on failure.
          try {
            const parsed = JSON.parse(feedback) as unknown;
            feedback =
              typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
          } catch {
            feedback = { notes: feedback };
          }
        } else if (typeof feedback !== 'object' || feedback === null) {
          feedback = {};
        }
        const feedbackRecord = feedback as Record<string, unknown>;

        const candidateName =
          (typeof candidateId === 'string' ? candidateNameById.get(candidateId) : undefined) ??
          (typeof feedbackRecord['candidate_name'] === 'string'
            ? feedbackRecord['candidate_name']
            : undefined) ??
          'Candidate';

        scheduledInterviews.push({
          candidate_name: candidateName,
          slot: String(interview['scheduled_at'] ?? 'None'),
          feedback: JSON.stringify(feedbackRecord),
          mode: interview['mode'] ?? 'video',
          meeting_link: interview['meeting_link'] ?? null,
          booked_at: feedbackRecord['booked_at'] || String(interview['scheduled_at'] ?? 'None'),
        });
      }

      return {
        id: sessionId,
        title: sessionRow['title'] ?? 'New Hiring Campaign',
        created_at: sessionRow['created_at'] ?? null,
        updated_at: sessionRow['updated_at'] ?? null,
        jd_structured: jdStructured,
        resumes: candidatesList,
        last_shortlist: shortlistList.length > 0 ? shortlistList : null,
        pending_confirmation: sessionRow['pending_confirmation'] ?? null,
        last_intent: sessionRow['last_intent'] ?? null,
        scheduled_interviews: scheduledInterviews,
        conversation_history: history,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(500, `Database error: ${errorMessage(error)}`);
    }
  }

  async deleteSession(userId: string, sessionId: string): Promise<{ message: string }> {
    try {
      const store = this.getStore();
      try {
        await store.deleteSessionCandidatesForSession(sessionId);
      } catch {
        // Python ignores join-table cleanup failures and still deletes the row.
      }
      await store.deleteSession(userId, sessionId);
      return { message: `Session ${sessionId} deleted successfully.` };
    } catch (error) {
      throw new HttpError(500, `Database error: ${errorMessage(error)}`);
    }
  }

  async patchSession(
    userId: string,
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<DbRow> {
    const patch = { ...payload };
    delete patch['user_id'];
    try {
      const updated = await this.getStore().updateSession(userId, sessionId, patch);
      if (!updated) {
        throw new HttpError(404, 'Session not found.');
      }
      return updated;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(500, `Database error: ${errorMessage(error)}`);
    }
  }
}

/** Factory used by the API router and tests. */
export function createSessionService(options: SessionServiceOptions = {}): SessionService {
  return new SessionService(options);
}
