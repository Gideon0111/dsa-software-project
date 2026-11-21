import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSqliteRepository } from "../src/repositories/sqlite.js";
import { ErrorCode } from "../src/domain/errors.js";

// Regression test for the last-ticket overselling fix (S08).
// The test fails if the atomic fix is removed from createBooking (src/repositories/sqlite.js): 
// without the `UPDATE ... WHERE sold + ? <=capacity` guard, 

describe("overselling: last ticket sold to exactly one person", () => {
  const SEATS = 1;
  const ATTEMPTS = 50;

  let repo;
  let eventId;
  let tierId;

  before(async () => {
    repo = createSqliteRepository(":memory:");
    const event = await repo.createEvent({
      title: "Last Seat",
      city: "Lagos",
      venue: "Demo Hall",
      startsAt: "2027-06-01T19:00:00Z",
    });
    const tier = await repo.createTier(event.id, {
      name: "General",
      priceCents: 500000,
      capacity: SEATS,
    });
    eventId = event.id;
    tierId = tier.id;
  });

  after(async () => {
    repo.close();
  });

  test("50 simultaneous bookings for 1 seat give exactly 1 success and 49 SOLD_OUT", async () => {
    let successes = 0;
    let soldOuts = 0;
    let otherErrors = 0;

    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        repo
          .createBooking({
            reference: `OS-${i + 1}`,
            eventId,
            tierId,
            customerName: `Buyer-${i + 1}`,
            quantity: 1,
            totalCents: 500000,
            userId: `u-${i + 1}`,
          })
          .then(() => {
            successes += 1;
          })
          .catch((error) => {
            if (error.code === ErrorCode.SOLD_OUT) {
              soldOuts += 1;
            } else {
              otherErrors += 1;
            }
          })
      )
    );

    assert.strictEqual(results.length, ATTEMPTS);
    assert.strictEqual(successes, 1, "exactly one booking must succeed");
    assert.strictEqual(soldOuts, ATTEMPTS - 1, "the rest must be SOLD_OUT");
    assert.strictEqual(otherErrors, 0, "no unexpected errors");

    // Inventory integrity: seats sold must never exceed capacity.
    const tier = await repo.getTier(tierId);
    assert.strictEqual(tier.sold, SEATS, "sold must equal capacity");
    assert.strictEqual(
      tier.capacity - tier.sold,
      0,
      "no seats may remain after the last one is sold"
    );
  });

  test("seats sold never exceeds capacity under repeated contention", async () => {
    // Re-seed a fresh tier for this test.
    const tier = await repo.createTier(eventId, {
      name: "Overflow",
      priceCents: 1000,
      capacity: 1,
    });

    let successes = 0;
    let soldOuts = 0;

    await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        repo
          .createBooking({
            reference: `OS2-${i + 1}`,
            eventId,
            tierId: tier.id,
            customerName: `Buyer-${i + 1}`,
            quantity: 1,
            totalCents: 1000,
            userId: `u2-${i + 1}`,
          })
          .then(() => {
            successes += 1;
          })
          .catch((error) => {
            if (error.code === ErrorCode.SOLD_OUT) soldOuts += 1;
          })
      )
    );

    assert.strictEqual(successes, 1);
    assert.strictEqual(soldOuts, ATTEMPTS - 1);

    const refreshed = await repo.getTier(tier.id);
    assert.strictEqual(refreshed.sold, 1);
    assert.strictEqual(refreshed.capacity - refreshed.sold, 0);
  });
});