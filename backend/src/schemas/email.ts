import { z } from 'zod';

import { optionalString, pydanticEmail, pydanticInt } from './common.js';

/**
 * Port of `app/schemas/email_schema.py`.
 *
 * `EmailRequest.recipient_email` keeps the Python validator: the value is
 * trimmed, then checked with `^[^\s@]+@[^\s@]+\.[^\s@]+$`. On failure the
 * FastAPI error is a `value_error` with the same message text.
 */
export const emailRequestSchema = z.object({
  recipient_email: pydanticEmail(),
  email_draft: optionalString(),
  subject: optionalString(),
  body: optionalString(),
  candidate_id: optionalString(),
  template_id: optionalString(),
});

export const emailResponseSchema = z.object({
  status: z.string(),
  log_id: optionalString(),
  dispatch_type: z.string().default('simulated'),
  credits_remaining: pydanticInt().nullable().default(null),
});

export const outreachLogItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  candidate_id: optionalString(),
  recipient_email: z.string(),
  subject: z.string(),
  body: z.string(),
  template_id: optionalString(),
  status: z.string(),
  error_message: optionalString(),
  created_at: z.string(),
});

export const outreachHistoryResponseSchema = z.object({
  total: pydanticInt(),
  items: z.array(outreachLogItemSchema),
});

export const outreachStatsResponseSchema = z.object({
  total_sent: pydanticInt(),
  smtp_count: pydanticInt(),
  simulated_count: pydanticInt(),
  failed_count: pydanticInt(),
});

/**
 * `GET /api/email/history` query parameters:
 *   candidate_id: Optional[str] = None
 *   limit: int = Query(default=50, ge=1, le=100)
 */
export const emailHistoryQuerySchema = z.object({
  candidate_id: optionalString(),
  limit: pydanticInt({ ge: 1, le: 100 }).default(50),
});

export type EmailRequest = z.infer<typeof emailRequestSchema>;
export type EmailResponse = z.infer<typeof emailResponseSchema>;
export type OutreachLogItem = z.infer<typeof outreachLogItemSchema>;
export type OutreachHistoryResponse = z.infer<typeof outreachHistoryResponseSchema>;
export type OutreachStatsResponse = z.infer<typeof outreachStatsResponseSchema>;
export type EmailHistoryQuery = z.infer<typeof emailHistoryQuerySchema>;

/** Kept for parity with consumers that only need list types. */
export const outreachLogListSchema = z.array(outreachLogItemSchema);
export type OutreachLogList = z.infer<typeof outreachLogListSchema>;
