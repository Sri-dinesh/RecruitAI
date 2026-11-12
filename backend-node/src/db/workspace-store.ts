import { and, eq } from 'drizzle-orm';

import type { Database } from './client.js';
import type { FallbackDatabase } from './fallback.js';
import {
  applications,
  chatMessages,
  chatSessions,
  candidates,
  interviews,
  jobs,
  sessionCandidates,
} from './schema.js';

/**
 * Narrow data-access contract used by `services/persistence.ts`.
 *
 * Centralizing these operations keeps every tenant filter explicit and lets
 * the same persistence behavior run on the primary Drizzle/Postgres path and
 * on the SQLite fallback. Both implementations below are the only places that
 * know how a table is written.
 */

export interface JobPatch {
  jdStructured: Record<string, unknown>;
  rawJd: string;
}

export interface NewJobRecord {
  id: string;
  userId: string;
  title: string;
  rawJd: string;
  jdStructured: Record<string, unknown>;
  status: string;
}

export interface ApplicationUpsert {
  jobId: string;
  candidateId: string;
  userId: string;
  matchScore: number;
  matchReasoning: Record<string, unknown>;
  status: string;
}

export interface InterviewInsert {
  applicationId: string | null;
  candidateId: string | null;
  userId: string;
  scheduledAt: Date | null;
  durationMinutes: number;
  mode: string;
  status: string;
  feedback: Record<string, unknown>;
}

export interface ChatMessageInsert {
  sessionId: string;
  userId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SessionPatch {
  lastIntent: string | null;
  pendingConfirmation: Record<string, unknown> | null;
  updatedAt: Date;
  title?: string;
  jobId?: string;
}

export interface WorkspaceStore {
  findJobIdByTitle(userId: string, title: string): Promise<string | undefined>;
  updateJob(userId: string, jobId: string, patch: JobPatch): Promise<void>;
  insertJob(record: NewJobRecord): Promise<void>;
  upsertApplication(record: ApplicationUpsert): Promise<void>;
  findCandidateIdByName(userId: string, fullName: string): Promise<string | undefined>;
  findApplicationId(
    userId: string,
    candidateId: string,
    jobId: string,
  ): Promise<string | undefined>;
  insertInterview(record: InterviewInsert): Promise<void>;
  insertChatMessage(record: ChatMessageInsert): Promise<void>;
  updateSession(userId: string, sessionId: string, patch: SessionPatch): Promise<void>;
  /**
   * Link a candidate to a session, but only when both rows belong to the
   * tenant. Returns `false` when either ownership check fails.
   */
  upsertSessionCandidate(userId: string, sessionId: string, candidateId: string): Promise<boolean>;
}

/** Primary path: Drizzle queries against PostgreSQL. */
export function createDrizzleWorkspaceStore(db: Database): WorkspaceStore {
  return {
    async findJobIdByTitle(userId, title) {
      const rows = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), eq(jobs.title, title)))
        .limit(1);
      return rows[0]?.id;
    },

    async updateJob(userId, jobId, patch) {
      await db
        .update(jobs)
        .set({ jdStructured: patch.jdStructured, rawJd: patch.rawJd })
        .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
    },

    async insertJob(record) {
      await db.insert(jobs).values({
        id: record.id,
        userId: record.userId,
        title: record.title,
        rawJd: record.rawJd,
        jdStructured: record.jdStructured,
        status: record.status,
      });
    },

    async upsertApplication(record) {
      await db
        .insert(applications)
        .values({
          jobId: record.jobId,
          candidateId: record.candidateId,
          userId: record.userId,
          matchScore: record.matchScore,
          matchReasoning: record.matchReasoning,
          status: record.status,
        })
        .onConflictDoUpdate({
          target: [applications.jobId, applications.candidateId],
          set: {
            userId: record.userId,
            matchScore: record.matchScore,
            matchReasoning: record.matchReasoning,
            status: record.status,
          },
        });
    },

    async findCandidateIdByName(userId, fullName) {
      const rows = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.userId, userId), eq(candidates.fullName, fullName)))
        .limit(1);
      return rows[0]?.id;
    },

    async findApplicationId(userId, candidateId, jobId) {
      const rows = await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.userId, userId),
            eq(applications.candidateId, candidateId),
            eq(applications.jobId, jobId),
          ),
        )
        .limit(1);
      return rows[0]?.id;
    },

    async insertInterview(record) {
      await db.insert(interviews).values({
        applicationId: record.applicationId,
        candidateId: record.candidateId,
        userId: record.userId,
        scheduledAt: record.scheduledAt,
        durationMinutes: record.durationMinutes,
        mode: record.mode,
        status: record.status,
        feedback: record.feedback,
      });
    },

    async insertChatMessage(record) {
      await db.insert(chatMessages).values({
        sessionId: record.sessionId,
        userId: record.userId,
        role: record.role,
        content: record.content,
        ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
      });
    },

    async updateSession(userId, sessionId, patch) {
      await db
        .update(chatSessions)
        .set({
          lastIntent: patch.lastIntent,
          pendingConfirmation: patch.pendingConfirmation,
          updatedAt: patch.updatedAt,
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.jobId === undefined ? {} : { jobId: patch.jobId }),
        })
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
    },

    async upsertSessionCandidate(userId, sessionId, candidateId) {
      const session = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1);
      if (!session[0]) {
        return false;
      }
      const candidate = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)))
        .limit(1);
      if (!candidate[0]) {
        return false;
      }
      await db.insert(sessionCandidates).values({ sessionId, candidateId }).onConflictDoNothing();
      return true;
    },
  };
}

