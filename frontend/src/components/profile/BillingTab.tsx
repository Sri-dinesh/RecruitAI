'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  Sparkles, 
  ArrowUpRight, 
  Clock, 
  Zap, 
  AlertCircle,
  RefreshCw,
  Receipt
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useAuth } from '@/context/AuthContext';

interface PricingTier {
  id: string;
  name: string;
  priceInr: string;
  priceUsd: string;
  quota: number;
  featured?: boolean;
  features: string[];
}

const TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter Recruiter',
    priceInr: '₹1,499',
    priceUsd: '~$18',
    quota: 50,
    features: [
      '50 Candidate Resume Parses/mo',
      '5 Active Job Campaigns',
      'Automated Interview Outreach via Email',
      'Basic Analytics & Blind Hiring Mode',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Recruiter',
    priceInr: '₹3,999',
    priceUsd: '~$48',
    quota: 250,
    featured: true,
    features: [
      '250 Candidate Resume Parses/mo',
      'Unlimited Job Campaigns',
      'ATS Export (CSV, JSON, PDF)',
      'AI Copilot Chat Assistant',
      'Custom Rubrics & Scoring Criteria',
    ],
  },
  {
    id: 'agency',
    name: 'Agency / Growth',
    priceInr: '₹7,999',
    priceUsd: '~$96',
    quota: 1000,
    features: [
      '1,000 Candidate Resume Parses/mo',
      'Bulk Resume Zip Parsing',
      'Multi-seat Team Sharing',
      'Priority LLM Generation Speed',
      'Dedicated Support & Integrations',
    ],
  },
];

interface SubscriptionStatus {
  user_id: string;
  plan_id: string;
  status: string;
  credits_remaining: number;
  current_period_end?: string | null;
}

interface TransactionItem {
  id: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export const BillingTab: React.FC = () => {
  const { user, profile } = useAuth();
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadBillingData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, txRes] = await Promise.all([
        fetchWithAuth('/api/payments/status'),
        fetchWithAuth('/api/payments/transactions'),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setSubStatus(data);
      }
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }
    } catch (e: any) {
      console.error('Failed to load billing status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  const handleUpgrade = (tierId: string) => {
    setUpgradingPlan(tierId);
    setMessage(null);

    openRazorpayCheckout({
      planId: tierId,
      userName: profile?.full_name || user?.user_metadata?.full_name || 'Recruiter',
      userEmail: user?.email || '',
      onSuccess: (data) => {
        setUpgradingPlan(null);
        setMessage({
          text: `Success! You are now subscribed to ${tierId.toUpperCase()}. Added candidate quota!`,
          type: 'success',
        });
        loadBillingData();
      },
      onError: (err) => {
        setUpgradingPlan(null);
        if (!err.includes('dismissed') && !err.includes('cancelled')) {
          setMessage({ text: err, type: 'error' });
        }
      },
    });
  };

  const currentPlan = subStatus?.plan_id || 'free';
  const creditsRemaining = subStatus?.credits_remaining ?? 10;

  return (
    <div className="space-y-6">
      {/* Feedback Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Overview Card: Active Plan & Credits Balance */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Current Plan</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-brand-primary/10 text-brand-primary">
                {currentPlan}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1 capitalize">
              {currentPlan === 'free' ? 'Free Community Tier' : `${currentPlan} Recruiter`}
            </h2>
            {subStatus?.current_period_end && (
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Renews on {new Date(subStatus.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:items-end">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Evaluation Quota</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-extrabold text-slate-900">{creditsRemaining}</span>
              <span className="text-xs text-slate-500 font-medium">credits available</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5">1 credit = 1 candidate rubric screening</span>
          </div>
        </div>

        {/* Quota Gauge */}
        <div className="mt-4 pt-2">
          <div className="flex justify-between text-xs text-slate-600 mb-1.5">
            <span className="font-medium">Quota Health</span>
            <span className="font-semibold text-brand-primary">
              {creditsRemaining > 10 ? 'Healthy' : creditsRemaining > 0 ? 'Low' : 'Exhausted'}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                creditsRemaining > 20
                  ? 'bg-emerald-500'
                  : creditsRemaining > 5
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(10, (creditsRemaining / 50) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Available Plans Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Upgrade or Change Plan</h3>
            <p className="text-xs text-slate-500">Pick a tier to expand your candidate screening capacity.</p>
          </div>
          <button
            type="button"
            onClick={loadBillingData}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier) => {
            const isCurrent = currentPlan.toLowerCase() === tier.id.toLowerCase();
            const isUpgrading = upgradingPlan === tier.id;

            return (
              <div
                key={tier.id}
                className={`relative bg-white rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  tier.featured
                    ? 'border-brand-primary shadow-sm ring-1 ring-brand-primary/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {tier.featured && (
                  <span className="absolute -top-2.5 left-5 bg-brand-primary text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs">
                    Popular
                  </span>
                )}

                <div>
                  <div className="flex justify-between items-baseline">
                    <h4 className="font-bold text-slate-900 text-sm">{tier.name}</h4>
                    <span className="text-xs text-slate-400">{tier.priceUsd}/mo</span>
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">{tier.priceInr}</span>
                    <span className="text-xs text-slate-500 font-medium">/month</span>
                  </div>
                  <p className="text-[11px] text-brand-primary font-semibold mt-1">
                    +{tier.quota} candidate evaluations/mo
                  </p>

                  <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-2">
                  <button
                    type="button"
                    disabled={isCurrent || isUpgrading}
                    onClick={() => handleUpgrade(tier.id)}
                    className={`w-full py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : tier.featured
                        ? 'bg-brand-primary text-white hover:bg-slate-800 shadow-xs'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isUpgrading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : isCurrent ? (
                      'Current Active Plan'
                    ) : (
                      <>
                        <span>Upgrade to {tier.name.split(' ')[0]}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Credit Ledger / Audit History */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-brand-primary" />
          <h3 className="text-sm font-bold text-slate-900">Credit Audit Ledger</h3>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">No recent credit activity recorded.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
            {transactions.slice(0, 10).map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800">{tx.reason}</p>
                  <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`font-bold ${
                      tx.amount > 0 ? 'text-emerald-600' : 'text-slate-600'
                    }`}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount} credits
                  </span>
                  <p className="text-[10px] text-slate-400">Balance: {tx.balance_after}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
