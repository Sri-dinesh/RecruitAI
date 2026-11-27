import cors from 'cors';
import type { RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';

/** Method list from `app/main.py` (kept as one string for byte parity). */
export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/** Starlette's default preflight cache lifetime. */
export const CORS_MAX_AGE_SECONDS = 600;

/**
 * Port of the FastAPI/Starlette CORS configuration:
 *
 *   allow_origins=ALLOWED_ORIGINS
 *   allow_origin_regex=^https://recruitai(-[a-zA-Z0-9]+)?\.vercel\.app$
 *   allow_credentials=True
 *   allow_methods=[GET, POST, PUT, PATCH, DELETE, OPTIONS]
 *   allow_headers=["*"]
 *
 * Requests without an `Origin` header (server-to-server, health probes) get no
 * CORS headers, exactly like the Starlette middleware.
 */
export function createCorsMiddleware(config: AppConfig): RequestHandler {
  const allowedOrigins = new Set(config.cors.allowedOrigins);
  const previewOrigin = new RegExp(config.cors.previewOriginRegex);

  return cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, allowedOrigins.has(origin) || previewOrigin.test(origin));
    },
    credentials: true,
    methods: CORS_ALLOWED_METHODS,
    // Starlette's `allow_headers=["*"]` reflects the requested headers during
    // preflight. The `cors` package only does that when `allowedHeaders` is
    // omitted; setting `'*'` would emit a literal wildcard, which browsers
    // reject for credentialed requests.
    maxAge: CORS_MAX_AGE_SECONDS,
    // Starlette answers preflights with 200, not the cors default 204.
    optionsSuccessStatus: 200,
  });
}
