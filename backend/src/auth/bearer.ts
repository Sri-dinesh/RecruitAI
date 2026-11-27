/**
 * Bearer-token extraction matching FastAPI's `HTTPBearer(auto_error=False)`.
 *
 * A missing, malformed or non-Bearer header yields `undefined`, which the auth
 * service treats exactly like "no credentials" (and therefore allows the dev
 * bypass only when `USE_LOCAL_AUTH` is enabled).
 */
export function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const separator = authorization.indexOf(' ');
  if (separator < 0) {
    return undefined;
  }

  const scheme = authorization.slice(0, separator);
  const credentials = authorization.slice(separator + 1);

  if (!scheme || !credentials) {
    return undefined;
  }

  if (scheme.toLowerCase() !== 'bearer') {
    return undefined;
  }

  return credentials;
}
