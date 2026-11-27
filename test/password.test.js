import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  SCRYPT_PARAMS,
} from "../src/lib/password.js";

describe("src/lib/password.js", () => {
  test("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct-password-123");
    assert.equal(await verifyPassword("correct-password-123", hash), true);
  });

  test("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-password-123");
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });

  test("produces different hashes for the same password (unique salt per hash)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    assert.notEqual(hash1, hash2, "two hashes of the same password must differ");
    assert.equal(await verifyPassword("same-password", hash1), true);
    assert.equal(await verifyPassword("same-password", hash2), true);
  });

  test("rejects a tampered derived key (same length, different bytes)", async () => {
    const hash = await hashPassword("tamper-me");
    const parts = hash.split(":");
    const hashPart = parts[4];
    const storedKey = Buffer.from(hashPart.slice("hash=".length), "base64url");
    // Flip the first byte of the derived key — same length, different content.
    // This exercises the timingSafeEqual code path, not just the length check.
    const tamperedKey = Buffer.from(storedKey);
    tamperedKey[0] ^= 0xff;
    parts[4] = `hash=${tamperedKey.toString("base64url")}`;
    const tamperedHash = parts.join(":");
    assert.equal(await verifyPassword("tamper-me", tamperedHash), false);
  });

  test("rejects a malformed stored hash", async () => {
    assert.equal(await verifyPassword("password", "not-a-hash"), false);
    assert.equal(await verifyPassword("password", ""), false);
    assert.equal(await verifyPassword("password", "scrypt:v0:bad"), false);
  });

  test("rejects a hash with an unsupported format version", async () => {
    const hash = await hashPassword("versioned");
    const badVersion = hash.replace(":v0:", ":v99:");
    assert.equal(await verifyPassword("versioned", badVersion), false);
  });

  test("rejects empty or non-string password input", async () => {
    await assert.rejects(() => hashPassword(""), /must be a non-empty string/);
    await assert.rejects(() => hashPassword(123), /must be a non-empty string/);
    assert.equal(
      await verifyPassword(123, "scrypt:v0:params=...:salt=...:hash=..."),
      false,
    );
  });

  test("rejects stored params with missing 'params=' prefix", async () => {
    const hash = await hashPassword("prefix-test");
    const parts = hash.split(":");
    parts[2] = parts[2].slice("params=".length); // strip the prefix
    assert.equal(await verifyPassword("prefix-test", parts.join(":")), false);
  });

  test("rejects stored params with missing 'salt=' prefix", async () => {
    const hash = await hashPassword("prefix-test");
    const parts = hash.split(":");
    parts[3] = parts[3].slice("salt=".length);
    assert.equal(await verifyPassword("prefix-test", parts.join(":")), false);
  });

  test("rejects stored params with missing 'hash=' prefix", async () => {
    const hash = await hashPassword("prefix-test");
    const parts = hash.split(":");
    parts[4] = parts[4].slice("hash=".length);
    assert.equal(await verifyPassword("prefix-test", parts.join(":")), false);
  });

  test("rejects stored params with absurd cost (DoS protection)", async () => {
    const hash = await hashPassword("dos-test");
    const parts = hash.split(":");
    const params = JSON.parse(
      Buffer.from(parts[2].slice("params=".length), "base64url").toString(
        "utf8",
      ),
    );
    params.cost = 4194304; // 2^22, above max bound of 2^20
    parts[2] = `params=${Buffer.from(JSON.stringify(params), "utf8").toString(
      "base64url",
    )}`;
    assert.equal(await verifyPassword("dos-test", parts.join(":")), false);
  });

  test("rejects stored params that are not a power of two", async () => {
    const hash = await hashPassword("pow2-test");
    const parts = hash.split(":");
    const params = JSON.parse(
      Buffer.from(parts[2].slice("params=".length), "base64url").toString(
        "utf8",
      ),
    );
    params.cost = 15000; // not a power of 2
    parts[2] = `params=${Buffer.from(JSON.stringify(params), "utf8").toString(
      "base64url",
    )}`;
    assert.equal(await verifyPassword("pow2-test", parts.join(":")), false);
  });

  test("uses current scrypt cost (2^17 per OWASP guidance)", () => {
    assert.equal(SCRYPT_PARAMS.cost, 131072);
    assert.equal(SCRYPT_PARAMS.blockSize, 8);
    assert.equal(SCRYPT_PARAMS.parallelization, 1);
    assert.equal(SCRYPT_PARAMS.keylen, 64);
    assert.equal(SCRYPT_PARAMS.maxmem, 256 * 1024 * 1024);
  });

  test("needsRehash returns false for a freshly hashed password", async () => {
    const hash = await hashPassword("fresh");
    assert.equal(needsRehash(hash), false);
  });

  test("needsRehash returns true for malformed hash", () => {
    assert.equal(needsRehash("not-a-hash"), true);
    assert.equal(needsRehash(""), true);
    assert.equal(needsRehash("scrypt:v0:bad"), true);
  });

  test("needsRehash returns true for a hash with outdated params", async () => {
    const hash = await hashPassword("outdated");
    const parts = hash.split(":");
    const params = JSON.parse(
      Buffer.from(parts[2].slice("params=".length), "base64url").toString(
        "utf8",
      ),
    );
    params.cost = SCRYPT_PARAMS.cost === 131072 ? 16384 : 131072; // differ
    parts[2] = `params=${Buffer.from(JSON.stringify(params), "utf8").toString(
      "base64url",
    )}`;
    assert.equal(needsRehash(parts.join(":")), true);
  });
});