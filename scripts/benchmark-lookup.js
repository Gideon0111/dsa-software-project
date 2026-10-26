import { performance } from "node:perf_hooks";
import { newReference } from "../src/domain/ids.js";

const SIZES = [1_000, 10_000, 100_000];
const LOOKUPS = 1_000; 
const RUNS = 5; 

function makeBookings(count) {
  const references = new Set(); 
  while (references.size < count) references.add(newReference());
  return [...references].map((reference, i) => ({ reference, customerName: `customer-${i}`, quantity: 1 }));
}

function pickRandom(items, count) {
  return Array.from({ length: count }, () => items[Math.floor(Math.random() * items.length)]);
}

function bestTime(fn, runs = RUNS) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const rows = [];
for (const size of SIZES) {
  const bookings = makeBookings(size);
  const byReference = new Map(bookings.map((b) => [b.reference, b]));
  const targets = pickRandom(bookings, LOOKUPS).map((b) => b.reference);

  const scan = () => {
    let hits = 0;
    for (const ref of targets) if (bookings.find((b) => b.reference === ref)) hits++;
    if (hits !== LOOKUPS) throw new Error("Array.find missed a booking");
  };
  const hash = () => {
    let hits = 0;
    for (const ref of targets) if (byReference.get(ref)) hits++;
    if (hits !== LOOKUPS) throw new Error("Map.get missed a booking");
  };

  scan(); 
  hash();
  const arrayMs = bestTime(scan);
  const mapMs = bestTime(hash);

  rows.push({
    bookings: size.toLocaleString("en-US"),
    "Array.find (ms)": Number(arrayMs.toFixed(2)),
    "Map.get (ms)": Number(mapMs.toFixed(3)),
    "Map is x faster": Math.round(arrayMs / mapMs),
  });
}

console.log(`\nTime for ${LOOKUPS.toLocaleString("en-US")} random lookups by booking reference (best of ${RUNS} runs)\n`);
console.table(rows);
console.log(`
How to read this:
- Array.find checks bookings one by one: O(n). 10x more bookings means roughly 10x more time.
- Map.get hashes the key and jumps straight to it: O(1) on average. Time stays almost flat.
`);