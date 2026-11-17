import http from "node:http";
import { createApp } from "../src/http/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { charge } from "../src/lib/mockPaymentGateway.js";
import { registerApiRoutes } from "../src/http/apiRoutes.js";

/** Build the standard "x-user-id" authentication header for a user id. */
export function authHeaders(userId) {
  return { "x-user-id": String(userId) };
}

/** Low-level HTTP request against the running test server. */
export function makeRequest(port) {
  async function request(path, { method = "GET", body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path,
          method,
          headers: { "content-type": "application/json", ...headers },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (text += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, text }),
          );
        },
      );
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : "");
    });
  }

  /** Fetch and parse a JSON response. */
  async function json(path, opts = {}) {
    const res = await request(path, opts);
    const body = res.text ? JSON.parse(res.text) : null;
    return { status: res.status, headers: res.headers, body };
  }

  return { request, json };
}

export async function startTestServer() {
  const repository = createMemoryRepository();
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, { charge });

  const app = createApp({
    publicDir: "/tmp",
    maxBodyBytes: 1000,
    registerRoutes(router) {
      registerApiRoutes(router, eventService, bookingService);
    },
  });

  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const port = app.address().port;
  const { json } = makeRequest(port);

  return {
    app,
    port,
    json,
    async stop() {
      app.closeAllConnections();
      await new Promise((resolve) => app.close(resolve));
    },
  };
}

/* ──────────────────────────────────────────────────────────────
 * Fixtures: each helper creates fresh, independent API resources
 * through real HTTP calls so every test owns its own data.
 * ───────────────────────────────────────────────────────────── */

const DEFAULT_STARTS_AT = "2027-01-01T19:00:00Z";

export async function seedEvent(json, userId, overrides = {}) {
  const res = await json("/api/events", {
    method: "POST",
    headers: authHeaders(userId),
    body: {
      title: "Untitled Event",
      city: "Lagos",
      venue: "Hall",
      startsAt: DEFAULT_STARTS_AT,
      ...overrides,
    },
  });
  return res.body.event;
}

export async function seedTier(json, userId, eventId, overrides = {}) {
  const res = await json(`/api/events/${eventId}/tiers`, {
    method: "POST",
    headers: authHeaders(userId),
    body: {
      name: "General",
      priceCents: 1000,
      capacity: 5,
      ...overrides,
    },
  });
  return res.body.tier;
}

export async function seedPublishedEvent(json, userId, { tier: tierOverrides, ...eventOverrides } = {}) {
  const event = await seedEvent(json, userId, eventOverrides);
  const tier = await seedTier(json, userId, event.id, tierOverrides);
  const publishRes = await json(`/api/events/${event.id}/publish`, {
    method: "POST",
    headers: authHeaders(userId),
  });
  return { event: publishRes.body.event, tier };
}

export async function seedBooking(json, userId, tierId, overrides = {}) {
  const res = await json("/api/bookings", {
    method: "POST",
    headers: authHeaders(userId),
    body: {
      tierId,
      quantity: 1,
      customerName: "Customer",
      ...overrides,
    },
  });
  return res.body.booking;
}

export async function seedPaidBooking(json, userId, tierId, overrides = {}) {
  const booking = await seedBooking(json, userId, tierId, overrides);
  await json(`/api/bookings/${booking.reference}/pay`, {
    method: "POST",
    headers: authHeaders(userId),
    body: {},
  });
  return booking;
}

export async function seedCancelledBooking(json, userId, tierId) {
  const booking = await seedBooking(json, userId, tierId);
  await json(`/api/bookings/${booking.reference}/cancel`, {
    method: "POST",
    headers: authHeaders(userId),
  });
  return booking;
}
