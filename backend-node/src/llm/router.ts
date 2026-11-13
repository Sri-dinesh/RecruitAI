import {
  getConfig,
  ROTATING_MODELS,
  verifyProviderCompliance,
  type AppConfig,
} from '../config/index.js';
import { logEvent } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';
import {
  invokeGemini,
  type GeminiInvoker,
  type GeminiRequest,
  type LlmResponse,
} from './gemini.js';

/**
 * Port of `backend/app/core/llm_router.py` (ENG-4).
 *
 * Circuit-breaker-aware rotation across the verified Gemini pool, token/cost
 * accounting, tenant-scoped telemetry, and safe JSON extraction. Node is
 * single-threaded, so Python's `threading.Lock` and the mutable `_model_index`
 * guard are unnecessary; the observable ordering is identical.
 */

const logger = createLogger('recruitai.llm_router');

/** Backward-compatible alias, matching Python's `MODELS`. */
export const MODELS = ROTATING_MODELS;

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitStateValue = (typeof CircuitState)[keyof typeof CircuitState];

/** Raised when the kill switch is active or every model in the pool fails. */
export class AllProvidersFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllProvidersFailedError';
  }
}

export interface ModelCircuitBreakerOptions {
  /** Models tracked by the breaker. Defaults to the rotating pool. */
  readonly models?: readonly string[];
  /** Consecutive failures before a circuit opens. Python: 3. */
  readonly failureThreshold?: number;
  /** Cooldown before OPEN → HALF_OPEN probing. Python: 60 s. */
  readonly cooldownSeconds?: number;
  /** Clock in epoch seconds, injectable for tests. */
  readonly now?: () => number;
}

/**
 * Tracks consecutive model failures and cooldown periods.
 *
 * Prevents cascading outages by failing fast on degrading models and probing
 * with canary requests during HALF_OPEN.
 */
export class ModelCircuitBreaker {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
  private readonly models: readonly string[];
  private readonly now: () => number;
  private readonly states = new Map<string, CircuitStateValue>();
  private readonly failureCounts = new Map<string, number>();
  private readonly lastFailureTimes = new Map<string, number>();
  private readonly lastSuccessTimes = new Map<string, number>();

  constructor(options: ModelCircuitBreakerOptions = {}) {
    this.models = options.models ?? ROTATING_MODELS;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownSeconds = options.cooldownSeconds ?? 60;
    this.now = options.now ?? (() => Date.now() / 1000);
    this.reset();
  }

  canAttempt(model: string): boolean {
    const state = this.states.get(model) ?? CircuitState.CLOSED;
    if (state === CircuitState.CLOSED) {
      return true;
    }

    const now = this.now();
    if (state === CircuitState.OPEN) {
      if (now - (this.lastFailureTimes.get(model) ?? 0) >= this.cooldownSeconds) {
        this.states.set(model, CircuitState.HALF_OPEN);
        logger.info(
          `[circuit_breaker] Model ${model} cooldown elapsed; entering HALF_OPEN state.`,
          { circuit_state: CircuitState.HALF_OPEN, model },
        );
        return true;
      }
      return false;
    }

    // HALF_OPEN allows a canary probe.
    return true;
  }

  recordSuccess(model: string): void {
    this.states.set(model, CircuitState.CLOSED);
    this.failureCounts.set(model, 0);
    this.lastSuccessTimes.set(model, this.now());
  }

  recordFailure(model: string, isRateLimit = false): void {
    const now = this.now();
    this.lastFailureTimes.set(model, now);

    if (isRateLimit) {
      this.failureCounts.set(model, this.failureThreshold);
      this.states.set(model, CircuitState.OPEN);
      logger.warn(
        `[circuit_breaker] Model ${model} hit rate limit. ` +
          `Circuit tripped to OPEN for ${formatCooldown(this.cooldownSeconds)}s cooldown.`,
        { circuit_state: CircuitState.OPEN, model, status: 'rate_limit' },
      );
      return;
    }

    const failures = (this.failureCounts.get(model) ?? 0) + 1;
    this.failureCounts.set(model, failures);
    if (failures >= this.failureThreshold) {
      this.states.set(model, CircuitState.OPEN);
      logger.warn(
        `[circuit_breaker] Model ${model} reached ${this.failureThreshold} consecutive failures. ` +
          `Circuit tripped to OPEN for ${formatCooldown(this.cooldownSeconds)}s cooldown.`,
        { circuit_state: CircuitState.OPEN, model, status: 'failure_threshold' },
      );
    }
  }

  getCircuitState(model: string): CircuitStateValue {
    return this.states.get(model) ?? CircuitState.CLOSED;
  }

