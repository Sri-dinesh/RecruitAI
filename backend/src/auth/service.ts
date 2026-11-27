import { decodeJwt, errors, jwtVerify } from 'jose';

import type { AppConfig } from '../config/index.js';
import { getConfig } from '../config/index.js';
import { UnauthorizedError } from '../types/errors.js';
import { ensureValidUuid } from './uuid.js';
import { createSupabaseUserResolver, type SupabaseUserResolver } from './supabase-user.js';

/**
 * JWT authentication service ported from `app/core/auth.py`.
 *
 * Execution order (unchanged):
 *   1. Local HS256 verification with `SUPABASE_JWT_SECRET`, mandatory `aud`
 *      and `exp` handling, pinned algorithm.
 *   2. Supabase Auth network fallback (`GET /auth/v1/user`).
 *   3. Dev-only unverified-claims fallback when `USE_LOCAL_AUTH` is enabled.
 *
 * Missing credentials resolve to the configured local dev user only outside
 * production, because the config layer already forces `useLocalAuth=false` in
 * production.
 */

/**
 * Tokens explicitly accepted by the Python dev bypass. The configured
 * `LOCAL_DEV_USER_ID` is also accepted directly, matching
 * `FallbackSupabaseClient`'s `MockAuth`.
 */
export const DEV_BEARER_TOKENS = [
  'mock-token',
  'local-token',
  'test-token',
  'local_dev_user_123',
] as const;

export interface AuthServiceOptions {
  readonly config?: AppConfig;
  readonly resolveSupabaseUser?: SupabaseUserResolver;
}

export interface AuthService {
  getCurrentUserId(token: string | undefined): Promise<string>;
}

/** Build a reusable auth service with its dependencies resolved once. */
export function createAuthService(options: AuthServiceOptions = {}): AuthService {
  const config = options.config ?? getConfig();
  const resolveSupabaseUser =
    options.resolveSupabaseUser ??
    createSupabaseUserResolver({
      supabaseUrl: config.supabase.url,
      serviceRoleKey: config.supabase.serviceRoleKey,
    });

  return {
    getCurrentUserId: (token) => resolveCurrentUserId(token, config, resolveSupabaseUser),
  };
}

/** Convenience wrapper; prefer `createAuthService` in hot paths. */
export function getCurrentUserId(
  token: string | undefined,
  options: AuthServiceOptions = {},
): Promise<string> {
  return createAuthService(options).getCurrentUserId(token);
}

async function resolveCurrentUserId(
  token: string | undefined,
  config: AppConfig,
  resolveSupabaseUser: SupabaseUserResolver,
): Promise<string> {
  const { auth } = config;

  if (!token) {
    if (auth.useLocalAuth) {
      return auth.localDevUserId;
    }
    throw new UnauthorizedError('Authentication required. Please log in to continue.');
  }

  const devTokens = new Set<string>([...DEV_BEARER_TOKENS, auth.localDevUserId]);
  if (auth.useLocalAuth && devTokens.has(token)) {
    return auth.localDevUserId;
  }

  // 1. Local cryptographic verification, pinned to HS256 with aud/exp checks.
  if (auth.jwtSecret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(auth.jwtSecret), {
        algorithms: [auth.jwtAlgorithm],
        audience: auth.jwtAudience,
      });

      if (payload.sub) {
        return ensureValidUuid(payload.sub);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      if (error instanceof errors.JWTExpired) {
        // python-jose surfaces ExpiredSignatureError with this exact text.
        throw new UnauthorizedError(
          'Authentication token verification failed: Signature has expired.',
        );
      }
      if (error instanceof errors.JWTClaimValidationFailed) {
        throw new UnauthorizedError(`Authentication token verification failed: ${error.message}`);
      }
      // Signature mismatch, algorithm rejection and malformed tokens fall
      // through to the Supabase fallback, matching python-jose behavior.
    }
  }

  // 2. Supabase Auth network fallback.
  let supabaseUserId: string | undefined;
  try {
    supabaseUserId = await resolveSupabaseUser(token);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    supabaseUserId = undefined;
  }

  if (supabaseUserId) {
    return ensureValidUuid(supabaseUserId);
  }

  // 3. Dev-only unverified claims (never reached when useLocalAuth is false).
  if (auth.useLocalAuth) {
    try {
      const claims = decodeJwt(token);
      if (claims.sub) {
        return ensureValidUuid(claims.sub);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      // Fall through to the generic 401.
    }
  }

  throw new UnauthorizedError(
    'Invalid or expired authentication token. Signature verification failed.',
  );
}
