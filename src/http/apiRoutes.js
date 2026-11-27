import { requireUser, requireRole } from "./guards.js";

//Register authentication routes on the router.
//Auth routes (signup, login, me) are registered separately via registerAuthRoutes(). 
export function registerApiRoutes(router, eventService, bookingService) {
  // ── Events ──
  router.post("/api/events", async ({ req, body }) => {
    requireUser(req);
    requireRole("organizer")(req);
    const event = await eventService.createEvent({
      ...body,
      organizerId: req.user.id,
    });
    return { status: 201, body: { event } };
  });

  router.post("/api/events/:id/tiers", async ({ req, params, body }) => {
    requireUser(req);
    requireRole("organizer")(req);
    const tier = await eventService.addTier(params.id, body, req.user.id);
    return { status: 201, body: { tier } };
  });

  router.post("/api/events/:id/publish", async ({ req, params }) => {
    requireUser(req);
    requireRole("organizer")(req);
    const event = await eventService.publishEvent(params.id, req.user.id);
    return { status: 200, body: { event } };
  });

  router.post("/api/events/:id/unpublish", async ({ req, params }) => {
    requireUser(req);
    requireRole("organizer")(req);
    const event = await eventService.unpublishEvent(params.id, req.user.id);
    return { status: 200, body: { event } };
  });

  router.get("/api/events", async ({ query }) => {
    const criteria = {};
    if (query.has("q")) criteria.q = query.get("q");
    if (query.has("city")) criteria.city = query.get("city");
    if (query.has("from")) criteria.from = query.get("from");
    if (query.has("to")) criteria.to = query.get("to");
    if (query.has("maxPriceCents")) criteria.maxPriceCents = Number(query.get("maxPriceCents"));
    if (query.get("onlyAvailable") === "true") criteria.onlyAvailable = true;
    const sortBy = query.get("sortBy") || "date";
    const events = await eventService.searchEvents(criteria, sortBy);
    return { status: 200, body: { events } };
  });

  // NEW: single event with its tiers (the frontend's getEvent() calls this).
  router.get("/api/events/:id", async ({ params }) => {
    const event = await eventService.getEventDetail(params.id);
    return { status: 200, body: { event } };
  });

  // ── Bookings ──
  router.post("/api/bookings", async ({ req, body }) => {
    requireUser(req);
    const booking = await bookingService.bookTickets({
      ...body,
      userId: req.user.id,
    });
    return { status: 201, body: { booking } };
  });

  router.post("/api/bookings/:reference/pay", async ({ req, params, body }) => {
    requireUser(req);
    const booking = await bookingService.payBooking(params.reference, req.user.id, {
      shouldDecline: body?.shouldDecline === true,
    });
    return { status: 200, body: { booking } };
  });

  router.post("/api/bookings/:reference/cancel", async ({ req, params }) => {
    requireUser(req);
    const result = await bookingService.cancelBooking(params.reference, req.user.id);
    return { status: 200, body: result };
  });
}