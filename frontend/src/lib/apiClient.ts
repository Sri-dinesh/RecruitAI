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
  options: FetchWithAuthOptions & { retries?: number; retryDelayMs?: number; _isRetryAfterRefresh?: boolean } = {}
): Promise<Response> {
  const { timeoutMs = 60000, retries = 2, retryDelayMs = 400, signal: externalSignal, _isRetryAfterRefresh, ...fetchOptions } = options as any;
  const headers = new Headers(fetchOptions.headers || {});

  // Preserve multipart boundary — only set JSON if body isn't FormData and no explicit type
  if (!(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const supabase = createSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError')), timeoutMs);
    }
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    }

    try {
      const res = await fetch(url, { ...fetchOptions, headers, signal: controller.signal });
      if (timer) clearTimeout(timer);

      // 401 → refresh session once
      if (res.status === 401 && !_isRetryAfterRefresh) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session?.access_token) {
            return fetchWithAuth(path, { ...(options as any), _isRetryAfterRefresh: true } as any);
          }
        } catch {}
      }

      // Retry on 502-504 gateway errors
      if ([502, 503, 504].includes(res.status) && attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      if (isTimeout) throw err;
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  // Fallback — should not reach
  throw new Error('fetchWithAuth exhausted retries');
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
