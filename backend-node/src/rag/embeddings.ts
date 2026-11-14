import { createHash } from 'node:crypto';

import { getConfig, type AppConfig } from '../config/index.js';
import { createLogger } from '../telemetry/logger.js';
import { redactPiiForEmbedding } from './redaction.js';

/**
 * Port of `backend/app/rag/embeddings.py`.
 *
 * Uses Gemini's `gemini-embedding-2` REST endpoint with 384 output dimensions
 * (matching the pgvector schema), applies PII minimization before every call
 * (AI-SEC-2), and falls back to a reproducible normalized vector when the
 * provider is unavailable. A missing key is non-fatal, exactly like Python.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIM = 384;
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;

const logger = createLogger('recruitai.embeddings');

export interface EmbeddingOptions {
  readonly config?: AppConfig;
  /** Explicit fetch for tests; defaults to the global implementation. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

interface EmbeddingApiResponse {
  embedding?: { values?: number[] };
  error?: { code?: number; message?: string };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reproducible 384-d normalized vector used when the cloud API is unavailable. */
export function fallbackDeterministicVector(text: string): number[] {
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const values: number[] = [];
  for (let index = 0; index < EMBEDDING_DIM; index += 1) {
    values.push((digest[index % digest.length] ?? 0) / 255.0 - 0.5);
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Math.round((value / norm) * 1e6) / 1e6);
}

/**
 * Embed one string. Blank input returns the zero vector; provider failures are
 * logged and fall back to the deterministic vector instead of throwing.
 */
export async function embedText(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
  if (!text || !text.trim()) {
    return new Array<number>(EMBEDDING_DIM).fill(0);
  }

  const config = options.config ?? getConfig();
  const apiKey = config.llm.geminiApiKey || config.llm.googleApiKey;
  if (!apiKey) {
    logger.warn('[embeddings] GEMINI_API_KEY is not set.');
    return fallbackDeterministicVector(text);
  }

  const sanitized = redactPiiForEmbedding(text).trim();
  const baseUrl = options.baseUrl ?? DEFAULT_GEMINI_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url =
    `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(EMBEDDING_MODEL)}` +
    `:embedContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: sanitized }] },
        outputDimensionality: EMBEDDING_DIM,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: EmbeddingApiResponse = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as EmbeddingApiResponse;
      } catch {
        parsed = {};
      }
    }

    if (!response.ok) {
      const status = parsed.error?.code ?? response.status;
      const detail = parsed.error?.message || raw.slice(0, 500) || 'unknown error';
      throw new Error(`Gemini embedding error (${status}): ${detail}`);
    }

    const values = parsed.embedding?.values;
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
    return new Array<number>(EMBEDDING_DIM).fill(0);
  } catch (error) {
    logger.error(`[embeddings] ${EMBEDDING_MODEL} call failed: ${errorMessage(error)}`);
    return fallbackDeterministicVector(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Embed many strings, preserving input order. Concurrency is capped at 10 to
 * mirror Python's `ThreadPoolExecutor(max_workers=min(10, len(texts)))`.
 */
export async function embedTexts(
  texts: readonly string[],
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const results: number[][] = [];
  for (let start = 0; start < texts.length; start += 10) {
    const batch = texts.slice(start, start + 10);
    const embeddings = await Promise.all(batch.map((text) => embedText(text, options)));
    results.push(...embeddings);
  }
  return results;
}
