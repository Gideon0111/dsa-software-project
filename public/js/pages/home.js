// import { el, formatCurrency } from "../ui.js";
// import { listEvents } from "../api.js";

// const eventsContainer = document.getElementById("events");
// const loading = document.getElementById("loading");
// const empty = document.getElementById("empty");
// const errorEl = document.getElementById("error");
// const searchInput = document.getElementById("search");
// const citySelect = document.getElementById("city");
// const maxPriceInput = document.getElementById("maxPrice");
// const sortSelect = document.getElementById("sortBy");
// const applyBtn = document.getElementById("applyFilters");

// let events = [];

// function showError(message) {
//   errorEl.textContent = message;
//   errorEl.classList.remove("hidden");
// }
// function hideError() {
//   errorEl.classList.add("hidden");
// }

// function formatDate(iso) {
//   return new Date(iso).toLocaleDateString(undefined, {
//     day: "numeric",
//     month: "short",
//     year: "numeric",
//   });
// }

// function renderCard(event) {
//   const minPrice =
//     event.minPriceCents === null ? null : formatCurrency(event.minPriceCents);
//   const seats = event.seatsAvailable;
//   return el(
//     "a",
//     {
//       href: `/event.html?id=${encodeURIComponent(event.id)}`,
//       class: "card",
//       "aria-label": `View ${event.title}`,
//     },
//     [
//       el("h2", {}, event.title),
//       el(
//         "div",
//         { class: "meta" },
//         [
//           el("span", {}, event.city),
//           el("span", { class: "divider", "aria-hidden": true }, "·"),
//           el("span", {}, formatDate(event.startsAt)),
//         ]
//       ),
//       minPrice
//         ? el("div", { class: "price" }, `From ${minPrice}`)
//         : null,
//       el(
//         "div",
//         { class: "seats" },
//         `${seats} seat${seats === 1 ? "" : "s"} left`
//       ),
//       el(
//         "div",
//         { class: "actions" },
//         [el("button", { type: "button", class: "primary" }, "Choose tickets")]
//       ),
//     ]
//   );
// }

// function render() {
//   eventsContainer.replaceChildren();
//   if (events.length === 0) {
//     empty.classList.remove("hidden");
//     return;
//   }
//   empty.classList.add("hidden");
//   for (const event of events) {
//     eventsContainer.appendChild(renderCard(event));
//   }
// }

// function populateCities(fetched) {
//   const citySet = new Set();
//   for (const e of fetched) citySet.add(e.city);
//   const cities = [...citySet].sort();
//   citySelect.replaceChildren(el("option", { value: "" }, "All cities"));
//   for (const city of cities) {
//     citySelect.appendChild(el("option", { value: city }, city));
//   }
// }

// async function load() {
//   loading.classList.remove("hidden");
//   hideError();
//   try {
//     const { events: fetched } = await listEvents({});
//     events = fetched;
//     populateCities(fetched);
//     render();
//   } catch (err) {
//     showError(err.message || "Unable to load events. Try again later.");
//   } finally {
//     loading.classList.add("hidden");
//   }
// }

// function getCriteria() {
//   const q = searchInput.value.trim() || undefined;
//   const city = citySelect.value || undefined;
//   let maxPriceCents = undefined;
//   const raw = maxPriceInput.value.trim();
//   if (raw !== "") {
//     const naira = Number(raw);
//     if (!Number.isFinite(naira) || naira < 0) {
//       throw new Error("Maximum price must be a valid number");
//     }
//     // Convert naira to whole cents using integer math (no floating-point money math).
//     maxPriceCents = Math.round(naira * 100);
//   }
//   const sortBy = sortSelect.value;
//   return { q, city, maxPriceCents, sortBy };
// }

// async function applyFilters() {
//   try {
//     const criteria = getCriteria();
//     loading.classList.remove("hidden");
//     hideError();
//     const { events: fetched } = await listEvents(criteria);
//     events = fetched;
//     render();
//   } catch (err) {
//     showError(err.message || "Unable to apply filters.");
//   } finally {
//     loading.classList.add("hidden");
//   }
// }

// applyBtn.addEventListener("click", applyFilters);

// // Safety net: always hide the loading spinner, even if an import or
// // top-level error prevents load() from running.
// window.addEventListener("error", () => {
//   loading.classList.add("hidden");
// });

