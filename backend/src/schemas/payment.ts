import { z } from 'zod';

import { optionalString, pydanticInt } from './common.js';

/**
 * Port of `app/schemas/payment_schema.py`.
 *
 * Credit amounts keep the Pydantic constraint `amount: int = Field(1, ge=1)`.
 * Pydantic also coerces `"2"`/`true`/`2.0` to an integer, which `pydanticInt`
 * reproduces.
 */
export const pricingPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: pydanticInt(),
  currency: z.string().default('INR'),
  interval: z.string().default('monthly'),
  candidate_quota: pydanticInt(),
  features: z.array(z.string()),
});

export const createOrderRequestSchema = z.object({
  plan_id: z.string(),
});

export const createOrderResponseSchema = z.object({
  order_id: z.string(),
  amount: pydanticInt(),
  currency: z.string(),
  key_id: optionalString(),
  plan_id: z.string(),
});

export const verifyPaymentRequestSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  plan_id: optionalString(),
});

export const verifyPaymentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.string(),
  subscription_id: optionalString(),
  plan_id: optionalString(),
  credits_remaining: pydanticInt().nullable().default(null),
});

export const subscriptionStatusResponseSchema = z.object({
  user_id: z.string(),
  plan_id: z.string(),
  status: z.string(),
  credits_remaining: pydanticInt(),
  current_period_end: optionalString(),
});

export const creditTransactionResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  amount: pydanticInt(),
  balance_after: pydanticInt(),
  reason: z.string(),
  created_at: z.string(),
});

export const consumeCreditRequestSchema = z.object({
  amount: pydanticInt({ ge: 1 }).default(1),
  reason: z.string().default('candidate_analysis'),
});

export const consumeCreditResponseSchema = z.object({
  success: z.boolean(),
  credits_remaining: pydanticInt(),
  amount_deducted: pydanticInt(),
  reason: z.string(),
});

/**
 * `POST /api/payments/webhook` reads `x-razorpay-signature: Optional[str]`.
 * FastAPI exposes it as `x-razorpay-signature` (underscores become hyphens).
 */
export const razorpayWebhookHeadersSchema = z.object({
  'x-razorpay-signature': optionalString(),
});

export type PricingPlan = z.infer<typeof pricingPlanSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type VerifyPaymentRequest = z.infer<typeof verifyPaymentRequestSchema>;
export type VerifyPaymentResponse = z.infer<typeof verifyPaymentResponseSchema>;
export type SubscriptionStatusResponse = z.infer<typeof subscriptionStatusResponseSchema>;
export type CreditTransactionResponse = z.infer<typeof creditTransactionResponseSchema>;
export type ConsumeCreditRequest = z.infer<typeof consumeCreditRequestSchema>;
export type ConsumeCreditResponse = z.infer<typeof consumeCreditResponseSchema>;
export type RazorpayWebhookHeaders = z.infer<typeof razorpayWebhookHeadersSchema>;
