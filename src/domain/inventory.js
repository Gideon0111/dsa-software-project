import { DomainError, ErrorCode } from "./errors.js";
import { newId, newReference, normalizeReference } from "./ids.js";
import { Queue } from "./waitlistQueue.js";

export const MIN_TICKETS_PER_BOOKING = 1;
export const MAX_TICKETS_PER_BOOKING = 10;
const MAX_REFERENCE_ATTEMPTS = 10;

export const BookingStatus = Object.freeze({
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
});

function invalid(field, message) {
  return new DomainError(ErrorCode.VALIDATION, `${field}: ${message}`, { field });
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(field, "must be a non-empty string");
  }
  return value.trim();
}

function requireInteger(value, field, { min, max = Number.MAX_SAFE_INTEGER }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalid(field, `must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function requireIsoDate(value, field) {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw invalid(field, "must be an ISO date string or a Date");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalid(field, "is not a valid date");
  return date.toISOString();
}

function requireStore(store) {
  const ok =
    store && store.events instanceof Map && store.tiers instanceof Map && store.bookings instanceof Map;
  if (!ok) throw invalid("store", "must come from createStore()");
}

const eventView = (e) => ({ id: e.id, name: e.name, startsAt: e.startsAt, location: e.location, tierIds: [...e.tierIds] });

const tierView = (t) => ({
  id: t.id,
  eventId: t.eventId,
  name: t.name,
  priceCents: t.priceCents,
  capacity: t.capacity,
  sold: t.sold,
  available: t.capacity - t.sold,
  waitlistSize: t.waitlist.size,
});

const bookingView = (b) => ({ ...b });

/** One Map per kind of record: every lookup by id or reference is O(1). */
export function createStore() {
  return {
    events: new Map(), // eventId -> event record
    tiers: new Map(), // tierId -> tier record (holds its own waitlist)
    bookings: new Map(), // reference -> booking record
  };
}

function requireEvent(store, eventId) {
  const id = requireText(eventId, "eventId");
  const event = store.events.get(id);
  if (!event) throw new DomainError(ErrorCode.NOT_FOUND, `Event not found: ${id}`, { eventId: id });
  return event;
}

function requireTier(store, tierId) {
  const id = requireText(tierId, "tierId");
  const tier = store.tiers.get(id);
  if (!tier) throw new DomainError(ErrorCode.NOT_FOUND, `Ticket tier not found: ${id}`, { tierId: id });
  return tier;
}

function requireBookingRecord(store, reference) {
  const ref = normalizeReference(requireText(reference, "reference"));
  const booking = store.bookings.get(ref);
  if (!booking) throw new DomainError(ErrorCode.NOT_FOUND, `Booking not found: ${ref}`, { reference: ref });
  return booking;
}

export function getEvent(store, eventId) {
  requireStore(store);
  return eventView(requireEvent(store, eventId));
}

export function getTier(store, tierId) {
  requireStore(store);
  return tierView(requireTier(store, tierId));
}

export function createEvent(store, { name, startsAt, location } = {}) {
  requireStore(store);
  const event = {
    id: newId(),
    name: requireText(name, "name"),
    startsAt: requireIsoDate(startsAt, "startsAt"),
    location: requireText(location, "location"),
    tierIds: [],
  };
  store.events.set(event.id, event);
  return eventView(event);
}

export function addTier(store, eventId, { name, priceCents, capacity } = {}) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  const tierName = requireText(name, "name");
  const price = requireInteger(priceCents, "priceCents", { min: 0 });
  const seats = requireInteger(capacity, "capacity", { min: 1 });

  const clash = event.tierIds.some((id) => store.tiers.get(id).name.toLowerCase() === tierName.toLowerCase());
  if (clash) {
    throw new DomainError(ErrorCode.CONFLICT, `This event already has a tier named "${tierName}"`, { eventId: event.id });
  }

  const tier = {
    id: newId(),
    eventId: event.id,
    name: tierName,
    priceCents: price,
    capacity: seats,
    sold: 0,
    waitlist: new Queue(),
  };
  store.tiers.set(tier.id, tier);
  event.tierIds.push(tier.id);
  return tierView(tier);
}

function uniqueReference(store) {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    const reference = newReference();
    if (!store.bookings.has(reference)) return reference;
  }
  throw new Error("Could not generate a unique booking reference");
}

export function bookTickets(store, { tierId, quantity, customerName } = {}) {
  // 1. VALIDATE everything first. Nothing has changed yet.
  requireStore(store);
  const buyer = requireText(customerName, "customerName");
  const count = requireInteger(quantity, "quantity", { min: MIN_TICKETS_PER_BOOKING, max: MAX_TICKETS_PER_BOOKING });
  const tier = requireTier(store, tierId);

  const available = tier.capacity - tier.sold;
  if (count > available) {
    throw new DomainError(
      ErrorCode.SOLD_OUT,
      `Only ${available} ticket(s) left in "${tier.name}", you asked for ${count}`,
      { tierId: tier.id, requested: count, available },
    );
  }

  const totalCents = tier.priceCents * count;
  if (!Number.isSafeInteger(totalCents)) throw invalid("quantity", "total price is too large");
  const reference = uniqueReference(store);

  // 2. MUTATE. Nothing below can throw, so we never stop half-way.
  const booking = {
    id: newId(),
    reference,
    eventId: tier.eventId,
    tierId: tier.id,
    customerName: buyer,
    quantity: count,
    totalCents,
    status: BookingStatus.CONFIRMED,
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
  tier.sold += count;
  store.bookings.set(reference, booking);
  return bookingView(booking);
}

export function cancelBooking(store, reference) {
  requireStore(store);
  const booking = requireBookingRecord(store, reference);
  if (booking.status === BookingStatus.CANCELLED) {
    throw new DomainError(ErrorCode.CONFLICT, `Booking ${booking.reference} is already cancelled`, {
      reference: booking.reference,
    });
  }

  const tier = store.tiers.get(booking.tierId);
  booking.status = BookingStatus.CANCELLED;
  booking.cancelledAt = new Date().toISOString();
  tier.sold -= booking.quantity;

  const next = tier.waitlist.peek();
  return {
    booking: bookingView(booking),
    seatsAvailable: tier.capacity - tier.sold,
    nextInLine: next ? { ...next } : null,
  };
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  const ref = normalizeReference(requireText(reference, "reference"));
  const booking = store.bookings.get(ref);
  return booking ? bookingView(booking) : null;
}

/** Join the back of the line for a tier that cannot currently seat you. */
export function joinWaitlist(store, { tierId, name, quantity } = {}) {
  requireStore(store);
  const person = requireText(name, "name");
  const count = requireInteger(quantity, "quantity", { min: MIN_TICKETS_PER_BOOKING, max: MAX_TICKETS_PER_BOOKING });
  const tier = requireTier(store, tierId);

  const available = tier.capacity - tier.sold;
  if (count <= available) {
    throw new DomainError(
      ErrorCode.CONFLICT,
      `${available} ticket(s) are still available in "${tier.name}", so book them directly`,
      { tierId: tier.id, requested: count, available },
    );
  }

  const entry = { id: newId(), name: person, quantity: count, joinedAt: new Date().toISOString() };
  tier.waitlist.enqueue(entry);
  return { ...entry, tierId: tier.id, position: tier.waitlist.size };
}