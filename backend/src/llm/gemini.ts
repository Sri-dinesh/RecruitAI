/**
 * Google Gemini client for the Node.js backend.
 *
 * Ports the `ChatGoogleGenerativeAI` invocation from
 * `backend/app/core/llm_router.py` without pulling in LangChain: the request
 * body, `response_mime_type` JSON mode, `temperature=0` and the 30 s timeout
 * are preserved, and the response is shaped like a LangChain `AIMessage`
 * (`content` plus `usage_metadata`/`response_metadata`) so the router and later
 * graph nodes can consume it unchanged.
 *
 * Uses the REST `generateContent` endpoint through `fetch`, so tests can inject
 * a fake `fetchImpl` and no vendor SDK is required.
 */

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Python passes `timeout=30.0` to ChatGoogleGenerativeAI. */
export const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;

/**
 * LangChain-shaped chat response.
 *
 * `usage_metadata` uses the same snake_case keys Python reads
 * (`input_tokens`, `prompt_token_count`, ...), so accounting logic is a direct
 * translation.
 */
export interface LlmResponse {
  readonly content: unknown;
  readonly usage_metadata?: Readonly<Record<string, unknown>>;
  readonly response_metadata?: Readonly<Record<string, unknown>>;
}

export interface GeminiRequest {
  readonly model: string;
  readonly prompt: string;
  readonly apiKey: string;
  readonly systemInstruction?: string;
  /** Enforce `responseMimeType: application/json` (upstream JSON mode). */
  readonly jsonMode?: boolean;
  /** Sampling temperature. Python text calls use 0, vision uses 0.1. */
  readonly temperature?: number;
  /** Base64 inline image part for multimodal extraction. */
  readonly image?: { readonly mimeType: string; readonly data: string };
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

export type GeminiInvoker = (request: GeminiRequest) => Promise<LlmResponse>;

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

/** Map Gemini's camelCase usage counts onto Python's expected key names. */
function usageMetadata(
  usage: NonNullable<GeminiApiResponse['usageMetadata']>,
): Record<string, unknown> {
  return {
    input_tokens: usage.promptTokenCount ?? 0,
    output_tokens: usage.candidatesTokenCount ?? 0,
    prompt_token_count: usage.promptTokenCount ?? 0,
    candidates_token_count: usage.candidatesTokenCount ?? 0,
    total_token_count: usage.totalTokenCount ?? 0,
  };
}

/**
 * Call `models/{model}:generateContent` and return the text plus usage.
 *
 * Errors are normalised to `Error` instances whose message contains the HTTP
 * status (so the router's `"429"` rate-limit detection keeps working).
 */
export const invokeGemini: GeminiInvoker = async (request) => {
  const baseUrl = request.baseUrl ?? DEFAULT_GEMINI_BASE_URL;
  const timeoutMs = request.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
  const fetchImpl = request.fetchImpl ?? fetch;
  const url =
    `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(request.model)}` +
    `:generateContent?key=${encodeURIComponent(request.apiKey)}`;

  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
  if (request.image) {
    parts.push({
      inlineData: { mimeType: request.image.mimeType, data: request.image.data },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: request.temperature ?? 0,
      ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (request.systemInstruction) {
    body.systemInstruction = { parts: [{ text: request.systemInstruction }] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const onAbort = (): void => controller.abort();
  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: GeminiApiResponse = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as GeminiApiResponse;
      } catch {
        parsed = {};
      }
    }

    if (!response.ok) {
      const status = parsed.error?.code ?? response.status;
      const detail = parsed.error?.message || raw.slice(0, 500) || 'unknown error';
      throw new Error(`Gemini API error (${status}): ${detail}`);
    }

    const candidates = parsed.candidates ?? [];
    if (candidates.length === 0) {
      const reason = parsed.promptFeedback?.blockReason;
      throw new Error(
        reason ? `Gemini response blocked: ${reason}` : 'Gemini response contained no candidates.',
      );
    }

    const text = (candidates[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
    const usage = parsed.usageMetadata;

    return {
      content: text,
      ...(usage ? { usage_metadata: usageMetadata(usage) } : {}),
      response_metadata: { model: request.model },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
  }
};
