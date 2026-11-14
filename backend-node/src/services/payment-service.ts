import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { getConfig, type AppConfig } from '../config/index.js';
import {
  createPaymentStore,
  type CreditTransactionRecord,
  type PaymentStore,
  type TimestampValue,
} from '../db/payment-store.js';
import type { PricingPlan } from '../schemas/payment.js';
import { createLogger } from '../telemetry/logger.js';

const logger = createLogger('recruitai.payment_service');

/**
 * Port of `backend/app/services/payment_service.py`.
 *
 * Preserved behaviors:
 * - the three public plans and their exact amounts/quotas/features;
 * - Razorpay order creation (REST `/v1/orders`, Basic auth) with the same
 *   development fallback to `order_mock_*` orders;
 * - checkout and webhook HMAC verification rules, including the mock/test
 *   acceptance paths;
 * - subscription activation, credit top-ups, the credit audit ledger and the
 *   HTTP-visible results;
 * - best-effort logging semantics: a failed balance write or ledger insert is
 *   logged and never aborts the surrounding flow.
 *
 * Database access goes through `PaymentStore` so the same behavior runs on
 * PostgreSQL and the local SQLite fallback.
 */

/** Plans configured for MRR targets (Starter ₹1,499, Pro ₹3,999, Agency ₹7,999). */
export const AVAILABLE_PLANS: Readonly<Record<string, PricingPlan>> = {
  starter: {
    id: 'starter',
    name: 'Starter Recruiter',
    amount: 149900, // ₹1,499 in paise (~$18)
    currency: 'INR',
    interval: 'monthly',
    candidate_quota: 50,
    features: [
      '50 Candidate Resume Parses/month',
      '5 Active Job Campaigns',
      'Automated Interview Outreach via Email',
      'Basic Analytics & Blind Hiring Mode',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Recruiter',
    amount: 399900, // ₹3,999 in paise (~$48)
    currency: 'INR',
    interval: 'monthly',
    candidate_quota: 250,
    features: [
      '250 Candidate Resume Parses/month',
      'Unlimited Job Campaigns',
      'ATS Export (CSV, JSON, PDF)',
      'AI Copilot Chat Assistant',
      'Custom Rubrics & Scoring Criteria',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency / Growth',
    amount: 799900, // ₹7,999 in paise (~$96 — achieves the $100 MRR target)
    currency: 'INR',
    interval: 'monthly',
    candidate_quota: 1000,
    features: [
      '1,000 Candidate Resume Parses/month',
      'Bulk Resume Zip Parsing',
      'Multi-seat Team Sharing',
      'Priority LLM Generation Speed',
      'Dedicated Support & Custom Integrations',
    ],
  },
};

export const DEFAULT_FREE_CREDITS = 10;
export const DEFAULT_RAZORPAY_BASE_URL = 'https://api.razorpay.com';
export const MOCK_RAZORPAY_KEY_ID = 'rzp_test_mock_key';

const SUBSCRIPTION_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Python raises `ValueError` for these; routes map them to 400 (or 402). */
export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

export interface CreateOrderResult {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string | null;
  plan_id: string;
}

export interface SubscriptionStatusResult {
  user_id: string;
  plan_id: string;
  status: string;
  credits_remaining: number;
  current_period_end: string | null;
}

export interface ActivationResult {
  success: boolean;
  subscription_id: string;
  plan_id: string;
  status: string;
  credits_remaining: number;
  current_period_end: string;
}

export interface ConsumptionResult {
  success: boolean;
  credits_remaining: number;
  amount_deducted: number;
  reason: string;
}

export interface CreditTransactionResult {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export interface PaymentServiceOptions {
  readonly config?: AppConfig;
  /** Explicit store for tests; otherwise resolved lazily from config. */
  readonly store?: PaymentStore;
  readonly fetchImpl?: typeof fetch;
  /** Injectable clock for deterministic periods/audit timestamps. */
  readonly now?: () => Date;
}

interface RazorpayOrderEntity {
  id?: unknown;
  amount?: unknown;
  currency?: unknown;
}

export class PaymentService {
  private readonly config: AppConfig;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private store: PaymentStore | undefined;

  constructor(options: PaymentServiceOptions = {}) {
    this.config = options.config ?? getConfig();
    this.keyId = this.config.razorpay.keyId;
    this.keySecret = this.config.razorpay.keySecret;
    this.webhookSecret = this.config.razorpay.webhookSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.store = options.store;
  }

  private getStore(): PaymentStore {
    this.store ??= createPaymentStore({ config: this.config });
    return this.store;
  }

  getPlans(): PricingPlan[] {
    return Object.values(AVAILABLE_PLANS);
  }

  getPlan(planId: string): PricingPlan | undefined {
    return AVAILABLE_PLANS[planId.toLowerCase()];
  }

  async createOrder(planId: string, userId: string): Promise<CreateOrderResult> {
    const plan = this.getPlan(planId);
    if (!plan) {
      throw new PaymentValidationError(`Plan '${planId}' does not exist.`);
    }

    // With live credentials, create the order through Razorpay.
    if (this.keyId && this.keySecret) {
      try {
        const orderPayload = {
          amount: plan.amount,
          currency: plan.currency,
          receipt: `rcpt_${userId.slice(0, 8)}_${Number.parseInt(
            randomUUID().replaceAll('-', '').slice(0, 6),
            16,
          )}`,
          notes: {
            user_id: userId,
            plan_id: plan.id,
          },
        };

        const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await this.fetchImpl(`${DEFAULT_RAZORPAY_BASE_URL}/v1/orders`, {
          method: 'POST',
          headers: {
            authorization: `Basic ${credentials}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(orderPayload),
        });

        if (!response.ok) {
          throw new Error(`Razorpay API responded with ${response.status}`);
        }

        const order = (await response.json()) as RazorpayOrderEntity;
        if (
          typeof order.id !== 'string' ||
          typeof order.amount !== 'number' ||
          typeof order.currency !== 'string'
        ) {
          throw new Error('Razorpay returned an unexpected order payload');
        }

        return {
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          key_id: this.keyId,
          plan_id: plan.id,
        };
      } catch (error) {
        // Match Python: a live failure is fatal in production, but development
        // and tests fall through to the simulated order path.
        if (this.config.isProduction) {
          throw new Error(`Razorpay order creation failed: ${errorMessage(error)}`, {
            cause: error,
          });
        }
      }
    }

    // Deterministic mock/simulated order when keys are absent or unusable.
    return {
      order_id: `order_mock_${randomHex(14)}`,
      amount: plan.amount,
      currency: plan.currency,
      key_id: this.keyId || MOCK_RAZORPAY_KEY_ID,
      plan_id: plan.id,
    };
  }

  /** Verifies the standard Razorpay HMAC-SHA256 checkout signature. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (
      signature === 'mock_valid_signature' ||
      (!this.keySecret && signature.startsWith('test_'))
    ) {
      return true;
    }

    if (!this.keySecret) {
      // Without a secret outside production, accept mock testing payloads.
      return true;
    }

    const expected = createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`, 'utf8')
      .digest('hex');
    return timingSafeCompare(expected, signature);
  }

  /** Verifies the `X-Razorpay-Signature` webhook header over the raw bytes. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      return true;
    }
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return timingSafeCompare(expected, signature);
  }

  /**
   * Current credits balance. Defaults to `DEFAULT_FREE_CREDITS` for missing
   * users and unreadable rows, exactly like Python.
   */
  async getUserCredits(userId: string): Promise<number> {
    try {
      const value = await this.getStore().getCreditsBalance(userId);
      if (value !== undefined && value !== null) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
        throw new Error('credits_balance is not a finite number');
      }
    } catch (error) {
      logger.warn(`Failed to fetch credits balance for user ${userId}: ${errorMessage(error)}`);
    }
    return DEFAULT_FREE_CREDITS;
  }

  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
    let planId = 'free';
    let subscriptionStatus = 'active';
    let periodEnd: string | null = null;

    try {
      const subscription = await this.getStore().getLatestSubscription(userId);
      if (subscription) {
        planId = subscription.planId ?? 'free';
        subscriptionStatus = subscription.status ?? 'active';
        periodEnd = toIsoString(subscription.currentPeriodEnd);
      }
    } catch (error) {
      logger.warn(`Failed to fetch subscription status for user ${userId}: ${errorMessage(error)}`);
    }

    const creditsRemaining = await this.getUserCredits(userId);
    return {
      user_id: userId,
      plan_id: planId,
      status: subscriptionStatus,
      credits_remaining: creditsRemaining,
      current_period_end: periodEnd,
    };
  }

  async activateSubscription(
    userId: string,
    planId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
  ): Promise<ActivationResult> {
    const plan = this.getPlan(planId);
    if (!plan) {
      throw new PaymentValidationError(`Plan '${planId}' does not exist.`);
    }

    const now = this.now();
    const nowIso = now.toISOString();
    const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * DAY_MS);
    const periodEndIso = periodEnd.toISOString();
    const subscriptionId = `sub_${randomHex(12)}`;
    const store = this.getStore();

    // 1. Save/replace the tenant's subscription row.
    await store.saveSubscription({
      id: subscriptionId,
      userId,
      planId: plan.id,
      status: 'active',
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySubscriptionId: null,
      currentPeriodStart: nowIso,
      currentPeriodEnd: periodEndIso,
      createdAt: nowIso,
    });

    // 2. Add the plan's credits to the user's quota.
    const currentCredits = await this.getUserCredits(userId);
    const newCredits = currentCredits + plan.candidate_quota;

    try {
      if (await store.userExists(userId)) {
        await store.updateCreditsBalance(userId, newCredits);
      } else {
        await store.insertUser({
          id: userId,
          email: `${userId}@recruitai.local`,
          fullName: 'Recruiter',
          role: 'recruiter',
          creditsBalance: newCredits,
        });
      }
    } catch (error) {
      logger.error(`Failed to update user credit balance: ${errorMessage(error)}`);
    }

    // 3. Append to the credit audit ledger (best effort).
    try {
      await store.insertCreditTransaction({
        id: `tx_${randomHex(12)}`,
        userId,
        amount: plan.candidate_quota,
        balanceAfter: newCredits,
        reason: `Plan Upgrade: ${plan.name} (+${plan.candidate_quota} credits)`,
        createdAt: nowIso,
      });
    } catch (error) {
      logger.warn(`Failed to log credit transaction: ${errorMessage(error)}`);
    }

    return {
      success: true,
      subscription_id: subscriptionId,
      plan_id: plan.id,
      status: 'active',
      credits_remaining: newCredits,
      current_period_end: periodEndIso,
    };
  }

  async consumeCredits(
    userId: string,
    amount = 1,
    reason = 'candidate_analysis',
  ): Promise<ConsumptionResult> {
    if (amount <= 0) {
      throw new PaymentValidationError('Amount must be greater than 0.');
    }

    const currentBalance = await this.getUserCredits(userId);
    if (currentBalance < amount) {
      throw new PaymentValidationError(
        `Insufficient credits. Remaining: ${currentBalance}, required: ${amount}`,
      );
    }

    const newBalance = currentBalance - amount;
    const nowIso = this.now().toISOString();
    const store = this.getStore();

    try {
      if (await store.userExists(userId)) {
        await store.updateCreditsBalance(userId, newBalance);
      } else {
        await store.insertUser({
          id: userId,
          email: `${userId}@recruitai.local`,
          fullName: 'Recruiter',
          role: 'recruiter',
          creditsBalance: newBalance,
        });
      }
    } catch (error) {
      logger.error(`Error updating user credit balance during consumption: ${errorMessage(error)}`);
    }

    try {
      await store.insertCreditTransaction({
        id: `tx_${randomHex(12)}`,
        userId,
        amount: -amount,
        balanceAfter: newBalance,
        reason,
        createdAt: nowIso,
      });
    } catch (error) {
      logger.warn(`Failed to log credit transaction deduction: ${errorMessage(error)}`);
    }

    return {
      success: true,
      credits_remaining: newBalance,
      amount_deducted: amount,
      reason,
    };
  }

  async getCreditTransactions(userId: string, limit = 50): Promise<CreditTransactionResult[]> {
    try {
      const records = await this.getStore().listCreditTransactions(userId, limit);
      return records.map((record) => mapCreditTransaction(record));
    } catch (error) {
      logger.warn(
        `Failed to retrieve credit transactions for user ${userId}: ${errorMessage(error)}`,
      );
      return [];
    }
  }

  /**
   * Processes Razorpay asynchronous webhooks (payment captured, order paid,
   * subscription lifecycle). Returns the same result objects as Python.
   */
  async processWebhookEvent(eventData: unknown): Promise<Record<string, unknown>> {
    const root = isRecord(eventData) ? eventData : {};
    const eventName = typeof root.event === 'string' ? root.event : '';
    const payload = isRecord(root.payload) ? root.payload : {};

    const paymentEntity = nestedEntity(payload, 'payment');
    const orderEntity = nestedEntity(payload, 'order');
    const subscriptionEntity = nestedEntity(payload, 'subscription');

    const notes = firstNonEmptyObject(
      paymentEntity.notes,
      orderEntity.notes,
      subscriptionEntity.notes,
    );
    const userId = typeof notes.user_id === 'string' ? notes.user_id : undefined;
    const planId = typeof notes.plan_id === 'string' ? notes.plan_id : undefined;

    const paymentId = nonEmptyString(paymentEntity.id) ?? `pay_${randomHex(8)}`;
    const orderId =
      nonEmptyString(orderEntity.id) ??
      nonEmptyString(paymentEntity.order_id) ??
      `order_${randomHex(8)}`;

    if (
      eventName === 'payment.captured' ||
      eventName === 'order.paid' ||
      eventName === 'subscription.charged' ||
      eventName === 'subscription.activated'
    ) {
      if (userId && planId) {
        const subscription = await this.activateSubscription(userId, planId, orderId, paymentId);
        return {
          status: 'processed',
          event: eventName,
          subscription_activated: true,
          plan_id: planId,
          user_id: userId,
          credits_remaining: subscription.credits_remaining,
        };
      }
      return {
        status: 'skipped',
        event: eventName,
        reason: 'Missing user_id or plan_id in payload notes',
      };
    }

    if (eventName === 'subscription.cancelled' || eventName === 'subscription.halted') {
      if (userId) {
        try {
          await this.getStore().cancelSubscriptions(userId);
        } catch (error) {
          logger.warn(`Error canceling subscription for ${userId}: ${errorMessage(error)}`);
        }
        return {
          status: 'processed',
          event: eventName,
          subscription_canceled: true,
          user_id: userId,
        };
      }
    }

    return { status: 'ignored', event: eventName };
  }
}

/** Process-wide service, mirroring the Python `payment_service` singleton. */
let singleton: PaymentService | undefined;

export function createPaymentService(options: PaymentServiceOptions = {}): PaymentService {
  return new PaymentService(options);
}

export function getPaymentService(): PaymentService {
  singleton ??= new PaymentService();
  return singleton;
}

/** Test helper: drop the memoised singleton. */
export function resetPaymentServiceForTests(): void {
  singleton = undefined;
}

function mapCreditTransaction(record: CreditTransactionRecord): CreditTransactionResult {
  return {
    id: String(record.id),
    user_id: String(record.userId),
    amount: Number(record.amount),
    balance_after: Number(record.balanceAfter),
    reason: String(record.reason),
    created_at: toIsoString(record.createdAt) ?? '',
  };
}

function toIsoString(value: TimestampValue): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function randomHex(length: number): string {
  return randomUUID().replaceAll('-', '').slice(0, length);
}

function timingSafeCompare(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  if (expectedBytes.length !== actualBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, actualBytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nestedEntity(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const section = payload[key];
  if (!isRecord(section)) {
    return {};
  }
  return isRecord(section.entity) ? section.entity : {};
}

/** Python's `a or b or c or {}` treats empty objects as falsy. */
function firstNonEmptyObject(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (isRecord(value) && Object.keys(value).length > 0) {
      return value;
    }
  }
  return {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
