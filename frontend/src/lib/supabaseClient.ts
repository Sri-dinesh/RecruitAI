import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let clientInstance: SupabaseClient | null = null;

const getSupabaseCredentials = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';
  return { url, anonKey };
};

/**
 * Creates or returns a singleton Supabase browser client using the public anon key.
 * This client respects RLS policies and guarantees that AuthContext, AuthModal,
 * and auth callback / reset-password routes all share the exact same session state
 * and cookie listeners. Safe for static Next.js prerender / build time.
 */
export const createSupabaseClient = (): SupabaseClient => {
  const { url, anonKey } = getSupabaseCredentials();

  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey);
  }

  if (!clientInstance) {
    clientInstance = createBrowserClient(url, anonKey);
  }

  return clientInstance;
};
