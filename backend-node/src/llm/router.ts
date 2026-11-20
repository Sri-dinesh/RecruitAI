import {
  getConfig,
  ROTATING_MODELS,
  verifyProviderCompliance,
  type AppConfig,
} from '../config/index.js';
import { getSharedRedisStore, type RedisStore } from '../redis/client.js';
import { logEvent } from '../telemetry/logging.js';
import { createLogger } from '../telemetry/logger.js';
import { metricsRegistry, type RedMetricsRegistry } from '../telemetry/metrics.js';
import {
  getDefaultLlmBudgetGate,
  LlmBudgetExceededError,
  type LlmBudgetGateLike,
} from './budget.js';
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
 * Async surface shared by the process-local breaker and the fleet-wide Redis
 * breaker. `callLlm` only uses these methods so both implementations are
 * interchangeable.
 */
export interface AsyncCircuitBreaker {
  canAttemptAsync(model: string): Promise<boolean>;
  recordSuccessAsync(model: string): Promise<void>;
  recordFailureAsync(model: string, isRateLimit?: boolean): Promise<void>;
  getCircuitStateAsync(model: string): Promise<CircuitStateValue>;
  resetAsync(): Promise<void>;
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

  // Async surface for `callLlm`; delegates to the synchronous in-process state.
  async canAttemptAsync(model: string): Promise<boolean> {
    return this.canAttempt(model);
  }

  async recordSuccessAsync(model: string): Promise<void> {
    this.recordSuccess(model);
  }

  async recordFailureAsync(model: string, isRateLimit = false): Promise<void> {
    this.recordFailure(model, isRateLimit);
  }

  async getCircuitStateAsync(model: string): Promise<CircuitStateValue> {
    return this.getCircuitState(model);
  }

