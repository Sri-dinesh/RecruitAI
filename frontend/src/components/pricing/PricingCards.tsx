'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { openRazorpayCheckout } from '@/lib/razorpay';

interface Tier {
  id: string;
  name: string;
  priceInr: string;
  priceUsd: string;
  note: string;
  bullets: string[];
  cta: string;
  featured: boolean;
}

const TIERS: Tier[] = [
  {
    id: 'starter',
    name: 'Starter Recruiter',
    priceInr: '₹1,499',
    priceUsd: '~$18',
    note: '/month • 50 candidate analyses',
    bullets: [
      '50 candidate evaluations / month',
      '5 active job campaigns',
      'Automated email outreach dispatcher',
      'Demographic blind hiring mode',
      'Greenhouse & Lever ATS CSV export',
      'Web & Android mobile app access',
    ],
    cta: 'Get Starter',
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro Recruiter',
    priceInr: '₹3,999',
    priceUsd: '~$48',
    note: '/month • 250 candidate analyses',
    bullets: [
      '250 candidate evaluations / month',
      'Unlimited job campaigns',
      'Full ATS export (JSON, CSV, PDF interview kits)',
      'Conversational AI copilot chat assistant',
      'Custom 5-pillar rubric criteria & scoring',
      'Priority pgvector search and indexing',
    ],
    cta: 'Get Pro Recruiter',
    featured: true,
  },
  {
    id: 'agency',
    name: 'Agency / Growth',
    priceInr: '₹7,999',
    priceUsd: '~$96',
    note: '/month • 1,000 candidate analyses',
    bullets: [
      '1,000 candidate evaluations / month',
      'Bulk resume zip upload and parallel parsing',
      'Multi-seat team sharing & recruiter roles',
      'Priority LLM speed and dedicated support',
      'Custom webhook ATS synchronization',
      'Bias audit trail and retention policies',
    ],
    cta: 'Get Agency Plan',
    featured: false,
  },
];

export default function PricingCards() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSelectPlan = (tierId: string) => {
    if (!user) {
      router.push(`/auth?tab=signup&plan=${tierId}`);
      return;
    }

    setUpgradingId(tierId);
    setToastMessage(null);

    openRazorpayCheckout({
      planId: tierId,
      userName: profile?.full_name || user?.user_metadata?.full_name || 'Recruiter',
      userEmail: user?.email || '',
      onSuccess: () => {
        setUpgradingId(null);
        setToastMessage(`Payment successful! Your account has been upgraded to ${tierId.toUpperCase()}.`);
        setTimeout(() => {
          router.push('/dashboard');
        }, 1200);
      },
      onError: (err) => {
        setUpgradingId(null);
        if (!err.includes('dismissed') && !err.includes('cancelled')) {
          setToastMessage(err);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm font-medium text-center">
          {toastMessage}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`bg-white border rounded-2xl p-6 flex flex-col justify-between ${
              tier.featured
                ? 'border-accent shadow-lg scale-[1.02] ring-1 ring-accent/20'
                : 'border-border'
            }`}
          >
            <div>
              {tier.featured && (
                <span className="inline-flex self-start bg-accent text-white text-[11px] font-bold tracking-widest uppercase rounded-full px-3 py-1 mb-2">
                  Most Popular
                </span>
              )}
              <h2 className="font-serif text-2xl">{tier.name}</h2>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold">{tier.priceInr}</span>
                <span className="text-xs text-muted font-medium">({tier.priceUsd})</span>
              </div>
              <p className="text-xs text-muted mt-1">{tier.note}</p>

              <ul className="mt-6 space-y-2.5 text-sm">
                {tier.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5 items-start">
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0 font-bold" />
                    <span className="text-muted leading-tight">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              disabled={upgradingId !== null}
              onClick={() => handleSelectPlan(tier.id)}
              className={`mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                tier.featured
                  ? 'bg-accent text-white hover:bg-[#263a66]'
                  : 'bg-[#F8F6F2] border border-border hover:bg-white text-foreground'
              }`}
            >
              {upgradingId === tier.id ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{tier.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
