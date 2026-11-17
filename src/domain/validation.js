import { DomainError, ErrorCode } from "./errors.js";
import { parseRealDate } from "./dates.js";

function invalid(field, message) {
  return new DomainError(ErrorCode.VALIDATION, `${field}: ${message}`, { field });
}

/** Validate a non-empty string and return its trimmed form. */
export function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(field, "must be a non-empty string");
  }
  return value.trim();
}

/** Validate a whole number within [min, max] and return it. */
export function requireInteger(value, field, { min, max = Number.MAX_SAFE_INTEGER }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalid(field, `must be a whole number from ${min} to ${max}`);
  }
  return value;
}

/** Validate an ISO date string and return its canonical ISO form. */
export function requireIsoDate(value, field) {
  return new Date(parseRealDate(value, field)).toISOString();
}