import { DomainError, ErrorCode } from "./errors.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PART = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 24 * 60 * 60 * 1000;

function invalid(field, message) {
  return new DomainError(ErrorCode.VALIDATION, `${field}: ${message}`, { field });
}

export function isDateOnly(value) {
  return typeof value === "string" && DATE_ONLY.test(value);
}

export function parseRealDate(value, field, { endOfDay = false } = {}) {
  let ms;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === "string") {
    ms = Date.parse(value);
    const part = DATE_PART.exec(value);
    if (!part) ms = NaN; // must at least start with YYYY-MM-DD
    else {
      const [, y, m, d] = part.map(Number);
      const check = new Date(Date.UTC(y, m - 1, d));
      // Node rolls 30 Feb over to 2 Mar; a round trip catches that.
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) ms = NaN;
    }
  } else {
    throw invalid(field, "must be an ISO date string or a Date");
  }
  if (Number.isNaN(ms)) throw invalid(field, "is not a valid date");
  return endOfDay && isDateOnly(value) ? ms + DAY_MS - 1 : ms;
}