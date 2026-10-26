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
} from "../src/domain/inventory.js";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
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

heading("1. An organiser sets up an event");
const event = createEvent(store, { name: "Harbour Rock Night", startsAt: "2027-03-20T19:00:00Z", location: "Harbour Hall" });
general = addTier(store, event.id, { name: "General", priceCents: 5000, capacity: 5 });
say(`Event: ${event.name} at ${event.location}`);
say(`Tier:  ${general.name}, ${money(general.priceCents)} each, ${general.capacity} seats`);

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

console.log("\nDone.");