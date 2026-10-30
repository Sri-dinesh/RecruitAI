-- ==============================================================================
-- RecruitAI Migration: 20261030000000_subscriptions_and_credits.sql
-- Description: Subscriptions, credit transactions, and quota gating for
--              Razorpay monetization ($100 MRR milestone).
-- ==============================================================================

-- 1. Ensure credits_balance column exists on public.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credits_balance'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credits_balance INTEGER NOT NULL DEFAULT 10;
  END IF;
END;
$$;

-- 2. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_subscription_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 3. Create credit_transactions table (immutable audit ledger)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 5. Subscriptions Policies
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions;
CREATE POLICY "subscriptions_service_role" ON public.subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Credit Transactions Policies
DROP POLICY IF EXISTS "credit_transactions_select_own" ON public.credit_transactions;
CREATE POLICY "credit_transactions_select_own" ON public.credit_transactions
  FOR SELECT
  USING (auth.uid() IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "credit_transactions_service_role" ON public.credit_transactions;
CREATE POLICY "credit_transactions_service_role" ON public.credit_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);
