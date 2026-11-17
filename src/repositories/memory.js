import { DomainError, ErrorCode } from "../domain/errors.js";
import { EventStatus } from "../domain/inventory.js";
import { BookingState } from "../domain/bookingStateMachine.js";
import { newId, normalizeReference } from "../domain/ids.js";

function notFound(kind, id) {
  throw new DomainError(ErrorCode.NOT_FOUND, `${kind} not found: ${id}`, { [kind]: id });
}

export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();

  async function createEvent({ title, city, venue, startsAt }) {
    const id = newId();
    const event = {
      id,
      title,
      city,
      venue,
      startsAt,
      status: EventStatus.DRAFT,
      tierIds: [],
    };
    events.set(id, event);
    return { ...event };
  }

  async function getEvent(id) {
    const event = events.get(id);
    if (!event) notFound("Event", id);
    return { ...event };
  }

  async function updateEvent(id, updates) {
    const event = events.get(id);
    if (!event) notFound("Event", id);
    Object.assign(event, updates);
    return { ...event };
  }

  async function listEvents({ publishedOnly = true } = {}) {
    const summaries = [];
    for (const event of events.values()) {
      if (publishedOnly && event.status !== EventStatus.PUBLISHED) continue;
      let minPriceCents = null;
      let seatsAvailable = 0;
      for (const tierId of event.tierIds) {
        const tier = tiers.get(tierId);
        if (tier) {
          if (minPriceCents === null || tier.priceCents < minPriceCents) {
            minPriceCents = tier.priceCents;
          }
          seatsAvailable += tier.capacity - tier.sold;
        }
      }
      summaries.push({
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
    return summaries;
  }

  async function createTier(eventId, { name, priceCents, capacity }) {
    const event = events.get(eventId);
    if (!event) notFound("Event", eventId);
    const id = newId();
    const tier = {
      id,
      eventId,
      name,
      priceCents,
      capacity,
      sold: 0,
      waitlist: { entries: [] },
    };
    tiers.set(id, tier);
    event.tierIds.push(id);
    return { ...tier };
  }

  async function getTier(id) {
    const tier = tiers.get(id);
    if (!tier) notFound("Ticket tier", id);
    return { ...tier };
  }

  async function listTiers(eventId) {
    const event = events.get(eventId);
    if (!event) notFound("Event", eventId);
    return event.tierIds
      .map((id) => tiers.get(id))
      .filter(Boolean)
      .map((tier) => ({ ...tier }));
  }

  async function updateTier(id, updates) {
    const tier = tiers.get(id);
    if (!tier) notFound("Ticket tier", id);
    Object.assign(tier, updates);
    return { ...tier };
  }

  async function createBooking({ reference, eventId, tierId, customerName, quantity, totalCents, userId }) {
    const tier = tiers.get(tierId);
    if (!tier) notFound("Ticket tier", tierId);

    const normalizedRef = normalizeReference(reference);
    if (bookings.has(normalizedRef)) {
      throw new DomainError(ErrorCode.CONFLICT, `Booking reference already exists: ${normalizedRef}`, { reference: normalizedRef });
    }

    const booking = {
      id: newId(),
      reference: normalizedRef,
      eventId,
      tierId,
      customerName,
      quantity,
      totalCents,
      status: BookingState.PENDING,
      userId,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    };
    bookings.set(normalizedRef, booking);

    tier.sold += quantity;

    return { ...booking };
  }

  async function getBooking(reference) {
    const booking = bookings.get(reference);
    if (!booking) notFound("Booking", reference);
    return { ...booking };
  }

  async function updateBooking(reference, updates) {
    const booking = bookings.get(reference);
    if (!booking) notFound("Booking", reference);
    Object.assign(booking, updates);
    return { ...booking };
  }

  async function peekWaitlist(tierId) {
    const tier = tiers.get(tierId);
    if (!tier || !tier.waitlist || tier.waitlist.entries.length === 0) return undefined;
    return tier.waitlist.entries[0];
  }

  return Object.freeze({
    createEvent,
    getEvent,
    updateEvent,
    listEvents,
    createTier,
    getTier,
    listTiers,
    updateTier,
    createBooking,
    getBooking,
    updateBooking,
    peekWaitlist,
  });
}