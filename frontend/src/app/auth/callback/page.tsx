'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';

/**
 * /auth/callback
 * Supabase redirects here after Google OAuth completes.
 * Exchanges the URL code for a session, then redirects to /dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getSession().then(() => {
      router.replace('/dashboard');
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f6f2]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-muted font-medium">Signing you in…</p>
      </div>
    </div>
  );
}
