import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm';

import { getConfig, type AppConfig } from '../config/index.js';
import { getDb, type Database } from './client.js';
import { getFallbackDatabase, type FallbackDatabase } from './fallback.js';
import {
  applications,
  candidates,
  chatMessages,
  chatSessions,
  interviews,
  jobs,
  resumeChunks,
  sessionCandidates,
  users,
} from './schema.js';

/**
 * Data-access contract for the Phase 15 routes (sessions, evaluate, reports,
 * analytics, users, privacy).
 *
 * `workspace-store.ts` is intentionally narrow: it only covers what the
 * campaign/persistence services need. These routes mirror Python's direct
 * Supabase table access, so they need a wider set of tenant-scoped reads and
 * cascades. Every method below filters by the authenticated `userId` (or by a
 * session/candidate id that was itself resolved through a tenant-scoped query)
 * unless Python's own behavior is global and safe.
 *
 * Rows are returned as snake_case dictionaries, exactly like the Python
 * Supabase responses, so services can be a direct port of the route code.
 * Both implementations live in this file; no route or service knows which
 * storage backend is active.
 */

export type DbRow = Record<string, unknown>;

export interface SessionInsert {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly jobId?: string | null;
}

export interface ChatMessageInsert {
  readonly sessionId: string;
  readonly userId: string;
  readonly role: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface CandidateInsert {
  readonly id: string;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly rawResumeText: string;
  readonly metadata: Record<string, unknown>;
}

export interface ApplicationInsert {
  readonly id: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly userId: string;
  readonly matchScore: number;
  readonly matchReasoning: Record<string, unknown>;
  readonly status: string;
}

export interface ChatMessageQuery {
  readonly descending?: boolean;
  readonly limit?: number;
}

export interface WorkspaceQueryStore {
  // ── Sessions ──────────────────────────────────────────────────────────────
  listSessions(userId: string): Promise<DbRow[]>;
  getSession(userId: string, sessionId: string): Promise<DbRow | undefined>;
  insertSession(record: SessionInsert): Promise<void>;
  updateSession(
    userId: string,
    sessionId: string,
    patch: Record<string, unknown>,
  ): Promise<DbRow | undefined>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  resetWorkspace(userId: string): Promise<void>;

  // ── Chat messages ─────────────────────────────────────────────────────────
  insertChatMessage(record: ChatMessageInsert): Promise<void>;
  listChatMessages(userId: string, sessionId: string, query?: ChatMessageQuery): Promise<DbRow[]>;
  deleteChatMessagesBefore(userId: string | undefined, cutoffIso: string): Promise<number>;

  // ── Candidates ────────────────────────────────────────────────────────────
  listCandidates(userId: string): Promise<DbRow[]>;
  getCandidate(userId: string, candidateId: string): Promise<DbRow | undefined>;
  insertCandidate(record: CandidateInsert): Promise<void>;
  updateCandidateMetadata(
    userId: string,
    candidateId: string,
    metadata: Record<string, unknown>,
  ): Promise<DbRow | undefined>;
  listCandidatesCreatedSince(userId: string, cutoffIso: string): Promise<DbRow[]>;
  clearRawResumeTextBefore(userId: string | undefined, cutoffIso: string): Promise<number>;
  deleteCandidate(userId: string, candidateId: string): Promise<void>;

  // ── Jobs ──────────────────────────────────────────────────────────────────
  listJobs(userId: string): Promise<DbRow[]>;
  getJobStructured(userId: string, jobId: string): Promise<DbRow | undefined>;

  // ── Applications ──────────────────────────────────────────────────────────
  listApplications(userId: string): Promise<DbRow[]>;
  getApplicationForCandidate(
    userId: string,
    candidateId: string,
    jobId?: string,
  ): Promise<DbRow | undefined>;
  listApplicationsForCandidate(userId: string, candidateId: string): Promise<DbRow[]>;
  insertApplication(record: ApplicationInsert): Promise<void>;
  updateApplication(
    userId: string,
    applicationId: string,
    patch: Record<string, unknown>,
  ): Promise<DbRow | undefined>;
  updateApplicationStatusForCandidate(
    userId: string,
    candidateId: string,
    status: string,
  ): Promise<void>;
  deleteApplicationsForCandidate(userId: string, candidateId: string): Promise<void>;

  // ── Interviews ────────────────────────────────────────────────────────────
  listInterviews(userId: string, candidateIds?: readonly string[]): Promise<DbRow[]>;
  listInterviewsForCandidate(userId: string, candidateId: string): Promise<DbRow[]>;
  deleteInterviewsForCandidate(userId: string, candidateId: string): Promise<void>;

