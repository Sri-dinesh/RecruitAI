import type { RequestHandler } from 'express';

import { parseBearerToken } from '../auth/bearer.js';
import { createAuthService, type AuthServiceOptions } from '../auth/service.js';
import { createRequestContext, runWithRequestContext } from '../context/request-context.js';
import { UnauthorizedError } from '../types/errors.js';

export type RequireAuthOptions = AuthServiceOptions;

/**
 * Express equivalent of FastAPI's `Depends(get_current_user_id)`.
 *
 * Verifies the bearer token, rejects invalid credentials with the same 401
 * body/`WWW-Authenticate` challenge FastAPI produces, attaches the user id to
 * the request, and runs the rest of the request inside an isolated
 * AsyncLocalStorage context (user, tenant, request id, later session id).
 *
 * Mount per router, mirroring where Python applies the dependency. Public
 * routes (health probes, the Razorpay webhook) must not use it.
 */
export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  const auth = createAuthService(options);

  return (req, res, next) => {
    const token = parseBearerToken(req.headers.authorization);

    void auth.getCurrentUserId(token).then(
      (userId) => {
        const context = createRequestContext(userId);
        req.userId = userId;
        req.requestContext = context;
        runWithRequestContext(context, next);
      },
      (error: unknown) => {
        if (error instanceof UnauthorizedError) {
          res.status(error.statusCode).set(error.headers).json({ detail: error.detail });
          return;
        }
        next(error);
      },
    );
  };
}
