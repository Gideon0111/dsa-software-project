import { DomainError } from "../src/domain/errors.js";
import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  cancelBooking,
  findBookingByReference,
  joinWaitlist,
  getTier,
  publishEvent,
  unpublishEvent,
  listEventSummaries,
} from "../src/domain/inventory.js";
import { searchEvents } from "../src/domain/eventSearch.js";

// Prices are stored as whole kobo (priceCents field). 100 kobo = 1 naira.
const money = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const heading = (text) => console.log(`\n=== ${text} ===`);
const say = (text) => console.log(`  ${text}`);

/** Run an action we EXPECT might be refused; print the refusal instead of crashing. */
function attempt(label, action) {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error; // a real bug: let it crash
    say(`REFUSED  ${label} -> [${error.code}] ${error.message}`);
    return null;
  }
}

const store = createStore();
let general;
const seats = () => {
  const t = getTier(store, general.id);
  return `${t.sold} sold, ${t.available} left, ${t.waitlistSize} waiting`;
};

heading("1. An organiser sets up an event (it starts as a DRAFT)");
const event = createEvent(store, {
  title: "Harbour Rock Night",
  city: "Lagos",
  venue: "Harbour Hall",
  startsAt: "2027-03-20T19:00:00Z",
});
say(`Event: ${event.title} at ${event.venue}, ${event.city}  [${event.status}]`);
say(`Public list now: ${listEventSummaries(store).length} event(s)`);
attempt("Publish with no ticket tiers", () => publishEvent(store, event.id));
attempt("Create an event on 30 February", () =>
  createEvent(store, { title: "Ghost Show", city: "Lagos", venue: "Nowhere", startsAt: "2027-02-30" }),
);
general = addTier(store, event.id, { name: "General", priceCents: 500000, capacity: 5 });
say(`Tier:  ${general.name}, ${money(general.priceCents)} each, ${general.capacity} seats`);
const published = publishEvent(store, event.id);
say(`Published -> status ${published.status}. Public list now: ${listEventSummaries(store).length} event(s)`);

heading("2. The event sells out");
const alice = bookTickets(store, { tierId: general.id, quantity: 3, customerName: "Alice" });
say(`Alice booked 3 = ${money(alice.totalCents)}  (ref ${alice.reference})`);
const bob = bookTickets(store, { tierId: general.id, quantity: 2, customerName: "Bob" });
say(`Bob booked 2   = ${money(bob.totalCents)}  (ref ${bob.reference})`);
say(`Now: ${seats()}`);

heading("3. A booking is refused, and nothing changes");
attempt("Carol wants 1 ticket", () => bookTickets(store, { tierId: general.id, quantity: 1, customerName: "Carol" }));
say(`Still: ${seats()}`);

heading("4. People join the waitlist (first in, first out)");
const carol = joinWaitlist(store, { tierId: general.id, name: "Carol", quantity: 1 });
const dan = joinWaitlist(store, { tierId: general.id, name: "Dan", quantity: 2 });
say(`${carol.name} joined at position ${carol.position}`);
say(`${dan.name} joined at position ${dan.position}`);

heading("5. Fast lookup by reference code");
const found = findBookingByReference(store, bob.reference.toLowerCase()); // case does not matter
say(`${bob.reference.toLowerCase()} -> ${found.customerName}, ${found.quantity} ticket(s), ${found.status}`);

heading("6. A booking is cancelled and the next person is named");
const result = cancelBooking(store, alice.reference);
say(`${result.booking.customerName} cancelled ${result.booking.quantity} ticket(s). Seats available: ${result.seatsAvailable}`);
say(`Next in line: ${result.nextInLine.name} (wants ${result.nextInLine.quantity})`);
say(`Now: ${seats()}`);

heading("7. Cancelling twice is an error");
attempt("Alice cancels again", () => cancelBooking(store, alice.reference));

heading("8. Attendees search, filter and sort published events");
function addPublished(fields, tier) {
  const e = createEvent(store, fields);
  addTier(store, e.id, tier);
  return publishEvent(store, e.id);
}
addPublished(
  { title: "Abuja Jazz Night", city: "Abuja", venue: "Transcorp Hall", startsAt: "2027-03-20T18:00:00Z" },
  { name: "General", priceCents: 300000, capacity: 200 },
);
addPublished(
  { title: "Lagos Tech Meetup", city: "Lagos", venue: "Landmark Centre", startsAt: "2027-02-10T10:00:00Z" },
  { name: "Standard", priceCents: 1000000, capacity: 80 },
);
createEvent(store, { title: "Secret Draft Party", city: "Lagos", venue: "TBA", startsAt: "2027-05-01T20:00:00Z" });

const showList = (label, list) => {
  say(`${label}:`);
  if (list.length === 0) say("   (nothing)");
  for (const e of list) {
    say(`   - ${e.title} | ${e.city} | ${e.startsAt.slice(0, 10)} | from ${e.minPriceCents === null ? "n/a" : money(e.minPriceCents)} | ${e.seatsAvailable} seats`);
  }
};
const all = listEventSummaries(store); // public events only: the draft is hidden
showList("All public events, by date", searchEvents(all, {}, "date"));
showList('Search "JAZZ"', searchEvents(all, { q: "JAZZ" }));
showList('City "lagos", cheapest first', searchEvents(all, { city: "lagos" }, "price"));
showList(`Max price ${money(500000)}, cheapest first`, searchEvents(all, { maxPriceCents: 500000 }, "price"));
showList("Up to 2027-03-20 (whole day included), by date", searchEvents(all, { to: "2027-03-20" }, "date"));
attempt("Sort by popularity", () => searchEvents(all, {}, "popularity"));
say(`The original list still has ${all.length} events (search never changes it)`);

heading("9. Unpublish takes an event off the public list");
unpublishEvent(store, event.id);
say(`Public list now: ${listEventSummaries(store).length} event(s)`);

console.log("\nDone.");