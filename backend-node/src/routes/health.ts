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
 * Liveness probe only — mirrors GET / and GET /health | /api/health from the
 * Python backend. Deep readiness (DB / LLM / auth diagnostics) and metrics are
 * Phase 4/17 work and require the real config + DB layer.
 */
export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'RecruitAI backend API server is running successfully.' });
});

healthRouter.get(['/health', '/api/health'], liveness);
