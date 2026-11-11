import { z } from 'zod';

import { optionalString, pydanticDict } from './common.js';

/**
 * `PatchSessionRequest` exists in `routes_sessions.py` but the live
 * `PATCH /api/sessions/:id` handler declares `payload: dict` and accepts any
 * JSON object (it removes `user_id` and forwards the rest). Both shapes are
 * exported so Phase 15 can choose the one the route actually uses.
 */
export const patchSessionRequestSchema = z.object({
  title: optionalString(),
});

/** The actual route payload: an arbitrary JSON object. */
export const sessionPatchPayloadSchema = pydanticDict();

export type PatchSessionRequest = z.infer<typeof patchSessionRequestSchema>;
export type SessionPatchPayload = z.infer<typeof sessionPatchPayloadSchema>;

/** `GET /api/sessions` rows (ad-hoc dicts in Python, no response_model). */
export interface SessionSummary {
  readonly id: string;
  readonly title?: string | null;
  readonly job_id?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly candidate_count?: number;
}

/** `POST /api/sessions` response. */
export interface CreateSessionResponse {
  readonly id: string;
  readonly user_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly candidate_count: number;
  readonly conversation_history: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly resumes: ReadonlyArray<unknown>;
  readonly scheduled_interviews: ReadonlyArray<unknown>;
}
