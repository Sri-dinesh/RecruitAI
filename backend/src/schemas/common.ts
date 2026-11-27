import { z } from 'zod';

/**
 * Shared primitives that reproduce Pydantic v2's *lax* mode.
 *
 * FastAPI validates request bodies and query/header parameters with Pydantic.
 * Express has no equivalent, so this module backs the Zod schemas with the same
 * coercion rules instead of the stricter defaults Zod ships with:
 *
 *   int     "2" -> 2, "2.0" -> 2, true -> 1, 1.5 -> error (int_from_float)
 *   float   "1.5" -> 1.5, "1e3" -> 1000, true -> 1.0
 *   bool    "yes"/"on"/"1" -> true, "no"/"off"/"0" -> false, 0/1 -> false/true
 *   str     no coercion at all (an int is a string_type error)
 *
 * Each failure carries the exact FastAPI/Pydantic `type`/`msg`/`ctx` metadata
 * (via `params.fastapi`) so `validation.ts` can serialise the documented
 * `{"detail": [{type, loc, msg, input, ctx?}]}` 422 body.
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FastApiIssueMeta {
  readonly type: string;
  readonly msg: string;
  readonly ctx?: Readonly<Record<string, unknown>>;
}

/** Payload attached to custom Zod issues so the 422 mapper can stay faithful. */
export interface FastApiIssueParams {
  readonly fastapi: FastApiIssueMeta;
}

const INT_TYPE: FastApiIssueMeta = {
  type: 'int_type',
  msg: 'Input should be a valid integer',
};
const INT_PARSING: FastApiIssueMeta = {
  type: 'int_parsing',
  msg: 'Input should be a valid integer, unable to parse string as an integer',
};
const INT_FROM_FLOAT: FastApiIssueMeta = {
  type: 'int_from_float',
  msg: 'Input should be a valid integer, got a number with a fractional part',
};
const FLOAT_TYPE: FastApiIssueMeta = {
  type: 'float_type',
  msg: 'Input should be a valid number',
};
const FLOAT_PARSING: FastApiIssueMeta = {
  type: 'float_parsing',
  msg: 'Input should be a valid number, unable to parse string as a number',
};
const BOOL_TYPE: FastApiIssueMeta = {
  type: 'bool_type',
  msg: 'Input should be a valid boolean',
};
const BOOL_PARSING: FastApiIssueMeta = {
  type: 'bool_parsing',
  msg: 'Input should be a valid boolean, unable to interpret input',
};
const MISSING: FastApiIssueMeta = { type: 'missing', msg: 'Field required' };

/** Add a custom issue that carries FastAPI-compatible metadata. */
export function addFastApiIssue(ctx: z.RefinementCtx, meta: FastApiIssueMeta): void {
  const params: FastApiIssueParams = { fastapi: meta };
  ctx.addIssue({ code: 'custom', message: meta.msg, params });
}

type Coerced<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly meta: FastApiIssueMeta };

/** Decimal integer strings Pydantic accepts ("2", "+2", " -2 ", "2.0", "2.00"). */
const INT_STRING = /^[+-]?\d+(?:\.0+)?$/;

/** Decimal float strings Pydantic accepts, including exponents. */
const FLOAT_STRING = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const FLOAT_SPECIAL = /^[+-]?(?:inf(?:inity)?|nan)$/i;

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9';
}

/**
 * Python numeric literals allow underscores between digits ("1_000"). Return
 * the value without separators, or `undefined` for an invalid placement.
 */
function removeDigitSeparators(value: string): string | undefined {
  if (!value.includes('_')) {
    return value;
  }

  let cleaned = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '_') {
      cleaned += char ?? '';
      continue;
    }
    if (!isAsciiDigit(value[index - 1]) || !isAsciiDigit(value[index + 1])) {
      return undefined;
    }
  }
  return cleaned;
}

function coerceInt(raw: unknown): Coerced<number> {
  if (raw === undefined) {
    return { ok: false, meta: MISSING };
  }
  if (typeof raw === 'boolean') {
    return { ok: true, value: raw ? 1 : 0 };
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? { ok: true, value: raw } : { ok: false, meta: INT_FROM_FLOAT };
  }
  if (typeof raw === 'string') {
    const cleaned = removeDigitSeparators(raw.trim());
    if (cleaned === undefined || !INT_STRING.test(cleaned)) {
      return { ok: false, meta: INT_PARSING };
    }
    return { ok: true, value: Number(cleaned) };
  }
  return { ok: false, meta: INT_TYPE };
}

