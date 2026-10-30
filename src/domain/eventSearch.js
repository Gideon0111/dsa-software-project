import { DomainError, ErrorCode } from "./errors.js";
import { parseRealDate } from "./dates.js";
import { mergeSort } from "./sorting.js";

export const SortBy = Object.freeze({
  DATE: "date",
  PRICE: "price",
  AVAILABILITY: "availability",
});

function invalid(field, message) {
  return new DomainError(ErrorCode.VALIDATION, `${field}: ${message}`, { field });
}

function requireList(summaries) {
  if (!Array.isArray(summaries)) throw invalid("summaries", "must be an array");
}

function optionalText(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw invalid(field, "must be a string");
  return value.trim().toLowerCase();
}

function optionalDate(value, field, options) {
  if (value === undefined || value === null || value === "") return null;
  return parseRealDate(value, field, options);
}

function optionalPrice(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(field, "must be a whole number, 0 or more");
  return value;
}

/** Keep only the events that match every given criterion. Returns a NEW list. */
export function filterEvents(summaries, criteria = {}) {
  requireList(summaries);
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria ?? {};

  // Validate and normalise ONCE, before looping over the events.
  const text = optionalText(q, "q");
  const wantedCity = optionalText(city, "city");
  const fromMs = optionalDate(from, "from", {});
  const toMs = optionalDate(to, "to", { endOfDay: true });
  const maxPrice = optionalPrice(maxPriceCents, "maxPriceCents");
  const mustHaveSeats = onlyAvailable === true;

  return summaries.filter((e) => {
    if (text !== null && !`${e.title}`.toLowerCase().includes(text) && !`${e.venue}`.toLowerCase().includes(text)) {
      return false;
    }
    if (wantedCity !== null && `${e.city}`.toLowerCase() !== wantedCity) return false;

    if (fromMs !== null || toMs !== null) {
      const when = Date.parse(e.startsAt);
      if (fromMs !== null && when < fromMs) return false;
      if (toMs !== null && when > toMs) return false;
    }
    if (maxPrice !== null && (e.minPriceCents === null || e.minPriceCents > maxPrice)) return false;
    if (mustHaveSeats && !(e.seatsAvailable > 0)) return false;
    return true;
  });
}

const byTitleThenId = (a, b) => {
  const byTitle = `${a.title}`.localeCompare(`${b.title}`, "en", { sensitivity: "base" });
  if (byTitle !== 0) return byTitle;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const COMPARATORS = {
  [SortBy.DATE]: (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || byTitleThenId(a, b),
  [SortBy.PRICE]: (a, b) => {
    // No price (no tiers) goes last.
    const pa = a.minPriceCents ?? Infinity;
    const pb = b.minPriceCents ?? Infinity;
    if (pa === pb) return byTitleThenId(a, b);
    return pa < pb ? -1 : 1;
  },
  [SortBy.AVAILABILITY]: (a, b) => b.seatsAvailable - a.seatsAvailable || byTitleThenId(a, b),
};

/** Sort by 'date', 'price' or 'availability'. Returns a NEW list. */
export function sortEvents(summaries, sortBy = SortBy.DATE) {
  requireList(summaries);
  if (!Object.hasOwn(COMPARATORS, sortBy)) {
    throw invalid("sortBy", `must be one of: ${Object.values(SortBy).join(", ")}`);
  }
  return mergeSort(summaries, COMPARATORS[sortBy]);
}

/** Filter first (shrinks the list), then sort what is left. */
export function searchEvents(summaries, criteria = {}, sortBy = SortBy.DATE) {
  requireList(summaries);
  if (!Object.hasOwn(COMPARATORS, sortBy)) {
    throw invalid("sortBy", `must be one of: ${Object.values(SortBy).join(", ")}`);
  }
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}