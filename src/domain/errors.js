export const ErrorCode = Object.freeze({
  VALIDATION: "VALIDATION", // input is malformed or out of range
  NOT_FOUND: "NOT_FOUND", // the thing you referred to does not exist
  SOLD_OUT: "SOLD_OUT", // not enough seats left
  CONFLICT: "CONFLICT", // the action clashes with current state (e.g. cancelling twice)
});

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    if (!Object.values(ErrorCode).includes(code)) {
      throw new TypeError(`Unknown DomainError code: ${code}`);
    }
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}