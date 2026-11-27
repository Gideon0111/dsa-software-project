import { DomainError, ErrorCode } from "../domain/errors.js";
import { verifyToken } from "../lib/token.js";

/**
 * Extract and verify a bearer token from the Authorization header.
 
 * @param {object} req - the HTTP request object
 * @returns {object} req.user { id, role }
 * @throws {DomainError} UNAUTHENTICATED when no valid token is present
 */
export function requireUser(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    throw new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Authorization header is required",
    );
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Authorization header must use the Bearer scheme",
    );
  }

  const token = parts[1];
  if (!token || token.length === 0) {
    throw new DomainError(
      ErrorCode.UNAUTHENTICATED,
      "Token is required",
    );
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch (error) {
    // Any token verification failure (expired, malformed, bad signature,
    // wrong algorithm, missing secret) maps to UNAUTHENTICATED.
    throw new DomainError(
      ErrorCode.UNAUTHENTICATED,
      error.message || "Invalid or expired token",
    );
  }

  req.user = { id: claims.userId, role: claims.role };
  return req.user;
}

/**
 * Restrict access to the given roles. Must be called after requireUser.
 *
 * @param {...string} roles - permitted roles (e.g. "organizer", "attendee")
 * @returns {object} req.user
 * @throws {DomainError} FORBIDDEN when the user's role is not permitted
 */
export function requireRole(...roles) {
  return (req) => {
    if (!req.user || !req.user.role) {
      throw new DomainError(
        ErrorCode.UNAUTHENTICATED,
        "User not authenticated",
      );
    }
    if (!roles.includes(req.user.role)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `This action requires one of the following roles: ${roles.join(", ")}`,
      );
    }
    return req.user;
  };
}