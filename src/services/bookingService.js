import { DomainError, ErrorCode } from "../domain/errors.js";
import { BookingState, assertTransition } from "../domain/bookingStateMachine.js";
import { assertOwnership } from "../lib/auth.js";
import { EventStatus } from "../domain/inventory.js";
import { newReference, normalizeReference } from "../domain/ids.js";
import { requireText, requireInteger } from "../domain/validation.js";

export function createBookingService(repository, paymentGateway) {
  const MIN_TICKETS = 1;
  const MAX_TICKETS = 10;
  const MAX_REFERENCE_ATTEMPTS = 10;

  // In-flight payments keyed by booking reference. Guarantees that two
  // simultaneous pay requests for the same booking charge the card at most
  // once (payment idempotency).
  const paymentChains = new Map();

  async function bookTickets({ tierId, quantity, customerName, userId }) {
    const buyer = requireText(customerName, "customerName");
    const count = requireInteger(quantity, "quantity", { min: MIN_TICKETS, max: MAX_TICKETS });

    const tier = await repository.getTier(tierId);

    //Checks if the event is already published, if not throws an error. This is to prevent booking tickets for events that are not yet published.
    const event = await repository.getEvent(tier.eventId);
if (event.status !== EventStatus.PUBLISHED) {
  throw new DomainError(
    ErrorCode.INVALID_STATE,
    "Tickets can only be booked for a published event",
    { eventId: event.id },
  );
}
    
    const available = tier.capacity - tier.sold;
    if (count > available) {
      throw new DomainError(
        ErrorCode.SOLD_OUT,
        `Only ${available} ticket(s) left in "${tier.name}", you asked for ${count}`,
        { tierId, requested: count, available },
      );
    }

    const totalCents = tier.priceCents * count;
    if (!Number.isSafeInteger(totalCents)) {
      throw new DomainError(ErrorCode.VALIDATION, "quantity: total price is too large", { field: "quantity" });
    }

    let reference;
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const candidate = normalizeReference(newReference());
      try {
        await repository.getBooking(candidate);
      } catch {
        reference = candidate;
        break;
      }
    }
    if (!reference) {
      throw new DomainError(ErrorCode.CONFLICT, "Could not generate a unique booking reference");
    }

    return repository.createBooking({
      reference,
      eventId: tier.eventId,
      tierId,
      customerName: buyer,
      quantity: count,
      totalCents,
      userId,
    });
  }

  async function payBooking(reference, userId, { shouldDecline = false } = {}) {
    const ref = normalizeReference(reference);

    // If a payment for this reference is already in flight, wait for it to
    // finish, then re-check. If it succeeded the booking is now PAID and we
    // must not charge again (idempotency).
    const previous = paymentChains.get(ref);
    if (previous) {
      await previous;
      const current = await repository.getBooking(ref);
      if (current.status === BookingState.PAID) {
        throw new DomainError(
          ErrorCode.INVALID_TRANSITION,
          "The booking is already paid",
          { reference: ref },
        );
      }}

    const booking = await repository.getBooking(ref);
    assertOwnership(booking, userId);

    if (booking.status === BookingState.PAID) {
      throw new DomainError(
        ErrorCode.INVALID_TRANSITION,
        "The booking is already paid",
        { reference: ref },
      );
    }
    assertTransition(booking.status, BookingState.PAID);

    let resolveChain;
    const chain = new Promise((resolve) => (resolveChain = resolve));
    paymentChains.set(ref, chain);

    try {
      const result = await paymentGateway.charge(booking.totalCents, { shouldDecline });
      if (!result.ok) {

        throw new DomainError(
          ErrorCode.PAYMENT_DECLINED,
          "Your mock card was declined. The booking stays pending and you can try again.",
          { reference: ref, declineCode: result.declineCode },
        );
      }

      return repository.updateBooking(ref, { status: BookingState.PAID });
    } finally {
      resolveChain();
      if (paymentChains.get(ref) === chain) {
        paymentChains.delete(ref);
      }
    }
  }

  async function cancelBooking(reference, userId) {
    const ref = normalizeReference(reference);
    const booking = await repository.getBooking(ref);

    assertOwnership(booking, userId);

    if (booking.status !== BookingState.PENDING) {
      throw new DomainError(
        ErrorCode.INVALID_TRANSITION,
        `A ${booking.status} booking cannot be cancelled. Only pending bookings can be cancelled.`,
        { reference: ref, from: booking.status, allowed: [BookingState.PENDING] },
      );
    }

    const tier = await repository.getTier(booking.tierId);
    tier.sold -= booking.quantity;
    await repository.updateTier(booking.tierId, { sold: tier.sold });

    const updated = await repository.updateBooking(ref, {
      status: BookingState.CANCELLED,
      cancelledAt: new Date().toISOString(),
    });

    const nextInLine = await repository.peekWaitlist(booking.tierId);

    return {
      booking: updated,
      seatsAvailable: tier.capacity - tier.sold,
      nextInLine: nextInLine ? { ...nextInLine } : null,
    };
  }

  return Object.freeze({
    bookTickets,
    payBooking,
    cancelBooking,
  });
}
