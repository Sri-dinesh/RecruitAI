import { z } from 'zod';

import { optionalString, pydanticBool, pydanticDict } from './common.js';

export const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

/**
 * Port of `ChatRequest` in `app/api/routes_chat.py`.
 *
 * `conversation_history` and `resumes` default to `[]` and reject `null`;
 * the `Optional[...] = None` fields accept `null`.
 */
export const chatRequestSchema = z.object({
  message: z.string(),
  conversation_history: z.array(chatMessageSchema).default(() => []),
  jd_structured: pydanticDict().nullable().default(null),
  resumes: z.array(pydanticDict()).default(() => []),
  last_shortlist: z.array(pydanticDict()).nullable().default(null),
  pending_confirmation: pydanticDict().nullable().default(null),
  last_intent: optionalString(),
  scheduled_interviews: z.array(pydanticDict()).nullable().default(null),
  session_id: optionalString(),
  async_mode: pydanticBool().nullable().default(false),
  focused_candidate_id: optionalString(),
});

/** Port of `ChatResponse`. */
export const chatResponseSchema = z.object({
  response: z.string(),
  jd_structured: pydanticDict().nullable().default(null),
  resumes: z.array(pydanticDict()).default(() => []),
  last_shortlist: z.array(pydanticDict()).nullable().default(null),
  pending_confirmation: pydanticDict().nullable().default(null),
  last_intent: optionalString(),
  conversation_history: z.array(chatMessageSchema).default(() => []),
  router_logs: z.array(pydanticDict()).default(() => []),
  scheduled_interviews: z.array(pydanticDict()).nullable().default(null),
  session_id: optionalString(),
});

/** `POST /api/chat` also accepts `?async_mode=` (Query(False)). */
export const chatQuerySchema = z.object({
  async_mode: pydanticBool().default(false),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatQuery = z.infer<typeof chatQuerySchema>;
