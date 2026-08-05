import { createSupabaseClient } from './supabaseClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

/**
 * A drop-in replacement for fetch() that automatically attaches the
 * Supabase JWT Bearer token to every request sent to the FastAPI backend.
 *
 * Usage (identical to native fetch):
 *   const res = await fetchWithAuth('/api/sessions');
 *   const res = await fetchWithAuth('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const supabase = createSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

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
