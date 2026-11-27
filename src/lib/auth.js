import { DomainError, ErrorCode } from "../domain/errors.js";
import { requireUser } from "../http/guards.js";

//Authenticate the request using a bearer token.
//Replaces the Build 4 x-user-id stand-in. 
//Throws UNAUTHENTICATED (401) when no valid token is present.
export function authenticate(req) {
  return requireUser(req);
}

/**
 * Ownership check used by booking operations.
 
 *  - If the resource has no owner (userId is NULL/undefined), access is
 *    denied with FORBIDDEN (403) — legacy/unowned bookings cannot be
      accessed by anyone.
 *  - If the resource belongs to a different user, access is denied with
 *    NOT_FOUND (404) — we do not reveal that another user's booking exists.
 *  - If the resource belongs to the requesting user, access is allowed.
 
 * Throws FORBIDDEN for unowned resources, NOT_FOUND for ownership mismatch.
 */
export function assertOwnership(resource, userId) {
  const resourceUserId = resource.userId;

  // Unowned resource (NULL user_id): deny access, safest default.
  if (resourceUserId === null || resourceUserId === undefined) {
    throw new DomainError(
      ErrorCode.FORBIDDEN,
      "This booking has no owner and cannot be accessed",
      { resourceId: resource.id || resource.reference },
    );
  }

  // Ownership mismatch: do not reveal that the resource exists.
  if (String(resourceUserId) !== String(userId)) {
    throw new DomainError(
      ErrorCode.NOT_FOUND,
      "You can only act on your own bookings",
      { resourceId: resource.id || resource.reference, userId },
    );
  }
}