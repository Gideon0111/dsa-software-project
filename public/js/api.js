const API_BASE = "";
const DELAY_MS = 350; // only used by the mock, to imitate network latency

// NEW: probe the backend once, when the module loads.
async function backendIsReachable() {
  if (typeof window === "undefined") return false; 
  try {
    const res = await fetch(`${API_BASE}/health`, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === "ok";
  } catch {
    return false;
  }
}
const USE_MOCK = !(await backendIsReachable());
if (typeof window !== "undefined") {
  console.info(USE_MOCK
    ? "[api] Backend not reachable on this origin: using MOCK data. Open http://localhost:3000 (npm start) to use the real API."
    : "[api] Connected to the real backend.");
}

const mockData = USE_MOCK ? await import("./mockData.js") : { events: [] };

function getUserId() {
  try {
    let id = localStorage.getItem("ticketing_user_id");
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem("ticketing_user_id", id);
    }
    return id;
  } catch {
    return "web-anonymous";
  }
}
export class ApiError extends Error {
  constructor({ code, message, status }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newReference() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 10; attempt++) {
    let ref = "";
    for (let g = 0; g < 2; g++) {
      let group = "";
      for (let i = 0; i < 4; i++) group += alphabet[Math.floor(Math.random() * alphabet.length)];
      ref += g === 0 ? group : `-${group}`;
    }
    if (!mockBookings.has(ref)) return ref;
  }
  throw new ApiError({
    code: "CONFLICT",
    message: "Could not generate a unique booking reference",
    status: 409,
  });
}

const SESSION_KEY_BOOKINGS = "ticketing_mock_bookings";
const SESSION_KEY_TIER_STATE = "ticketing_mock_tier_state";

function loadFromSession(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

const tierState = new Map();
const initialTierState = [];
for (const event of mockData.events) {
  for (const tier of event.tiers) {
    initialTierState.push({
      id: tier.id,
      capacity: tier.capacity,
      priceCents: tier.priceCents,
      name: tier.name,
      sold: tier.sold,
      originalSold: tier.sold,
    });
  }
}
const savedTierState = loadFromSession(SESSION_KEY_TIER_STATE, null);
if (savedTierState) {
  for (const s of savedTierState) tierState.set(s.id, s);
} else {
  for (const s of initialTierState) tierState.set(s.id, s);
}
const mockBookings = new Map();
const savedBookings = loadFromSession(SESSION_KEY_BOOKINGS, null);
if (savedBookings && typeof savedBookings === "object") {
  for (const [ref, booking] of Object.entries(savedBookings)) {
    mockBookings.set(ref, booking);
  }
}

/** Save mutable mock state to sessionStorage after every mutation. */
function persistMockState() {
  saveToSession(SESSION_KEY_TIER_STATE, [...tierState.values()]);
  const bookingsObj = {};
  for (const [ref, booking] of mockBookings.entries()) {
    bookingsObj[ref] = booking;
  }
  saveToSession(SESSION_KEY_BOOKINGS, bookingsObj);
}
function resetMockState() {
  for (const state of tierState.values()) state.sold = state.originalSold;
  mockBookings.clear();
  persistMockState();
}

function summaryOf(event) {
  let minPriceCents = null;
  let seatsAvailable = 0;
  for (const tier of event.tiers) {
    const s = tierState.get(tier.id);
    if (s) {
      if (minPriceCents === null || s.priceCents < minPriceCents) minPriceCents = s.priceCents;
      seatsAvailable += s.capacity - s.sold;
    }
  }
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    minPriceCents,
    seatsAvailable,
    tierCount: event.tiers.length,
  };
}

function detailOf(event) {
  const tiers = event.tiers.map((tier) => {
    const s = tierState.get(tier.id);
    return {
      id: tier.id,
      eventId: event.id,
      name: tier.name,
      priceCents: tier.priceCents,
      capacity: tier.capacity,
      sold: s ? s.sold : 0,
      available: s ? s.capacity - s.sold : 0,
    };
  });
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    description: event.description,
    tiers,
  };
}

function matchSearch(event, { q, city, maxPriceCents }) {
  if (q) {
    const text = q.toLowerCase();
    if (!event.title.toLowerCase().includes(text) && !event.venue.toLowerCase().includes(text)) {
      return false;
    }
  }
  if (city && event.city.toLowerCase() !== city.toLowerCase()) return false;
  if (maxPriceCents != null) {
    let min = null;
    for (const tier of event.tiers) {
      const s = tierState.get(tier.id);
      const price = s ? s.priceCents : tier.priceCents;
      if (min === null || price < min) min = price;
    }
    if (min === null || min > maxPriceCents) return false;
  }
  return true;
}

function sortSummary(list, sortBy) {
  return [...list].sort((a, b) => {
    if (sortBy === "date") {
      return Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title);
    }
    if (sortBy === "price") {
      const pa = a.minPriceCents ?? Infinity;
      const pb = b.minPriceCents ?? Infinity;
      if (pa === pb) return a.title.localeCompare(b.title);
      return pa - pb;
    }
    if (sortBy === "availability") {
      return b.seatsAvailable - a.seatsAvailable || a.title.localeCompare(b.title);
    }
    return 0;
  });
}

