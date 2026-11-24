import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatCurrency } from "../../public/js/ui.js";

describe("Build 6 UI helpers (ui.js)", () => {
  test("formatCurrency formats whole cents as naira: 250000 -> ₦2,500", () => {
    assert.equal(formatCurrency(250000), "₦2,500");
    assert.equal(formatCurrency(100000), "₦1,000");
    assert.equal(formatCurrency(50000), "₦500");
    assert.equal(formatCurrency(0), "₦0");
  });

  test("formatCurrency shows kobo when present", () => {
    assert.equal(formatCurrency(250050), "₦2,500.50");
    assert.equal(formatCurrency(1050), "₦10.50");
    assert.equal(formatCurrency(5), "₦0.05");
  });

  test("formatCurrency uses integer math, no floating point", () => {
    assert.equal(formatCurrency(100000 + 50), "₦1,000.50");
  });

  test("formatCurrency rejects non-integers", () => {
    assert.throws(() => formatCurrency(99.5), Error);
    assert.throws(() => formatCurrency("250000"), Error);
  });
});