// // Kick off loading and make sure the spinner always resolves, even if a
// // module import or promise fails silently.
// load().catch((err) => {
//   showError(err.message || "Unable to load events. Try again later.");
//   loading.classList.add("hidden");
// });


import { el, formatCurrency } from "../ui.js";
import { listEvents } from "../api.js";

const eventsContainer = document.getElementById("events");
const loading = document.getElementById("loading");
const empty = document.getElementById("empty");
const errorEl = document.getElementById("error");
const searchInput = document.getElementById("search");
const citySelect = document.getElementById("city");
const maxPriceInput = document.getElementById("maxPrice");
const sortSelect = document.getElementById("sortBy");
const applyBtn = document.getElementById("applyFilters");

let events = [];

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}
function hideError() {
  errorEl.classList.add("hidden");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderCard(event) {
  const minPrice =
    event.minPriceCents === null ? null : formatCurrency(event.minPriceCents);
  const seats = event.seatsAvailable;
  return el(
    "a",
    {
      // FIX: relative link (was "/event.html?...") so it also works under Live Server,
      // where the site root is NOT the /public folder.
      href: `event.html?id=${encodeURIComponent(event.id)}`,
      class: "card",
      "aria-label": `View ${event.title}`,
    },
    [
      el("h2", {}, event.title),
      el(
        "div",
        { class: "meta" },
        [
          el("span", {}, event.city),
          el("span", { class: "divider", "aria-hidden": true }, "·"),
          el("span", {}, formatDate(event.startsAt)),
        ]
      ),
      minPrice
        ? el("div", { class: "price" }, `From ${minPrice}`)
        : null,
      el(
        "div",
        { class: "seats" },
        `${seats} seat${seats === 1 ? "" : "s"} left`
      ),
      el(
        "div",
        { class: "actions" },
        // FIX: <span> instead of <button>; a button nested inside <a> is invalid HTML.
        [el("span", { class: "cta" }, "Choose tickets")]
      ),
    ]
  );
}

function render() {
  eventsContainer.replaceChildren();
  if (events.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  for (const event of events) {
    eventsContainer.appendChild(renderCard(event));
  }
}

function populateCities(fetched) {
  const citySet = new Set();
  for (const e of fetched) citySet.add(e.city);
  const cities = [...citySet].sort();
  citySelect.replaceChildren(el("option", { value: "" }, "All cities"));
  for (const city of cities) {
    citySelect.appendChild(el("option", { value: city }, city));
  }
}

async function load() {
  loading.classList.remove("hidden");
  hideError();
  try {
    const { events: fetched } = await listEvents({});
    events = fetched;
    populateCities(fetched);
    render();
  } catch (err) {
    showError(err.message || "Unable to load events. Try again later.");
  } finally {
    loading.classList.add("hidden");
  }
}

function getCriteria() {
  const q = searchInput.value.trim() || undefined;
  const city = citySelect.value || undefined;
  let maxPriceCents = undefined;
  const raw = maxPriceInput.value.trim();
  if (raw !== "") {
    const naira = Number(raw);
    if (!Number.isFinite(naira) || naira < 0) {
      throw new Error("Maximum price must be a valid number");
    }
    // Convert naira to whole cents using integer math (no floating-point money math).
    maxPriceCents = Math.round(naira * 100);
  }
  const sortBy = sortSelect.value;
  return { q, city, maxPriceCents, sortBy };
}

async function applyFilters() {
  try {
    const criteria = getCriteria();
    loading.classList.remove("hidden");
    hideError();
    const { events: fetched } = await listEvents(criteria);
    events = fetched;
    render();
  } catch (err) {
    showError(err.message || "Unable to apply filters.");
  } finally {
    loading.classList.add("hidden");
  }
}

applyBtn.addEventListener("click", applyFilters);

// Safety net: always hide the loading spinner, even if an import or
// top-level error prevents load() from running.
window.addEventListener("error", () => {
  loading.classList.add("hidden");
});

// Kick off loading and make sure the spinner always resolves, even if a
// module import or promise fails silently.
load().catch((err) => {
  showError(err.message || "Unable to load events. Try again later.");
  loading.classList.add("hidden");
});
