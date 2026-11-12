import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Environment source accepted by the config loader. Defaults to process.env,
 * but tests can pass a plain object without touching global state.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Absolute path to backend-node/.env, resolved from this module so it works
 * from both src/config/env.ts (dev) and dist/config/env.js (prod) regardless
 * of the current working directory.
 */
const DEFAULT_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Load backend-node/.env when present, mirroring the Python config's
 * `load_dotenv(BASE_DIR / ".env")`.
 *
 * Uses Node's built-in env-file loader (no dotenv dependency). Existing
 * process.env values win, which keeps real deployment env authoritative.
 */
export function loadEnvFileIfPresent(path: string = DEFAULT_ENV_FILE): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/** Read a raw string value; `''` stays `''` (matches os.getenv). */
export function readString(env: EnvSource, key: string): string | undefined {
  return env[key];
}

/** Read a string with a fallback for unset values only. */
export function readStringOr(env: EnvSource, key: string, fallback: string): string {
  return env[key] ?? fallback;
}

/**
 * Python-compatible boolean parsing: only the exact value `true`
 * (case-insensitive) is truthy; everything else is false.
 */
export function readBoolean(env: EnvSource, key: string, fallback = false): boolean {
  const value = env[key];
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Lenient integer parsing, matching `_parse_port` in the Python config:
 * unset/empty/invalid values fall back to the default instead of throwing.
 */
export function readInt(env: EnvSource, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const trimmed = raw.trim();
  // Reject decimals/trailing junk like Python's int() does.
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

/**
 * Strict integer parsing for startup-critical values (PORT). The Python
 * launcher calls int() here and crashes on invalid input, so fail loudly
 * instead of silently binding a different port.
 */
export function readIntStrict(env: EnvSource, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${key}: expected an integer, received "${raw}".`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${key}: value "${raw}" is out of range.`);
  }
  return parsed;
}

/**
 * Strict positive-integer parsing for bounded-resource settings (pool sizing).
 * Unset/empty uses the fallback; invalid, zero or negative values fail loudly
 * instead of silently changing the connection budget.
 */
export function readPositiveIntStrict(env: EnvSource, key: string, fallback: number): number {
  const value = readIntStrict(env, key, fallback);
  if (value <= 0) {
    throw new Error(`Invalid ${key}: expected a positive integer, received "${env[key]}".`);
  }
  return value;
}

/**
 * Strict non-negative-integer parsing (timeouts). Unset/empty uses the
 * fallback; invalid or negative values fail loudly.
 */
export function readNonNegativeIntStrict(env: EnvSource, key: string, fallback: number): number {
  const value = readIntStrict(env, key, fallback);
  if (value < 0) {
    throw new Error(`Invalid ${key}: expected a non-negative integer, received "${env[key]}".`);
  }
  return value;
}

/**
 * Comma-separated list parsing, matching the Python ALLOWED_ORIGINS logic:
 * unset/empty -> undefined (caller applies defaults); otherwise split, trim
 * and drop empty entries.
 */
export function readCsvList(env: EnvSource, key: string): string[] | undefined {
  const raw = env[key];
  if (!raw) {
    return undefined;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
