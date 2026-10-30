# RecruitAI Monetization & Production Readiness Roadmap ($100 MRR Goal)

## Executive Summary & Target
- **Primary Objective**: Make RecruitAI a robust, production-ready SaaS product and achieve **$100+ MRR** (Monthly Recurring Revenue).
- **Target Audience**: Independent recruiters, boutique staffing agencies, and high-growth tech startups.
- **Payment Gateway**: Razorpay (standard for INR and international multi-currency card payments).

---

## 1. Pricing Structure & MRR Math

To reach $100 MRR (~₹8,300 - ₹8,500/month):

| Tier | Price (INR) | Equivalent (USD) | Quota & Features | Strategy to Reach $100 MRR |
| :--- | :--- | :--- | :--- | :--- |
| **Starter** | ₹1,499 / mo | ~$18 / mo | 50 candidate analyses, 5 job campaigns, email dispatch, basic analytics | 6 active users = **~$108 MRR** |
| **Pro Recruiter** | ₹3,999 / mo | ~$48 / mo | 250 candidate analyses, unlimited campaigns, ATS CSV/JSON export, AI copilot chat | 2 active users = **~$96 MRR** |
| **Agency / Growth** | ₹7,999 / mo | ~$96 / mo | Unlimited resumes, bulk parsing, custom rubrics, team seats, priority AI | 1 active user = **~$96 MRR** |
| **Pay-as-you-go Credits** | ₹499 / 25 credits | ~$6 one-time | On-demand resume analysis top-up | Supplementary revenue |

---

## 2. Phased Step-by-Step Delivery Plan

Each step is developed on an isolated branch (`feat/<step-name>`), verified through automated tests (`pytest`, `npm run build`), and cleanly merged into `main`.

### Step 1: Payment Architecture & Foundation [COMPLETED]
- [x] Define Razorpay schemas (Order request, payment verification, webhook payloads).
- [x] Set up roadmap and feature tracking in `plans/`.
- [x] Establish test harness for payment order generation and cryptographic HMAC-SHA256 signature verification.

### Step 2: Backend Payment Routes & Razorpay Client [COMPLETED]
- [x] `backend/app/schemas/payment_schema.py`: Models for Plans, Orders, Verification, and Webhooks.
- [x] `backend/app/services/payment_service.py`: Razorpay client wrapper with order creation and HMAC signature validation.
- [x] `backend/app/api/routes_payments.py`:
  - `GET /api/payments/plans` (Public pricing plans)
  - `POST /api/payments/order` (Authenticated user order initialization)
  - `POST /api/payments/verify` (Client-side checkout completion handler)
  - `POST /api/payments/webhook` (Server-to-server Razorpay event listener)
- [x] Unit tests in `backend/tests/test_payments.py`.

### Step 3: Subscription & Credits Persistence + Quota Gating [COMPLETED]
- [x] Supabase PostgreSQL & SQLite fallback tables:
  - `subscriptions` (user_id, plan_id, status, razorpay_order_id, razorpay_payment_id, current_period_end)
  - `credit_transactions` (user_id, amount, balance_after, reason, created_at)
  - `credits_balance` column on `users` with automatic migration.
- [x] Gating middleware / dependency: `require_candidate_quota` / `payment_service.consume_credits` returning HTTP 402 with structured `INSUFFICIENT_CREDITS` and `upgrade_url` on quota exhaustion.
- [x] Asynchronous Razorpay Webhook processor (`payment.captured`, `order.paid`, `subscription.cancelled`).
- [x] Credit audit ledger endpoints (`GET /api/payments/transactions`, `POST /api/payments/consume-credit`).

### Step 4: Web Frontend Checkout Integration [COMPLETED]
- [x] Integration of Razorpay standard checkout (`https://checkout.razorpay.com/v1/checkout.js`) with sandbox simulation fallback (`frontend/src/lib/razorpay.ts`).
- [x] Interactive pricing cards at `/pricing` (`frontend/src/components/pricing/PricingCards.tsx`).
- [x] Dedicated `BillingTab` in Profile Modal with active plan badge, quota health gauge, upgrade cards, and credit audit history.
- [x] Header quota quick-access CTA in `AppHeader.tsx`.

### Step 5: Mobile App Upgrade Bridge [UPCOMING]
- [ ] Add Upgrade CTA in Mobile profile and quota banner.
- [ ] Seamless web-checkout bridge or in-app payment link.

---

## 3. Progress Log

| Date | Branch | Changes & Milestones | Verification |
| :--- | :--- | :--- | :--- |
| **2026-10-29** | `feat/monetization-razorpay-roadmap` | Steps 1 & 2: Added Razorpay order creation, HMAC-SHA256 signature verification, and `/api/payments/*` routes. | `pytest tests/test_payments.py` (6 passed) |
| **2026-10-30** | `feat/subscription-credits-gating` | Steps 3 & 4: Subscriptions & credit transaction persistence, quota paywall gating (HTTP 402), webhook event dispatching, Next.js Razorpay Checkout integration, and Profile Billing modal. | `pytest` (45 passed), `npm run build` (46/46 static pages generated) |

---

## 4. Non-Negotiable Quality Gates
- **Backend**: `venv/bin/pytest tests/test_*.py`
- **Frontend**: `npm run build` & `npx tsc --noEmit`
- **Git Hygiene**: Atomic commit on feature branch, tested, merged into `main`.
