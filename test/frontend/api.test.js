import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  listEvents,
  getEvent,
  createBooking,
  pay,
  ApiError,
  resetMockState,
} from "../../public/js/api.js";

describe("Build 6 mock API (api.js)", () => {
  beforeEach(resetMockState);

  test("listEvents returns published events with summaries", async () => {
    const { events } = await listEvents();
    assert.ok(Array.isArray(events));
    assert.ok(events.length > 0);
    for (const e of events) {
      assert.ok(e.id);
      assert.ok(e.title);
      assert.ok(e.city);
      assert.equal(e.status, "PUBLISHED");
    }
  });

  test("getEvent returns event with tiers and available seats", async () => {
    const { event } = await getEvent("evt-101");
    assert.equal(event.id, "evt-101");
    assert.ok(Array.isArray(event.tiers));
    assert.ok(event.tiers.length > 0);
    for (const t of event.tiers) {
      assert.ok(Number.isInteger(t.available));
      assert.equal(t.available, t.capacity - t.sold);
    }
  });

  test("getEvent unknown id throws NOT_FOUND", async () => {
    await assert.rejects(() => getEvent("nope"), (err) => {
      assert.equal(err.code, "NOT_FOUND");
      assert.equal(err.status, 404);
      assert.ok(err instanceof ApiError);
      return true;
    });
  });

  test("createBooking creates pending booking and decrements seats", async () => {
    const { event } = await getEvent("evt-102");
    const tier = event.tiers[0];
    const before = tier.available;

    const { booking } = await createBooking({
      tierId: tier.id,
      quantity: 2,
      customerName: "Ada",
    });
    assert.equal(booking.status, "pending");
    assert.equal(booking.quantity, 2);
    assert.equal(booking.totalCents, tier.priceCents * 2);
    assert.ok(booking.reference);
    assert.ok(Number.isInteger(booking.totalCents));

    const { event: after } = await getEvent("evt-102");
    const afterTier = after.tiers.find((t) => t.id === tier.id);
    assert.equal(afterTier.available, before - 2);
  });

  test("createBooking rejects quantity above available with SOLD_OUT", async () => {
    let soldOutTier = null;
    for (const e of (await listEvents()).events) {
      const ev = await getEvent(e.id);
      const t = ev.event.tiers.find((tier) => tier.available === 0);
      if (t) {
        soldOutTier = t;
        break;
      }
    }
    assert.ok(soldOutTier, "expected a sold-out tier in mock data");

    await assert.rejects(
      () =>
        createBooking({ tierId: soldOutTier.id, quantity: 1, customerName: "Ada" }),
      (err) => {
        assert.equal(err.code, "SOLD_OUT");
        assert.equal(err.status, 409);
        return true;
      }
    );
  });

  test("createBooking rejects invalid quantity with VALIDATION", async () => {
    for (const qty of [0, -1, 1.5, 11]) {
      await assert.rejects(
        () =>
          createBooking({
            tierId: "tier-102-a",
            quantity: qty,
            customerName: "Ada",
          }),
        (err) => {
          assert.equal(err.code, "VALIDATION");
          assert.equal(err.status, 400);
          return true;
        }
      );
    }
  });

  test("pay marks a pending booking paid", async () => {
    const { booking } = await createBooking({
      tierId: "tier-102-a",
      quantity: 1,
      customerName: "Ada",
    });
    const result = await pay({
      reference: booking.reference,
      shouldDecline: false,
    });
    assert.equal(result.booking.status, "paid");
  });

  test("declined payment leaves booking pending and is retryable", async () => {
    const { booking } = await createBooking({
      tierId: "tier-102-a",
      quantity: 1,
      customerName: "Ada",
    });

    await assert.rejects(
      () => pay({ reference: booking.reference, shouldDecline: true }),
      (err) => {
        assert.equal(err.code, "PAYMENT_DECLINED");
        assert.equal(err.status, 402);
        return true;
      }
    );

    const result = await pay({
      reference: booking.reference,
      shouldDecline: false,
    });
    assert.equal(result.booking.status, "paid");
  });

  test("pay unknown booking throws NOT_FOUND", async () => {
    await assert.rejects(
      () => pay({ reference: "NOPE-NOPE", shouldDecline: false }),
      (err) => {
        assert.equal(err.code, "NOT_FOUND");
        assert.equal(err.status, 404);
        return true;
      }
    );
  });

  test("pay already-paid booking throws INVALID_TRANSITION", async () => {
    const { booking } = await createBooking({
      tierId: "tier-102-a",
      quantity: 1,
      customerName: "Ada",
    });
    await pay({ reference: booking.reference, shouldDecline: false });

    await assert.rejects(
      () => pay({ reference: booking.reference, shouldDecline: false }),
      (err) => {
        assert.equal(err.code, "INVALID_TRANSITION");
        assert.equal(err.status, 409);
        return true;
      }
    );
  });

  test("listEvents applies search, city, max price and sort", async () => {
    const { events: jazz } = await listEvents({ q: "jazz" });
    assert.ok(jazz.length > 0);
    assert.ok(jazz.every((e) => e.title.toLowerCase().includes("jazz")));

    const { events: lagos } = await listEvents({ city: "Lagos" });
    assert.ok(lagos.length > 0);
    assert.ok(lagos.every((e) => e.city.toLowerCase() === "lagos"));

    const { events: cheap } = await listEvents({
      maxPriceCents: 200000,
      sortBy: "price",
    });
    assert.ok(cheap.length > 0);
    assert.ok(
      cheap.every((e) => e.minPriceCents !== null && e.minPriceCents <= 200000)
    );
    for (let i = 1; i < cheap.length; i++) {
      assert.ok(cheap[i - 1].minPriceCents <= cheap[i].minPriceCents);
    }
  });
});
