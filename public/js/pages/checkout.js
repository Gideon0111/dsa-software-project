import { el, formatCurrency } from "../ui.js";
import { pay, cancelBooking, ApiError } from "../api.js";

const HOLD_SECONDS = 600; // 10-minute seat hold (fallback if no expiresAt was saved)

const checkoutSection = document.getElementById("checkout");
const bookingSummary = document.getElementById("booking-summary");
const countdownEl = document.getElementById("countdown");
const errorEl = document.getElementById("error");
const expiredEl = document.getElementById("expired");
const resultEl = document.getElementById("result");
const notFound = document.getElementById("notFound");
const payForm = document.getElementById("payment-form");
const payBtn = document.getElementById("payBtn");
const payAmount = document.getElementById("payAmount");
const simulateDecline = document.getElementById("simulateDecline");
const cancelBtn = document.getElementById("cancelBtn");
// NEW: card inputs, so we can validate them
const cardName = document.getElementById("card-name");
const cardNumber = document.getElementById("card-number");
const cardExpiry = document.getElementById("card-expiry");
const cardCvc = document.getElementById("card-cvc");

let checkout = null;
let countdownTimer = null;

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}
function hideError() {
  errorEl.classList.add("hidden");
}
function showResult(msg, kind) {
  resultEl.textContent = msg;
  resultEl.className = `message ${kind === "success" ? "success" : "error"}`;
  resultEl.classList.remove("hidden");
}
function hideResult() {
  resultEl.classList.add("hidden");
}
function hideExpired() {
  expiredEl.classList.add("hidden");
}