/** Fallback path: the same contract over the local SQLite database. */
export function createSqliteWorkspaceStore(db: FallbackDatabase): WorkspaceStore {
  return {
    async findJobIdByTitle(userId, title) {
      const response = db
        .table('jobs')
        .select('id')
        .eq('user_id', userId)
        .eq('title', title)
        .limit(1)
        .execute();
      return response.data[0]?.id as string | undefined;
    },

    async updateJob(userId, jobId, patch) {
      db.table('jobs')
        .update({
          jd_structured: patch.jdStructured,
          raw_jd: patch.rawJd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', userId)
        .execute();
    },

    async insertJob(record) {
      db.table('jobs')
        .insert({
          id: record.id,
          user_id: record.userId,
          title: record.title,
          raw_jd: record.rawJd,
          jd_structured: record.jdStructured,
          status: record.status,
        })
        .execute();
    },

    async upsertApplication(record) {
      db.table('applications')
        .upsert(
          {
            job_id: record.jobId,
            candidate_id: record.candidateId,
            user_id: record.userId,
            match_score: record.matchScore,
            match_reasoning: record.matchReasoning,
            status: record.status,
          },
          'job_id,candidate_id',
        )
        .execute();
    },

    async findCandidateIdByName(userId, fullName) {
      const response = db
        .table('candidates')
        .select('id')
        .eq('user_id', userId)
        .eq('full_name', fullName)
        .limit(1)
        .execute();
      return response.data[0]?.id as string | undefined;
    },

    async findApplicationId(userId, candidateId, jobId) {
      const response = db
        .table('applications')
        .select('id')
        .eq('user_id', userId)
        .eq('candidate_id', candidateId)
        .eq('job_id', jobId)
        .limit(1)
        .execute();
      return response.data[0]?.id as string | undefined;
    },

    async insertInterview(record) {
      db.table('interviews')
        .insert({
          application_id: record.applicationId,
          candidate_id: record.candidateId,
          user_id: record.userId,
          scheduled_at: record.scheduledAt?.toISOString() ?? null,
          duration_minutes: record.durationMinutes,
          mode: record.mode,
          status: record.status,
          feedback: record.feedback,
        })
        .execute();
    },

    async insertChatMessage(record) {
      db.table('chat_messages')
        .insert({
          session_id: record.sessionId,
          user_id: record.userId,
          role: record.role,
          content: record.content,
          ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
        })
        .execute();
    },

    async updateSession(userId, sessionId, patch) {
      db.table('chat_sessions')
        .update({
          last_intent: patch.lastIntent,
          pending_confirmation: patch.pendingConfirmation,
          updated_at: patch.updatedAt.toISOString(),
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.jobId === undefined ? {} : { job_id: patch.jobId }),
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .execute();
    },

    async upsertSessionCandidate(userId, sessionId, candidateId) {
      const session = db
        .table('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .limit(1)
        .execute();
      if (!session.data[0]) {
        return false;
      }
      const candidate = db
        .table('candidates')
        .select('id')
        .eq('id', candidateId)
        .eq('user_id', userId)
        .limit(1)
        .execute();
      if (!candidate.data[0]) {
        return false;
      }
      db.table('session_candidates')
        .upsert({ session_id: sessionId, candidate_id: candidateId })
        .execute();
      return true;
    },
  };
}
