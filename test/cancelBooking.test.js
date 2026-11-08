import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createStore, publishEvent, bookTickets, cancelBooking, findBookingByReference,
  joinWaitlist, getTier, BookingStatus,
} from "../src/domain/inventory.js";
import { BookingState } from "../src/domain/bookingStateMachine.js";
import { ErrorCode } from "../src/domain/errors.js";
import { errorOf, newEventWithTier } from "./helpers.js";

// One event, one tier with 3 seats.
const setup = () => {
  const store = createStore();
  const { event, tier } = newEventWithTier(store, {}, { capacity: 3, priceCents: 250000 });
  publishEvent(store, event.id);
  return { store, tier };
};

describe("booking statuses use the state machine's names", () => {
  test("BookingStatus is the state machine's list, in lowercase", () => {
    assert.equal(BookingStatus, BookingState);
    assert.equal(BookingStatus.PENDING, "pending");
    assert.equal(BookingStatus.CANCELLED, "cancelled");
    assert.equal(BookingStatus.CONFIRMED, undefined); // replaced by PAID
  });

  test("a new booking starts as 'pending'", () => {
    const { store, tier } = setup();
    const booking = bookTickets(store, { tierId: tier.id, quantity: 1, customerName: "Ada" });
    assert.equal(booking.status, "pending");
  });
});

describe("cancelling a booking", () => {
  test("a pending booking becomes cancelled, is time-stamped, and its seats come back", () => {
    const { store, tier } = setup();
    const booking = bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
    assert.equal(getTier(store, tier.id).available, 1);

    const result = cancelBooking(store, booking.reference);
    assert.equal(result.booking.status, BookingStatus.CANCELLED);
    assert.ok(result.booking.cancelledAt);
    assert.equal(result.seatsAvailable, 3);
    assert.equal(getTier(store, tier.id).available, 3);
    assert.equal(findBookingByReference(store, booking.reference).status, "cancelled");
  });

  test("cancelling twice is INVALID_TRANSITION and the seats are released only ONCE", () => {
    const { store, tier } = setup();
    const booking = bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
    cancelBooking(store, booking.reference);

    const err = errorOf(() => cancelBooking(store, booking.reference));
    assert.equal(err.code, ErrorCode.INVALID_TRANSITION);
    assert.equal(getTier(store, tier.id).available, 3); 
  });

  test("refunded and checked_in bookings cannot be cancelled, and nothing changes", () => {
    for (const finalState of [BookingState.REFUNDED, BookingState.CHECKED_IN]) {
      const { store, tier } = setup();
      const booking = bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
      store.bookings.get(booking.reference).status = finalState;

      const err = errorOf(() => cancelBooking(store, booking.reference));
      assert.equal(err.code, ErrorCode.INVALID_TRANSITION, finalState);
      assert.equal(findBookingByReference(store, booking.reference).status, finalState);
      assert.equal(getTier(store, tier.id).available, 1, finalState);
    }
  });

  test("an unknown reference is NOT_FOUND; the reference is not case-sensitive", () => {
    const { store, tier } = setup();
    assert.equal(errorOf(() => cancelBooking(store, "ZZZZ-ZZZZ")).code, ErrorCode.NOT_FOUND);
    const booking = bookTickets(store, { tierId: tier.id, quantity: 1, customerName: "Ada" });
    assert.equal(cancelBooking(store, booking.reference.toLowerCase()).booking.status, "cancelled");
  });

  test("cancelling names the next person on the waitlist", () => {
    const { store, tier } = setup();
    const booking = bookTickets(store, { tierId: tier.id, quantity: 3, customerName: "Ada" });
    joinWaitlist(store, { tierId: tier.id, name: "Carol", quantity: 1 });
    const result = cancelBooking(store, booking.reference);
    assert.equal(result.nextInLine.name, "Carol");
    assert.equal(result.seatsAvailable, 3);
  });
});