/**
 * Supabase Auth fallback used when a token cannot be verified locally.
 *
 * Python calls `client.auth.get_user(token)` through the service-role client,
 * which performs `GET {SUPABASE_URL}/auth/v1/user` with the service-role key as
 * `apikey` and the caller token as the bearer credential. This resolver does
 * the same over plain `fetch` (no supabase-js dependency), and — like the
 * Python dependency — treats every failure as "not resolved" so the caller can
 * fall through to the dev-only unverified claims path.
 */

/** Resolves a raw bearer token to a Supabase user id, or `undefined`. */
export type SupabaseUserResolver = (token: string) => Promise<string | undefined>;

export interface SupabaseUserResolverOptions {
  readonly supabaseUrl: string | undefined;
  readonly serviceRoleKey: string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function createSupabaseUserResolver(
  options: SupabaseUserResolverOptions,
): SupabaseUserResolver {
  const baseUrl = options.supabaseUrl?.replace(/\/+$/, '');
  const apiKey = options.serviceRoleKey;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (token: string): Promise<string | undefined> => {
    if (!baseUrl || !apiKey) {
      return undefined;
    }

    try {
      const response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return undefined;
      }

      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
        return undefined;
      }

      const id = (payload as { id: unknown }).id;
      return typeof id === 'string' ? id : undefined;
    } catch {
      // Network errors, timeouts and malformed bodies all fall through.
      return undefined;
    }
  };
}
