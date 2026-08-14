import { createSupabaseClient } from '@/lib/supabaseClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * A drop-in replacement for fetch() that hits the FastAPI backend
 * and automatically attaches the user's Supabase JWT.
 *
 * Usage:
 *   const res = await fetchWithAuth('/api/sessions');
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // Only force application/json if the body isn't FormData
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Get active session from Supabase
  const supabase = createSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  // Resolve the full URL — prepend BACKEND_URL for relative paths
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;

  return fetch(url, {
    ...options,
    headers,
  });
}
