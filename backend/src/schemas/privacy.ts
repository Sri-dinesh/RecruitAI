import { z } from 'zod';

import { pydanticInt } from './common.js';

/**
 * Port of `routes_privacy.py::RetentionRunRequest`.
 *
 * The Python model has no ge/le constraints (negative TTLs are accepted) and
 * both fields are `Optional[int]` with non-null defaults. The route treats a
 * missing body as a defaults instance, so Phase 15 should use
 * `validateBody(..., { required: false })`.
 */
export const retentionRunRequestSchema = z.object({
  raw_resume_ttl_days: pydanticInt().nullable().default(90),
  chat_ttl_days: pydanticInt().nullable().default(365),
});

export type RetentionRunRequest = z.infer<typeof retentionRunRequestSchema>;

/** `POST /api/privacy/retention/run` response. */
export interface RetentionRunResponse {
  readonly success: true;
  readonly summary: unknown;
}