  reset(): void {
    for (const model of this.models) {
      this.states.set(model, CircuitState.CLOSED);
      this.failureCounts.set(model, 0);
      this.lastFailureTimes.set(model, 0);
      this.lastSuccessTimes.set(model, 0);
    }
  }

  /** Test/introspection helper; Python does not expose success times. */
  getLastSuccessTime(model: string): number {
    return this.lastSuccessTimes.get(model) ?? 0;
  }
}

/** Python formats `60.0` as "60.0", not "60". */
function formatCooldown(seconds: number): string {
  return Number.isInteger(seconds) ? seconds.toFixed(1) : String(seconds);
}

/** Global circuit breaker, mirroring `circuit_breaker` in Python. */
export const circuitBreaker = new ModelCircuitBreaker({
  failureThreshold: 3,
  cooldownSeconds: 60,
});

/** Round-robin cursor for quota balancing. */
let modelIndex = 0;

/** Test helper: restart the rotation cursor. */
export function resetModelRotation(): void {
  modelIndex = 0;
}

/**
 * Safely extract plain text from LangChain-style response content
 * (string, list of blocks, dict, or an object with `text`/`content`).
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block);
        continue;
      }
      if (isRecord(block)) {
        if (block.type === 'text' && 'text' in block) {
          parts.push(String(block.text));
        } else if ('text' in block) {
          parts.push(String(block.text));
        } else if ('content' in block) {
          parts.push(String(block.content));
        }
        continue;
      }
      if (block && typeof block === 'object') {
        const candidate = block as { text?: unknown; content?: unknown };
        if ('text' in candidate) {
          parts.push(String(candidate.text));
        } else if ('content' in candidate) {
          parts.push(String(candidate.content));
        }
      }
    }
    if (parts.length > 0) {
      return parts.join('');
    }
    // Python falls back to `str(content)`; JSON matches for empty arrays.
    try {
      return JSON.stringify(content) ?? String(content);
    } catch {
      return String(content);
    }
  }

  if (isRecord(content)) {
    if ('text' in content) {
      return String(content.text);
    }
    if ('content' in content) {
      return String(content.content);
    }
  }

  if (content && typeof content === 'object') {
    const candidate = content as { text?: unknown; content?: unknown };
    if ('text' in candidate) {
      return String(candidate.text);
    }
    if ('content' in candidate) {
      return String(candidate.content);
    }
  }

  return String(content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Thread-safe model selection prioritizing healthy circuits (CLOSED/HALF_OPEN).
 * Round-robin rotation balances quota; if every model is OPEN the full pool is
 * returned as a last-resort fallback.
 */
export function getNextModelOrder(
  providerOverride?: string,
  breaker: ModelCircuitBreaker = circuitBreaker,
): string[] {
  const models = ROTATING_MODELS;
  let baseOrder: string[];

  if (providerOverride && models.includes(providerOverride as (typeof models)[number])) {
    baseOrder = [providerOverride, ...models.filter((model) => model !== providerOverride)];
  } else {
    const startIndex = modelIndex;
    modelIndex = (modelIndex + 1) % models.length;
    baseOrder = models.map((_, offset) => models[(startIndex + offset) % models.length] as string);
  }

  const healthy = baseOrder.filter((model) => breaker.canAttempt(model));
  const tripped = baseOrder.filter((model) => !healthy.includes(model));
  return healthy.length > 0 ? [...healthy, ...tripped] : tripped;
}

export interface LlmCallOptions {
  readonly systemInstruction?: string;
  readonly providerOverride?: string;
  /** Enforce upstream JSON schema mode. */
  readonly jsonMode?: boolean;
  /** Explicit config (tests); defaults to the validated singleton. */
  readonly config?: AppConfig;
  /** Transport injection; defaults to the REST Gemini client. */
  readonly invoker?: GeminiInvoker;
  /** Registry injection; defaults to the process-wide collector. */
  readonly circuitBreaker?: ModelCircuitBreaker;
  /** Metrics registry injection; defaults to the process-wide collector. */
  readonly metrics?: RedMetricsRegistry;
}

