'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';

/**
 * /auth/callback
 * Supabase redirects here after Google OAuth or email verification links.
 * Exchanges URL code/tokens for a session, then routes to appropriate destination:
 * - type=recovery -> /auth/reset-password (clean route without re-submitting single-use code)
 * - OAuth signin -> /dashboard
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createSupabaseClient();
    const typeParam = searchParams.get('type');
    const code = searchParams.get('code');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const isRecovery =
      typeParam === 'recovery' ||
      hash.includes('type=recovery') ||
      search.includes('type=recovery');

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/reset-password');
      }
    });

    const processAuth = async () => {
      // 1. If PKCE authorization code is present in query parameters, exchange it ONCE
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch (e) {
          console.warn('[AuthCallback] Error exchanging auth code:', e);
        }
      }

      // 2. If access_token and refresh_token are in the hash fragment, set session
      if (hash && hash.includes('access_token=')) {
        try {
          const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        } catch (e) {
          console.warn('[AuthCallback] Error setting session from hash:', e);
        }
      }

      // 3. Verify session state and route cleanly
      const { data: { session } } = await supabase.auth.getSession();

      if (isRecovery) {
        // Route to reset-password with clean URL so it doesn't re-exchange code
        router.replace('/auth/reset-password');
      } else if (session) {
        router.replace('/dashboard');
      } else {
        // Fallback retry after 400ms
        setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (isRecovery) {
            router.replace('/auth/reset-password');
          } else if (retrySession) {
            router.replace('/dashboard');
          } else {
            router.replace('/auth?tab=login');
          }
        }, 400);
      }
    };

    processAuth();

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
