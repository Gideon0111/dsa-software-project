import { DomainError, ErrorCode } from "../domain/errors.js";
import { EventStatus } from "../domain/inventory.js";
import { BookingState } from "../domain/bookingStateMachine.js";
import { newId, normalizeReference } from "../domain/ids.js";
import {
  openDatabase,
  applySchema,
  DEFAULT_DB_PATH,
} from "../db/connection.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

const orNull = (value) => (value === undefined ? null : value);

function notFound(kind, id) {
  throw new DomainError(ErrorCode.NOT_FOUND, `${kind} not found: ${id}`, { [kind]: id });
}

function eventRowToEvent(row) {
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    status: row.status,
    tierIds: JSON.parse(row.tier_ids || "[]"),
    organizerId: row.organizer_id ?? undefined,
  };
}

function tierRowToTier(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
    waitlist: { entries: [] },
  };
}

function bookingRowToBooking(row) {
  return {
    id: row.id,
    reference: row.reference,
    eventId: row.event_id,
    tierId: row.tier_id,
    customerName: row.customer_name,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
    userId: row.user_id,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

function userRowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
  };
}

export function createSqliteRepository(dbPath) {
  const target = dbPath || DEFAULT_DB_PATH;
  const db = openDatabase(target);
  applySchema(db, schemaSql);

  // ── Prepared statements (parameterised, never string-concatenated) ──
  const stmtCreateEvent = db.prepare(
    "INSERT INTO events(id, title, city, venue, starts_at, status, tier_ids) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const stmtGetEvent = db.prepare("SELECT * FROM events WHERE id = ?");
  const stmtUpdateEvent = db.prepare(
    "UPDATE events SET title = COALESCE(?, title), city = COALESCE(?, city), venue = COALESCE(?, venue), starts_at = COALESCE(?, starts_at), status = COALESCE(?, status) WHERE id = ?"
  );
  const stmtListEvents = db.prepare("SELECT * FROM events");
  const stmtCreateTier = db.prepare(
    "INSERT INTO ticket_tiers(id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, 0)"
  );
  const stmtGetTier = db.prepare("SELECT * FROM ticket_tiers WHERE id = ?");
  // CHANGED: also updates `sold`. Before, cancelBooking() asked for { sold } but this
  // statement ignored it, so cancelled seats were never released.
  const stmtUpdateTier = db.prepare(
    "UPDATE ticket_tiers SET name = COALESCE(?, name), price_cents = COALESCE(?, price_cents), capacity = COALESCE(?, capacity), sold = COALESCE(?, sold) WHERE id = ?"
  );
  const stmtListTiers = db.prepare("SELECT * FROM ticket_tiers WHERE event_id = ?");
  const stmtGetBooking = db.prepare("SELECT * FROM bookings WHERE reference = ?");
  const stmtFindBookingByRef = db.prepare("SELECT * FROM bookings WHERE reference = ?");
  const stmtCreateBooking = db.prepare(
    "INSERT INTO bookings(id, reference, event_id, tier_id, user_id, customer_name, quantity, total_cents, status, created_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
  );
  const stmtUpdateBooking = db.prepare(
    "UPDATE bookings SET status = COALESCE(?, status), cancelled_at = COALESCE(?, cancelled_at) WHERE reference = ?"
  );
  const stmtReserveSeat = db.prepare(
    "UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity"
  );
  const stmtAppendTierId = db.prepare(
    "UPDATE events SET tier_ids = json_insert(tier_ids, '$[#]', ?) WHERE id = ?"
  );
  const stmtCreateUser = db.prepare(
    "INSERT INTO users(id, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const stmtGetUserByEmail = db.prepare(
    "SELECT * FROM users WHERE email = ?"
  );
  const stmtGetUserById = db.prepare(
    "SELECT * FROM users WHERE id = ?"
  );

  function close() {
    db.close();
  }

  async function createEvent({ title, city, venue, startsAt, organizerId }) {
    const id = newId();
    stmtCreateEvent.run(
      id,
      title,
      city,
      venue,
      startsAt,
      EventStatus.DRAFT,
      "[]"
    );
    return eventRowToEvent(stmtGetEvent.get(id));
  }

  async function getEvent(id) {
    const row = stmtGetEvent.get(id);
    if (!row) notFound("Event", id);
    return eventRowToEvent(row);
  }

  async function updateEvent(id, updates) {
    const row = stmtGetEvent.get(id);
    if (!row) notFound("Event", id);

    stmtUpdateEvent.run(
      orNull(updates.title), orNull(updates.city), orNull(updates.venue),
      orNull(updates.startsAt), orNull(updates.status), id
    );
    return eventRowToEvent(stmtGetEvent.get(id));
  }

  async function listEvents({ publishedOnly = true } = {}) {
    const rows = stmtListEvents.all();
    const summaries = [];
    for (const row of rows) {
      if (publishedOnly && row.status !== EventStatus.PUBLISHED) continue;
      const event = eventRowToEvent(row);
      let minPriceCents = null;
      let seatsAvailable = 0;
      for (const tierId of event.tierIds) {
        const tier = stmtGetTier.get(tierId);
        if (tier) {
          if (minPriceCents === null || tier.price_cents < minPriceCents) {
            minPriceCents = tier.price_cents;
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
    const event = stmtGetEvent.get(eventId);
    if (!event) notFound("Event", eventId);
    const id = newId();
    stmtCreateTier.run(id, eventId, name, priceCents, capacity);
    stmtAppendTierId.run(id, eventId);
    return tierRowToTier(stmtGetTier.get(id));
  }

  async function getTier(id) {
    const row = stmtGetTier.get(id);
    if (!row) notFound("Ticket tier", id);
    return tierRowToTier(row);
  }

  async function listTiers(eventId) {
    const event = stmtGetEvent.get(eventId);
    if (!event) notFound("Event", eventId);
    const rows = stmtListTiers.all(eventId);
    return rows.map(tierRowToTier);
  }

  async function updateTier(id, updates) {
    const row = stmtGetTier.get(id);
    if (!row) notFound("Ticket tier", id);

    stmtUpdateTier.run(
      orNull(updates.name), orNull(updates.priceCents), orNull(updates.capacity), orNull(updates.sold), id
    );
    return tierRowToTier(stmtGetTier.get(id));
  }

  async function createBooking({
    reference,
    eventId,
    tierId,
    customerName,
    quantity,
    totalCents,
    userId,
  }) {
    const tierRow = stmtGetTier.get(tierId);
    if (!tierRow) notFound("Ticket tier", tierId);

    const normalizedRef = normalizeReference(reference);
    if (stmtFindBookingByRef.get(normalizedRef)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Booking reference already exists: ${normalizedRef}`,
        { reference: normalizedRef }
      );
    }

    const id = newId();
    const createdAt = new Date().toISOString();

    // Transactionally reserve the seat and create the booking.
    db.exec("BEGIN IMMEDIATE");
    try {
      const reserve = stmtReserveSeat.run(quantity, tierId, quantity);
      if (reserve.changes === 0) {
        db.exec("ROLLBACK");
        throw new DomainError(
          ErrorCode.SOLD_OUT,
          `Not enough seats left in tier "${tierId}"`,
          { tierId, requested: quantity, available: tierRow.capacity - tierRow.sold }
        );
      }

      stmtCreateBooking.run(
        id,
        normalizedRef,
        eventId,
        tierId,
        userId,
        customerName,
        quantity,
        totalCents,
        BookingState.PENDING,
        createdAt
      );
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) {
        try { db.exec("ROLLBACK"); } catch { /* ignore rollback errors */ }
      }
      if (error instanceof DomainError) throw error;
      throw error;
    }

    return bookingRowToBooking(stmtGetBooking.get(normalizedRef));
  }

  async function getBooking(reference) {
    const row = stmtGetBooking.get(reference);
    if (!row) notFound("Booking", reference);
    return bookingRowToBooking(row);
  }

  async function updateBooking(reference, updates) {
    const row = stmtGetBooking.get(reference);
    if (!row) notFound("Booking", reference);
  
    stmtUpdateBooking.run(orNull(updates.status), orNull(updates.cancelledAt), reference);
    return bookingRowToBooking(stmtGetBooking.get(reference));
  }

  async function createUser({ email, passwordHash, role }) {
    const existing = stmtGetUserByEmail.get(email);
    if (existing) {
      throw new DomainError(
        ErrorCode.EMAIL_TAKEN,
        `An account with email "${email}" already exists`,
        { email }
      );
    }
    const id = newId();
    stmtCreateUser.run(id, email, passwordHash, role);
    return userRowToUser(stmtGetUserById.get(id));
  }

  async function getUserByEmail(email) {
    const row = stmtGetUserByEmail.get(email);
    if (!row) return null;
    return userRowToUser(row);
  }

  async function getUserById(id) {
    const row = stmtGetUserById.get(id);
    if (!row) return null;
    return userRowToUser(row);
  }

  async function peekWaitlist(tierId) {

    const tier = stmtGetTier.get(tierId);
    if (!tier) notFound("Ticket tier", tierId);
    return undefined;
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
    createUser,
    getUserByEmail,
    getUserById,
    peekWaitlist,
    close,
  });
}