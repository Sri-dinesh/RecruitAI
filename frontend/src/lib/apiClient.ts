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

/**
 * Triggers compilation and download of the recruitment PDF report from backend.
 * Falls back gracefully if session is not yet created.
 */
export async function downloadPdfReport(
  sessionId?: string,
  payload?: Record<string, unknown>
): Promise<string> {
  let res: Response;
  if (sessionId) {
    res = await fetchWithAuth(`/api/reports/session/${sessionId}`);
  } else if (payload) {
    res = await fetchWithAuth('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } else {
    throw new Error('Either sessionId or payload must be provided to download report.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Server returned HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisp = res.headers.get('content-disposition');
  let filename = `recruitment_report_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (contentDisp && contentDisp.includes('filename=')) {
    const match = contentDisp.match(/filename=["']?([^"';]+)["']?/);
    if (match && match[1]) filename = match[1];
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  return filename;
}
