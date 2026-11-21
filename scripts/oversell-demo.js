import { createSqliteRepository } from "../src/repositories/sqlite.js";
import { DatabaseSync } from "node:sqlite";
import { DomainError, ErrorCode } from "../src/domain/errors.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const SEATS = 1;
const ATTEMPTS = 50;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(
  path.join(__dirname, "..", "src", "db", "schema.sql"),
  "utf8"
);

function heading(text) {
  console.log(`\n=== ${text} ===`);
}
function say(text) {
  console.log(`  ${text}`);
}

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const cleaned = schemaSql
    .split("\n")
    .map((line) => {
      const ci = line.indexOf("--");
      return ci === -1 ? line : line.slice(0, ci);
    })
    .join("\n");
  for (const statement of cleaned.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(statement);
  }
  return db;
}

/*
 * Seed one event + one tier with `capacity` seats into a fresh DB.
 * Returns { eventId, tierId }.
 */
function seedOneSeat(db) {
  const eventId = "evt-demo";
  const tierId = "tier-demo";
  db.prepare(
    "INSERT INTO events(id, title, city, venue, starts_at, status, tier_ids) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(eventId, "Last Seat Demo", "Lagos", "Demo Hall", "2027-06-01T19:00:00Z", "PUBLISHED", JSON.stringify([tierId]));
  db.prepare(
    "INSERT INTO ticket_tiers(id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(tierId, eventId, "General", 500000, SEATS, 0);
  return { eventId, tierId };
}

async function main() {
  heading(`Overselling Demo: ${SEATS} seat, ${ATTEMPTS} simultaneous attempts`);

  heading("BEFORE FIX (non-atomic check-then-act, simulated race)");
  const dbBefore = freshDb();
  const { tierId: beforeTierId } = seedOneSeat(dbBefore);

  let beforeSuccess = 0;
  let beforeCleanSoldOut = 0;
  let beforeConstraintErrors = 0;

  const writeLock = Promise.resolve(); 

  async function nonAtomicBook(customerName) {
    const row = dbBefore
      .prepare("SELECT sold FROM ticket_tiers WHERE id = ?")
      .get(beforeTierId);
    const sold = row.sold;
    const available = SEATS - sold;
    if (1 > available) {
      beforeCleanSoldOut++;
      throw new DomainError(ErrorCode.SOLD_OUT, "sold out");
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    await writeLock.then(() => {
      dbBefore.prepare("UPDATE ticket_tiers SET sold = sold + ? WHERE id = ?").run(1, beforeTierId);
      beforeSuccess += 1;
    });
    return { ok: true };
  }

  const beforeResults = await Promise.all(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      nonAtomicBook(`Buyer-${i + 1}`).then(
        () => ({ ok: true }),
        (e) => {
          if (e.code === ErrorCode.SOLD_OUT) {
            beforeCleanSoldOut++;
          } else {
            beforeConstraintErrors++;
          }
          return { ok: false, code: e.code };
        }
      )
    )
  );
  const beforeOk = beforeResults.filter((r) => r.ok).length;
  const beforeFail = beforeResults.filter((r) => !r.ok).length;
  const beforeDbSold = dbBefore
    .prepare("SELECT sold FROM ticket_tiers WHERE id = ?")
    .get(beforeTierId).sold;
  say(`Attempts: ${ATTEMPTS} | Succeeded: ${beforeOk} | Failed: ${beforeFail}`);
  say(`  Clean SOLD_OUT: ${beforeCleanSoldOut} | SQLite constraint errors: ${beforeConstraintErrors}`);
  say(`Seats sold (DB): ${beforeDbSold} (capacity: ${SEATS})`);
  if (beforeConstraintErrors > 0) {
    say("PROBLEM: failures are raw SQLite constraint errors, not clean SOLD_OUT —");
    say("         non-deterministic and not the application-level error users expect.");
  } else {
    say("No overselling observed in this run (race timing varies).");
  }
  dbBefore.close();

  // AFTER FIX: atomic UPDATE
  heading("AFTER FIX (atomic UPDATE ... WHERE sold + ? <= capacity)");
  const repo = createSqliteRepository(":memory:");
  const event = await repo.createEvent({
    title: "Last Seat Demo",
    city: "Lagos",
    venue: "Demo Hall",
    startsAt: "2027-06-01T19:00:00Z",
  });
  const tier = await repo.createTier(event.id, {
    name: "General",
    priceCents: 500000,
    capacity: SEATS,
  });

  let afterSuccess = 0;
  let afterSoldOut = 0;

  await Promise.all(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      repo
        .createBooking({
          reference: `AFTER-${i + 1}`,
          eventId: event.id,
          tierId: tier.id,
          customerName: `Buyer-${i + 1}`,
          quantity: 1,
          totalCents: 500000,
          userId: `u-${i + 1}`,
        })
        .then(() => {
          afterSuccess++;
        })
        .catch((e) => {
          if (e.code === ErrorCode.SOLD_OUT) afterSoldOut++;
        })
    )
  );

  const finalTier = await repo.getTier(tier.id);
  say(`Attempts: ${ATTEMPTS} | Succeeded: ${afterSuccess} | SOLD_OUT: ${afterSoldOut}`);
  say(`Seats sold (DB): ${finalTier.sold} (capacity: ${SEATS})`);
  if (afterSuccess === 1 && afterSoldOut === ATTEMPTS - 1 && finalTier.sold === SEATS) {
    say("FIXED: exactly one booking succeeded for the last seat; capacity respected.");
  } else {
    say("UNEXPECTED: result does not match 1 success / 49 SOLD_OUT.");
  }

  repo.close();
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});