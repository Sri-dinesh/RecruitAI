import { Router, type Request, type RequestHandler, type Response } from 'express';

import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Public liveness and authenticated readiness probes, ported from
 * `app/main.py` (ENG-5).
 *
 * Liveness is intentionally shallow: load balancers get a 200 as long as the
 * process can answer, and anonymous callers never see database topology.
 *
 * Readiness is authenticated like Python's `Depends(get_current_user_id)` and
 * performs real dependency checks:
 *   1. database round trip (latency + backend type),
 *   2. LLM provider configuration (model list only; never the key),
 *   3. authentication mode.
 *
 * Failure semantics match Python: an unreachable database is `unhealthy` with
 * HTTP 503; a working SQLite fallback or unconfigured LLM is `degraded` with
 * HTTP 200. Error details are reduced to the exception type, so raw database
 * errors, credentials and stack traces never reach the caller.
 */

export const SERVER_START_TIME = Date.now();
export const API_VERSION = '2.0.0';

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

function liveness(_req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    message: 'RecruitAI backend API server is operational.',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round((Date.now() - SERVER_START_TIME) / 10) / 100,
    version: API_VERSION,
  });
}

/** Public liveness probes — mirror GET / and GET /health | /api/health. */
export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'RecruitAI backend API server is running successfully.' });
});

// Registered separately so `req.route.path` stays a string and the request
// metrics middleware can label these endpoints instead of `unmatched`.
healthRouter.get('/health', liveness);
healthRouter.get('/api/health', liveness);

export interface ReadinessRouterOptions {
  readonly config: AppConfig;
  /** Shared Phase 15 store; defaults to the configured Drizzle/SQLite store. */
  readonly queryStore?: WorkspaceQueryStore;
  /** Injectable auth middleware (tests); defaults to `requireAuth({ config })`. */
  readonly auth?: RequestHandler;
}

interface DatabaseService {
  status: 'healthy' | 'unhealthy';
  type?: string;
  latency_ms: number;
  error_type?: string;
}

interface LlmService {
  status: 'configured' | 'unconfigured' | 'error';
  provider?: string;
  models?: readonly string[];
  warning?: string;
  error_type?: string;
}

interface AuthService {
  mode: 'local_dev' | 'supabase_jwt' | 'unconfigured_jwt';
  local_auth_enabled: boolean;
}

/** Same placeholder guard as Python's `"your_gemini" not in key`. */
function isLlmConfigured(config: AppConfig): boolean {
  const key = config.llm.geminiApiKey;
  return Boolean(key) && !key?.includes('your_gemini');
}

/** Python's auth readiness modes, without exposing secrets or key lengths. */
export function resolveAuthMode(config: AppConfig): AuthService {
  const useLocalAuth = config.auth.useLocalAuth;
  return {
    mode: useLocalAuth ? 'local_dev' : config.auth.jwtSecret ? 'supabase_jwt' : 'unconfigured_jwt',
    local_auth_enabled: useLocalAuth,
  };
}

export function createReadinessRouter(options: ReadinessRouterOptions): Router {
  const router = Router();
  const auth = options.auth ?? requireAuth({ config: options.config });
  let store = options.queryStore;

  const getStore = (): WorkspaceQueryStore => {
    store ??= createWorkspaceQueryStore({ config: options.config });
    return store;
  };

  const readiness: RequestHandler = async (_req, res) => {
    let overallHealthy = true;
    let degraded = false;
    const services: {
      database: DatabaseService;
      llm: LlmService;
      auth: AuthService;
    } = {
      database: { status: 'healthy', latency_ms: 0 },
      llm: { status: 'unconfigured' },
      auth: { mode: 'unconfigured_jwt', local_auth_enabled: false },
    };

    // 1. Database connectivity.
    const dbStarted = performance.now();
    try {
      const database = getStore();
      await database.ping();
      services.database = {
        status: 'healthy',
        // Python reports `supabase_postgresql` for the hosted database. Keep
        // that label while the internal store kind stays deployment-neutral.
        type: database.kind === 'sqlite_fallback' ? 'sqlite_fallback' : 'supabase_postgresql',
        latency_ms: roundMs(performance.now() - dbStarted),
      };
      // A working SQLite fallback is usable but operationally degraded, as in
      // the Python readiness probe.
      if (database.kind === 'sqlite_fallback') {
        degraded = true;
      }
    } catch (error) {
      overallHealthy = false;
      services.database = {
        status: 'unhealthy',
        error_type: errorType(error),
        latency_ms: roundMs(performance.now() - dbStarted),
      };
    }

    // 2. LLM provider configuration. The key itself is never returned.
    if (isLlmConfigured(options.config)) {
      services.llm = {
        status: 'configured',
        provider: 'google_gemini',
        models: options.config.llm.rotatingModels,
      };
    } else {
      degraded = true;
      services.llm = {
        status: 'unconfigured',
        warning: 'GEMINI_API_KEY is missing or unconfigured',
      };
    }

    // 3. Authentication mode.
    services.auth = resolveAuthMode(options.config);

    const status = overallHealthy ? (degraded ? 'degraded' : 'healthy') : 'unhealthy';
    res.status(overallHealthy ? 200 : 503).json({
      status,
      message: 'RecruitAI readiness diagnostics completed.',
      timestamp: new Date().toISOString(),
      uptime_seconds: roundMs((Date.now() - SERVER_START_TIME) / 1000),
      version: API_VERSION,
      services,
    });
  };

  // Registered separately so metrics can label each endpoint; both require auth.
  router.get('/health/ready', auth, readiness);
  router.get('/api/health/ready', auth, readiness);

  return router;
}
