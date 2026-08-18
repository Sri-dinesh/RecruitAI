'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';

/**
 * /auth/callback
 * Supabase redirects here after Google OAuth or Password Recovery links.
 * Exchanges URL code/tokens for a session, then routes to appropriate destination:
 * - type=recovery -> /auth/reset-password
 * - OAuth signin -> /dashboard
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createSupabaseClient();
    const typeParam = searchParams.get('type');
    const isRecovery = typeParam === 'recovery' || (typeof window !== 'undefined' && window.location.hash.includes('type=recovery'));

    // Set up auth state listener for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/reset-password');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isRecovery) {
        router.replace('/auth/reset-password');
      } else if (session) {
        router.replace('/dashboard');
      } else {
        router.replace('/auth?tab=login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F2]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted font-medium">Verifying your secure session…</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F2]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
