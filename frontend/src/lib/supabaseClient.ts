import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let clientInstance: SupabaseClient | null = null;

/**
 * Creates or returns a singleton Supabase browser client using the public anon key.
 * This client respects RLS policies and guarantees that AuthContext, AuthModal,
 * and auth callback / reset-password routes all share the exact same session state
 * and cookie listeners.
 */
export const createSupabaseClient = (): SupabaseClient => {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  if (!clientInstance) {
    clientInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return clientInstance;
};
