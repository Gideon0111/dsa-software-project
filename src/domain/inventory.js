import { DomainError, ErrorCode } from "./errors.js";
import { newId, newReference, normalizeReference } from "./ids.js";
import { parseRealDate } from "./dates.js";
import { Queue } from "./waitlistQueue.js";

export const MIN_TICKETS_PER_BOOKING = 1;
export const MAX_TICKETS_PER_BOOKING = 10;
const MAX_REFERENCE_ATTEMPTS = 10;

export const EventStatus = Object.freeze({
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
});

export const BookingStatus = Object.freeze({
  PENDING: "PENDING", // seats held, not paid yet
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
  return new Date(parseRealDate(value, field)).toISOString();
}

function requireStore(store) {
  const ok =
    store && store.events instanceof Map && store.tiers instanceof Map && store.bookings instanceof Map;
  if (!ok) throw invalid("store", "must come from createStore()");
}

const eventView = (e) => ({
  id: e.id,
  title: e.title,
  city: e.city,
  venue: e.venue,
  startsAt: e.startsAt,
  status: e.status,
  tierIds: [...e.tierIds],
});

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

export function createStore() {
  return {
    events: new Map(),  
    tiers: new Map(), 
    bookings: new Map(), 
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

/** New events always start as DRAFT, so they are not on the public list. */
export function createEvent(store, { title, city, venue, startsAt } = {}) {
  requireStore(store);
  const event = {
    id: newId(),
    title: requireText(title, "title"),
    city: requireText(city, "city"),
    venue: requireText(venue, "venue"),
    startsAt: requireIsoDate(startsAt, "startsAt"),
    status: EventStatus.DRAFT,
    tierIds: [],
  };
  store.events.set(event.id, event);
  return eventView(event);
}

/** DRAFT -> PUBLISHED. An event needs at least one ticket tier first. */
export function publishEvent(store, eventId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  if (event.status === EventStatus.PUBLISHED) {
    throw new DomainError(ErrorCode.INVALID_STATE, "Event is already published", { eventId: event.id });
  }
  if (event.tierIds.length === 0) {
    throw new DomainError(ErrorCode.INVALID_STATE, "Add at least one ticket tier before publishing", {
      eventId: event.id,
    });
  }
  event.status = EventStatus.PUBLISHED;
  return eventView(event);
}

/** PUBLISHED -> DRAFT. The event leaves the public list. */
export function unpublishEvent(store, eventId) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  if (event.status !== EventStatus.PUBLISHED) {
    throw new DomainError(ErrorCode.INVALID_STATE, "Only a published event can be unpublished", {
      eventId: event.id,
    });
  }
  event.status = EventStatus.DRAFT;
  return eventView(event);
}

export function listEventSummaries(store, { publishedOnly = true } = {}) {
  requireStore(store);
  if (typeof publishedOnly !== "boolean") throw invalid("publishedOnly", "must be true or false");
  const rows = [];
  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== EventStatus.PUBLISHED) continue;
    let minPriceCents = null; // null = no tiers, so no price
    let seatsAvailable = 0;
    for (const tierId of event.tierIds) {
      const tier = store.tiers.get(tierId);
      if (minPriceCents === null || tier.priceCents < minPriceCents) minPriceCents = tier.priceCents;
      seatsAvailable += tier.capacity - tier.sold;
    }
    rows.push({
      id: event.id,
      title: event.title,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt,
      status: event.status,
      minPriceCents,
      seatsAvailable,
      tierCount: event.tierIds.length,
    });
  }
  return rows;
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
    status: BookingStatus.PENDING,
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