import { z } from 'zod';

import { HttpError } from '../types/errors.js';
import type { FastApiIssueMeta } from './common.js';

/**
 * FastAPI-compatible request validation errors.
 *
 * FastAPI renders every validation failure as:
 *
 *   HTTP 422
 *   { "detail": [{ "type", "loc", "msg", "input", "ctx"? }, ...] }
 *
 * The `url` field Pydantic adds is intentionally omitted by FastAPI, so it is
 * omitted here too. `loc` is prefixed with the parameter source (`body`,
 * `query`, `header`).
 */

export type ValidationLocation = string | number;

export interface FastApiValidationError {
  readonly type: string;
  readonly loc: readonly ValidationLocation[];
  readonly msg: string;
  readonly input: unknown;
  readonly ctx?: Readonly<Record<string, unknown>>;
}

export class ValidationError extends HttpError {
  declare readonly detail: readonly FastApiValidationError[];

  constructor(errors: readonly FastApiValidationError[]) {
    super(422, errors, 'Request validation failed');
    this.name = 'ValidationError';
  }
}

function getFastApiMeta(issue: z.core.$ZodIssue): FastApiIssueMeta | undefined {
  if (issue.code !== 'custom') {
    return undefined;
  }
  return issue.params?.['fastapi'] as FastApiIssueMeta | undefined;
}

function describeIssue(issue: z.core.$ZodIssue, input: unknown): FastApiIssueMeta {
  const custom = getFastApiMeta(issue);
  if (custom) {
    return custom;
  }

  switch (issue.code) {
    case 'invalid_type': {
      if (input === undefined) {
        return { type: 'missing', msg: 'Field required' };
      }
      switch (issue.expected) {
        case 'string':
          return { type: 'string_type', msg: 'Input should be a valid string' };
        case 'array':
          return { type: 'list_type', msg: 'Input should be a valid list' };
        case 'object':
        case 'record':
          return { type: 'dict_type', msg: 'Input should be a valid dictionary' };
        case 'boolean':
          return { type: 'bool_type', msg: 'Input should be a valid boolean' };
        case 'number':
          return { type: 'float_type', msg: 'Input should be a valid number' };
        case 'int':
          return { type: 'int_type', msg: 'Input should be a valid integer' };
        default:
          return { type: 'invalid_type', msg: issue.message };
      }
    }
    case 'too_small': {
      const minimum = Number(issue.minimum);
      return {
        type: 'greater_than_equal',
        msg: `Input should be greater than or equal to ${minimum}`,
        ctx: { ge: minimum },
      };
    }
    case 'too_big': {
      const maximum = Number(issue.maximum);
      return {
        type: 'less_than_equal',
        msg: `Input should be less than or equal to ${maximum}`,
        ctx: { le: maximum },
      };
    }
    case 'invalid_format':
      return { type: 'string_pattern_mismatch', msg: issue.message };
    case 'custom':
      return { type: 'value_error', msg: `Value error, ${issue.message}` };
    default:
      return { type: issue.code ?? 'value_error', msg: issue.message };
  }
}

interface PathValue {
  readonly value: unknown;
  readonly parent: unknown;
}

/** Read the value (and its parent) at a Zod issue path from the raw input. */
function readPath(root: unknown, path: readonly PropertyKey[]): PathValue {
  let current: unknown = root;
  let parent: unknown;

  for (const key of path) {
    parent = current;
    if (current === null || current === undefined || typeof current !== 'object') {
      current = undefined;
      continue;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }

  return { value: current, parent };
}

export function formatZodIssues(
  issues: readonly z.core.$ZodIssue[],
  rootInput: unknown,
  locPrefix: readonly ValidationLocation[] = [],
): FastApiValidationError[] {
  return issues.map((issue) => {
    const path = issue.path.map((segment) =>
      typeof segment === 'number' ? segment : String(segment),
    );
    const { value, parent } = readPath(rootInput, issue.path);
    const meta = describeIssue(issue, value);
    const input = meta.type === 'missing' ? parent : value;

    const error: {
      type: string;
      loc: ValidationLocation[];
      msg: string;
      input: unknown;
      ctx?: Readonly<Record<string, unknown>>;
    } = {
      type: meta.type,
      loc: [...locPrefix, ...path],
      msg: meta.msg,
      input,
    };
    if (meta.ctx !== undefined) {
      error.ctx = meta.ctx;
    }
    return error;
  });
}

/**
 * Response helper: run a response model through its schema so unknown keys are
 * stripped and serialisation stays stable, mirroring FastAPI `response_model`.
 */
export function serializeResponse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(value);
}
