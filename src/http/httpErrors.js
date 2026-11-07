import { DomainError, ErrorCode } from "../domain/errors.js";

/* EVERY error the HTTP layer can produce lives in this file: its code, its status number */

// ── 1. Problems that belong to HTTP itself ───────────────────────────────────
export const HttpCode = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST", // the request line could not be read
  BAD_JSON: "BAD_JSON", // the body is not valid JSON
  NOT_FOUND: "NOT_FOUND", // no such API route, or no such file
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED", // the path exists, but not for this method
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE", // the body is bigger than the limit
  INTERNAL: "INTERNAL", // anything unexpected
});

export const HTTP_STATUS = Object.freeze({
  [HttpCode.BAD_REQUEST]: 400,
  [HttpCode.BAD_JSON]: 400,
  [HttpCode.NOT_FOUND]: 404,
  [HttpCode.METHOD_NOT_ALLOWED]: 405,
  [HttpCode.PAYLOAD_TOO_LARGE]: 413,
  [HttpCode.INTERNAL]: 500,
});

// ── 2. HttpError, and one function per error ─────────────────────────────────
export class HttpError extends Error {
  constructor(code, message, headers = {}) {
    if (!Object.hasOwn(HTTP_STATUS, code)) throw new TypeError(`Unknown HttpError code: ${code}`);
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.headers = headers;
  }
}

export const badRequestUrl = () => new HttpError(HttpCode.BAD_REQUEST, "Bad request URL");
export const badJson = () => new HttpError(HttpCode.BAD_JSON, "Request body is not valid JSON");
export const notFound = (message = "Not found") => new HttpError(HttpCode.NOT_FOUND, message);
export const methodNotAllowed = (allowed) =>
  new HttpError(HttpCode.METHOD_NOT_ALLOWED, "Method not allowed", { Allow: allowed.join(", ") });

export const payloadTooLarge = () =>
  new HttpError(HttpCode.PAYLOAD_TOO_LARGE, "Request body is too large", { Connection: "close" });
export const internalError = () => new HttpError(HttpCode.INTERNAL, "Something went wrong on our side");

// ── 3. Business (domain) errors: code -> status ──────────────────────────────
/**
 * A test checks that EVERY code in ErrorCode appears here, so adding a new domain
 * code without choosing its status fails the tests instead of becoming a 500.
 */
export const DOMAIN_STATUS = Object.freeze({
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.SOLD_OUT]: 409,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INVALID_STATE]: 409,
  [ErrorCode.INVALID_TRANSITION]: 409,
});

// ── 4. Any thrown value -> the one response shape ────────────────────────────
const errorBody = (code, message) => ({ error: { code, message } });
const fromHttpError = (e) => ({ status: e.status, headers: e.headers, body: errorBody(e.code, e.message) });

export function toErrorResponse(error, logger = console) {
  if (error instanceof HttpError) return fromHttpError(error);

  if (error instanceof DomainError) {
    if (Object.hasOwn(DOMAIN_STATUS, error.code)) {
      return { status: DOMAIN_STATUS[error.code], headers: {}, body: errorBody(error.code, error.message) };
    }
    logger.error(`No HTTP status is mapped for domain error code ${error.code}`);
  } else {
    logger.error("Unhandled error while handling a request:", error);
  }
  return fromHttpError(internalError());
}
