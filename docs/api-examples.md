# API Examples

All examples assume the server is running on `http://localhost:3000`.
Replace `USER_ID` with any string — it stands in for authentication until Build 7.

## 1. Create an event (organizer)

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"title":"Harbour Rock Night","city":"Lagos","venue":"Harbour Hall","startsAt":"2027-03-20T19:00:00Z"}'
```

## 2. Add a ticket tier

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"name":"General","priceCents":500000,"capacity":5}'
```

## 3. Publish the event

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H "x-user-id: USER_ID"
```

## 4. Unpublish the event

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/unpublish \
  -H "x-user-id: USER_ID"
```

## 5. Search, filter and sort events

```bash
# All published events, newest first
curl "http://localhost:3000/api/events?sortBy=date"

# Search by title or venue
curl "http://localhost:3000/api/events?q=jazz"

# Filter by city
curl "http://localhost:3000/api/events?city=Lagos"

# Maximum price, cheapest first
curl "http://localhost:3000/api/events?maxPriceCents=500000&sortBy=price"

# Only events with seats left
curl "http://localhost:3000/api/events?onlyAvailable=true"
```

## 6. Book tickets (attendee)

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"tierId":"TIER_ID","quantity":2,"customerName":"Alice"}'
```

The response includes a `reference` (e.g. `K7QM-3XPD`) — use it for pay and cancel.

## 7. Pay for a booking (mock payment)

```bash
# Successful payment
curl -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{}'

# Simulate a declined card (booking stays pending)
curl -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"shouldDecline":true}'
```

## 8. Cancel a booking (unpaid bookings only)

```bash
curl -X POST http://localhost:3000/api/bookings/REFERENCE/cancel \
  -H "x-user-id: USER_ID"
```

## Error shape

Every error returns the same JSON shape, with an HTTP status mapped from the error code:

```json
{"error":{"code":"VALIDATION","message":"title: must be a non-empty string"}}
```

| Code | Status | Meaning |
|------|--------|---------|
| VALIDATION | 400 | Bad input |
| NOT_FOUND | 404 | Event, tier or booking does not exist |
| SOLD_OUT | 409 | Not enough seats left |
| CONFLICT | 409 | Duplicate tier name |
| INVALID_STATE | 409 | Action not allowed in current state (e.g. publish without tiers) |
| INVALID_TRANSITION | 409 | Booking state move not allowed (e.g. pay a cancelled booking, or act on someone else's booking) |
| PAYMENT_DECLINED | 402 | Mock card was declined; booking stays pending |