// CHANGED: counts down to an absolute deadline (checkout.expiresAt) instead of a
// counter that restarted at 10:00 on every page load.
function startCountdown(deadlineMs) {
  function tick() {
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    countdownEl.textContent = `Seats held: ${m}:${String(s).padStart(2, "0")}`;
    if (remaining <= 0) {
      stopCountdown();
      expiredEl.classList.remove("hidden");
      payBtn.disabled = true;
      payBtn.textContent = "Session expired";
      // NEW: actually give the seats back. Before, the booking stayed "pending" forever.
      cancelBooking(checkout.reference).catch(() => {});
      sessionStorage.removeItem("pendingCheckout");
    }
  }
  tick();
  if (!countdownTimer && deadlineMs > Date.now()) countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderSummary() {
  bookingSummary.replaceChildren();
  bookingSummary.appendChild(el("p", {}, `Event: ${checkout.eventTitle}`));
  bookingSummary.appendChild(el("p", {}, `Ticket: ${checkout.tierName}`));
  bookingSummary.appendChild(el("p", {}, `Quantity: ${checkout.quantity}`));
  bookingSummary.appendChild(
    el("p", {}, `Unit price: ${formatCurrency(checkout.tierPriceCents)}`)
  );
  bookingSummary.appendChild(
    el("p", { class: "total" }, `Total: ${formatCurrency(checkout.totalCents)}`)
  );
  payAmount.textContent = formatCurrency(checkout.totalCents).replace("₦", "");
}

// NEW: card validation. This is a mock gateway, so the card is never sent anywhere;
// we only check that the form is filled in sensibly (the "decline" checkbox, not the
// card number, controls whether the mock payment fails).
function validateCard() {
  if (cardName.value.trim().length < 2) {
    return { field: cardName, message: "Enter the name on the card." };
  }
  const digits = cardNumber.value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return { field: cardNumber, message: "Enter a valid card number (13 to 19 digits)." };
  }
  const match = /^(\d{2})\/(\d{2})$/.exec(cardExpiry.value.trim());
  if (!match) {
    return { field: cardExpiry, message: "Enter the expiry date as MM/YY." };
  }
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const now = new Date();
  const expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  if (month < 1 || month > 12 || expired) {
    return { field: cardExpiry, message: "That expiry date is invalid or has passed." };
  }
  if (!/^\d{3,4}$/.test(cardCvc.value.trim())) {
    return { field: cardCvc, message: "Enter the 3 or 4 digit CVC." };
  }
  return null;
} 
function formatCardNumber() {
  const digits = cardNumber.value.replace(/\D/g, "").slice(0, 19);
  
  cardNumber.value = digits.match(/.{1,4}/g)?.join(" ") ?? "";
}
function formatExpiry() {
  const digits = cardExpiry.value.replace(/\D/g, "").slice(0, 4);
  cardExpiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

async function handlePay(evt) {
  evt.preventDefault();
  hideError();
  hideResult();
  hideExpired();
  if (!checkout) return;

  // NEW: this block is the fix for the bug in your screenshot. Before, nothing was
  // validated, so clicking Pay on an empty form always said "Payment confirmed".
  const problem = validateCard();
  if (problem) {
    showError(problem.message);
    problem.field.focus();
    return;
  }

  // Card details entered in the form are never read, transmitted or logged.
  // Only the reference and the should-decline flag are sent to the API.
  payBtn.disabled = true;
  const originalText = payBtn.textContent;
  payBtn.textContent = "Paying…";

  try {
    const result = await pay({
      reference: checkout.reference,
      shouldDecline: simulateDecline.checked,
    });

    stopCountdown();
    payBtn.disabled = true;
    payBtn.textContent = "Paid";
    payForm.style.display = "none";
    cancelBtn.style.display = "none";
    simulateDecline.closest(".field").style.display = "none";
    showResult(
      `Payment confirmed. Booking ${result.booking.reference} is now paid.`,
      "success"
    );
    sessionStorage.removeItem("pendingCheckout");
  } catch (err) {
    payBtn.disabled = false;
    payBtn.textContent = originalText;
    if (err instanceof ApiError && err.code === "PAYMENT_DECLINED") {
      showResult(
        "Card declined. Your booking is still pending — correct the card and try again.",
        "error"
      );
    } else {
      showError(err.message || "Payment failed. Try again.");
    }
  }
}

async function init() {
  const raw = sessionStorage.getItem("pendingCheckout");
  if (!raw) {
    notFound.classList.remove("hidden");
    return;
  }
  try {
    checkout = JSON.parse(raw);
  } catch {
    notFound.classList.remove("hidden");
    return;
  }
  if (!checkout || !checkout.reference) {
    notFound.classList.remove("hidden");
    return;
  }

  // NEW: if the 10 minutes already ran out (e.g. the tab was left open), say so
  // instead of showing a payable checkout.
  const deadline = checkout.expiresAt ?? Date.now() + HOLD_SECONDS * 1000;
  if (deadline <= Date.now()) {
    cancelBooking(checkout.reference).catch(() => {});
    sessionStorage.removeItem("pendingCheckout");
    expiredEl.classList.remove("hidden");
    return;
  }

  checkoutSection.classList.remove("hidden");
  renderSummary();
  startCountdown(deadline);

  cardNumber.addEventListener("input", formatCardNumber);
  cardExpiry.addEventListener("input", formatExpiry);
  payForm.addEventListener("submit", handlePay);
  cancelBtn.addEventListener("click", async () => {
    // CHANGED: Cancel now tells the server, which releases the seats. Before, it only
    // cleared sessionStorage and the booking stayed pending with the seats still held.
    cancelBtn.disabled = true;
    try {
      await cancelBooking(checkout.reference);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "NOT_FOUND")) {
        cancelBtn.disabled = false;
        showError(err.message || "Could not cancel the booking. Try again.");
        return;
      }
    }
    stopCountdown();
    sessionStorage.removeItem("pendingCheckout");
    window.location.href = "index.html"; // FIX: relative (was "/")
  });

  // Clean up the countdown interval when the checkout screen is removed.
  window.addEventListener("beforeunload", stopCountdown);
}

init();
