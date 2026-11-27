import { UnauthorizedError } from '../types/errors.js';

/**
 * UUID handling for authenticated identities.
 *
 * Mirrors `_ensure_valid_uuid` in `app/core/auth.py`, which normalizes input
 * through Python's `uuid.UUID` and rejects anything that is not a UUID to
 * prevent invisible tenant partitions.
 */

const HEX32 = /^[0-9a-f]{32}$/;

/** Message used by the Python auth layer for non-UUID subjects. */
export const INVALID_UUID_DETAIL =
  'Invalid user identification: token subject must be a valid UUID.';

/**
 * Normalize a UUID-like value into Postgres-compatible canonical form, or
 * return `undefined` when the value cannot be parsed.
 *
 * Python's `uuid.UUID` accepts 32 hex characters, hyphenated UUIDs, a
 * `urn:uuid:` prefix and surrounding braces, then emits lowercase canonical
 * form. This follows the same normalization.
 */
export function canonicalizeUuid(value: unknown): string | undefined {
  const hex = String(value)
    .toLowerCase()
    .replaceAll('urn:', '')
    .replaceAll('uuid:', '')
    .replace(/^\{+/, '')
    .replace(/\}+$/, '')
    .replaceAll('-', '');

  if (!HEX32.test(hex)) {
    return undefined;
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Return the canonical UUID or throw the same 401 the Python dependency raises.
 */
export function ensureValidUuid(value: unknown): string {
  const canonical = canonicalizeUuid(value);
  if (!canonical) {
    throw new UnauthorizedError(INVALID_UUID_DETAIL);
  }
  return canonical;
}
