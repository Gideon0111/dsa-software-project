import { DomainError, ErrorCode } from "../domain/errors.js";

export function authenticate(req) {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    throw new DomainError(ErrorCode.VALIDATION, "x-user-id header is required");
  }
  req.user = { id: String(userId) };
  return req.user;
}

/**
 * Ownership check used by booking operations. Throws if the resource does not
 * belong to the given user. Kept in one place so it can be reused by pay and cancel.
 */
export function assertOwnership(resource, userId) {
  if (resource.userId !== String(userId)) {
    throw new DomainError(
      ErrorCode.INVALID_TRANSITION,
      "You can only act on your own bookings",
      { resourceId: resource.id || resource.reference, userId }
    );
  }
}