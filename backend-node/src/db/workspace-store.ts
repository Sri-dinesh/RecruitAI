import { randomUUID } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';

import { getConfig, type AppConfig } from '../config/index.js';
import { getDb, type Database } from './client.js';
import { getFallbackDatabase, type FallbackDatabase } from './fallback.js';
import {
  applications,
  chatMessages,
  chatSessions,
  candidates,
  interviews,
  jobs,
  resumeChunks,
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

export interface NewSessionRecord {
  id: string;
  userId: string;
  title: string;
}

export interface CandidateRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  rawResumeText: string | null;
  metadata: Record<string, unknown>;
}

export interface NewCandidateRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  rawResumeText: string | null;
  metadata: Record<string, unknown>;
}

export interface CandidatePatch {
  fullName: string;
  phone: string | null;
  rawResumeText: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatMessagePair {
  role: string;
  content: string;
}

export interface ResumeChunkRecord {
  candidateId: string;
  userId: string;
  chunkText: string;
  chunkIndex: number;
  embedding: readonly number[];
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

  // Campaign session context (Phase 12).
  sessionExists(userId: string, sessionId: string): Promise<boolean>;
  insertSession(record: NewSessionRecord): Promise<void>;
  bindJobToSession(userId: string, sessionId: string, jobId: string, title: string): Promise<void>;
  findSessionJobId(userId: string, sessionId: string): Promise<string | undefined>;
  findJobStructured(userId: string, jobId: string): Promise<Record<string, unknown> | undefined>;
  listCandidates(userId: string, limit?: number): Promise<CandidateRecord[]>;
  findCandidateByEmail(userId: string, email: string): Promise<CandidateRecord | undefined>;
  findCandidateById(userId: string, candidateId: string): Promise<CandidateRecord | undefined>;
  insertCandidate(record: NewCandidateRecord): Promise<void>;
  updateCandidate(userId: string, candidateId: string, patch: CandidatePatch): Promise<void>;
  listChatMessages(userId: string, sessionId: string, limit?: number): Promise<ChatMessagePair[]>;
  deleteResumeChunks(userId: string, candidateId: string): Promise<void>;
  insertResumeChunks(records: readonly ResumeChunkRecord[]): Promise<void>;
}

function parseMetadata(value: unknown): Record<string, unknown> {
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
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function candidateRecord(row: {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  rawResumeText: string | null;
  metadata: Record<string, unknown> | null;
}): CandidateRecord {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    rawResumeText: row.rawResumeText,
    metadata: row.metadata ?? {},
  };
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

    async sessionExists(userId, sessionId) {
      const rows = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1);
      return rows.length > 0;
    },

    async insertSession(record) {
      await db.insert(chatSessions).values({
        id: record.id,
        userId: record.userId,
        title: record.title,
      });
    },

    async bindJobToSession(userId, sessionId, jobId, title) {
      await db
        .update(chatSessions)
        .set({ jobId, title, updatedAt: new Date() })
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
    },

