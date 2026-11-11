import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import {
  formatZodIssues,
  ValidationError,
  type FastApiValidationError,
} from '../schemas/validation.js';

export interface ValidateBodyOptions {
  /**
   * `true` (default) mirrors `req: Model` — a missing/`null` body is a 422
   * `missing` error on `["body"]`.
   *
   * `false` mirrors `req: Model = Model()` — a missing/`null` body falls back
   * to the schema defaults (used by `POST /api/privacy/retention/run`).
   */
  readonly required?: boolean;
}

function missingBodyError(): FastApiValidationError {
  return { type: 'missing', loc: ['body'], msg: 'Field required', input: null };
}

function modelAttributesError(input: unknown): FastApiValidationError {
  return {
    type: 'model_attributes_type',
    loc: ['body'],
    msg: 'Input should be a valid dictionary or object to extract fields from',
    input,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** body-parser decodes an empty JSON body to `{}`; trust the content length. */
function isEmptyJsonBody(req: Request): boolean {
  return req.headers['content-length'] === '0';
}

/**
 * Validate a JSON request body against a Zod schema.
 *
 * Mirrors FastAPI's body handling:
 *   - no body / `null` body       -> 422 `missing` on `["body"]`
 *   - array/string/number/boolean -> 422 `model_attributes_type`
 *   - object                      -> field-level errors, prefixed with `body`
 *
 * Successful validation replaces `req.body` with the parsed output, so unknown
 * keys are stripped and Pydantic-style coercion has already happened.
 */
export function validateBody<T extends z.ZodType>(
  schema: T,
  options: ValidateBodyOptions = {},
): RequestHandler {
  const required = options.required ?? true;

  return (req, _res, next) => {
    let body: unknown = req.body;

    if (body === undefined || body === null) {
      if (required) {
        next(new ValidationError([missingBodyError()]));
        return;
      }
      body = {};
    } else if (
      required &&
      isPlainObject(body) &&
      Object.keys(body).length === 0 &&
      isEmptyJsonBody(req)
    ) {
      next(new ValidationError([missingBodyError()]));
      return;
    }

    if (!isPlainObject(body)) {
      next(new ValidationError([modelAttributesError(body)]));
      return;
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      next(new ValidationError(formatZodIssues(result.error.issues, body, ['body'])));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Multipart/form-data fields (after multer). FastAPI reports form validation
 * errors on `["body", field]`, so the prefix is the same as JSON bodies.
 */
export function validateForm<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const body: unknown = isPlainObject(req.body) ? req.body : {};

    const result = schema.safeParse(body);
    if (!result.success) {
      next(new ValidationError(formatZodIssues(result.error.issues, body, ['body'])));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Express 5's `req.query` is read-only in practice (assignment is ignored), so
 * validated query values are stored on `req.validatedQuery` and read back with
 * `getValidatedQuery`.
 *
 * FastAPI uses the *last* value for a repeated scalar query parameter, so
 * arrays are collapsed to their final element before validation.
 */
function normalizeMultiValue(source: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      normalized[key] = value.length > 0 ? value[value.length - 1] : undefined;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const raw = normalizeMultiValue(req.query as Record<string, unknown>);

    const result = schema.safeParse(raw);
    if (!result.success) {
      next(new ValidationError(formatZodIssues(result.error.issues, raw, ['query'])));
      return;
    }

    req.validatedQuery = result.data;
    next();
  };
}

export function getValidatedQuery<T>(req: Request): T {
  if (req.validatedQuery === undefined) {
    throw new Error('validateQuery middleware has not run for this route.');
  }
  return req.validatedQuery as T;
}

/** Header names are lowercased by Node; FastAPI loc is `["header", name]`. */
export function validateHeaders<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const raw = normalizeMultiValue(req.headers as Record<string, unknown>);

    const result = schema.safeParse(raw);
    if (!result.success) {
      next(new ValidationError(formatZodIssues(result.error.issues, raw, ['header'])));
      return;
    }

    req.validatedHeaders = result.data;
    next();
  };
}

export function getValidatedHeaders<T>(req: Request): T {
  if (req.validatedHeaders === undefined) {
    throw new Error('validateHeaders middleware has not run for this route.');
  }
  return req.validatedHeaders as T;
}
