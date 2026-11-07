import { DomainError, ErrorCode } from "./errors.js";

export const BookingState = Object.freeze({
  PENDING: "pending", // seats held, not paid yet
  PAID: "paid", // payment taken, booking confirmed
  CANCELLED: "cancelled", // ended without a refund (also: unpaid booking expired)
  REFUNDED: "refunded", // ended with money returned
  CHECKED_IN: "checked_in", // attendee scanned in at the door
});

const TRANSITIONS = Object.freeze({
  [BookingState.PENDING]: Object.freeze([BookingState.PAID, BookingState.CANCELLED]),
  [BookingState.PAID]: Object.freeze([BookingState.CHECKED_IN, BookingState.REFUNDED, BookingState.CANCELLED]),
  [BookingState.CANCELLED]: Object.freeze([]),
  [BookingState.REFUNDED]: Object.freeze([]),
  [BookingState.CHECKED_IN]: Object.freeze([]),
});

export function isBookingState(value) {
  return typeof value === "string" && Object.hasOwn(TRANSITIONS, value);
}

export function nextStates(from) {
  if (!isBookingState(from)) {
    throw new DomainError(ErrorCode.VALIDATION, `from: unknown booking state "${from}"`, { field: "from" });
  }
  return [...TRANSITIONS[from]];
}

/** True when the booking has no way out (cancelled, refunded, checked_in). */
export function isFinalState(state) {
  return nextStates(state).length === 0;
}

export function canTransition(from, to) {
  return isBookingState(from) && isBookingState(to) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!isBookingState(from)) {
    throw new DomainError(ErrorCode.VALIDATION, `from: unknown booking state "${from}"`, { field: "from" });
  }
  if (!isBookingState(to)) {
    throw new DomainError(ErrorCode.VALIDATION, `to: unknown booking state "${to}"`, { field: "to" });
  }
  if (!canTransition(from, to)) {
    // Staying put (e.g. paying twice, cancelling twice) gets its own plain wording.
    const message = from === to ? `The booking is already ${from}` : `A ${from} booking cannot become ${to}`;
    throw new DomainError(ErrorCode.INVALID_TRANSITION, message, { from, to, allowed: [...TRANSITIONS[from]] });
  }
}