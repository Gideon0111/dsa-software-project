export const ErrorCode = Object.freeze({
  VALIDATION: "VALIDATION", // input is malformed or out of range
  NOT_FOUND: "NOT_FOUND", // the thing you referred to does not exist
  SOLD_OUT: "SOLD_OUT", // not enough seats left
  CONFLICT: "CONFLICT", // the action clashes with current state (e.g. a duplicate tier name)
  INVALID_STATE: "INVALID_STATE",
  INVALID_TRANSITION: "INVALID_TRANSITION", // a booking was asked to make a move the state machine does not allow
  PAYMENT_DECLINED: "PAYMENT_DECLINED", // the mock payment card was declined
  UNAUTHENTICATED: "UNAUTHENTICATED", // missing, invalid, expired, or malformed token
  FORBIDDEN: "FORBIDDEN", // authenticated but not allowed to perform this action
  EMAIL_TAKEN: "EMAIL_TAKEN", // email address is already registered
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS", // email or password is incorrect
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