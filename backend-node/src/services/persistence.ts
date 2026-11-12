import { randomUUID } from 'node:crypto';

import type { WorkspaceStore } from '../db/workspace-store.js';
import type { Candidate } from '../schemas/candidate.js';
import type { JobDescription } from '../schemas/jd.js';

/**
 * Port of `backend/app/services/persistence_service.py`.
 *
 * All functions take a `WorkspaceStore` instead of a Supabase client. The
 * store has a Drizzle/PostgreSQL implementation and a SQLite fallback, so this
 * behavior is identical on both paths and every query stays tenant-scoped by
 * `user_id`.
 *
 * Failure semantics are preserved: each write is best-effort, logs the same
 * warning text as Python, and never aborts the surrounding campaign flow.
 */

export interface ScheduledInterview {
  candidate_id?: unknown;
  candidate_name?: unknown;
  slot?: unknown;
  duration_minutes?: unknown;
  duration?: unknown;
  mode?: unknown;
  application_id?: unknown;
  booked_at?: unknown;
  [key: string]: unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Convert an extracted slot to a timestamp. A blank or unparseable slot
 * becomes `null` rather than a fabricated date (BUG-4).
 */
function parseSlot(slot: string | null): Date | null {
  if (!slot) {
    return null;
  }
  const parsed = new Date(slot);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Persist or update a structured job description, keyed by user + title.
 * Returns the job UUID, matching Python.
 */
export async function persistJob(
  store: WorkspaceStore,
  userId: string,
  jdStructured: JobDescription | null | undefined,
  rawText = '',
): Promise<string | null> {
  if (!jdStructured || !jdStructured.role) {
    return null;
  }

  const jobTitle = jdStructured.role;
  const structured = jdStructured as Record<string, unknown>;
  const rawJd = jdStructured.raw_text || rawText || '';
  let jobId: string | null = null;

  try {
    const existingJobId = await store.findJobIdByTitle(userId, jobTitle);
    if (existingJobId) {
      jobId = existingJobId;
      await store.updateJob(userId, existingJobId, { jdStructured: structured, rawJd });
    } else {
      jobId = randomUUID();
      await store.insertJob({
        id: jobId,
        userId,
        title: jobTitle,
        rawJd,
        jdStructured: structured,
        status: 'active',
      });
    }
  } catch (error) {
    // Preserve Python: the generated id is returned even if the write failed.
    console.warn(`[persistence_service] Failed to persist job: ${errorMessage(error)}`);
  }

  return jobId;
}

/**
 * Upsert shortlisted candidate evaluations into `applications`.
 * Only real candidate UUIDs are persisted, exactly like Python.
 */
export async function persistApplications(
  store: WorkspaceStore,
  userId: string,
  jobId: string | null | undefined,
  shortlist: readonly Candidate[],
): Promise<void> {
  if (!jobId || shortlist.length === 0) {
    return;
  }

  for (const candidate of shortlist) {
    const candidateId = candidate.candidate_id;
    if (!candidateId || candidateId.length !== 36) {
      continue;
    }
    try {
      await store.upsertApplication({
        jobId,
        candidateId,
        userId,
        matchScore: candidate.match_score || 0,
        matchReasoning: {
          matched_skills: candidate.matched_skills ?? [],
          gaps: candidate.gaps ?? [],
          summary: candidate.summary,
        },
        status: 'shortlisted',
      });
    } catch (error) {
      console.warn(
        `[persistence_service] Failed to persist application for candidate ${candidateId}: ${errorMessage(error)}`,
      );
    }
  }
}

/**
 * Insert scheduled interviews.
 *
 * BUG-4 compliance: `scheduled_at` stays NULL when the slot is missing or
 * unextractable. Candidate ids are resolved by name when absent; application
 * ids are resolved by candidate + job, always scoped to the tenant.
 */
export async function persistInterviews(
  store: WorkspaceStore,
  userId: string,
  scheduledInterviews: readonly ScheduledInterview[],
  jobId?: string | null,
): Promise<void> {
  if (scheduledInterviews.length === 0) {
    return;
  }

  for (const interview of scheduledInterviews) {
    try {
      const candidateName = asString(interview.candidate_name) ?? '';
      let candidateId = asString(interview.candidate_id);
      if (!candidateId && candidateName) {
        candidateId = await store.findCandidateIdByName(userId, candidateName);
      }

      const rawSlot = interview.slot;
      const slot = typeof rawSlot === 'string' && rawSlot.trim().length > 0 ? rawSlot.trim() : null;

      const duration = asNumber(interview.duration_minutes) || asNumber(interview.duration) || 30;
      const mode = asString(interview.mode) ?? 'video';

      let applicationId = asString(interview.application_id);
      if (!applicationId && candidateId && jobId) {
        applicationId = await store.findApplicationId(userId, candidateId, jobId);
      }

      await store.insertInterview({
        candidateId: candidateId ?? null,
        userId,
        applicationId: applicationId ?? null,
        scheduledAt: parseSlot(slot),
        durationMinutes: duration,
        mode,
        status: 'scheduled',
        feedback: {
          candidate_name: candidateName,
          booked_at: interview.booked_at ?? null,
        },
      });
    } catch (error) {
      console.warn(`[persistence_service] Failed to persist interview: ${errorMessage(error)}`);
    }
  }
}

/** Insert one chat message; metadata is omitted when undefined. */
export async function persistChatMessage(
  store: WorkspaceStore,
  userId: string,
  sessionId: string,
  role: string,
  content: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await store.insertChatMessage({
      sessionId,
      userId,
      role,
      content,
      ...(metadata === undefined || metadata === null ? {} : { metadata }),
    });
  } catch (error) {
    console.warn(
      `[persistence_service] Failed to persist chat message (${role}): ${errorMessage(error)}`,
    );
  }
}

/**
 * Link a candidate to a chat session. The store verifies that both rows belong
 * to the tenant, so a cross-tenant id pair is a no-op instead of a leak.
 */
export async function persistSessionCandidate(
  store: WorkspaceStore,
  userId: string,
  sessionId: string,
  candidateId: string,
): Promise<boolean> {
  try {
    return await store.upsertSessionCandidate(userId, sessionId, candidateId);
  } catch (error) {
    console.warn(
      `[persistence_service] Failed to link candidate to session: ${errorMessage(error)}`,
    );
    return false;
  }
}

/**
 * Update chat-session metadata. `last_intent` and `pending_confirmation` are
 * always written (null clears them), mirroring the Python update payload.
 */
export async function updateSessionMetadata(
  store: WorkspaceStore,
  userId: string,
  sessionId: string,
  options: {
    title?: string | null;
    jobId?: string | null;
    lastIntent?: string | null;
    pendingConfirmation?: Record<string, unknown> | null;
  } = {},
): Promise<void> {
  try {
    await store.updateSession(userId, sessionId, {
      lastIntent: options.lastIntent ?? null,
      pendingConfirmation: options.pendingConfirmation ?? null,
      updatedAt: new Date(),
      ...(options.title ? { title: options.title } : {}),
      ...(options.jobId ? { jobId: options.jobId } : {}),
    });
  } catch (error) {
    console.warn(
      `[persistence_service] Failed to update chat_sessions metadata: ${errorMessage(error)}`,
    );
  }
}