  // ── Session ↔ candidate links ─────────────────────────────────────────────
  listSessionCandidates(sessionId: string): Promise<string[]>;
  listSessionCandidatesForSessions(sessionIds: readonly string[]): Promise<DbRow[]>;
  upsertSessionCandidate(sessionId: string, candidateId: string): Promise<void>;
  deleteSessionCandidatesForSession(sessionId: string): Promise<void>;
  deleteSessionCandidatesForCandidate(candidateId: string): Promise<void>;
  deleteSessionCandidatesForUser(userId: string): Promise<void>;

  // ── Resume chunks ─────────────────────────────────────────────────────────
  countResumeChunks(userId: string, candidateId: string): Promise<number>;
  deleteResumeChunksForCandidate(userId: string, candidateId: string): Promise<void>;

  // ── Users ─────────────────────────────────────────────────────────────────
  getUser(userId: string): Promise<DbRow | undefined>;
  updateUser(userId: string, patch: Record<string, unknown>): Promise<DbRow | undefined>;
  deleteUser(userId: string): Promise<void>;
  purgeUserAccount(userId: string): Promise<void>;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Candidate/application/session patches are snake_case dictionaries. */
function normalizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  return { ...patch };
}

// ─── Drizzle/PostgreSQL implementation ───────────────────────────────────────

type DrizzleSession = typeof chatSessions.$inferSelect;
type DrizzleMessage = typeof chatMessages.$inferSelect;
type DrizzleCandidate = typeof candidates.$inferSelect;
type DrizzleJob = typeof jobs.$inferSelect;
type DrizzleApplication = typeof applications.$inferSelect;
type DrizzleInterview = typeof interviews.$inferSelect;
type DrizzleUser = typeof users.$inferSelect;

function drizzleSessionRow(row: DrizzleSession): DbRow {
  return {
    id: row.id,
    user_id: row.userId,
    job_id: row.jobId,
    title: row.title,
    last_intent: row.lastIntent,
    pending_confirmation: row.pendingConfirmation,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleMessageRow(row: DrizzleMessage): DbRow {
  return {
    id: row.id,
    session_id: row.sessionId,
    user_id: row.userId,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    created_at: toIsoString(row.createdAt),
  };
}

function drizzleCandidateRow(row: DrizzleCandidate): DbRow {
  return {
    id: row.id,
    user_id: row.userId,
    full_name: row.fullName,
    email: row.email,
    phone: row.phone,
    resume_file_url: row.resumeFileUrl,
    raw_resume_text: row.rawResumeText,
    metadata: row.metadata,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleJobRow(row: DrizzleJob): DbRow {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    raw_jd: row.rawJd,
    jd_structured: row.jdStructured,
    status: row.status,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleApplicationRow(row: DrizzleApplication): DbRow {
  return {
    id: row.id,
    job_id: row.jobId,
    candidate_id: row.candidateId,
    user_id: row.userId,
    match_score: numericOrNull(row.matchScore),
    match_reasoning: row.matchReasoning,
    status: row.status,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleInterviewRow(row: DrizzleInterview): DbRow {
  return {
    id: row.id,
    application_id: row.applicationId,
    candidate_id: row.candidateId,
    user_id: row.userId,
    scheduled_at: toIsoString(row.scheduledAt),
    duration_minutes: row.durationMinutes,
    mode: row.mode,
    meeting_link: row.meetingLink,
    status: row.status,
    feedback: row.feedback,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleUserRow(row: DrizzleUser): DbRow {
  return {
    id: row.id,
    email: row.email,
    full_name: row.fullName,
    avatar_url: row.avatarUrl,
    phone: row.phone,
    company_name: row.companyName,
    company_website: row.companyWebsite,
    role: row.role,
    preferences: row.preferences,
    last_sign_in_at: toIsoString(row.lastSignInAt),
    credits_balance: row.creditsBalance,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function drizzleApplicationPatch(
  patch: Record<string, unknown>,
): Partial<typeof applications.$inferInsert> {
  const values: Partial<typeof applications.$inferInsert> = { updatedAt: new Date() };
  if ('status' in patch && typeof patch['status'] === 'string') {
    values.status = patch['status'];
  }
  if ('match_reasoning' in patch) {
    values.matchReasoning = jsonObject(patch['match_reasoning']);
  }
  if ('match_score' in patch) {
    values.matchScore = numericOrNull(patch['match_score']);
  }
  return values;
}

function drizzleSessionPatch(
  patch: Record<string, unknown>,
): Partial<typeof chatSessions.$inferInsert> {
  const values: Partial<typeof chatSessions.$inferInsert> = { updatedAt: new Date() };
  if ('title' in patch && typeof patch['title'] === 'string') {
    values.title = patch['title'];
  }
  if ('job_id' in patch) {
    const jobId = patch['job_id'];
    values.jobId = typeof jobId === 'string' ? jobId : null;
  }
  if ('last_intent' in patch) {
    const intent = patch['last_intent'];
    values.lastIntent = typeof intent === 'string' ? intent : null;
  }
  if ('pending_confirmation' in patch) {
    values.pendingConfirmation = jsonObject(patch['pending_confirmation']);
  }
  return values;
}

function drizzleUserPatch(patch: Record<string, unknown>): Partial<typeof users.$inferInsert> {
  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  const textFields = {
    full_name: 'fullName',
    avatar_url: 'avatarUrl',
    phone: 'phone',
    company_name: 'companyName',
    company_website: 'companyWebsite',
    role: 'role',
  } as const;
  for (const [column, property] of Object.entries(textFields)) {
    if (column in patch) {
      const value = patch[column];
      if (typeof value === 'string') {
        values[property] = value;
      }
    }
  }
  if ('preferences' in patch) {
    values.preferences = (jsonObject(patch['preferences']) ?? {}) as Record<string, unknown>;
  }
  return values;
}

export function createDrizzleWorkspaceQueryStore(db: Database): WorkspaceQueryStore {
  return {
    async listSessions(userId) {
      const rows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.userId, userId))
        .orderBy(desc(chatSessions.updatedAt));
      return rows.map(drizzleSessionRow);
    },

    async getSession(userId, sessionId) {
      const rows = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1);
      return rows[0] ? drizzleSessionRow(rows[0]) : undefined;
    },

    async insertSession(record) {
      await db.insert(chatSessions).values({
        id: record.id,
        userId: record.userId,
        title: record.title,
        jobId: record.jobId ?? null,
      });
    },

    async updateSession(userId, sessionId, patch) {
      const rows = await db
        .update(chatSessions)
        .set(drizzleSessionPatch(normalizePatch(patch)))
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .returning();
      return rows[0] ? drizzleSessionRow(rows[0]) : undefined;
    },

    async deleteSession(userId, sessionId) {
      await db
        .delete(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
    },

    async resetWorkspace(userId) {
      await this.deleteSessionCandidatesForUser(userId);
      await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
      await db.delete(interviews).where(eq(interviews.userId, userId));
      await db.delete(applications).where(eq(applications.userId, userId));
      await db.delete(resumeChunks).where(eq(resumeChunks.userId, userId));
      await db.delete(candidates).where(eq(candidates.userId, userId));
      await db.delete(chatSessions).where(eq(chatSessions.userId, userId));
      await db.delete(jobs).where(eq(jobs.userId, userId));
    },

    async insertChatMessage(record) {
      await db.insert(chatMessages).values({
        sessionId: record.sessionId,
        userId: record.userId,
        role: record.role,
        content: record.content,
        metadata: record.metadata ?? null,
      });
    },

    async listChatMessages(userId, sessionId, query = {}) {
      const direction = query.descending
        ? desc(chatMessages.createdAt)
        : asc(chatMessages.createdAt);
      const base = db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.userId, userId)))
        .orderBy(direction);
      const rows = query.limit === undefined ? await base : await base.limit(query.limit);
      return rows.map(drizzleMessageRow);
    },

    async deleteChatMessagesBefore(userId, cutoffIso) {
      const cutoff = asDate(cutoffIso);
      if (!cutoff) {
        return 0;
      }
      const where =
        userId === undefined
          ? lt(chatMessages.createdAt, cutoff)
          : and(eq(chatMessages.userId, userId), lt(chatMessages.createdAt, cutoff));
      const rows = await db.delete(chatMessages).where(where).returning({ id: chatMessages.id });
      return rows.length;
    },

    async listCandidates(userId) {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.userId, userId))
        .orderBy(asc(candidates.createdAt));
      return rows.map(drizzleCandidateRow);
    },

    async getCandidate(userId, candidateId) {
      const rows = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)))
        .limit(1);
      return rows[0] ? drizzleCandidateRow(rows[0]) : undefined;
    },

    async insertCandidate(record) {
      await db.insert(candidates).values({
        id: record.id,
        userId: record.userId,
        fullName: record.fullName,
        email: record.email,
        rawResumeText: record.rawResumeText,
        metadata: record.metadata,
      });
    },

    async updateCandidateMetadata(userId, candidateId, metadata) {
      const rows = await db
        .update(candidates)
        .set({ metadata, updatedAt: new Date() })
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)))
        .returning();
      return rows[0] ? drizzleCandidateRow(rows[0]) : undefined;
    },

