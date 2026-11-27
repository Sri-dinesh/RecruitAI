import type { RequestContext } from '../context/request-context.js';

/**
 * Express request additions populated by `requireAuth`.
 *
 * The request context is also available through AsyncLocalStorage, which is
 * preferred inside services. `req.userId` is kept for route-level ergonomics.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      requestContext?: Readonly<RequestContext>;
      /** Correlation id set by `createRequestIdMiddleware`. */
      requestId?: string;
      /** Output of `validateQuery(...)` for the matched route. */
      validatedQuery?: unknown;
      /** Output of `validateHeaders(...)` for the matched route. */
      validatedHeaders?: unknown;
    }
  }
}

export {};
