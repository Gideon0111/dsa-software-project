import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  startTestServer,
  authHeaders,
  seedEvent,
  seedTier,
  seedPublishedEvent,
  seedBooking,
  seedPaidBooking,
  seedCancelledBooking,
} from "./apiHelpers.js";

let server;
let json;

describe("Build 4 API", () => {
  before(async () => {
    server = await startTestServer();
    json = server.json;
  });

  after(async () => {
    await server.stop();
  });

  /* ──────────────── POST /api/events ──────────────── */

  describe("POST /api/events", () => {
    test("creates a draft event and returns it", async () => {
      const res = await json("/api/events", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: {
          title: "Harbour Rock Night",
          city: "Lagos",
          venue: "Harbour Hall",
          startsAt: "2027-03-20T19:00:00Z",
        },
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.event.id);
      assert.equal(res.body.event.title, "Harbour Rock Night");
      assert.equal(res.body.event.status, "DRAFT");
    });

    test("rejects missing title with VALIDATION", async () => {
      const res = await json("/api/events", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { city: "Lagos", venue: "Hall", startsAt: "2027-03-20T19:00:00Z" },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });

    test("rejects an impossible date with VALIDATION", async () => {
      const res = await json("/api/events", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: {
          title: "Ghost",
          city: "Lagos",
          venue: "Nowhere",
          startsAt: "2027-02-30",
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });

    test("requires x-user-id header", async () => {
      const res = await json("/api/events", {
        method: "POST",
        body: {
          title: "X",
          city: "Lagos",
          venue: "Y",
          startsAt: "2027-03-20T19:00:00Z",
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });
  });

  /* ──────────── POST /api/events/:id/tiers ─────────── */

  describe("POST /api/events/:id/tiers", () => {
    test("adds a tier to the event", async () => {
      const event = await seedEvent(json, "user-1", {
        title: "Tier Event",
        startsAt: "2027-04-01T19:00:00Z",
      });
      const res = await json(`/api/events/${event.id}/tiers`, {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { name: "General", priceCents: 500000, capacity: 5 },
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.tier.id);
      assert.equal(res.body.tier.priceCents, 500000);
      assert.equal(res.body.tier.capacity, 5);
      assert.equal(res.body.tier.sold, 0);
    });

    test("rejects a tier for an unknown event", async () => {
      const res = await json("/api/events/nope/tiers", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { name: "X", priceCents: 100, capacity: 5 },
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });

    test("rejects duplicate tier names with CONFLICT", async () => {
      const event = await seedEvent(json, "user-1", {
        title: "Duplicate Tier Event",
        startsAt: "2027-04-02T19:00:00Z",
      });
      await seedTier(json, "user-1", event.id, { name: "General" });
      const res = await json(`/api/events/${event.id}/tiers`, {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { name: "general", priceCents: 200, capacity: 5 },
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "CONFLICT");
    });
  });

  /* ──────────── POST /api/events/:id/publish ───────── */

  describe("POST /api/events/:id/publish", () => {
    test("publishes a draft event with tiers", async () => {
      const { event } = await seedPublishedEvent(json, "user-1", {
        title: "Pub Event",
        startsAt: "2027-05-01T19:00:00Z",
      });
      assert.equal(event.status, "PUBLISHED");
    });

    test("rejects publishing twice with INVALID_STATE", async () => {
      const { event } = await seedPublishedEvent(json, "user-1", {
        title: "Publish Twice Event",
        startsAt: "2027-05-02T19:00:00Z",
      });
      const res = await json(`/api/events/${event.id}/publish`, {
        method: "POST",
        headers: authHeaders("user-1"),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_STATE");
    });

    test("rejects publishing an event with no tiers", async () => {
      const event = await seedEvent(json, "user-1", {
        title: "Empty Event",
        startsAt: "2027-06-01T19:00:00Z",
      });
      const res = await json(`/api/events/${event.id}/publish`, {
        method: "POST",
        headers: authHeaders("user-1"),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_STATE");
    });
  });

  /* ────────── POST /api/events/:id/unpublish ───────── */

  describe("POST /api/events/:id/unpublish", () => {
    test("unpublishes a published event", async () => {
      const { event } = await seedPublishedEvent(json, "user-1", {
        title: "Unpub Event",
        startsAt: "2027-07-01T19:00:00Z",
      });
      const res = await json(`/api/events/${event.id}/unpublish`, {
        method: "POST",
        headers: authHeaders("user-1"),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.event.status, "DRAFT");
    });

    test("rejects unpublishing a draft with INVALID_STATE", async () => {
      const { event } = await seedPublishedEvent(json, "user-1", {
        title: "Unpub Draft Event",
        startsAt: "2027-07-02T19:00:00Z",
      });
      await json(`/api/events/${event.id}/unpublish`, {
        method: "POST",
        headers: authHeaders("user-1"),
      });
      const res = await json(`/api/events/${event.id}/unpublish`, {
        method: "POST",
        headers: authHeaders("user-1"),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_STATE");
    });
  });

  /* ──────────────── GET /api/events ──────────────── */

  describe("GET /api/events", () => {
    test("returns published events only", async () => {
      await seedPublishedEvent(json, "user-1", {
        title: "Jazz Lagos",
        city: "Lagos",
        startsAt: "2027-08-01T19:00:00Z",
      });
      await seedPublishedEvent(json, "user-1", {
        title: "Tech Abuja",
        city: "Abuja",
        startsAt: "2027-09-01T19:00:00Z",
      });
      await seedEvent(json, "user-1", {
        title: "Secret Draft",
        city: "Lagos",
        startsAt: "2027-10-01T19:00:00Z",
      });

      const res = await json("/api/events");
      assert.equal(res.status, 200);
      assert.ok(res.body.events.length >= 2);
      assert.ok(res.body.events.every((e) => e.status === "PUBLISHED"));
    });

    test("filters by city ignoring case", async () => {
      await seedPublishedEvent(json, "user-1", {
        title: "Lagos One",
        city: "Lagos",
        startsAt: "2027-08-01T19:00:00Z",
      });
      await seedPublishedEvent(json, "user-1", {
        title: "Abuja One",
        city: "Abuja",
        startsAt: "2027-09-01T19:00:00Z",
      });

      const res = await json("/api/events?city=lagos");
      assert.equal(res.status, 200);
      assert.ok(res.body.events.length >= 1);
      assert.ok(
        res.body.events.every((e) => e.city.toLowerCase() === "lagos"),
      );
    });

    test("searches by title", async () => {
      await seedPublishedEvent(json, "user-1", {
        title: "Jazz Lagos",
        city: "Lagos",
        startsAt: "2027-08-01T19:00:00Z",
      });
      await seedPublishedEvent(json, "user-1", {
        title: "Tech Abuja",
        city: "Abuja",
        startsAt: "2027-09-01T19:00:00Z",
      });

      const res = await json("/api/events?q=Jazz");
      assert.equal(res.status, 200);
      assert.ok(
        res.body.events.some((e) => e.title.toLowerCase().includes("jazz")),
      );
    });

    test("rejects an unknown sortBy with VALIDATION", async () => {
      await seedPublishedEvent(json, "user-1", {
        title: "Sort Event",
        startsAt: "2027-08-01T19:00:00Z",
      });

      const res = await json("/api/events?sortBy=popularity");
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });
  });

  /* ──────────────── POST /api/bookings ─────────────── */

  describe("POST /api/bookings", () => {
    test("creates a pending booking and decrements seats", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-1", {
        title: "Booking Event",
        startsAt: "2027-11-01T19:00:00Z",
        tier: { priceCents: 250000, capacity: 3 },
      });

      const res = await json("/api/bookings", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { tierId: tier.id, quantity: 2, customerName: "Alice" },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.booking.status, "pending");
      assert.equal(res.body.booking.quantity, 2);
      assert.equal(res.body.booking.totalCents, 500000);
      assert.ok(res.body.booking.reference);
      assert.equal(res.body.booking.userId, "user-1");
    });

    test("rejects more tickets than available with SOLD_OUT", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-1", {
        title: "Sold Out Event",
        startsAt: "2027-11-02T19:00:00Z",
        tier: { priceCents: 250000, capacity: 1 },
      });
      await seedBooking(json, "user-1", tier.id, { quantity: 1 });

      const res = await json("/api/bookings", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { tierId: tier.id, quantity: 2, customerName: "Bob" },
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "SOLD_OUT");
    });

    test("rejects invalid quantity with VALIDATION", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-1", {
        title: "Invalid Qty Event",
        startsAt: "2027-11-03T19:00:00Z",
        tier: { priceCents: 250000, capacity: 3 },
      });

      const res = await json("/api/bookings", {
        method: "POST",
        headers: authHeaders("user-1"),
        body: { tierId: tier.id, quantity: 0, customerName: "Bob" },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });
  });

  /* ────────── POST /api/bookings/:reference/pay ────── */

  describe("POST /api/bookings/:reference/pay", () => {
    test("pays a pending booking and marks it paid", async () => {
      const { event, tier } = await seedPublishedEvent(json, "owner", {
        title: "Pay Event",
        startsAt: "2027-12-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedBooking(json, "owner", tier.id, {
        customerName: "Owner",
      });

      const res = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("owner"),
        body: {},
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.booking.status, "paid");
    });

    test("rejects paying again with INVALID_TRANSITION", async () => {
      const { event, tier } = await seedPublishedEvent(json, "owner", {
        title: "Pay Twice Event",
        startsAt: "2027-12-02T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedPaidBooking(json, "owner", tier.id, {
        customerName: "Owner",
      });

      const res = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("owner"),
        body: {},
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_TRANSITION");
    });

    test("declined payment leaves booking pending and can be retried", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-3", {
        title: "Decline Event",
        startsAt: "2028-02-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedBooking(json, "user-3", tier.id, {
        customerName: "Decliner",
      });

      const res = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("user-3"),
        body: { shouldDecline: true },
      });
      assert.equal(res.status, 402);
      assert.equal(res.body.error.code, "PAYMENT_DECLINED");

      const retryRes = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("user-3"),
        body: {},
      });
      assert.equal(retryRes.status, 200);
      assert.equal(retryRes.body.booking.status, "paid");
    });

    test("rejects paying with a different user (ownership check)", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-2", {
        title: "Other Event",
        startsAt: "2028-01-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedBooking(json, "user-2", tier.id, {
        customerName: "Other",
      });

      const res = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("user-1"),
        body: {},
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_TRANSITION");
    });

    test("rejects paying a cancelled booking with INVALID_TRANSITION", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-4", {
        title: "Cancel Event",
        startsAt: "2028-03-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedCancelledBooking(json, "user-4", tier.id);

      const res = await json(`/api/bookings/${booking.reference}/pay`, {
        method: "POST",
        headers: authHeaders("user-4"),
        body: {},
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_TRANSITION");
    });

    test("rejects paying an unknown booking with NOT_FOUND", async () => {
      const res = await json("/api/bookings/NOPE-NOPE/pay", {
        method: "POST",
        headers: authHeaders("owner"),
        body: {},
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });
  });

  /* ───────── POST /api/bookings/:reference/cancel ──── */

  describe("POST /api/bookings/:reference/cancel", () => {
    test("cancels a pending booking and releases seats", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-5", {
        title: "Cancel Event 2",
        startsAt: "2028-04-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedBooking(json, "user-5", tier.id, {
        customerName: "Canceler",
      });

      const res = await json(`/api/bookings/${booking.reference}/cancel`, {
        method: "POST",
        headers: authHeaders("user-5"),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.booking.status, "cancelled");
      assert.ok(res.body.booking.cancelledAt);
      assert.equal(res.body.seatsAvailable, 5);
    });

    test("rejects cancelling twice with INVALID_TRANSITION", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-5", {
        title: "Cancel Twice Event",
        startsAt: "2028-04-02T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedBooking(json, "user-5", tier.id, {
        customerName: "Canceler",
      });

      await json(`/api/bookings/${booking.reference}/cancel`, {
        method: "POST",
        headers: authHeaders("user-5"),
      });
      const res = await json(`/api/bookings/${booking.reference}/cancel`, {
        method: "POST",
        headers: authHeaders("user-5"),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_TRANSITION");
    });

    test("rejects cancelling a paid booking with INVALID_TRANSITION", async () => {
      const { event, tier } = await seedPublishedEvent(json, "user-6", {
        title: "Paid Cancel Event",
        startsAt: "2028-05-01T19:00:00Z",
        tier: { priceCents: 1000, capacity: 5 },
      });
      const booking = await seedPaidBooking(json, "user-6", tier.id, {
        customerName: "Payer",
      });

      const res = await json(`/api/bookings/${booking.reference}/cancel`, {
        method: "POST",
        headers: authHeaders("user-6"),
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "INVALID_TRANSITION");
    });

    test("rejects cancelling an unknown booking with NOT_FOUND", async () => {
      const res = await json("/api/bookings/NOPE-NOPE/cancel", {
        method: "POST",
        headers: authHeaders("user-5"),
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });
  });
});
