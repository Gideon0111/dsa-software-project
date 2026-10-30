import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createStore, createEvent, addTier, bookTickets, publishEvent, unpublishEvent,
  listEventSummaries, getEvent, getTier, EventStatus, BookingStatus,
} from "../src/domain/inventory.js";
import { ErrorCode, DomainError } from "../src/domain/errors.js";
import { errorOf, newEvent, newEventWithTier } from "./helpers.js";

describe("S02: create an event", () => {
  test("saves a draft with a new id, and it is not on the public list", () => {
    const store = createStore();
    const event = newEvent(store);
    assert.ok(event.id);
    assert.equal(event.status, EventStatus.DRAFT);
    assert.deepEqual(listEventSummaries(store), []);
  });

  test("two events get two different ids", () => {
    const store = createStore();
    assert.notEqual(newEvent(store).id, newEvent(store).id);
  });

  test("a missing title or city is rejected with VALIDATION and nothing is saved", () => {
    const store = createStore();
    assert.equal(errorOf(() => newEvent(store, { title: "" })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => newEvent(store, { city: undefined })).code, ErrorCode.VALIDATION);
    assert.equal(store.events.size, 0);
  });

  test("a date that is not a real date is rejected with VALIDATION", () => {
    const store = createStore();
    for (const bad of ["not a date", "2026-02-30", "", undefined, 12345]) {
      assert.equal(errorOf(() => newEvent(store, { startsAt: bad })).code, ErrorCode.VALIDATION, String(bad));
    }
    assert.equal(store.events.size, 0);
  });
});

describe("S03: add ticket tiers", () => {
  test("saves the tier with 0 sold and 100 seats left", () => {
    const store = createStore();
    const { tier } = newEventWithTier(store);
    assert.equal(tier.priceCents, 500000);
    assert.equal(tier.sold, 0);
    assert.equal(tier.available, 100);
  });

  test("a price that is not a whole number, or capacity below 1, is rejected with VALIDATION", () => {
    const store = createStore();
    const event = newEvent(store);
    const add = (extra) => () => addTier(store, event.id, { name: "X", priceCents: 1000, capacity: 5, ...extra });
    assert.equal(errorOf(add({ priceCents: 99.5 })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(add({ capacity: 0 })).code, ErrorCode.VALIDATION);
    assert.equal(getEvent(store, event.id).tierIds.length, 0);
  });

  test("an event id that does not exist is rejected with NOT_FOUND", () => {
    const store = createStore();
    const err = errorOf(() => addTier(store, "missing", { name: "General", priceCents: 1000, capacity: 5 }));
    assert.equal(err.code, ErrorCode.NOT_FOUND);
  });
});

describe("S04: publish and unpublish", () => {
  test("publishing a draft with a tier makes it PUBLISHED and puts it on the public list", () => {
    const store = createStore();
    const { event } = newEventWithTier(store);
    assert.equal(publishEvent(store, event.id).status, EventStatus.PUBLISHED);
    assert.deepEqual(listEventSummaries(store).map((e) => e.id), [event.id]);
  });

  test("unpublishing a published event makes it a DRAFT and removes it from the public list", () => {
    const store = createStore();
    const { event } = newEventWithTier(store);
    publishEvent(store, event.id);
    assert.equal(unpublishEvent(store, event.id).status, EventStatus.DRAFT);
    assert.deepEqual(listEventSummaries(store), []);
  });

  test("publishing a draft with no tiers is rejected with INVALID_STATE and stays a draft", () => {
    const store = createStore();
    const event = newEvent(store);
    assert.equal(errorOf(() => publishEvent(store, event.id)).code, ErrorCode.INVALID_STATE);
    assert.equal(getEvent(store, event.id).status, EventStatus.DRAFT);
  });

  test("publishing twice, or unpublishing a draft, is INVALID_STATE", () => {
    const store = createStore();
    const { event } = newEventWithTier(store);
    assert.equal(errorOf(() => unpublishEvent(store, event.id)).code, ErrorCode.INVALID_STATE);
    publishEvent(store, event.id);
    assert.equal(errorOf(() => publishEvent(store, event.id)).code, ErrorCode.INVALID_STATE);
  });

  test("an unknown event id is NOT_FOUND", () => {
    const store = createStore();
    assert.equal(errorOf(() => publishEvent(store, "missing")).code, ErrorCode.NOT_FOUND);
  });

  test("listEventSummaries({ publishedOnly: false }) also shows drafts, with price and seats", () => {
    const store = createStore();
    const { event } = newEventWithTier(store);
    addTier(store, event.id, { name: "VIP", priceCents: 900000, capacity: 20 });
    const [summary] = listEventSummaries(store, { publishedOnly: false });
    assert.equal(summary.minPriceCents, 500000);
    assert.equal(summary.seatsAvailable, 120);
    assert.equal(summary.tierCount, 2);
  });
});

describe("S06: book tickets", () => {
  const setup = () => {
    const store = createStore();
    const { event, tier } = newEventWithTier(store, {}, { capacity: 3, priceCents: 250000 });
    publishEvent(store, event.id);
    return { store, tier };
  };

  test("booking 2 of 3 seats creates a PENDING booking priced in whole minor units, 1 seat left", () => {
    const { store, tier } = setup();
    const booking = bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
    assert.equal(booking.status, BookingStatus.PENDING);
    assert.equal(booking.quantity, 2);
    assert.equal(booking.totalCents, 500000);
    assert.ok(Number.isInteger(booking.totalCents));
    assert.equal(getTier(store, tier.id).available, 1);
  });

  test("asking for more than what is left is SOLD_OUT and nothing changes", () => {
    const { store, tier } = setup();
    bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
    const err = errorOf(() => bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Bo" }));
    assert.equal(err.code, ErrorCode.SOLD_OUT);
    assert.equal(getTier(store, tier.id).available, 1);
    assert.equal(store.bookings.size, 1);
  });

  test("quantity 0, negative, fractional or above 10 is VALIDATION", () => {
    const { store, tier } = setup();
    for (const quantity of [0, -1, 1.5, 11]) {
      const err = errorOf(() => bookTickets(store, { tierId: tier.id, quantity, customerName: "Ada" }));
      assert.equal(err.code, ErrorCode.VALIDATION, `quantity ${quantity}`);
    }
    assert.equal(getTier(store, tier.id).available, 3);
  });
});

describe("DomainError", () => {
  test("knows all five error codes and rejects unknown ones", () => {
    for (const code of ["VALIDATION", "NOT_FOUND", "SOLD_OUT", "CONFLICT", "INVALID_STATE"]) {
      assert.equal(new DomainError(code, "x").code, code);
    }
    assert.throws(() => new DomainError("NOPE", "x"), TypeError);
  });
});