  async resetAsync(): Promise<void> {
    this.reset();
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

const circuitLogger = createLogger('recruitai.circuit_breaker');

/**
 * Atomically record a failure and trip the circuit when the threshold is hit.
 * KEYS: failures, last_failure, state
 * ARGV: failure ttl seconds, now (epoch seconds), rate-limit flag, threshold
 */
const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[1])

local shouldTrip = ARGV[3] == '1' or count >= tonumber(ARGV[4])
if shouldTrip then
  local wasOpen = redis.call('GET', KEYS[3]) == 'OPEN'
  redis.call('SET', KEYS[3], 'OPEN')
  redis.call('EXPIRE', KEYS[3], ARGV[1])
  if wasOpen then
    return {count, 0}
  end
  return {count, 1}
end
return {count, 0}
`;

export interface RedisCircuitBreakerOptions extends ModelCircuitBreakerOptions {
  readonly store: RedisStore;
}

/**
 * Fleet-wide circuit breaker backed by Redis counters and TTLs (Phase 21).
 *
 * A per-instance breaker lets the remaining replicas stampede into a failing
 * model. This implementation writes the consecutive-failure counter, last
 * failure time and OPEN state to Redis in one Lua call, so every instance sees
 * the same circuit. If Redis is unreachable it falls back to the process-local
 * breaker rather than failing LLM traffic.
 */
export class RedisModelCircuitBreaker implements AsyncCircuitBreaker {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
  private readonly models: readonly string[];
  private readonly store: RedisStore;
  private readonly now: () => number;
  private readonly fallback: ModelCircuitBreaker;

  constructor(options: RedisCircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownSeconds = options.cooldownSeconds ?? 60;
    this.models = options.models ?? ROTATING_MODELS;
    this.store = options.store;
    this.now = options.now ?? (() => Date.now() / 1000);
    this.fallback = new ModelCircuitBreaker({
      models: this.models,
      failureThreshold: this.failureThreshold,
      cooldownSeconds: this.cooldownSeconds,
      now: this.now,
    });
  }

  private stateKey(model: string): string {
    return this.store.key('breaker', model, 'state');
  }

  private failuresKey(model: string): string {
    return this.store.key('breaker', model, 'failures');
  }

  private lastFailureKey(model: string): string {
    return this.store.key('breaker', model, 'last_failure');
  }

  private failureTtlSeconds(): number {
    return Math.max(60, Math.ceil(this.cooldownSeconds * 2));
  }

  async canAttemptAsync(model: string): Promise<boolean> {
    try {
      const state = await this.store.getString(this.stateKey(model));
      if (state === null || state === 'CLOSED') {
        return true;
      }
      if (state === 'HALF_OPEN') {
        return true;
      }
      const lastFailure = Number((await this.store.getString(this.lastFailureKey(model))) ?? 0);
      if (this.now() - lastFailure >= this.cooldownSeconds) {
        await this.store.setString(this.stateKey(model), 'HALF_OPEN', this.failureTtlSeconds());
        circuitLogger.info(
          `[circuit_breaker] Model ${model} cooldown elapsed; entering HALF_OPEN state.`,
          { circuit_state: CircuitState.HALF_OPEN, model },
        );
        return true;
      }
      return false;
    } catch (error) {
      circuitLogger.warn(
        `[circuit_breaker] Redis read failed; using local breaker: ${errorMessage(error)}`,
      );
      return this.fallback.canAttempt(model);
    }
  }

  async recordSuccessAsync(model: string): Promise<void> {
    this.fallback.recordSuccess(model);
    try {
      await this.store.setString(this.stateKey(model), 'CLOSED', this.failureTtlSeconds());
      await this.store.delete(this.failuresKey(model));
      await this.store.delete(this.lastFailureKey(model));
    } catch (error) {
      circuitLogger.warn(
        `[circuit_breaker] Redis write failed; local state only: ${errorMessage(error)}`,
      );
    }
  }

  async recordFailureAsync(model: string, isRateLimit = false): Promise<void> {
    this.fallback.recordFailure(model, isRateLimit);
    try {
      const result = await this.store.evalScript(
        RECORD_FAILURE_SCRIPT,
        [this.failuresKey(model), this.lastFailureKey(model), this.stateKey(model)],
        [
          this.failureTtlSeconds(),
          Math.floor(this.now()),
          isRateLimit ? 1 : 0,
          this.failureThreshold,
        ],
      );
      const [, tripped] = Array.isArray(result) ? result : [0, 0];
      if (Number(tripped) === 1) {
        circuitLogger.warn(
          isRateLimit
            ? `[circuit_breaker] Model ${model} hit rate limit. ` +
                `Circuit tripped to OPEN for ${formatCooldown(this.cooldownSeconds)}s cooldown.`
            : `[circuit_breaker] Model ${model} reached ${this.failureThreshold} consecutive failures. ` +
                `Circuit tripped to OPEN for ${formatCooldown(this.cooldownSeconds)}s cooldown.`,
          {
            circuit_state: CircuitState.OPEN,
            model,
            status: isRateLimit ? 'rate_limit' : 'failure_threshold',
          },
        );
      }
    } catch (error) {
      circuitLogger.warn(
        `[circuit_breaker] Redis write failed; local state only: ${errorMessage(error)}`,
      );
    }
  }

  async getCircuitStateAsync(model: string): Promise<CircuitStateValue> {
    try {
      const state = await this.store.getString(this.stateKey(model));
      if (state === 'OPEN' || state === 'HALF_OPEN') {
        return state;
      }
      return CircuitState.CLOSED;
    } catch (error) {
      circuitLogger.warn(
        `[circuit_breaker] Redis read failed; using local state: ${errorMessage(error)}`,
      );
      return this.fallback.getCircuitState(model);
    }
  }

  async resetAsync(): Promise<void> {
    this.fallback.reset();
    try {
      for (const model of this.models) {
        await this.store.delete(this.stateKey(model));
        await this.store.delete(this.failuresKey(model));
        await this.store.delete(this.lastFailureKey(model));
      }
    } catch (error) {
      circuitLogger.warn(
        `[circuit_breaker] Redis reset failed; local state cleared: ${errorMessage(error)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let defaultRedisBreaker: RedisModelCircuitBreaker | undefined;
let defaultRedisBreakerUrl: string | null = null;

/**
 * Select the fleet-wide breaker when `REDIS_URL` is configured, otherwise the
 * Python-equivalent process-local breaker.
 */
export function getDefaultCircuitBreaker(config: AppConfig): AsyncCircuitBreaker {
  if (!config.jobs.redisUrl) {
    return circuitBreaker;
  }
  if (defaultRedisBreaker && defaultRedisBreakerUrl === config.jobs.redisUrl) {
    return defaultRedisBreaker;
  }
  const store = getSharedRedisStore();
  if (!store) {
    return circuitBreaker;
  }
  defaultRedisBreaker = new RedisModelCircuitBreaker({
    store,
    failureThreshold: 3,
    cooldownSeconds: 60,
  });
  defaultRedisBreakerUrl = config.jobs.redisUrl;
  return defaultRedisBreaker;
}

/** Test helper: drop the memoised Redis breaker. */
export function resetDefaultCircuitBreakerForTests(): void {
  defaultRedisBreaker = undefined;
  defaultRedisBreakerUrl = null;
}

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

/** Fleet-aware variant: awaits every circuit lookup. */
export async function getNextModelOrderAsync(
  providerOverride?: string,
  breaker: AsyncCircuitBreaker = circuitBreaker,
  models: readonly string[] = ROTATING_MODELS,
): Promise<string[]> {
  let baseOrder: string[];

  if (providerOverride && models.includes(providerOverride)) {
    baseOrder = [providerOverride, ...models.filter((model) => model !== providerOverride)];
  } else {
    const startIndex = modelIndex;
    modelIndex = (modelIndex + 1) % models.length;
    baseOrder = models.map((_, offset) => models[(startIndex + offset) % models.length] as string);
  }

  const attempts = await Promise.all(
    baseOrder.map(async (model) => ({ model, allowed: await breaker.canAttemptAsync(model) })),
  );
  const healthy = attempts.filter((entry) => entry.allowed).map((entry) => entry.model);
  const tripped = attempts.filter((entry) => !entry.allowed).map((entry) => entry.model);
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
  readonly circuitBreaker?: AsyncCircuitBreaker;
  /** Metrics registry injection; defaults to the process-wide collector. */
  readonly metrics?: RedMetricsRegistry;
  /** Spend-gate injection (tests); defaults to the process-wide gate. */
  readonly budget?: LlmBudgetGateLike;
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
  const breaker = options.circuitBreaker ?? getDefaultCircuitBreaker(config);
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

  const budget = options.budget ?? getDefaultLlmBudgetGate(config);
  const lease = await budget.acquire();
  if (!lease) {
    throw new LlmBudgetExceededError(
      'LLM concurrency budget is saturated. Degrade to deterministic processing and retry shortly.',
    );
  }

  try {
    const order = await getNextModelOrderAsync(options.providerOverride, breaker);
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

        await breaker.recordSuccessAsync(modelName);

        const { tokensIn, tokensOut } = extractUsage(response, prompt, responseText);
        const costUsd = estimateCost(tokensIn, tokensOut);

        logEvent('llm_call_completed', {
          extra: {
            model: modelName,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            cost_usd: costUsd,
            latency_ms: roundTo(latencyMs, 2),
            circuit_state: await breaker.getCircuitStateAsync(modelName),
            status: 'success',
          },
        });

        // Phase 7 accounting hook: feeds /api/metrics token + cost totals.
        metrics.recordTokens(tokensIn, tokensOut, costUsd);
        // Phase 23 spend anomaly alert (never blocks the response).
        await budget.recordCost(costUsd, modelName);

        logger.info(
          `[llm_router] Handled by ${modelName} in ${latencyMs.toFixed(1)}ms ` +
            `(in=${tokensIn}, out=${tokensOut}, cost=$${costUsd.toFixed(6)})`,
          { model: modelName, latency_ms: roundTo(latencyMs, 2), status: 'success' },
        );

        return { text: responseText, provider: 'gemini', latencyMs };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = isRateLimitMessage(message);

        await breaker.recordFailureAsync(modelName, isRateLimit);
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
  } finally {
    await lease.release();
  }
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
