import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken, TOKEN_SECRET_ENV } from "../src/lib/token.js";

const ORIGINAL_SECRET = process.env[TOKEN_SECRET_ENV];

afterEach(() => {
  // Restore the original secret so tests are independent.
  if (ORIGINAL_SECRET === undefined) {
    delete process.env[TOKEN_SECRET_ENV];
  } else {
    process.env[TOKEN_SECRET_ENV] = ORIGINAL_SECRET;
  }
});

describe("src/lib/token.js", () => {
  test("signs and verifies a valid token returning userId and role", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    const token = signToken({ userId: "user-42", role: "organizer" });
    assert.equal(typeof token, "string");
    assert.equal(token.split(".").length, 3);

    const claims = verifyToken(token);
    assert.equal(claims.userId, "user-42");
    assert.equal(claims.role, "organizer");
    assert.ok(Number.isInteger(claims.issuedAt));
    assert.ok(Number.isInteger(claims.expiresAt));
    assert.ok(claims.expiresAt > claims.issuedAt);
  });

  test("rejects a modified payload (tampered token)", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    const token = signToken({ userId: "user-1", role: "attendee" });
    const parts = token.split(".");
    // Flip the role in the payload without re-signing.
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    payload.role = "organizer";
    parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const tampered = parts.join(".");

    assert.throws(() => verifyToken(tampered), /invalid signature/);
  });

  test("rejects a malformed token with too few segments", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    assert.throws(() => verifyToken("abc.def"), /malformed token/);
    assert.throws(() => verifyToken("abc"), /malformed token/);
    assert.throws(() => verifyToken(""), /malformed token/);
  });

  test("rejects a malformed token with invalid JSON payload", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    )}.${Buffer.from("not-json").toString("base64url")}.sig`;
    assert.throws(() => verifyToken(token), /malformed token/);
  });

  test("rejects an expired token", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    // expiresInSeconds = -1 puts exp one second in the past.
    const token = signToken({ userId: "user-1", role: "attendee" }, -1);
    assert.throws(() => verifyToken(token), /expired token/);
  });

  test("rejects a token with a non-HS256 algorithm", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    // First create a valid token, then replace the header with alg=RS256.
    const token = signToken({ userId: "user-1", role: "attendee" });
    const parts = token.split(".");
    const forgedHeader = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const forged = `${forgedHeader}.${parts[1]}.${parts[2]}`;
    assert.throws(() => verifyToken(forged), /unsupported algorithm/);
  });

  test("rejects a token with alg=none", () => {
    process.env[TOKEN_SECRET_ENV] = "test-secret-at-least-16-chars";
    const token = signToken({ userId: "user-1", role: "attendee" });
    const parts = token.split(".");
    const forgedHeader = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const forged = `${forgedHeader}.${parts[1]}.${parts[2]}`;
    assert.throws(() => verifyToken(forged), /unsupported algorithm/);
  });

  test("rejects signing when TOKEN_SECRET is missing", () => {
    delete process.env[TOKEN_SECRET_ENV];
    assert.throws(() => signToken({ userId: "user-1", role: "attendee" }), /TOKEN_SECRET/);
  });

  test("rejects verification when TOKEN_SECRET is missing", () => {
    delete process.env[TOKEN_SECRET_ENV];
    assert.throws(() => verifyToken("a.b.c"), /TOKEN_SECRET/);
  });

  test("rejects a token signed with a different secret", () => {
    process.env[TOKEN_SECRET_ENV] = "secret-one-at-least-16-chars";
    const token = signToken({ userId: "user-1", role: "attendee" });
    process.env[TOKEN_SECRET_ENV] = "secret-two-at-least-16-chars";
    assert.throws(() => verifyToken(token), /invalid signature/);
  });

  test("requires a secret of at least 16 characters", () => {
    process.env[TOKEN_SECRET_ENV] = "short";
    assert.throws(() => signToken({ userId: "user-1", role: "attendee" }), /TOKEN_SECRET/);
  });
});