export interface LlmCallResult {
  readonly text: string;
  readonly provider: 'gemini';
  readonly latencyMs: number;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Extract token counts from a LangChain-shaped response, falling back to the
 * same `len(text) // 4` heuristic as Python.
 */
function extractUsage(
  response: LlmResponse,
  prompt: string,
  responseText: string,
): { tokensIn: number; tokensOut: number } {
  const raw = (response.usage_metadata ?? response.response_metadata?.token_usage ?? {}) as Record<
    string,
    unknown
  >;
  const pick = (keys: readonly string[]): number | undefined => {
    for (const key of keys) {
      const value = raw[key];
      // Python uses `or`, so a zero count falls through to the next source.
      if (typeof value === 'number' && value !== 0) {
        return value;
      }
    }
    return undefined;
  };

  return {
    tokensIn:
      pick(['input_tokens', 'prompt_token_count']) ?? Math.max(1, Math.floor(prompt.length / 4)),
    tokensOut:
      pick(['output_tokens', 'candidates_token_count']) ??
      Math.max(1, Math.floor(responseText.length / 4)),
  };
}

/** Gemini Flash standard rate: $0.075 / 1M in, $0.30 / 1M out. */
function estimateCost(tokensIn: number, tokensOut: number): number {
  return roundTo(tokensIn * 0.000000075 + tokensOut * 0.0000003, 6);
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes('429') || lower.includes('resource_exhausted') || lower.includes('rate_limit')
  );
}

/**
 * Call Gemini through the breaker-aware rotation pool.
 *
 * Returns the text, provider and latency. Throws `AllProvidersFailedError` when
 * the kill switch is active or every model fails.
 */
export async function callLlm(
  prompt: string,
  options: LlmCallOptions = {},
): Promise<LlmCallResult> {
  const config = options.config ?? getConfig();
  const breaker = options.circuitBreaker ?? circuitBreaker;
  const metrics = options.metrics ?? metricsRegistry;
  const invoker = options.invoker ?? invokeGemini;

  if (config.llm.killSwitch) {
    throw new AllProvidersFailedError(
      'LLM kill-switch is active: AI model calls disabled. Gracefully degrading to rule-based evaluation.',
    );
  }

  // AI-SEC-1: defence in depth. Production boot already fails fast on an
  // unverified data-use mode; the call layer refuses to run without it too.
  verifyProviderCompliance(config);

  const apiKey = config.llm.geminiApiKey;
  if (!apiKey || apiKey.includes('your_gemini')) {
    throw new Error('No valid GEMINI_API_KEY is configured in backend/.env.');
  }

  const order = getNextModelOrder(options.providerOverride, breaker);
  const errors: string[] = [];

  for (const modelName of order) {
    const startedAt = performance.now();

    try {
      const request: GeminiRequest = {
        model: modelName,
        prompt,
        apiKey,
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(options.jsonMode ? { jsonMode: true } : {}),
      };
      const response = await invoker(request);
      const latencyMs = performance.now() - startedAt;
      const responseText = extractText(response.content);

      breaker.recordSuccess(modelName);

      const { tokensIn, tokensOut } = extractUsage(response, prompt, responseText);
      const costUsd = estimateCost(tokensIn, tokensOut);

      logEvent('llm_call_completed', {
        extra: {
          model: modelName,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          latency_ms: roundTo(latencyMs, 2),
          circuit_state: breaker.getCircuitState(modelName),
          status: 'success',
        },
      });

      // Phase 7 accounting hook: feeds /api/metrics token + cost totals.
      metrics.recordTokens(tokensIn, tokensOut, costUsd);

      logger.info(
        `[llm_router] Handled by ${modelName} in ${latencyMs.toFixed(1)}ms ` +
          `(in=${tokensIn}, out=${tokensOut}, cost=$${costUsd.toFixed(6)})`,
        { model: modelName, latency_ms: roundTo(latencyMs, 2), status: 'success' },
      );

      return { text: responseText, provider: 'gemini', latencyMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = isRateLimitMessage(message);

      breaker.recordFailure(modelName, isRateLimit);
      errors.push(`${modelName}: ${message}`);

      if (isRateLimit) {
        logger.warn(
          `[gemini] Rate limit hit on ${modelName}. Tripping circuit and failing over...`,
          {
            model: modelName,
            status: 'rate_limit',
          },
        );
      } else {
        logger.warn(`[${modelName}] call failed: ${message}. Failing over to next model...`, {
          model: modelName,
          status: 'failed',
        });
      }
    }
  }

  throw new AllProvidersFailedError(
    `All Gemini models in pool failed. Details: ${errors.join('; ')}`,
  );
}

/**
 * Clean markdown wrappers and strictly parse JSON (ENG-4).
 *
 * `ast.literal_eval` is deliberately not replaced: only real JSON is accepted,
 * so model output can never execute code.
 */
export function parseJsonSafely(text: string): unknown {
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(cleaned);
    if (match?.[1]) {
      cleaned = match[1].trim();
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Heuristic sanitation: strip trailing commas before closing braces/brackets.
    const sanitized = cleaned.replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(sanitized);
    } catch {
      const detail = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(
        `Failed to parse text as valid JSON (ast.literal_eval disabled for security): ${detail}`,
      );
    }
  }
}
