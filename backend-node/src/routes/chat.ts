import { randomUUID } from 'node:crypto';

import { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import { createChatJobManager } from '../jobs/index.js';
import type { ChatJobManager, ChatJobPayload } from '../jobs/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getValidatedQuery, validateBody, validateQuery } from '../middleware/validate.js';
import {
  chatQuerySchema,
  chatRequestSchema,
  type ChatQuery,
  type ChatRequest,
} from '../schemas/chat.js';
import {
  createCampaignService,
  type CampaignService,
  type ExecuteAgentTurnInput,
} from '../services/campaign-service.js';
import { createLogger } from '../telemetry/logger.js';
import { HttpError } from '../types/errors.js';

const logger = createLogger('recruitai.routes_chat');

/**
 * Port of `backend/app/api/routes_chat.py`.
 *
 * Preserved contract:
 * - `POST /api/chat` runs synchronously by default and returns `ChatResponse`;
 * - `?async_mode=true` or `"async_mode": true` returns 202 with
 *   `{job_id, session_id, status: "queued", check_url, stream_url}`;
 * - `GET /api/chat/jobs/:id` returns the Python `AgentJob.to_dict()` shape and
 *   is tenant-scoped (another user's id is a 404);
 * - `GET /api/chat/jobs/:id/stream` emits `init`, `status`, then `complete` or
 *   `error` as `text/event-stream`, replaying a finished job immediately.
 *
 * Session creation and context hydration happen before dispatch, exactly as in
 * Python, so the worker receives a self-contained turn payload.
 */

export interface ChatRouterOptions {
  readonly config?: AppConfig;
  readonly campaignService?: CampaignService;
  readonly jobManager?: ChatJobManager;
  /** Pre-built auth middleware (the API router shares one instance). */
  readonly auth?: RequestHandler;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function turnInput(
  userId: string,
  sessionId: string,
  body: ChatRequest,
  context: {
    jd: Record<string, unknown> | null;
    resumes: Record<string, unknown>[];
    history: Array<{ role: string; content: string }>;
  },
): ExecuteAgentTurnInput {
  return {
    userId,
    sessionId,
    message: body.message,
    jd: context.jd,
    resumes: context.resumes,
    ...(body.last_shortlist === null ? {} : { shortlist: body.last_shortlist }),
    history: context.history,
    pendingConfirmation: body.pending_confirmation ?? null,
    lastIntent: body.last_intent ?? null,
    scheduledInterviews: body.scheduled_interviews ?? null,
    focusedCandidateId: body.focused_candidate_id ?? null,
  };
}

export function createChatRouter(options: ChatRouterOptions = {}): Router {
  const router = Router();
  const config = options.config ?? getConfig();
  const service = options.campaignService ?? createCampaignService({ config });
  const manager =
    options.jobManager ??
    createChatJobManager({
      config,
      runner: (payload) => service.executeAgentTurn(payload as unknown as ExecuteAgentTurnInput),
    });
  const auth = options.auth ?? requireAuth({ config });

  router.post(
    '/',
    auth,
    validateQuery(chatQuerySchema),
    validateBody(chatRequestSchema),
    async (req, res) => {
      const userId = getCurrentUserId();
      const body = req.body as ChatRequest;
      const query = getValidatedQuery<ChatQuery>(req);

      const sessionId = await service.ensureSessionExists(userId, body.session_id ?? null);
      const context = await service.hydrateChatContext({
        userId,
        sessionId,
        jd: body.jd_structured,
        resumes: body.resumes,
        historyItems: body.conversation_history,
      });

      const input = turnInput(userId, sessionId, body, context);
      const shouldRunAsync = query.async_mode || Boolean(body.async_mode);

      if (shouldRunAsync) {
        const job = await manager.createJob(userId, sessionId);
        await manager.startJob(job.job_id, input as unknown as ChatJobPayload);
        res.status(202).json({
          job_id: job.job_id,
          session_id: sessionId,
          status: 'queued',
          check_url: `/api/chat/jobs/${job.job_id}`,
          stream_url: `/api/chat/jobs/${job.job_id}/stream`,
        });
        return;
      }

      try {
        res.json(await service.executeAgentTurn(input));
      } catch (error) {
        const refId = randomUUID().replace(/-/g, '').slice(0, 8);
        logger.error(`[chat_endpoint ref=${refId}] Agent execution failed: ${errorMessage(error)}`);
        throw new HttpError(500, `Agent execution failed. (ref=${refId})`);
      }
    },
  );

  router.get('/jobs/:job_id', auth, async (req, res) => {
    const userId = getCurrentUserId();
    const job = await manager.getJob(paramString(req.params.job_id), userId);
    if (!job) {
      throw new HttpError(404, 'Agent job not found.');
    }
    res.json({
      job_id: job.job_id,
      session_id: job.session_id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      steps_count: job.steps_count,
      result: job.result,
      error: job.error,
    });
  });

  router.get('/jobs/:job_id/stream', auth, async (req, res) => {
    const userId = getCurrentUserId();
    const jobId = paramString(req.params.job_id);

    const job = await manager.getJob(jobId, userId);
    if (!job) {
      throw new HttpError(404, 'Agent job not found.');
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    const onClose = (): void => controller.abort();
    req.on('close', onClose);

    try {
      for await (const frame of manager.streamEvents(jobId, userId, controller.signal)) {
        if (res.writableEnded || res.destroyed) {
          break;
        }
        res.write(frame);
      }
    } catch (error) {
      logger.warn(
        `[chat_endpoint] SSE stream for job ${jobId} ended early: ${errorMessage(error)}`,
      );
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}
