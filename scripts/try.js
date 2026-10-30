import { createStore, createEvent, addTier, publishEvent } from "../src/domain/inventory.js";

const store = createStore();
const e = createEvent(store, { title: "My Show", city: "Lagos", venue: "Hall A", startsAt: "2027-06-01T18:00:00Z" });
addTier(store, e.id, { name: "General", priceCents: 500000, capacity: 100 });
console.log(publishEvent(store, e.id));