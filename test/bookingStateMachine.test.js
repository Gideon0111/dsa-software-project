import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DomainError, ErrorCode } from "../src/domain/errors.js";
import {
  BookingState,
  canTransition,
  assertTransition,
  nextStates,
  isFinalState,
  isBookingState,
} from "../src/domain/bookingStateMachine.js";

const { PENDING, PAID, CANCELLED, REFUNDED, CHECKED_IN } = BookingState;
const ALL = [PENDING, PAID, CANCELLED, REFUNDED, CHECKED_IN];

const ALLOWED = [
  [PENDING, PAID],
  [PENDING, CANCELLED],
  [PAID, CHECKED_IN],
  [PAID, REFUNDED],
  [PAID, CANCELLED],
];
const isAllowed = (from, to) => ALLOWED.some(([f, t]) => f === from && t === to);

const throwsDomain = (fn, code) =>
  assert.throws(fn, (e) => e instanceof DomainError && e.code === code);

describe("state names", () => {
  test("are the five lowercase names from the spec", () => {
    assert.deepEqual(
      Object.values(BookingState).sort(),
      ["cancelled", "checked_in", "paid", "pending", "refunded"],
    );
  });
});

describe("allowed moves", () => {
  for (const [from, to] of ALLOWED) {
    test(`${from} -> ${to} is allowed`, () => {
      assert.equal(canTransition(from, to), true);
      assert.doesNotThrow(() => assertTransition(from, to));
    });
  }
});

describe("illegal moves (every other pair, including staying put)", () => {
  for (const from of ALL) {
    for (const to of ALL) {
      if (isAllowed(from, to)) continue;
      test(`${from} -> ${to} is refused`, () => {
        assert.equal(canTransition(from, to), false);
        throwsDomain(() => assertTransition(from, to), ErrorCode.INVALID_TRANSITION);
      });
    }
  }

  test("paying a cancelled booking is refused", () => {
    throwsDomain(() => assertTransition(CANCELLED, PAID), ErrorCode.INVALID_TRANSITION);
  });

  test("the error says what was tried and what was allowed", () => {
    try {
      assertTransition(PENDING, CHECKED_IN);
      assert.fail("should have thrown");
    } catch (e) {
      assert.equal(e.code, ErrorCode.INVALID_TRANSITION);
      assert.deepEqual(e.details, { from: PENDING, to: CHECKED_IN, allowed: [PAID, CANCELLED] });
    }
  });
});

describe("error wording", () => {
  test("repeating a state says 'already', other illegal moves say 'cannot become'", () => {
    assert.throws(() => assertTransition(CANCELLED, CANCELLED), { message: "The booking is already cancelled" });
    assert.throws(() => assertTransition(CANCELLED, PAID), { message: "A cancelled booking cannot become paid" });
  });
});

describe("final states", () => {
  for (const state of [CANCELLED, REFUNDED, CHECKED_IN]) {
    test(`${state} is final: nothing leaves it`, () => {
      assert.equal(isFinalState(state), true);
      assert.deepEqual(nextStates(state), []);
    });
  }
  for (const state of [PENDING, PAID]) {
    test(`${state} is not final`, () => assert.equal(isFinalState(state), false));
  }
});

describe("bad input", () => {
  test("unknown state names are a VALIDATION error, not a transition error", () => {
    throwsDomain(() => assertTransition("shipped", PAID), ErrorCode.VALIDATION);
    throwsDomain(() => assertTransition(PENDING, "shipped"), ErrorCode.VALIDATION);
    throwsDomain(() => nextStates("shipped"), ErrorCode.VALIDATION);
  });

  test("canTransition answers false instead of throwing", () => {
    assert.equal(canTransition("shipped", PAID), false);
    assert.equal(canTransition(PENDING, undefined), false);
    assert.equal(canTransition(null, null), false);
  });

  test("object-prototype names are not states", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      assert.equal(isBookingState(name), false);
      assert.equal(canTransition(name, PAID), false);
    }
  });

  test("uppercase names from the old inventory vocabulary are not accepted", () => {
    assert.equal(isBookingState("PENDING"), false);
    assert.equal(isBookingState("CONFIRMED"), false);
  });
});

describe("safety", () => {
  test("nextStates returns a copy, so callers cannot change the rules", () => {
    const list = nextStates(PENDING);
    list.push(CHECKED_IN);
    assert.equal(canTransition(PENDING, CHECKED_IN), false);
    assert.deepEqual(nextStates(PENDING), [PAID, CANCELLED]);
  });

  test("the state list is frozen", () => {
    assert.throws(() => { "use strict"; BookingState.PENDING = "x"; }, TypeError);
  });
});