import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase browser client using the public anon key.
 * This client is safe to use on the client side — it respects RLS policies.
 */
export const createSupabaseClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
