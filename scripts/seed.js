import { createConnection, applySchema, DEFAULT_DB_PATH } from "../src/db/connection.js";
//Reuse the frontend's mock events so the real database has the same events
import { events as mockEvents } from "../public/js/mockData.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(
  path.join(__dirname, "..", "src", "db", "schema.sql"),
  "utf8"
);

const SEED_DB_PATH = process.env.TICKETING_DB_PATH || DEFAULT_DB_PATH;

function main() {
  const db = createConnection(SEED_DB_PATH);
  applySchema(db, schemaSql);

  const eventId = "evt-demo-last-seat";
  const tierId = "tier-demo-last-seat";

  const existing = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);
  if (!existing) {
    db.prepare(
      "INSERT INTO events(id, title, city, venue, starts_at, status, tier_ids) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      eventId,
      "Last Seat Demo",
      "Lagos",
      "Demo Hall",
      "2027-06-01T19:00:00Z",
      "PUBLISHED",
      JSON.stringify([tierId])
    );

    db.prepare(
      "INSERT INTO ticket_tiers(id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(tierId, eventId, "General", 500000, 1, 0);

    console.log(`Seeded event "${eventId}" with tier "${tierId}" (capacity: 1, sold: 0)`);
  } else {
    console.log(`Database already seeded at ${SEED_DB_PATH}; skipping.`);
  }
  // NEW: seed the six sample events (idempotent: skips any that already exist).
  const insertEvent = db.prepare(
    "INSERT INTO events(id, title, city, venue, starts_at, status, tier_ids) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertTier = db.prepare(
    "INSERT INTO ticket_tiers(id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)"
  );
  let added = 0;
  for (const e of mockEvents) {
    if (db.prepare("SELECT id FROM events WHERE id = ?").get(e.id)) continue;
    insertEvent.run(e.id, e.title, e.city, e.venue, e.startsAt, e.status, JSON.stringify(e.tiers.map((t) => t.id)));
    for (const t of e.tiers) insertTier.run(t.id, e.id, t.name, t.priceCents, t.capacity, t.sold);
    added++;
  }
  console.log(added > 0 ? `Seeded ${added} sample event(s).` : "Sample events already present; skipping.");

  db.close();
}

main();

export { SEED_DB_PATH };