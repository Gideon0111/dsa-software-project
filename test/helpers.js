import { createStore, createEvent, addTier } from "../src/domain/inventory.js";

export function errorOf(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("Expected the function to throw, but it did not");
}

export function newEvent(store, overrides = {}) {
  return createEvent(store, {
    title: "Lagos Tech Meetup",
    city: "Lagos",
    venue: "Landmark Centre",
    startsAt: "2026-12-05T17:00:00.000Z",
    ...overrides,
  });
}

export function newEventWithTier(store, overrides = {}, tier = {}) {
  const event = newEvent(store, overrides);
  const t = addTier(store, event.id, { name: "General", priceCents: 500000, capacity: 100, ...tier });
  return { event, tier: t };
}

/** A hand-made summary row, for testing search and sort without a store. */
export function row(overrides = {}) {
  return {
    id: "e1",
    title: "Event",
    city: "Lagos",
    venue: "Hall",
    startsAt: "2026-12-05T17:00:00.000Z",
    status: "PUBLISHED",
    minPriceCents: 100000,
    seatsAvailable: 10,
    tierCount: 1,
    ...overrides,
  };
}

export { createStore };