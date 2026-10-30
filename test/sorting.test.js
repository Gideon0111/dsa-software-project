import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSort } from "../src/domain/sorting.js";
import { ErrorCode } from "../src/domain/errors.js";
import { errorOf } from "./helpers.js";

const numeric = (a, b) => a - b;

test("sorts numbers in ascending order", () => {
  assert.deepEqual(mergeSort([5, 2, 9, 1, 5, 6], numeric), [1, 2, 5, 5, 6, 9]);
});

test("returns a NEW array and leaves the input untouched", () => {
  const input = [3, 1, 2];
  const output = mergeSort(input, numeric);
  assert.notEqual(output, input);
  assert.deepEqual(input, [3, 1, 2]);
});

test("empty and single-item lists work, and still return a new array", () => {
  const empty = [];
  const one = [7];
  assert.deepEqual(mergeSort(empty, numeric), []);
  assert.deepEqual(mergeSort(one, numeric), [7]);
  assert.notEqual(mergeSort(empty, numeric), empty);
  assert.notEqual(mergeSort(one, numeric), one);
});

test("is stable: equal items keep their original order", () => {
  const items = [
    { rank: 2, name: "a" },
    { rank: 1, name: "b" },
    { rank: 2, name: "c" },
    { rank: 1, name: "d" },
    { rank: 2, name: "e" },
  ];
  const sorted = mergeSort(items, (x, y) => x.rank - y.rank);
  assert.deepEqual(sorted.map((i) => i.name), ["b", "d", "a", "c", "e"]);
});

test("never calls Array.prototype.sort", () => {
  const original = Array.prototype.sort;
  Array.prototype.sort = () => {
    throw new Error("Array.prototype.sort must not be used");
  };
  try {
    assert.deepEqual(mergeSort([3, 1, 2], numeric), [1, 2, 3]);
  } finally {
    Array.prototype.sort = original;
  }
});

test("matches the built-in sort on 5,000 random numbers", () => {
  const input = Array.from({ length: 5000 }, () => Math.floor(Math.random() * 1000));
  assert.deepEqual(mergeSort(input, numeric), [...input].sort(numeric));
});

test("rejects a non-array or a missing compare function with VALIDATION", () => {
  assert.equal(errorOf(() => mergeSort("nope", numeric)).code, ErrorCode.VALIDATION);
  assert.equal(errorOf(() => mergeSort([1, 2], undefined)).code, ErrorCode.VALIDATION);
});