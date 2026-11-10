import { ForbiddenError } from '../types/errors.js';
import { canonicalizeUuid } from './uuid.js';

/**
 * Reusable tenant-isolation checks.
 *
 * Most route queries keep Python's behavior of filtering by `user_id`, which
 * surfaces another tenant's resource as 404. These helpers are for explicit
 * ownership checks where the resource has already been loaded (for example the
 * GDPR Art. 22 guard in `routes_evaluate.py`, which returns 403).
 */

/** Compare two identities, normalizing UUID formatting when possible. */
function normalizeIdentity(value: string): string {
  return canonicalizeUuid(value) ?? value;
}

/**
 * True when `actorUserId` owns the resource. Missing resource owners are never
 * accessible.
 */
export function canAccessTenantResource(
  actorUserId: string,
  resourceUserId: string | null | undefined,
): boolean {
  if (!resourceUserId) {
    return false;
  }
  return normalizeIdentity(actorUserId) === normalizeIdentity(resourceUserId);
}

/** Throw 403 unless the actor owns the resource. */
export function assertTenantAccess(
  actorUserId: string,
  resourceUserId: string | null | undefined,
  detail = 'Access denied: resource belongs to another tenant.',
): void {
  if (!canAccessTenantResource(actorUserId, resourceUserId)) {
    throw new ForbiddenError(detail);
  }
}
