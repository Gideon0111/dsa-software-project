import { createHmac, timingSafeEqual } from "node:crypto";

export const TOKEN_SECRET_ENV = "TOKEN_SECRET";
export const MIN_SECRET_LENGTH = 16;
export const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const ALGORITHM = "HS256";
export const TOKEN_TYPE = "JWT";

/**
 * Resolve the token signing secret from the environment.
 *
 * Fails fast with a clear error when TOKEN_SECRET is missing or too short.
 * This is intentional: a weak or absent signing secret makes every token
 * forgeable, so the application must not start without a strong secret.
 *
 * @returns {string} the configured token secret
 */
function getSecret() {
  const secret = process.env[TOKEN_SECRET_ENV];
  if (!secret || typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `TOKEN_SECRET: must be set to at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return secret;
}

/**
 * Base64URL-encode a buffer without padding.
 */
function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

/**
 * Base64URL-decode a string back to a buffer.
 * Throws on invalid input.
 */
function base64UrlDecode(text) {
  return Buffer.from(text, "base64url");
}

/**
 * Build the JWT signing input: base64url(header).base64url(payload).
 */
function signingInput(header, payload) {
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;
}

function createSignature(signingInputText, secret) {
  return createHmac("sha256", secret).update(signingInputText).digest();
}

/**
 * Sign a JWT token for the given user.
 *
 * @param {object} params
 * @param {string} params.userId - the authenticated user's id (becomes `sub`)
 * @param {string} params.role - the user's role (organizer, attendee, or staff)
 * @param {number} [params.expiresInSeconds=TOKEN_EXPIRY_SECONDS] - token lifetime
 * @returns {string} a signed HS256 JWT string
 */
export function signToken(
  { userId, role },
  expiresInSeconds = TOKEN_EXPIRY_SECONDS,
) {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: ALGORITHM, typ: TOKEN_TYPE };
  const payload = {
    sub: String(userId),
    role,
    iat: now,
    exp: now + Math.trunc(expiresInSeconds),
  };

  const input = signingInput(header, payload);
  const signature = createSignature(input, secret);

  return `${input}.${base64UrlEncode(signature)}`;
}

/**
 * Verify a JWT token and return its decoded payload claims.
 *
 * Performs the following checks in order:
 *  1. Token has exactly three base64url segments (header.payload.signature)
 *  2. Header and payload are valid JSON
 *  3. Header algorithm is HS256 (never trusts `alg` supplied by the token)
 *  4. Required claims are present: sub, role, iat, exp
 *  5. Token has not expired (exp > now)
 *  6. Signature matches HMAC-SHA256(input, secret), compared in constant time
 *
 * Any failure throws an Error with a descriptive message. Callers (e.g.
 * guards.js) map these to the appropriate DomainError code.
 *
 * @param {string} token - the JWT string to verify
 * @returns {object} { userId, role, issuedAt, expiresAt }
 * @throws {Error} when the token is malformed, expired, or has an invalid signature
 */
export function verifyToken(token) {
  const secret = getSecret();

  if (typeof token !== "string" || token.length === 0) {
    throw new Error("malformed token: token is empty");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed token: expected header.payload.signature");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("malformed token: header or payload is not valid JSON");
  }

  if (header.alg !== ALGORITHM || header.typ !== TOKEN_TYPE) {
    throw new Error("unsupported algorithm: only HS256 JWT tokens are accepted");
  }

  if (
    !payload.sub ||
    !payload.role ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("missing required claims: sub, role, iat, exp");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("expired token");
  }

  const input = `${headerB64}.${payloadB64}`;
  const expectedSig = createSignature(input, secret);
  let actualSig;
  try {
    actualSig = base64UrlDecode(signatureB64);
  } catch {
    throw new Error("invalid signature");
  }

  if (expectedSig.length !== actualSig.length) {
    throw new Error("invalid signature");
  }

  if (!timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("invalid signature");
  }

  return {
    userId: payload.sub,
    role: payload.role,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}