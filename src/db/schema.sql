-- SQLite schema for Event Ticketing 
-- Every table uses explicit PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK constraints.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('organizer', 'attendee', 'staff'))
);

-- ── Events ──
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  city        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,  
  status      TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED')),
  tier_ids    TEXT NOT NULL DEFAULT '[]'  -- JSON array of tier ids (mirrors memory.js tierIds)
);

-- ── Ticket Tiers ──
-- sold is never allowed to go negative or exceed capacity (CHECK constraint).
CREATE TABLE IF NOT EXISTS ticket_tiers (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  capacity    INTEGER NOT NULL CHECK (capacity >= 1),
  sold        INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0 AND sold <= capacity)
);

-- ── Bookings ──
CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT PRIMARY KEY,
  reference    TEXT NOT NULL UNIQUE,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id      TEXT NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  user_id      TEXT,                                   -- Build 7: ownership; nullable until FK to users
  customer_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 10),
  total_cents  INTEGER NOT NULL CHECK (total_cents >= 0),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  created_at   TEXT NOT NULL,   
  cancelled_at TEXT             
);

-- Helpful read index for the booking look-up flow used by services.
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);
CREATE INDEX IF NOT EXISTS idx_bookings_tier ON bookings(tier_id);
CREATE INDEX IF NOT EXISTS idx_tiers_event ON ticket_tiers(event_id);