    async findSessionJobId(userId, sessionId) {
      const rows = await db
        .select({ jobId: chatSessions.jobId })
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1);
      return rows[0]?.jobId ?? undefined;
    },

    async findJobStructured(userId, jobId) {
      const rows = await db
        .select({ jdStructured: jobs.jdStructured })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
        .limit(1);
      return rows[0]?.jdStructured ?? undefined;
    },

    async listCandidates(userId, limit) {
      const query = db
        .select({
          id: candidates.id,
          fullName: candidates.fullName,
          email: candidates.email,
          phone: candidates.phone,
          rawResumeText: candidates.rawResumeText,
          metadata: candidates.metadata,
        })
        .from(candidates)
        .where(eq(candidates.userId, userId));
      const rows = limit === undefined ? await query : await query.limit(limit);
      return rows.map(candidateRecord);
    },

    async findCandidateByEmail(userId, email) {
      const rows = await db
        .select({
          id: candidates.id,
          fullName: candidates.fullName,
          email: candidates.email,
          phone: candidates.phone,
          rawResumeText: candidates.rawResumeText,
          metadata: candidates.metadata,
        })
        .from(candidates)
        .where(and(eq(candidates.userId, userId), eq(candidates.email, email)))
        .limit(1);
      return rows[0] ? candidateRecord(rows[0]) : undefined;
    },

    async findCandidateById(userId, candidateId) {
      const rows = await db
        .select({
          id: candidates.id,
          fullName: candidates.fullName,
          email: candidates.email,
          phone: candidates.phone,
          rawResumeText: candidates.rawResumeText,
          metadata: candidates.metadata,
        })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)))
        .limit(1);
      return rows[0] ? candidateRecord(rows[0]) : undefined;
    },

    async insertCandidate(record) {
      await db.insert(candidates).values({
        id: record.id,
        userId: record.userId,
        fullName: record.fullName,
        email: record.email,
        phone: record.phone,
        rawResumeText: record.rawResumeText,
        metadata: record.metadata,
      });
    },

    async updateCandidate(userId, candidateId, patch) {
      await db
        .update(candidates)
        .set({
          fullName: patch.fullName,
          phone: patch.phone,
          rawResumeText: patch.rawResumeText,
          metadata: patch.metadata,
          updatedAt: new Date(),
        })
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)));
    },

    async listChatMessages(userId, sessionId, limit = 20) {
      const rows = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.userId, userId)))
        .orderBy(asc(chatMessages.createdAt))
        .limit(limit);
      return rows;
    },

    async deleteResumeChunks(userId, candidateId) {
      await db
        .delete(resumeChunks)
        .where(and(eq(resumeChunks.userId, userId), eq(resumeChunks.candidateId, candidateId)));
    },

    async insertResumeChunks(records) {
      if (records.length === 0) {
        return;
      }
      await db.insert(resumeChunks).values(
        records.map((record) => ({
          id: randomUUID(),
          candidateId: record.candidateId,
          userId: record.userId,
          chunkText: record.chunkText,
          chunkIndex: record.chunkIndex,
          embedding: [...record.embedding],
        })),
      );
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

    async sessionExists(userId, sessionId) {
      return (
        db
          .table('chat_sessions')
          .select('id')
          .eq('id', sessionId)
          .eq('user_id', userId)
          .limit(1)
          .execute().data.length > 0
      );
    },

    async insertSession(record) {
      db.table('chat_sessions')
        .insert({
          id: record.id,
          user_id: record.userId,
          title: record.title,
        })
        .execute();
    },

    async bindJobToSession(userId, sessionId, jobId, title) {
      db.table('chat_sessions')
        .update({
          job_id: jobId,
          title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .execute();
    },

    async findSessionJobId(userId, sessionId) {
      const row = db
        .table('chat_sessions')
        .select('job_id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .limit(1)
        .execute().data[0];
      return (row?.job_id as string | null | undefined) ?? undefined;
    },

    async findJobStructured(userId, jobId) {
      const row = db
        .table('jobs')
        .select('jd_structured')
        .eq('id', jobId)
        .eq('user_id', userId)
        .limit(1)
        .execute().data[0];
      return row?.jd_structured === undefined ? undefined : parseMetadata(row.jd_structured);
    },

    async listCandidates(userId, limit) {
      let builder: ReturnType<FallbackDatabase['table']> = db
        .table('candidates')
        .select('id, full_name, email, phone, raw_resume_text, metadata')
        .eq('user_id', userId);
      if (limit !== undefined) {
        builder = builder.limit(limit);
      }
      return builder.execute().data.map((row) => ({
        id: String(row.id),
        fullName: String(row.full_name),
        email: (row.email as string | null | undefined) ?? null,
        phone: (row.phone as string | null | undefined) ?? null,
        rawResumeText: (row.raw_resume_text as string | null | undefined) ?? null,
        metadata: parseMetadata(row.metadata),
      }));
    },

    async findCandidateByEmail(userId, email) {
      const row = db
        .table('candidates')
        .select('id, full_name, email, phone, raw_resume_text, metadata')
        .eq('user_id', userId)
        .eq('email', email)
        .limit(1)
        .execute().data[0];
      return row
        ? {
            id: String(row.id),
            fullName: String(row.full_name),
            email: (row.email as string | null | undefined) ?? null,
            phone: (row.phone as string | null | undefined) ?? null,
            rawResumeText: (row.raw_resume_text as string | null | undefined) ?? null,
            metadata: parseMetadata(row.metadata),
          }
        : undefined;
    },

    async findCandidateById(userId, candidateId) {
      const row = db
        .table('candidates')
        .select('id, full_name, email, phone, raw_resume_text, metadata')
        .eq('id', candidateId)
        .eq('user_id', userId)
        .limit(1)
        .execute().data[0];
      return row
        ? {
            id: String(row.id),
            fullName: String(row.full_name),
            email: (row.email as string | null | undefined) ?? null,
            phone: (row.phone as string | null | undefined) ?? null,
            rawResumeText: (row.raw_resume_text as string | null | undefined) ?? null,
            metadata: parseMetadata(row.metadata),
          }
        : undefined;
    },

    async insertCandidate(record) {
      db.table('candidates')
        .insert({
          id: record.id,
          user_id: record.userId,
          full_name: record.fullName,
          email: record.email,
          phone: record.phone,
          raw_resume_text: record.rawResumeText,
          metadata: record.metadata,
        })
        .execute();
    },

    async updateCandidate(userId, candidateId, patch) {
      db.table('candidates')
        .update({
          full_name: patch.fullName,
          phone: patch.phone,
          raw_resume_text: patch.rawResumeText,
          metadata: patch.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async listChatMessages(userId, sessionId, limit = 20) {
      return db
        .table('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', false)
        .limit(limit)
        .execute()
        .data.map((row) => ({ role: String(row.role), content: String(row.content) }));
    },

    async deleteResumeChunks(userId, candidateId) {
      db.table('resume_chunks')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async insertResumeChunks(records) {
      for (const record of records) {
        db.table('resume_chunks')
          .insert({
            id: randomUUID(),
            candidate_id: record.candidateId,
            user_id: record.userId,
            chunk_text: record.chunkText,
            chunk_index: record.chunkIndex,
            embedding: [...record.embedding],
          })
          .execute();
      }
    },
  };
}

export interface WorkspaceStoreOptions {
  readonly config?: AppConfig;
  /** Explicit Drizzle handle (tests / scripts). */
  readonly db?: Database;
  /** Explicit SQLite fallback handle (tests). */
  readonly fallback?: FallbackDatabase;
}

/**
 * Resolve the production store: PostgreSQL when `DATABASE_URL` is configured,
 * otherwise the local SQLite fallback. Lazy, so constructing a service never
 * opens a connection.
 */
export function createWorkspaceStore(options: WorkspaceStoreOptions = {}): WorkspaceStore {
  if (options.db) {
    return createDrizzleWorkspaceStore(options.db);
  }
  if (options.fallback) {
    return createSqliteWorkspaceStore(options.fallback);
  }
  const config = options.config ?? getConfig();
  return config.database.url
    ? createDrizzleWorkspaceStore(getDb())
    : createSqliteWorkspaceStore(getFallbackDatabase());
}