    async listCandidatesCreatedSince(userId, cutoffIso) {
      const cutoff = asDate(cutoffIso);
      if (!cutoff) {
        return [];
      }
      const rows = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.userId, userId), gte(candidates.createdAt, cutoff)))
        .orderBy(asc(candidates.createdAt));
      return rows.map(drizzleCandidateRow);
    },

    async clearRawResumeTextBefore(userId, cutoffIso) {
      const cutoff = asDate(cutoffIso);
      if (!cutoff) {
        return 0;
      }
      const where =
        userId === undefined
          ? lt(candidates.createdAt, cutoff)
          : and(eq(candidates.userId, userId), lt(candidates.createdAt, cutoff));
      const rows = await db
        .update(candidates)
        .set({ rawResumeText: null })
        .where(where)
        .returning({ id: candidates.id });
      return rows.length;
    },

    async deleteCandidate(userId, candidateId) {
      await db
        .delete(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.userId, userId)));
    },

    async listJobs(userId) {
      const rows = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, userId))
        .orderBy(desc(jobs.createdAt));
      return rows.map(drizzleJobRow);
    },

    async getJobStructured(userId, jobId) {
      const rows = await db
        .select({ jdStructured: jobs.jdStructured })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
        .limit(1);
      return rows[0]?.jdStructured === undefined
        ? undefined
        : { jd_structured: rows[0].jdStructured };
    },

    async listApplications(userId) {
      const rows = await db.select().from(applications).where(eq(applications.userId, userId));
      return rows.map(drizzleApplicationRow);
    },

    async getApplicationForCandidate(userId, candidateId, jobId) {
      const filters: SQL[] = [
        eq(applications.userId, userId),
        eq(applications.candidateId, candidateId),
      ];
      if (jobId !== undefined) {
        filters.push(eq(applications.jobId, jobId));
      }
      const rows = await db
        .select()
        .from(applications)
        .where(and(...filters))
        .limit(1);
      return rows[0] ? drizzleApplicationRow(rows[0]) : undefined;
    },

    async listApplicationsForCandidate(userId, candidateId) {
      const rows = await db
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.candidateId, candidateId)));
      return rows.map(drizzleApplicationRow);
    },

    async insertApplication(record) {
      await db.insert(applications).values({
        id: record.id,
        jobId: record.jobId,
        candidateId: record.candidateId,
        userId: record.userId,
        matchScore: record.matchScore,
        matchReasoning: record.matchReasoning,
        status: record.status,
      });
    },

    async updateApplication(userId, applicationId, patch) {
      const rows = await db
        .update(applications)
        .set(drizzleApplicationPatch(normalizePatch(patch)))
        .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
        .returning();
      return rows[0] ? drizzleApplicationRow(rows[0]) : undefined;
    },

    async updateApplicationStatusForCandidate(userId, candidateId, status) {
      await db
        .update(applications)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(applications.userId, userId), eq(applications.candidateId, candidateId)));
    },

    async deleteApplicationsForCandidate(userId, candidateId) {
      await db
        .delete(applications)
        .where(and(eq(applications.userId, userId), eq(applications.candidateId, candidateId)));
    },

    async listInterviews(userId, candidateIds) {
      const filters: SQL[] = [eq(interviews.userId, userId)];
      if (candidateIds !== undefined) {
        if (candidateIds.length === 0) {
          return [];
        }
        filters.push(inArray(interviews.candidateId, [...candidateIds]));
      }
      const rows = await db
        .select()
        .from(interviews)
        .where(and(...filters))
        .orderBy(asc(interviews.scheduledAt));
      return rows.map(drizzleInterviewRow);
    },

    async listInterviewsForCandidate(userId, candidateId) {
      const rows = await db
        .select()
        .from(interviews)
        .where(and(eq(interviews.userId, userId), eq(interviews.candidateId, candidateId)));
      return rows.map(drizzleInterviewRow);
    },

    async deleteInterviewsForCandidate(userId, candidateId) {
      await db
        .delete(interviews)
        .where(and(eq(interviews.userId, userId), eq(interviews.candidateId, candidateId)));
    },

    async listSessionCandidates(sessionId) {
      const rows = await db
        .select({ candidateId: sessionCandidates.candidateId })
        .from(sessionCandidates)
        .where(eq(sessionCandidates.sessionId, sessionId));
      return rows.map((row) => row.candidateId);
    },

    async listSessionCandidatesForSessions(sessionIds) {
      if (sessionIds.length === 0) {
        return [];
      }
      const rows = await db
        .select()
        .from(sessionCandidates)
        .where(inArray(sessionCandidates.sessionId, [...sessionIds]));
      return rows.map((row) => ({
        session_id: row.sessionId,
        candidate_id: row.candidateId,
        created_at: toIsoString(row.createdAt),
      }));
    },

    async upsertSessionCandidate(sessionId, candidateId) {
      await db
        .insert(sessionCandidates)
        .values({ sessionId, candidateId })
        .onConflictDoNothing({
          target: [sessionCandidates.sessionId, sessionCandidates.candidateId],
        });
    },

    async deleteSessionCandidatesForSession(sessionId) {
      await db.delete(sessionCandidates).where(eq(sessionCandidates.sessionId, sessionId));
    },

    async deleteSessionCandidatesForCandidate(candidateId) {
      await db.delete(sessionCandidates).where(eq(sessionCandidates.candidateId, candidateId));
    },

    async deleteSessionCandidatesForUser(userId) {
      const sessionRows = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.userId, userId));
      const candidateRows = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.userId, userId));
      const sessionIds = sessionRows.map((row) => row.id);
      const candidateIds = candidateRows.map((row) => row.id);
      const filters: SQL[] = [];
      if (sessionIds.length > 0) {
        filters.push(inArray(sessionCandidates.sessionId, sessionIds));
      }
      if (candidateIds.length > 0) {
        filters.push(inArray(sessionCandidates.candidateId, candidateIds));
      }
      if (filters.length === 0) {
        return;
      }
      await db.delete(sessionCandidates).where(or(...filters));
    },

    async countResumeChunks(userId, candidateId) {
      const rows = await db
        .select({ id: resumeChunks.id })
        .from(resumeChunks)
        .where(and(eq(resumeChunks.userId, userId), eq(resumeChunks.candidateId, candidateId)));
      return rows.length;
    },

    async deleteResumeChunksForCandidate(userId, candidateId) {
      await db
        .delete(resumeChunks)
        .where(and(eq(resumeChunks.userId, userId), eq(resumeChunks.candidateId, candidateId)));
    },

    async getUser(userId) {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return rows[0] ? drizzleUserRow(rows[0]) : undefined;
    },

    async updateUser(userId, patch) {
      const rows = await db
        .update(users)
        .set(drizzleUserPatch(normalizePatch(patch)))
        .where(eq(users.id, userId))
        .returning();
      return rows[0] ? drizzleUserRow(rows[0]) : undefined;
    },

    async deleteUser(userId) {
      await db.delete(users).where(eq(users.id, userId));
    },

    async purgeUserAccount(userId) {
      await bestEffort([
        () => db.delete(chatMessages).where(eq(chatMessages.userId, userId)),
        () => db.delete(interviews).where(eq(interviews.userId, userId)),
        () => db.delete(applications).where(eq(applications.userId, userId)),
        () => db.delete(resumeChunks).where(eq(resumeChunks.userId, userId)),
        () => db.delete(candidates).where(eq(candidates.userId, userId)),
        () => db.delete(chatSessions).where(eq(chatSessions.userId, userId)),
        () => db.delete(jobs).where(eq(jobs.userId, userId)),
        () => db.delete(users).where(eq(users.id, userId)),
      ]);
    },
  };
}

