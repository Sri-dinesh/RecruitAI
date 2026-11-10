import {
  readBoolean,
  readCsvList,
  readInt,
  readIntStrict,
  readString,
  readStringOr,
  type EnvSource,
} from './env.js';

/**
 * Typed application configuration.
 *
 * Ported from backend/app/core/config.py. Behavior is preserved exactly
 * (defaults, parsing quirks, production gates); the only deliberate addition
 * is fail-fast validation of required production keys, which the migration
 * plan requires and the Python backend defined as get_missing_keys() but
 * never enforced at startup.
 */

/** CORS allow-list defaults from the Python config. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://recruitaiofficial.vercel.app',
  'https://recruitai.vercel.app',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
] as const;

/** Vercel preview-origin regex used by the FastAPI CORS middleware. */
export const VERCEL_PREVIEW_ORIGIN_REGEX = String.raw`^https:\/\/recruitai(-[a-zA-Z0-9]+)?\.vercel\.app$`;

export const DEFAULT_LOCAL_DEV_USER_ID = 'e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3';

export const DEFAULT_LLM_DATA_USE_MODE = 'zero_retention_verified';

/**
 * Gemini model rotation order, ported from
 * backend/app/core/llm_router.py::ROTATING_MODELS.
 */
export const ROTATING_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
] as const;

/** JWT verification is pinned to HS256 in the Python auth layer. */
export const JWT_ALGORITHM = 'HS256' as const;

/** Supabase `aud` claim expected by auth.py (getattr default). */
export const DEFAULT_JWT_AUDIENCE = 'authenticated';

/**
 * Keys the Python backend treats as required (get_missing_keys()).
 * In production we fail fast when any are absent.
 */
export const REQUIRED_PRODUCTION_KEYS = [
  'GEMINI_API_KEY',
  'TAVILY_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Modes rejected by the AI-SEC-1 production gate. */
const UNVERIFIED_DATA_USE_MODES = new Set(['unverified', 'training_allowed', 'opt_in', 'false']);

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly reload: boolean;
}

export interface AuthConfig {
  readonly useLocalAuth: boolean;
  readonly localDevUserId: string;
  readonly jwtSecret: string;
  readonly jwtAlgorithm: typeof JWT_ALGORITHM;
  readonly jwtAudience: string;
}

export interface LlmConfig {
  readonly geminiApiKey: string | undefined;
  readonly googleApiKey: string | undefined;
  /** Kept for parity; defined in Python but unused. TODO(Phase 8): confirm drop. */
  readonly groqApiKey: string | undefined;
  readonly tavilyApiKey: string | undefined;
  readonly dataUseMode: string;
  readonly killSwitch: boolean;
  readonly rotatingModels: readonly string[];
}

export interface SupabaseConfig {
  readonly url: string | undefined;
  readonly anonKey: string;
  readonly serviceRoleKey: string | undefined;
}

export interface SmtpConfig {
  readonly server: string;
  readonly port: number;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly sender: string | undefined;
}

export interface RazorpayConfig {
  readonly keyId: string;
  readonly keySecret: string;
  readonly webhookSecret: string;
}

export interface CorsConfig {
  readonly allowedOrigins: readonly string[];
  readonly previewOriginRegex: string;
}

export interface TelemetryConfig {
  /** Python has no telemetry env toggles; metrics are always enabled. */
  readonly enabled: true;
}

export interface AppConfig {
  readonly environment: string;
  readonly nodeEnv: string | undefined;
  readonly isProduction: boolean;
  readonly server: ServerConfig;
  readonly auth: AuthConfig;
  readonly llm: LlmConfig;
  readonly supabase: SupabaseConfig;
  readonly smtp: SmtpConfig;
  readonly razorpay: RazorpayConfig;
  readonly cors: CorsConfig;
  readonly telemetry: TelemetryConfig;
  /** Required keys that are currently missing (informational outside production). */
  readonly missingKeys: readonly string[];
}

/** AI-SEC-1. Mirrors verify_provider_compliance() in the Python config. */
export function verifyProviderCompliance(config: AppConfig): void {
  if (
    config.isProduction &&
    (UNVERIFIED_DATA_USE_MODES.has(config.llm.dataUseMode.toLowerCase()) ||
      config.llm.dataUseMode !== DEFAULT_LLM_DATA_USE_MODE)
  ) {
    throw new Error(
      `FATAL SECURITY VIOLATION (AI-SEC-1): LLM_DATA_USE_MODE is '${config.llm.dataUseMode}'. ` +
        "Enterprise production requires 'zero_retention_verified' with active provider DPA " +
        'and training opt-out to prevent candidate data ingestion by foundational models.',
    );
  }
}

/** Mirrors get_missing_keys() from the Python config. */
export function getMissingKeys(env: EnvSource): string[] {
  return REQUIRED_PRODUCTION_KEYS.filter((key) => !env[key]);
}

