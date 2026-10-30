import { DomainError, ErrorCode } from "./errors.js";

export function mergeSort(items, compare) {
  if (!Array.isArray(items)) {
    throw new DomainError(ErrorCode.VALIDATION, "items: must be an array", { field: "items" });
  }
  if (typeof compare !== "function") {
    throw new DomainError(ErrorCode.VALIDATION, "compare: must be a function", { field: "compare" });
  }
  if (items.length < 2) return [...items];

  const source = [...items]; 
  const buffer = new Array(source.length);
  sortRange(source, buffer, 0, source.length, compare);
  return source;
}

function sortRange(source, buffer, start, end, compare) {
  if (end - start < 2) return;
  const mid = start + ((end - start) >> 1);
  sortRange(source, buffer, start, mid, compare);
  sortRange(source, buffer, mid, end, compare);
  merge(source, buffer, start, mid, end, compare);
}

function merge(source, buffer, start, mid, end, compare) {
  let left = start;
  let right = mid;
  let out = start;
  while (left < mid && right < end) {
    if (compare(source[left], source[right]) <= 0) buffer[out++] = source[left++];
    else buffer[out++] = source[right++];
  }
  while (left < mid) buffer[out++] = source[left++];
  while (right < end) buffer[out++] = source[right++];
  for (let i = start; i < end; i++) source[i] = buffer[i];
}