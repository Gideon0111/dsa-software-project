import { randomInt, randomUUID } from "node:crypto";

// 31 characters: A-Z and 2-9 with the look-alikes removed (no 0/O, 1/I/L),
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_LENGTH = 4;
const GROUP_COUNT = 2;

/** Unique internal id (UUID v4). Not meant to be read aloud. */
export function newId() {
  return randomUUID();
}

export function newReference() {
  const groups = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}
export function normalizeReference(input) {
  return String(input).trim().toUpperCase();
}