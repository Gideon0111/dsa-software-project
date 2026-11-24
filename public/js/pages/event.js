// import { el, formatCurrency } from "../ui.js";
// import { getEvent, createBooking } from "../api.js";

// const urlParams = new URLSearchParams(window.location.search);
// const eventId = urlParams.get("id");

// const detailSection = document.getElementById("event-detail");
// const loading = document.getElementById("loading");
// const empty = document.getElementById("empty");
// const errorEl = document.getElementById("error");
// const tiersContainer = document.getElementById("tiers");
// const bookErrorEl = document.getElementById("bookError");

// function showError(message) {
//   errorEl.textContent = message;
//   errorEl.classList.remove("hidden");
// }
// function hideError() {
//   errorEl.classList.add("hidden");
// }
// function showBookError(message) {
//   bookErrorEl.textContent = message;
//   bookErrorEl.classList.remove("hidden");
// }
// function hideBookError() {
//   bookErrorEl.classList.add("hidden");
// }

// function formatDate(iso) {
//   return new Date(iso).toLocaleString(undefined, {
//     day: "numeric",
//     month: "short",
//     year: "numeric",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// function renderTiers(event) {
//   tiersContainer.replaceChildren();
//   tiersContainer.appendChild(el("h2", {}, "Select Tickets"));

//   const nameField = el(
//     "div",
//     { class: "field", style: "max-width: 340px; margin-bottom: 1rem;" },
//     [
//       el("label", { for: "attendeeName" }, "Attendee name"),
//       el("input", {
//         id: "attendeeName",
//         type: "text",
//         required: true,
//         placeholder: "Your full name",
//       }),
//     ]
//   );
//   tiersContainer.appendChild(nameField);

//   const tierList = el("div", { class: "tier-list" });
//   for (const tier of event.tiers) {
//     const available = tier.capacity - tier.sold;
//     const soldOut = available <= 0;

//     const card = el(
//       "article",
//       { class: "tier-card" },
//       [
//         el("div", { class: "tier-info" }, [
//           el("h3", {}, tier.name),
//           el("p", {}, `${formatCurrency(tier.priceCents)} per ticket`),
//         ]),
//         el("div", { class: "tier-meta" }, [
//           el("div", {}, `Seats left: ${available}`),
//         ]),
//         el("div", { class: "tier-actions" }, [
//           soldOut
//             ? el("span", { class: "tier-soldout" }, "Sold out")
//             : el("div", { class: "quantity-group" }, [
//                 el("label", { for: `qty-${tier.id}` }, "Quantity"),
//                 el("input", {
//                   id: `qty-${tier.id}`,
//                   type: "number",
//                   min: 1,
//                   max: Math.min(10, available),
//                   value: 1,
//                 }),
//                 el("button", {
//                   type: "button",
//                   class: "primary",
//                   "data-tier": tier.id,
//                   "data-event": event.id,
//                   "data-available": available,
//                   "data-price": tier.priceCents,
//                   "data-name": tier.name,
//                 }, "Book"),
//               ]),
//         ]),
//       ]
//     );
//     tierList.appendChild(card);
//   }
//   tiersContainer.appendChild(tierList);
// }

// async function load() {
//   if (!eventId) {
//     showError("No event specified.");
//     return;
//   }
//   loading.classList.remove("hidden");
//   hideError();
//   hideBookError();
//   try {
//     const { event } = await getEvent(eventId);
//     document.title = `${event.title} — Event Ticketing`;
//     document.getElementById("event-title").textContent = event.title;
//     document.getElementById("event-city").textContent = event.city;
//     document.getElementById("event-venue").textContent = event.venue;
//     document.getElementById("event-date").textContent = formatDate(
//       event.startsAt
//     );
//     document.getElementById(
//       "event-description"
//     ).textContent = event.description || "No description available.";
//     renderTiers(event);
//     detailSection.classList.remove("hidden");
//   } catch (err) {
//     showError(err.message || "Unable to load event.");
//   } finally {
//     loading.classList.add("hidden");
//   }
// }

// tiersContainer.addEventListener("click", async (evt) => {
//   const btn = evt.target.closest("button[data-tier]");
//   if (!btn) return;

//   const tierId = btn.dataset.tier;
//   const available = Number(btn.dataset.available);
//   const priceCents = Number(btn.dataset.price);
//   const tierName = btn.dataset.name;

//   const qtyInput = document.getElementById(`qty-${tierId}`);
//   let quantity = qtyInput ? Number(qtyInput.value) : 1;
//   if (!Number.isInteger(quantity) || quantity < 1) quantity = 1;
//   if (quantity > 10) quantity = 10;
//   if (quantity > available) quantity = available;
//   if (qtyInput) qtyInput.value = quantity;

//   const customerName =
//     document.getElementById("attendeeName")?.value.trim() || "";
//   if (!customerName) {
//     showBookError("Please enter your name before booking.");
//     return;
//   }
//   hideBookError();

//   btn.disabled = true;
//   const originalText = btn.textContent;
//   btn.textContent = "Booking…";

//   try {
//     const { booking } = await createBooking({
//       tierId,
//       quantity,
//       customerName,
//     });

//     // Pass the booking to the checkout page via session storage.
//     sessionStorage.setItem(
//       "pendingCheckout",
//       JSON.stringify({
//         reference: booking.reference,
//         eventTitle: document.getElementById("event-title").textContent,
//         tierName,
//         quantity: booking.quantity,
//         totalCents: booking.totalCents,
//         tierPriceCents: priceCents,
//       })
//     );
//     window.location.href = "/checkout.html";
//   } catch (err) {
//     showBookError(err.message || "Unable to create booking. Try again.");
//   } finally {
//     btn.disabled = false;
//     btn.textContent = originalText;
//   }
// });