function coerceFloat(raw: unknown): Coerced<number> {
  if (raw === undefined) {
    return { ok: false, meta: MISSING };
  }
  if (typeof raw === 'boolean') {
    return { ok: true, value: raw ? 1 : 0 };
  }
  if (typeof raw === 'number') {
    return { ok: true, value: raw };
  }
  if (typeof raw === 'string') {
    const cleaned = removeDigitSeparators(raw.trim());
    if (cleaned === undefined || (!FLOAT_STRING.test(cleaned) && !FLOAT_SPECIAL.test(cleaned))) {
      return { ok: false, meta: FLOAT_PARSING };
    }
    return { ok: true, value: Number(cleaned) };
  }
  return { ok: false, meta: FLOAT_TYPE };
}

const BOOL_TRUE = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const BOOL_FALSE = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

function coerceBool(raw: unknown): Coerced<boolean> {
  if (raw === undefined) {
    return { ok: false, meta: MISSING };
  }
  if (typeof raw === 'boolean') {
    return { ok: true, value: raw };
  }
  if (typeof raw === 'number') {
    if (raw === 0) {
      return { ok: true, value: false };
    }
    if (raw === 1) {
      return { ok: true, value: true };
    }
    return { ok: false, meta: BOOL_PARSING };
  }
  if (typeof raw === 'string') {
    // Pydantic does not trim bool strings (" true " is a parsing error).
    const lower = raw.toLowerCase();
    if (BOOL_TRUE.has(lower)) {
      return { ok: true, value: true };
    }
    if (BOOL_FALSE.has(lower)) {
      return { ok: true, value: false };
    }
    return { ok: false, meta: BOOL_PARSING };
  }
  return { ok: false, meta: BOOL_TYPE };
}

function rangeIssue(kind: 'ge' | 'le', value: number): FastApiIssueMeta {
  if (kind === 'ge') {
    return {
      type: 'greater_than_equal',
      msg: `Input should be greater than or equal to ${value}`,
      ctx: { ge: value },
    };
  }
  return {
    type: 'less_than_equal',
    msg: `Input should be less than or equal to ${value}`,
    ctx: { le: value },
  };
}

export interface IntOptions {
  readonly ge?: number;
  readonly le?: number;
}

/**
 * Pydantic-compatible integer. Missing input is a `missing` error; optional
 * fields are built with `.nullable()` / `.default(...)`.
 */
export function pydanticInt(options: IntOptions = {}) {
  return z
    .unknown()
    .superRefine((raw, ctx) => {
      const result = coerceInt(raw);
      if (!result.ok) {
        addFastApiIssue(ctx, result.meta);
        return;
      }
      if (options.ge !== undefined && result.value < options.ge) {
        addFastApiIssue(ctx, rangeIssue('ge', options.ge));
      }
      if (options.le !== undefined && result.value > options.le) {
        addFastApiIssue(ctx, rangeIssue('le', options.le));
      }
    })
    .transform((raw) => {
      const result = coerceInt(raw);
      // Transform runs even when an issue was added; the value is discarded by
      // `safeParse` in that case, so a placeholder is enough.
      return result.ok ? result.value : 0;
    });
}

/** Pydantic-compatible float. */
export function pydanticFloat() {
  return z
    .unknown()
    .superRefine((raw, ctx) => {
      const result = coerceFloat(raw);
      if (!result.ok) {
        addFastApiIssue(ctx, result.meta);
      }
    })
    .transform((raw) => {
      const result = coerceFloat(raw);
      return result.ok ? result.value : 0;
    });
}

/** Pydantic-compatible boolean. */
export function pydanticBool() {
  return z
    .unknown()
    .superRefine((raw, ctx) => {
      const result = coerceBool(raw);
      if (!result.ok) {
        addFastApiIssue(ctx, result.meta);
      }
    })
    .transform((raw) => {
      const result = coerceBool(raw);
      return result.ok ? result.value : false;
    });
}

/** `Dict[str, Any]` — a JSON object with arbitrary values. */
export function pydanticDict() {
  return z.record(z.string(), z.unknown());
}

/** A fresh `[]` default (Pydantic copies mutable defaults per instance). */
export function stringListDefault() {
  return z.array(z.string()).default(() => []);
}

/** `Optional[str]` with the documented default. */
export function optionalString(defaultValue: string | null = null) {
  return z.string().nullable().default(defaultValue);
}

/**
 * Pydantic serialises `datetime` as ISO 8601. Accepting `Date` lets the same
 * schema shape database rows before they are sent to clients.
 */
export function isoDateTime() {
  return z
    .union([z.string(), z.date()])
    .transform((value) => (value instanceof Date ? value.toISOString() : value));
}

/** Email field from `EmailRequest.recipient_email`. */
export function pydanticEmail() {
  return z
    .string()
    .superRefine((value, ctx) => {
      const clean = value.trim();
      if (!clean || !EMAIL_REGEX.test(clean)) {
        const error = `Invalid recipient email format: '${clean}'`;
        addFastApiIssue(ctx, {
          type: 'value_error',
          msg: `Value error, ${error}`,
          ctx: { error },
        });
      }
    })
    .transform((value) => value.trim());
}
