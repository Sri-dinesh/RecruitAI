import express, { Router, type RequestHandler } from 'express';

import type { AppConfig } from '../config/index.js';
import { getCurrentUserId } from '../context/request-context.js';
import { requireAuth } from '../middleware/auth.js';
import { JSON_BODY_LIMIT } from '../middleware/json-body.js';
import { validateBody } from '../middleware/validate.js';
import {
  consumeCreditRequestSchema,
  createOrderRequestSchema,
  verifyPaymentRequestSchema,
  type ConsumeCreditRequest,
  type CreateOrderRequest,
  type VerifyPaymentRequest,
} from '../schemas/payment.js';
import {
  createPaymentService,
  PaymentValidationError,
  type PaymentService,
} from '../services/payment-service.js';
import { HttpError } from '../types/errors.js';

/**
 * Port of `backend/app/api/routes_payments.py`.
 *
 * `/plans` and `/webhook` are public. Every other route uses the shared
 * `requireAuth()` middleware, mirroring the per-route `Depends` in Python.
 *
 * The webhook is mounted separately (before the global JSON parser) because it
 * must verify the HMAC over the exact raw bytes; an invalid JSON body has to
 * produce this route's 400 message rather than body-parser's 422.
 */

export interface PaymentsRouterOptions {
  readonly config?: AppConfig;
  readonly paymentService?: PaymentService;
  /** Pre-built auth middleware (the API router shares one instance). */
  readonly auth?: RequestHandler;
}

export function createPaymentsRouter(options: PaymentsRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.paymentService ??
    createPaymentService(options.config === undefined ? {} : { config: options.config });
  const auth =
    options.auth ?? (options.config ? requireAuth({ config: options.config }) : requireAuth());

  router.get('/plans', (_req, res) => {
    res.json(service.getPlans());
  });

  router.post('/order', auth, validateBody(createOrderRequestSchema), async (req, res) => {
    const body = req.body as CreateOrderRequest;
    try {
      const order = await service.createOrder(body.plan_id, getCurrentUserId());
      res.json(order);
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw new HttpError(400, error.message);
      }
      throw new HttpError(500, `Unable to create order: ${errorMessage(error)}`);
    }
  });

  router.post('/verify', auth, validateBody(verifyPaymentRequestSchema), async (req, res) => {
    const body = req.body as VerifyPaymentRequest;

    const isValid = service.verifyPaymentSignature(
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature,
    );
    if (!isValid) {
      throw new HttpError(400, 'Invalid payment signature. Verification failed.');
    }

    const planId = body.plan_id || 'starter';
    try {
      const subscription = await service.activateSubscription(
        getCurrentUserId(),
        planId,
        body.razorpay_order_id,
        body.razorpay_payment_id,
      );
      res.json({
        success: true,
        message: 'Payment verified successfully. Subscription activated.',
        status: 'active',
        subscription_id: subscription.subscription_id,
        plan_id: subscription.plan_id,
        credits_remaining: subscription.credits_remaining,
      });
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        throw new HttpError(400, error.message);
      }
      throw new HttpError(500, `Failed to activate subscription: ${errorMessage(error)}`);
    }
  });

  router.get('/status', auth, async (_req, res) => {
    res.json(await service.getSubscriptionStatus(getCurrentUserId()));
  });

  router.get('/transactions', auth, async (_req, res) => {
    res.json(await service.getCreditTransactions(getCurrentUserId()));
  });

  router.post(
    '/consume-credit',
    auth,
    validateBody(consumeCreditRequestSchema),
    async (req, res) => {
      const body = req.body as ConsumeCreditRequest;
      try {
        const result = await service.consumeCredits(getCurrentUserId(), body.amount, body.reason);
        res.json(result);
      } catch (error) {
        if (error instanceof PaymentValidationError) {
          // Python raises the plain string in `detail` (not the structured
          // INSUFFICIENT_CREDITS body used by quota gating).
          throw new HttpError(402, error.message);
        }
        throw error;
      }
    },
  );

  return router;
}

export interface PaymentsWebhookRouterOptions {
  readonly config?: AppConfig;
  readonly paymentService?: PaymentService;
}

/**
 * Mount at `/api/payments/webhook` before `jsonBodyParser`.
 *
 * The raw-body parser is scoped to this route so the rest of the API keeps the
 * shared JSON parser and its FastAPI-compatible 422 behavior.
 */
export function createPaymentsWebhookRouter(options: PaymentsWebhookRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.paymentService ??
    createPaymentService(options.config === undefined ? {} : { config: options.config });

  const rawBody = express.raw({ type: () => true, limit: JSON_BODY_LIMIT });

  router.post('/', rawBody, (req, res, next) => {
    void (async () => {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const signatureHeader = req.headers['x-razorpay-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      if (signature) {
        const isValid = service.verifyWebhookSignature(body, signature);
        if (!isValid) {
          throw new HttpError(400, 'Invalid webhook signature.');
        }
      }

      let eventPayload: unknown = {};
      if (body.length > 0) {
        try {
          eventPayload = JSON.parse(body.toString('utf8')) as unknown;
        } catch {
          throw new HttpError(400, 'Invalid JSON payload in webhook body.');
        }
      }

      const result = await service.processWebhookEvent(eventPayload);
      res.json({ status: 'ok', received: true, result });
    })().catch(next);
  });

  return router;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