async function bestEffort(operations: ReadonlyArray<() => Promise<unknown>>): Promise<void> {
  for (const operation of operations) {
    try {
      await operation();
    } catch {
      // Python wraps each cascade step in try/except and always reports success.
    }
  }
}

// ─── SQLite fallback implementation ──────────────────────────────────────────

function sqliteRow(table: string, row: Record<string, unknown>): DbRow {
  switch (table) {
    case 'chat_sessions':
      return {
        id: row['id'],
        user_id: row['user_id'],
        job_id: row['job_id'] ?? null,
        title: row['title'],
        last_intent: row['last_intent'] ?? null,
        pending_confirmation: row['pending_confirmation'] ?? null,
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    case 'chat_messages':
      return {
        id: row['id'],
        session_id: row['session_id'],
        user_id: row['user_id'],
        role: row['role'],
        content: row['content'],
        metadata: row['metadata'] ?? null,
        created_at: toIsoString(row['created_at']),
      };
    case 'candidates':
      return {
        id: row['id'],
        user_id: row['user_id'],
        full_name: row['full_name'],
        email: row['email'] ?? null,
        phone: row['phone'] ?? null,
        resume_file_url: row['resume_file_url'] ?? null,
        raw_resume_text: row['raw_resume_text'] ?? null,
        metadata: row['metadata'] ?? {},
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    case 'jobs':
      return {
        id: row['id'],
        user_id: row['user_id'],
        title: row['title'],
        raw_jd: row['raw_jd'] ?? null,
        jd_structured: row['jd_structured'] ?? null,
        status: row['status'],
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    case 'applications':
      return {
        id: row['id'],
        job_id: row['job_id'],
        candidate_id: row['candidate_id'],
        user_id: row['user_id'],
        match_score: numericOrNull(row['match_score']),
        match_reasoning: row['match_reasoning'] ?? null,
        status: row['status'],
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    case 'interviews':
      return {
        id: row['id'],
        application_id: row['application_id'] ?? null,
        candidate_id: row['candidate_id'] ?? null,
        user_id: row['user_id'],
        scheduled_at: toIsoString(row['scheduled_at']),
        duration_minutes: row['duration_minutes'] ?? null,
        mode: row['mode'] ?? null,
        meeting_link: row['meeting_link'] ?? null,
        status: row['status'],
        feedback: row['feedback'] ?? null,
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    case 'users':
      return {
        id: row['id'],
        email: row['email'],
        full_name: row['full_name'] ?? null,
        avatar_url: row['avatar_url'] ?? null,
        phone: row['phone'] ?? null,
        company_name: row['company_name'] ?? null,
        company_website: row['company_website'] ?? null,
        role: row['role'],
        preferences: row['preferences'] ?? {},
        last_sign_in_at: toIsoString(row['last_sign_in_at']),
        credits_balance: numericOrNull(row['credits_balance']),
        created_at: toIsoString(row['created_at']),
        updated_at: toIsoString(row['updated_at']),
      };
    default:
      return { ...row };
  }
}

function sqliteRows(table: string, rows: Record<string, unknown>[]): DbRow[] {
  return rows.map((row) => sqliteRow(table, row));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createSqliteWorkspaceQueryStore(db: FallbackDatabase): WorkspaceQueryStore {
  return {
    async listSessions(userId) {
      const rows = db
        .table('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', true)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('chat_sessions', rows);
    },

    async getSession(userId, sessionId) {
      const rows = db
        .table('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('chat_sessions', rows[0]) : undefined;
    },

    async insertSession(record) {
      db.table('chat_sessions')
        .insert({
          id: record.id,
          user_id: record.userId,
          title: record.title,
          job_id: record.jobId ?? null,
        })
        .execute();
    },

    async updateSession(userId, sessionId, patch) {
      const update = { ...normalizePatch(patch), updated_at: nowIso() };
      const rows = db
        .table('chat_sessions')
        .update(update)
        .eq('id', sessionId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('chat_sessions', rows[0]) : undefined;
    },

    async deleteSession(userId, sessionId) {
      db.table('chat_sessions').delete().eq('id', sessionId).eq('user_id', userId).execute();
    },

    async resetWorkspace(userId) {
      await this.deleteSessionCandidatesForUser(userId);
      db.table('chat_messages').delete().eq('user_id', userId).execute();
      db.table('interviews').delete().eq('user_id', userId).execute();
      db.table('applications').delete().eq('user_id', userId).execute();
      db.table('resume_chunks').delete().eq('user_id', userId).execute();
      db.table('candidates').delete().eq('user_id', userId).execute();
      db.table('chat_sessions').delete().eq('user_id', userId).execute();
      db.table('jobs').delete().eq('user_id', userId).execute();
    },

    async insertChatMessage(record) {
      db.table('chat_messages')
        .insert({
          session_id: record.sessionId,
          user_id: record.userId,
          role: record.role,
          content: record.content,
          metadata: record.metadata ?? null,
        })
        .execute();
    },

    async listChatMessages(userId, sessionId, query = {}) {
      let builder = db
        .table('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', query.descending === true);
      if (query.limit !== undefined) {
        builder = builder.limit(query.limit);
      }
      return sqliteRows('chat_messages', builder.execute().data as Record<string, unknown>[]);
    },

    async deleteChatMessagesBefore(userId, cutoffIso) {
      const countBuilder = db.table('chat_messages').select('id').lt('created_at', cutoffIso);
      const scoped = userId === undefined ? countBuilder : countBuilder.eq('user_id', userId);
      const count = scoped.execute().data.length;
      let deleteBuilder = db.table('chat_messages').delete().lt('created_at', cutoffIso);
      if (userId !== undefined) {
        deleteBuilder = deleteBuilder.eq('user_id', userId);
      }
      deleteBuilder.execute();
      return count;
    },

    async listCandidates(userId) {
      const rows = db
        .table('candidates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', false)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('candidates', rows);
    },

    async getCandidate(userId, candidateId) {
      const rows = db
        .table('candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('user_id', userId)
        .limit(1)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('candidates', rows[0]) : undefined;
    },

    async insertCandidate(record) {
      db.table('candidates')
        .insert({
          id: record.id,
          user_id: record.userId,
          full_name: record.fullName,
          email: record.email,
          raw_resume_text: record.rawResumeText,
          metadata: record.metadata,
        })
        .execute();
    },

    async updateCandidateMetadata(userId, candidateId, metadata) {
      const rows = db
        .table('candidates')
        .update({ metadata, updated_at: nowIso() })
        .eq('id', candidateId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('candidates', rows[0]) : undefined;
    },

    async listCandidatesCreatedSince(userId, cutoffIso) {
      const rows = db
        .table('candidates')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', cutoffIso)
        .order('created_at', false)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('candidates', rows);
    },

    async clearRawResumeTextBefore(userId, cutoffIso) {
      let builder = db
        .table('candidates')
        .update({ raw_resume_text: null })
        .lt('created_at', cutoffIso);
      if (userId !== undefined) {
        builder = builder.eq('user_id', userId);
      }
      return builder.execute().data.length;
    },

    async deleteCandidate(userId, candidateId) {
      db.table('candidates').delete().eq('id', candidateId).eq('user_id', userId).execute();
    },

    async listJobs(userId) {
      const rows = db
        .table('jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', true)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('jobs', rows);
    },

    async getJobStructured(userId, jobId) {
      const rows = db
        .table('jobs')
        .select('jd_structured')
        .eq('id', jobId)
        .eq('user_id', userId)
        .limit(1)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? { jd_structured: rows[0]['jd_structured'] ?? null } : undefined;
    },

    async listApplications(userId) {
      const rows = db.table('applications').select('*').eq('user_id', userId).execute()
        .data as Record<string, unknown>[];
      return sqliteRows('applications', rows);
    },

    async getApplicationForCandidate(userId, candidateId, jobId) {
      let builder = db
        .table('applications')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('user_id', userId);
      if (jobId !== undefined) {
        builder = builder.eq('job_id', jobId);
      }
      const rows = builder.limit(1).execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('applications', rows[0]) : undefined;
    },

    async listApplicationsForCandidate(userId, candidateId) {
      const rows = db
        .table('applications')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('applications', rows);
    },

    async insertApplication(record) {
      db.table('applications')
        .insert({
          id: record.id,
          job_id: record.jobId,
          candidate_id: record.candidateId,
          user_id: record.userId,
          match_score: record.matchScore,
          match_reasoning: record.matchReasoning,
          status: record.status,
        })
        .execute();
    },

    async updateApplication(userId, applicationId, patch) {
      const rows = db
        .table('applications')
        .update({ ...normalizePatch(patch), updated_at: nowIso() })
        .eq('id', applicationId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('applications', rows[0]) : undefined;
    },

    async updateApplicationStatusForCandidate(userId, candidateId, status) {
      db.table('applications')
        .update({ status, updated_at: nowIso() })
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async deleteApplicationsForCandidate(userId, candidateId) {
      db.table('applications')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async listInterviews(userId, candidateIds) {
      if (candidateIds !== undefined && candidateIds.length === 0) {
        return [];
      }
      let builder = db
        .table('interviews')
        .select('*')
        .eq('user_id', userId)
        .order('scheduled_at', false);
      if (candidateIds !== undefined) {
        builder = builder.in('candidate_id', candidateIds);
      }
      return sqliteRows('interviews', builder.execute().data as Record<string, unknown>[]);
    },

    async listInterviewsForCandidate(userId, candidateId) {
      const rows = db
        .table('interviews')
        .select('*')
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute().data as Record<string, unknown>[];
      return sqliteRows('interviews', rows);
    },

    async deleteInterviewsForCandidate(userId, candidateId) {
      db.table('interviews')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async listSessionCandidates(sessionId) {
      const rows = db
        .table('session_candidates')
        .select('candidate_id')
        .eq('session_id', sessionId)
        .execute().data as Record<string, unknown>[];
      return rows.map((row) => String(row['candidate_id']));
    },

    async listSessionCandidatesForSessions(sessionIds) {
      if (sessionIds.length === 0) {
        return [];
      }
      const rows = db.table('session_candidates').select('*').in('session_id', sessionIds).execute()
        .data as Record<string, unknown>[];
      return rows.map((row) => ({
        session_id: row['session_id'],
        candidate_id: row['candidate_id'],
        created_at: toIsoString(row['created_at']),
      }));
    },

    async upsertSessionCandidate(sessionId, candidateId) {
      db.table('session_candidates')
        .upsert({ session_id: sessionId, candidate_id: candidateId })
        .execute();
    },

    async deleteSessionCandidatesForSession(sessionId) {
      db.table('session_candidates').delete().eq('session_id', sessionId).execute();
    },

    async deleteSessionCandidatesForCandidate(candidateId) {
      db.table('session_candidates').delete().eq('candidate_id', candidateId).execute();
    },

    async deleteSessionCandidatesForUser(userId) {
      const sessionIds = (
        db.table('chat_sessions').select('id').eq('user_id', userId).execute().data as Record<
          string,
          unknown
        >[]
      ).map((row) => String(row['id']));
      const candidateIds = (
        db.table('candidates').select('id').eq('user_id', userId).execute().data as Record<
          string,
          unknown
        >[]
      ).map((row) => String(row['id']));

      if (sessionIds.length > 0) {
        db.table('session_candidates').delete().in('session_id', sessionIds).execute();
      }
      if (candidateIds.length > 0) {
        db.table('session_candidates').delete().in('candidate_id', candidateIds).execute();
      }
    },

    async countResumeChunks(userId, candidateId) {
      return db
        .table('resume_chunks')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute().data.length;
    },

    async deleteResumeChunksForCandidate(userId, candidateId) {
      db.table('resume_chunks')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('user_id', userId)
        .execute();
    },

    async getUser(userId) {
      const rows = db.table('users').select('*').eq('id', userId).limit(1).execute().data as Record<
        string,
        unknown
      >[];
      return rows[0] ? sqliteRow('users', rows[0]) : undefined;
    },

    async updateUser(userId, patch) {
      const rows = db
        .table('users')
        .update({ ...normalizePatch(patch), updated_at: nowIso() })
        .eq('id', userId)
        .execute().data as Record<string, unknown>[];
      return rows[0] ? sqliteRow('users', rows[0]) : undefined;
    },

    async deleteUser(userId) {
      db.table('users').delete().eq('id', userId).execute();
    },

    async purgeUserAccount(userId) {
      const operations: ReadonlyArray<() => void> = [
        () => db.table('chat_messages').delete().eq('user_id', userId).execute(),
        () => db.table('interviews').delete().eq('user_id', userId).execute(),
        () => db.table('applications').delete().eq('user_id', userId).execute(),
        () => db.table('resume_chunks').delete().eq('user_id', userId).execute(),
        () => db.table('candidates').delete().eq('user_id', userId).execute(),
        () => db.table('chat_sessions').delete().eq('user_id', userId).execute(),
        () => db.table('jobs').delete().eq('user_id', userId).execute(),
        () => db.table('users').delete().eq('id', userId).execute(),
      ];
      for (const operation of operations) {
        try {
          operation();
        } catch {
          // Best-effort, matching Python's per-table try/except.
        }
      }
    },
  };
}

export interface WorkspaceQueryStoreOptions {
  readonly config?: AppConfig;
  /** Explicit Drizzle handle (tests / scripts). */
  readonly db?: Database;
  /** Explicit SQLite fallback handle (tests). */
  readonly fallback?: FallbackDatabase;
}

/**
 * Resolve the production store: PostgreSQL when `DATABASE_URL` is configured,
 * otherwise the local SQLite fallback. Selection is lazy, so constructing a
 * service never opens a connection.
 */
export function createWorkspaceQueryStore(
  options: WorkspaceQueryStoreOptions = {},
): WorkspaceQueryStore {
  if (options.db) {
    return createDrizzleWorkspaceQueryStore(options.db);
  }
  if (options.fallback) {
    return createSqliteWorkspaceQueryStore(options.fallback);
  }
  const config = options.config ?? getConfig();
  return config.database.url
    ? createDrizzleWorkspaceQueryStore(getDb())
    : createSqliteWorkspaceQueryStore(getFallbackDatabase());
}

/** Exposed for services that need to mint identifiers exactly like Python. */
export function newId(): string {
  return randomUUID();
}