async function request(path, { method = "GET", body } = {}) {
  // ── Real API branch (fetch) ──────────────────────────────────────────
  if (!USE_MOCK) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-user-id": getUserId(), 
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new ApiError({
        code: (data && data.error && data.error.code) || "INTERNAL",
        message: (data && data.error && data.error.message) || "Request failed",
        status: res.status,
      });
    }
    return data;
  }

  // ── Mock implementation ──────────────────────────────────────────────
  await delay(DELAY_MS); 
  const url = new URL(path, "http://localhost");

  if (url.pathname === "/api/events" && method === "GET") {
    const q = url.searchParams.get("q") || undefined;
    const city = url.searchParams.get("city") || undefined;
    const maxPriceCents = url.searchParams.get("maxPriceCents")
      ? Number(url.searchParams.get("maxPriceCents"))
      : undefined;
    const sortBy = url.searchParams.get("sortBy") || "date";

    let result = mockData.events
      .filter((e) => matchSearch(e, { q, city, maxPriceCents }))
      .map(summaryOf);
    result = sortSummary(result, sortBy);
    return { events: result };
  }

  const eventMatch = path.match(/^\/api\/events\/([^\/]+)$/);
  if (eventMatch && method === "GET") {
    const event = mockData.events.find((e) => e.id === eventMatch[1]);
    if (!event) {
      throw new ApiError({ code: "NOT_FOUND", message: "Event not found", status: 404 });
    }
    return { event: detailOf(event) };
  }

  if (url.pathname === "/api/bookings" && method === "POST") {
    const { tierId, quantity, customerName } = body || {};
    const event = mockData.events.find((e) => e.tiers.some((t) => t.id === tierId));
    if (!event) {
      throw new ApiError({ code: "NOT_FOUND", message: "Ticket tier not found", status: 404 });
    }
    const tier = event.tiers.find((t) => t.id === tierId);
    const s = tierState.get(tierId);
    const available = s ? s.capacity - s.sold : 0;

    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new ApiError({
        code: "VALIDATION",
        message: "quantity: must be a whole number from 1 to 10",
        status: 400,
      });
    }
    if (quantity > available) {
      throw new ApiError({
        code: "SOLD_OUT",
        message: `Only ${available} ticket(s) left in "${tier.name}", you asked for ${quantity}`,
        status: 409,
      });
    }

    const reference = newReference();
    const totalCents = tier.priceCents * quantity;
    const booking = {
      id: `booking-${reference}`,
      reference,
      eventId: event.id,
      tierId,
      customerName,
      quantity,
      totalCents,
      status: "pending",
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    };
    s.sold += quantity;
    mockBookings.set(reference, booking);
    persistMockState();
    return { booking: { ...booking } };
  }

  const payMatch = path.match(/^\/api\/bookings\/([^\/]+)\/pay$/);
  if (payMatch && method === "POST") {
    const reference = payMatch[1].toUpperCase();
    const booking = mockBookings.get(reference);
    if (!booking) {
      throw new ApiError({ code: "NOT_FOUND", message: "Booking not found", status: 404 });
    }
    if (booking.status === "paid") {
      throw new ApiError({
        code: "INVALID_TRANSITION",
        message: "The booking is already paid",
        status: 409,
      });
    }
    if (booking.status !== "pending") {
      throw new ApiError({
        code: "INVALID_TRANSITION",
        message: "A non-pending booking cannot be paid",
        status: 409,
      });
    }
    if (body && body.shouldDecline === true) {
      throw new ApiError({
        code: "PAYMENT_DECLINED",
        message: "Your mock card was declined. The booking stays pending and you can try again.",
        status: 402,
      });
    }
    booking.status = "paid";
    persistMockState();
    return { booking: { ...booking } };
  }

  const cancelMatch = path.match(/^\/api\/bookings\/([^\/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const reference = cancelMatch[1].toUpperCase();
    const booking = mockBookings.get(reference);
    if (!booking) {
      throw new ApiError({ code: "NOT_FOUND", message: "Booking not found", status: 404 });
    }
    if (booking.status !== "pending") {
      throw new ApiError({
        code: "INVALID_TRANSITION",
        message: `A ${booking.status} booking cannot be cancelled. Only pending bookings can be cancelled.`,
        status: 409,
      });
    }
    const s = tierState.get(booking.tierId);
    if (s) s.sold -= booking.quantity; 
    booking.status = "cancelled";
    booking.cancelledAt = new Date().toISOString();
    persistMockState();
    return { booking: { ...booking }, seatsAvailable: s ? s.capacity - s.sold : 0, nextInLine: null };
  }

  throw new ApiError({ code: "NOT_FOUND", message: "No such API route", status: 404 });
}

export async function listEvents(criteria = {}) {
  const qs = new URLSearchParams();
  if (criteria.q) qs.set("q", criteria.q);
  if (criteria.city) qs.set("city", criteria.city);
  if (criteria.maxPriceCents != null) qs.set("maxPriceCents", String(criteria.maxPriceCents));
  if (criteria.sortBy) qs.set("sortBy", criteria.sortBy);
  return request(`/api/events?${qs}`);
}

export async function getEvent(id) {
  return request(`/api/events/${encodeURIComponent(id)}`);
}

export async function createBooking(data) {
  return request("/api/bookings", { method: "POST", body: data });
}

export async function pay(data) {
  return request(`/api/bookings/${encodeURIComponent(data.reference)}/pay`, {
    method: "POST",
    body: { shouldDecline: data.shouldDecline === true },
  });
}

//cancel a pending booking and release its seats. 
export async function cancelBooking(reference) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method: "POST" });
}

export { resetMockState };