// load().catch((err) => {
//   showError(err.message || "Unable to load event.");
//   loading.classList.add("hidden");
// });



import { el, formatCurrency } from "../ui.js";
import { getEvent, createBooking, ApiError } from "../api.js";

const HOLD_MS = 10 * 60 * 1000; // NEW: seat hold length (10 minutes), shared with checkout via sessionStorage

const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get("id");

const detailSection = document.getElementById("event-detail");
const loading = document.getElementById("loading");
const empty = document.getElementById("empty");
const errorEl = document.getElementById("error");
const tiersContainer = document.getElementById("tiers");
const bookErrorEl = document.getElementById("bookError");

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}
function hideError() {
  errorEl.classList.add("hidden");
}
function showBookError(message) {
  bookErrorEl.textContent = message;
  bookErrorEl.classList.remove("hidden");
}
function hideBookError() {
  bookErrorEl.classList.add("hidden");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTiers(event) {
  tiersContainer.replaceChildren();
  // FIX: removed a second <h2>Select Tickets</h2>; event.html already has one.

  const nameField = el(
    "div",
    { class: "field", style: "max-width: 340px; margin-bottom: 1rem;" },
    [
      el("label", { for: "attendeeName" }, "Attendee name"),
      el("input", {
        id: "attendeeName",
        type: "text",
        required: true,
        placeholder: "Your full name",
      }),
    ]
  );
  tiersContainer.appendChild(nameField);

  const tierList = el("div", { class: "tier-list" });
  for (const tier of event.tiers) {
    const available = tier.capacity - tier.sold;
    const soldOut = available <= 0;

    const card = el(
      "article",
      { class: "tier-card" },
      [
        el("div", { class: "tier-info" }, [
          el("h3", {}, tier.name),
          el("p", {}, `${formatCurrency(tier.priceCents)} per ticket`),
        ]),
        el("div", { class: "tier-meta" }, [
          el("div", {}, `Seats left: ${available}`),
        ]),
        el("div", { class: "tier-actions" }, [
          soldOut
            ? el("span", { class: "tier-soldout" }, "Sold out")
            : el("div", { class: "quantity-group" }, [
                el("label", { for: `qty-${tier.id}` }, "Quantity"),
                el("input", {
                  id: `qty-${tier.id}`,
                  type: "number",
                  min: 1,
                  max: Math.min(10, available),
                  value: 1,
                }),
                el("button", {
                  type: "button",
                  class: "primary",
                  "data-tier": tier.id,
                  "data-event": event.id,
                  "data-available": available,
                  "data-price": tier.priceCents,
                  "data-name": tier.name,
                }, "Book"),
              ]),
        ]),
      ]
    );
    tierList.appendChild(card);
  }
  tiersContainer.appendChild(tierList);
}

async function load() {
  if (!eventId) {
    showError("No event specified.");
    loading.classList.add("hidden"); // FIX: the spinner used to stay on screen here
    return;
  }
  loading.classList.remove("hidden");
  hideError();
  hideBookError();
  try {
    const { event } = await getEvent(eventId);
    document.title = `${event.title} — Event Ticketing`;
    document.getElementById("event-title").textContent = event.title;
    document.getElementById("event-city").textContent = event.city;
    document.getElementById("event-venue").textContent = event.venue;
    document.getElementById("event-date").textContent = formatDate(
      event.startsAt
    );
    document.getElementById(
      "event-description"
    ).textContent = event.description || "No description available.";
    renderTiers(event);
    detailSection.classList.remove("hidden");
  } catch (err) {
    // FIX: an unknown id now shows the "Event not found." state instead of a raw error.
    if (err instanceof ApiError && err.code === "NOT_FOUND") {
      empty.classList.remove("hidden");
    } else {
      showError(err.message || "Unable to load event.");
    }
  } finally {
    loading.classList.add("hidden");
  }
}

tiersContainer.addEventListener("click", async (evt) => {
  const btn = evt.target.closest("button[data-tier]");
  if (!btn) return;

  const tierId = btn.dataset.tier;
  const available = Number(btn.dataset.available);
  const priceCents = Number(btn.dataset.price);
  const tierName = btn.dataset.name;

  const qtyInput = document.getElementById(`qty-${tierId}`);
  let quantity = qtyInput ? Number(qtyInput.value) : 1;
  if (!Number.isInteger(quantity) || quantity < 1) quantity = 1;
  if (quantity > 10) quantity = 10;
  if (quantity > available) quantity = available;
  if (qtyInput) qtyInput.value = quantity;

  const customerName =
    document.getElementById("attendeeName")?.value.trim() || "";
  if (!customerName) {
    showBookError("Please enter your name before booking.");
    return;
  }
  hideBookError();

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Booking…";

  try {
    const { booking } = await createBooking({
      tierId,
      quantity,
      customerName,
    });

    // Pass the booking to the checkout page via session storage.
    sessionStorage.setItem(
      "pendingCheckout",
      JSON.stringify({
        reference: booking.reference,
        eventTitle: document.getElementById("event-title").textContent,
        tierName,
        quantity: booking.quantity,
        totalCents: booking.totalCents,
        tierPriceCents: priceCents,
        // NEW: absolute deadline, so refreshing checkout no longer restarts the 10:00 timer.
        expiresAt: Date.now() + HOLD_MS,
      })
    );
    // FIX: relative URL (was "/checkout.html") so it works on Live Server too.
    window.location.href = "checkout.html";
  } catch (err) {
    showBookError(err.message || "Unable to create booking. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

load().catch((err) => {
  showError(err.message || "Unable to load event.");
  loading.classList.add("hidden");
});
