import { Router, type Request, type Response } from 'express';

const SERVER_START_TIME = Date.now();
const API_VERSION = '2.0.0';

function liveness(_req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    message: 'RecruitAI backend API server is operational.',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round((Date.now() - SERVER_START_TIME) / 10) / 100,
    version: API_VERSION,
  });
}

/**
 * Public liveness probes — mirror GET / and GET /health | /api/health from
 * `app/main.py`. Deep readiness (`/health/ready`, `/api/health/ready`) needs
 * the LLM diagnostics layer, so it arrives with a later phase. Metrics live in
 * `metrics.ts` (Phase 7) and are authenticated.
 */
export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'RecruitAI backend API server is running successfully.' });
});

healthRouter.get(['/health', '/api/health'], liveness);
