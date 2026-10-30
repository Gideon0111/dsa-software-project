import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterEvents, sortEvents, searchEvents } from "../src/domain/eventSearch.js";
import { ErrorCode } from "../src/domain/errors.js";
import { errorOf, row } from "./helpers.js";

const titles = (list) => list.map((e) => e.title);

describe("S05: search, filter and sort", () => {
  test("search 'JAZZ' returns only Abuja Jazz Night", () => {
    const list = [row({ id: "1", title: "Lagos Tech Meetup" }), row({ id: "2", title: "Abuja Jazz Night" })];
    assert.deepEqual(titles(filterEvents(list, { q: "JAZZ" })), ["Abuja Jazz Night"]);
  });

  test("search also matches the venue, ignoring case", () => {
    const list = [row({ id: "1", title: "A", venue: "Eko Hotel" }), row({ id: "2", title: "B", venue: "Landmark" })];
    assert.deepEqual(titles(filterEvents(list, { q: "eko" })), ["A"]);
  });

  test("city 'lagos' returns only Lagos events, whatever the capital letters", () => {
    const list = [row({ id: "1", title: "A", city: "Lagos" }), row({ id: "2", title: "B", city: "Abuja" })];
    assert.deepEqual(titles(filterEvents(list, { city: "lagos" })), ["A"]);
    assert.deepEqual(titles(filterEvents(list, { city: "LAGOS" })), ["A"]);
  });

  test("max price + sort by price: cheapest first, within the maximum, no-tier events left out", () => {
    const list = [
      row({ id: "1", title: "Pricey", minPriceCents: 900000 }),
      row({ id: "2", title: "Mid", minPriceCents: 500000 }),
      row({ id: "3", title: "Cheap", minPriceCents: 100000 }),
      row({ id: "4", title: "NoTiers", minPriceCents: null, seatsAvailable: 0, tierCount: 0 }),
    ];
    const result = searchEvents(list, { maxPriceCents: 500000 }, "price");
    assert.deepEqual(titles(result), ["Cheap", "Mid"]);
  });

  test("sort by date: earlier first, same-day events stay in title order", () => {
    const list = [
      row({ id: "1", title: "Zebra Fest", startsAt: "2026-12-05T09:00:00.000Z" }),
      row({ id: "2", title: "Later", startsAt: "2026-12-06T09:00:00.000Z" }),
      row({ id: "3", title: "Alpha Fest", startsAt: "2026-12-05T09:00:00.000Z" }),
      row({ id: "4", title: "Earliest", startsAt: "2026-12-01T09:00:00.000Z" }),
    ];
    assert.deepEqual(titles(sortEvents(list, "date")), ["Earliest", "Alpha Fest", "Zebra Fest", "Later"]);
  });

  test("an event at 5 PM on 5 December is included when filtering up to 2026-12-05", () => {
    const list = [row({ title: "Evening", startsAt: "2026-12-05T17:00:00.000Z" })];
    assert.equal(filterEvents(list, { to: "2026-12-05" }).length, 1);
    assert.equal(filterEvents(list, { to: "2026-12-04" }).length, 0);
  });

  test("'from' is inclusive, and a full timestamp 'to' is NOT stretched to the whole day", () => {
    const list = [row({ startsAt: "2026-12-05T17:00:00.000Z" })];
    assert.equal(filterEvents(list, { from: "2026-12-05" }).length, 1);
    assert.equal(filterEvents(list, { from: "2026-12-06" }).length, 0);
    assert.equal(filterEvents(list, { to: "2026-12-05T10:00:00Z" }).length, 0);
  });

  test("a bad date, a fractional price or an unknown sort option is VALIDATION", () => {
    const list = [row()];
    assert.equal(errorOf(() => filterEvents(list, { from: "tomorrow-ish" })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => filterEvents(list, { to: "2026-02-30" })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => filterEvents(list, { maxPriceCents: 99.5 })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => filterEvents(list, { maxPriceCents: -5 })).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => sortEvents(list, "popularity")).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => searchEvents(list, {}, "popularity")).code, ErrorCode.VALIDATION);
    assert.equal(errorOf(() => filterEvents("not a list", {})).code, ErrorCode.VALIDATION);
  });

  test("the original list is unchanged after filtering, sorting and searching", () => {
    const list = [
      row({ id: "1", title: "B", minPriceCents: 300 }),
      row({ id: "2", title: "A", minPriceCents: 100 }),
      row({ id: "3", title: "C", minPriceCents: 200 }),
    ];
    const snapshot = structuredClone(list);
    const sorted = sortEvents(list, "price");
    const filtered = filterEvents(list, { q: "a" });
    const searched = searchEvents(list, { maxPriceCents: 250 }, "price");
    assert.deepEqual(list, snapshot);
    assert.notEqual(sorted, list);
    assert.notEqual(filtered, list);
    assert.notEqual(searched, list);
  });
});

describe("more sort and filter behaviour", () => {
  test("sort by price puts events with no price last", () => {
    const list = [
      row({ id: "1", title: "NoTiers", minPriceCents: null }),
      row({ id: "2", title: "Cheap", minPriceCents: 100 }),
    ];
    assert.deepEqual(titles(sortEvents(list, "price")), ["Cheap", "NoTiers"]);
  });

  test("sort by availability: most seats first", () => {
    const list = [
      row({ id: "1", title: "Few", seatsAvailable: 2 }),
      row({ id: "2", title: "Many", seatsAvailable: 50 }),
    ];
    assert.deepEqual(titles(sortEvents(list, "availability")), ["Many", "Few"]);
  });

  test("ties are broken by title, then by id", () => {
    const list = [
      row({ id: "b", title: "Same", seatsAvailable: 5 }),
      row({ id: "a", title: "Same", seatsAvailable: 5 }),
      row({ id: "c", title: "Aaa", seatsAvailable: 5 }),
    ];
    assert.deepEqual(sortEvents(list, "availability").map((e) => e.id), ["c", "a", "b"]);
  });

  test("onlyAvailable removes sold-out events", () => {
    const list = [row({ title: "Full", seatsAvailable: 0 }), row({ id: "2", title: "Open", seatsAvailable: 3 })];
    assert.deepEqual(titles(filterEvents(list, { onlyAvailable: true })), ["Open"]);
  });

  test("no criteria returns a copy of everything; an empty list stays empty", () => {
    const list = [row({ id: "1" }), row({ id: "2" })];
    assert.deepEqual(filterEvents(list), list);
    assert.deepEqual(filterEvents(list, {}), list);
    assert.deepEqual(filterEvents([], { q: "x", maxPriceCents: 10 }), []);
    assert.deepEqual(sortEvents([], "date"), []);
    assert.deepEqual(searchEvents([], {}, "price"), []);
  });

  test("criteria combine: search + city + sort", () => {
    const list = [
      row({ id: "1", title: "Jazz Lagos 2", city: "Lagos", startsAt: "2026-12-09T10:00:00Z" }),
      row({ id: "2", title: "Jazz Lagos 1", city: "Lagos", startsAt: "2026-12-02T10:00:00Z" }),
      row({ id: "3", title: "Jazz Abuja", city: "Abuja", startsAt: "2026-12-01T10:00:00Z" }),
    ];
    assert.deepEqual(titles(searchEvents(list, { q: "jazz", city: "Lagos" }, "date")), ["Jazz Lagos 1", "Jazz Lagos 2"]);
  });
});