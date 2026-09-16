import { createSupabaseClient } from '@/lib/supabaseClient';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface FetchWithAuthOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * A drop-in replacement for fetch() that hits the FastAPI backend,
 * automatically attaches the user's Supabase JWT, and provides
 * client-side timeout and AbortController signal handling (ARCH-4).
 *
 * Usage:
 *   const res = await fetchWithAuth('/api/sessions', { timeoutMs: 15000 });
 */
export async function fetchWithAuth(
  path: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const { timeoutMs = 60000, signal: externalSignal, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});

  // Only force application/json if the body isn't FormData
  if (!(fetchOptions.body instanceof FormData)) {
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

  // Client-side timeout and AbortController integration
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
    }, timeoutMs);
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', () => {
        controller.abort(externalSignal.reason);
      });
    }
  }

  try {
    return await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
