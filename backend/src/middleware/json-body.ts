import express, { type RequestHandler } from 'express';

/**
 * Interim JSON body limit.
 *
 * FastAPI/Starlette read the whole body with no framework limit, while
 * body-parser requires one. Chat and report requests can legitimately include
 * candidate objects with large `raw_text` fields, so the default 100 kB is far
 * too small. Phase 23 replaces this with stream-limited parsing and the
 * fair-use limits from `docs/slo.md`.
 */
export const JSON_BODY_LIMIT = '25mb';

/**
 * `strict: false` lets primitive JSON values reach the validators, where they
 * produce FastAPI's `model_attributes_type` (or `missing` for `null`) instead
 * of body-parser's generic parse error.
 */
export const jsonBodyParser: RequestHandler = express.json({
  strict: false,
  limit: JSON_BODY_LIMIT,
});
