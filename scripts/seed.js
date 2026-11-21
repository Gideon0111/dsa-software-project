import { createConnection, applySchema, DEFAULT_DB_PATH } from "../src/db/connection.js";
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

  db.close();
}

main();

export { SEED_DB_PATH };