/**
 * Build a validated config object from an env source.
 *
 * Throws when:
 * - a production AI-SEC-1 data-use violation is detected
 * - required production keys are missing
 * - PORT is present but not an integer
 */
export function loadConfig(env: EnvSource = process.env): AppConfig {
  const nodeEnv = readString(env, 'NODE_ENV');
  const environment = (env.ENVIRONMENT ?? nodeEnv ?? 'development').toLowerCase();
  const isProduction = environment === 'production';

  const username = readString(env, 'SMTP_USERNAME');
  const port = readIntStrict(env, 'PORT', 8000);

  const allowedOrigins = readCsvList(env, 'ALLOWED_ORIGINS') ?? [...DEFAULT_ALLOWED_ORIGINS];

  const config: AppConfig = {
    environment,
    nodeEnv,
    isProduction,
    server: {
      host: readStringOr(env, 'HOST', '0.0.0.0'),
      port,
      reload: readBoolean(env, 'RELOAD', !isProduction),
    },
    auth: {
      // Dev-only bypass; never active in production.
      useLocalAuth: isProduction ? false : readBoolean(env, 'USE_LOCAL_AUTH', false),
      localDevUserId: readStringOr(env, 'LOCAL_DEV_USER_ID', DEFAULT_LOCAL_DEV_USER_ID),
      jwtSecret: readStringOr(env, 'SUPABASE_JWT_SECRET', ''),
      jwtAlgorithm: JWT_ALGORITHM,
      jwtAudience: readStringOr(env, 'SUPABASE_JWT_AUDIENCE', DEFAULT_JWT_AUDIENCE),
    },
    llm: {
      geminiApiKey: readString(env, 'GEMINI_API_KEY'),
      googleApiKey: readString(env, 'GOOGLE_API_KEY'),
      groqApiKey: readString(env, 'GROQ_API_KEY'),
      tavilyApiKey: readString(env, 'TAVILY_API_KEY'),
      dataUseMode: readStringOr(env, 'LLM_DATA_USE_MODE', DEFAULT_LLM_DATA_USE_MODE),
      killSwitch: readBoolean(env, 'LLM_KILL_SWITCH', false),
      rotatingModels: ROTATING_MODELS,
    },
    supabase: {
      url: readString(env, 'SUPABASE_URL'),
      anonKey: readStringOr(env, 'SUPABASE_ANON_KEY', ''),
      serviceRoleKey: readString(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    },
    smtp: {
      server: readStringOr(env, 'SMTP_SERVER', 'smtp.gmail.com'),
      port: readInt(env, 'SMTP_PORT', 587),
      username,
      password: readString(env, 'SMTP_PASSWORD'),
      sender: env.SMTP_SENDER ?? username,
    },
    razorpay: {
      keyId: readStringOr(env, 'RAZORPAY_KEY_ID', ''),
      keySecret: readStringOr(env, 'RAZORPAY_KEY_SECRET', ''),
      webhookSecret: readStringOr(env, 'RAZORPAY_WEBHOOK_SECRET', ''),
    },
    cors: {
      allowedOrigins,
      previewOriginRegex: VERCEL_PREVIEW_ORIGIN_REGEX,
    },
    telemetry: { enabled: true },
    missingKeys: getMissingKeys(env),
  };

  // Production gate ordering matches the Python import-time check:
  // AI-SEC-1 compliance first, then required-key fail-fast hardening.
  verifyProviderCompliance(config);

  if (isProduction && config.missingKeys.length > 0) {
    throw new Error(
      `Missing required production configuration: ${config.missingKeys.join(', ')}. ` +
        'Set these values before starting the backend in production.',
    );
  }

  return config;
}

let cachedConfig: AppConfig | undefined;

/**
 * Typed process-wide config singleton.
 *
 * Call once during bootstrap (after loadEnvFileIfPresent) so invalid
 * production configuration fails fast before the server starts listening.
 */
export function getConfig(env: EnvSource = process.env): AppConfig {
  cachedConfig ??= loadConfig(env);
  return cachedConfig;
}

/** Test helper: drop the memoized singleton. */
export function resetConfig(): void {
  cachedConfig = undefined;
}

/** Mode helpers requested by the plan. */
export function isProduction(config: AppConfig = getConfig()): boolean {
  return config.isProduction;
}

export function isLlmKilled(config: AppConfig = getConfig()): boolean {
  return config.llm.killSwitch;
}

/** Runtime LLM gate: mirrors the kill-switch short-circuit in call_llm. */
export function isLlmAllowed(config: AppConfig = getConfig()): boolean {
  return !config.llm.killSwitch;
}

/** AI-SEC-1 data-use gate (startup enforcement is verifyProviderCompliance). */
export function isLlmDataUseModeVerified(config: AppConfig = getConfig()): boolean {
  return config.llm.dataUseMode === DEFAULT_LLM_DATA_USE_MODE;
}
