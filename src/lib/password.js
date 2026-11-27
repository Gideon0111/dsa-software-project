import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// OWASP-aligned scrypt parameters: N=2^17 (~128 MiB per hash),
// r=8, p=1. Raised from Node's default (2^14) to resist GPU/ASIC cracking.
// maxmem is set above N*r*128 so scrypt never rejects the allocation.
export const SCRYPT_PARAMS = Object.freeze({
  cost: 131072,
  blockSize: 8,
  parallelization: 1,
  maxmem: 256 * 1024 * 1024,
  keylen: 64,
});

export const SALT_LENGTH = 16;
export const FORMAT_VERSION = "v0";

// Hard bounds for stored params. Stored hashes carry their own parameters,
// so a tampered row must never be able to drive cost/maxmem high enough
// to starve the libuv thread pool (DoS). 
export const PARAM_BOUNDS = Object.freeze({
  minCost: 16384,
  maxCost: 1048576,
  minBlockSize: 8,
  maxBlockSize: 8,
  minParallelization: 1,
  maxParallelization: 1,
  minKeylen: 32,
  maxKeylen: 128,
  minMaxmem: 64 * 1024 * 1024,
  maxMaxmem: 512 * 1024 * 1024,
});

function encodeBase64Url(buffer) {
  return buffer.toString("base64url");
}

function decodeBase64Url(text) {
  return Buffer.from(text, "base64url");
}

//Validate that a parsed params object contains only safe, expected values.

function isValidParams(params) {
  if (!params || typeof params !== "object") return false;
  const { cost, blockSize, parallelization, maxmem, keylen } = params;
  return (
    Number.isInteger(cost) &&
    cost >= PARAM_BOUNDS.minCost &&
    cost <= PARAM_BOUNDS.maxCost &&
    (cost & (cost - 1)) === 0 && // must be a power of 2
    Number.isInteger(blockSize) &&
    blockSize >= PARAM_BOUNDS.minBlockSize &&
    blockSize <= PARAM_BOUNDS.maxBlockSize &&
    Number.isInteger(parallelization) &&
    parallelization >= PARAM_BOUNDS.minParallelization &&
    parallelization <= PARAM_BOUNDS.maxParallelization &&
    Number.isInteger(maxmem) &&
    maxmem >= PARAM_BOUNDS.minMaxmem &&
    maxmem <= PARAM_BOUNDS.maxMaxmem &&
    Number.isInteger(keylen) &&
    keylen >= PARAM_BOUNDS.minKeylen &&
    keylen <= PARAM_BOUNDS.maxKeylen
  );
}

/**
 * Hash a plaintext password with scrypt and a random per-password salt.
 
 * The returned string never contains the plaintext password.
 *
 * @param {string} password - the plaintext password to hash
 * @returns {Promise<string>} a storable scrypt hash string
 */
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("password: must be a non-empty string");
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.cost,
    r: SCRYPT_PARAMS.blockSize,
    p: SCRYPT_PARAMS.parallelization,
    maxmem: SCRYPT_PARAMS.maxmem,
  });

  const paramsEncoded = encodeBase64Url(
    Buffer.from(JSON.stringify(SCRYPT_PARAMS), "utf8")
  );
  const saltEncoded = encodeBase64Url(salt);
  const hashEncoded = encodeBase64Url(derivedKey);

  return `scrypt:${FORMAT_VERSION}:params=${paramsEncoded}:salt=${saltEncoded}:hash=${hashEncoded}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash string.
 
 * @param {string} password - the plaintext password to check
 * @param {string} storedHash - a hash string previously produced by hashPassword
 * @returns {Promise<boolean>} true when the password matches, false otherwise
 */
export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 5) return false;
  const [format, version, paramsPart, saltPart, hashPart] = parts;
  if (format !== "scrypt" || version !== FORMAT_VERSION) return false;

  if (!paramsPart.startsWith("params=")) return false;
  if (!saltPart.startsWith("salt=")) return false;
  if (!hashPart.startsWith("hash=")) return false;

  let params;
  try {
    params = JSON.parse(
      decodeBase64Url(paramsPart.slice("params=".length)).toString("utf8")
    );
  } catch {
    return false;
  }

  if (!isValidParams(params)) return false;

  let salt;
  let storedKey;
  try {
    salt = decodeBase64Url(saltPart.slice("salt=".length));
    storedKey = decodeBase64Url(hashPart.slice("hash=".length));
  } catch {
    return false;
  }

  let computedKey;
  try {
    computedKey = await scryptAsync(password, salt, params.keylen, {
      N: params.cost,
      r: params.blockSize,
      p: params.parallelization,
      maxmem: params.maxmem,
    });
  } catch {
    return false;
  }

  if (computedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(computedKey, storedKey);
}

/**
 Determines whether a stored hash should be re-hashed with the current SCRYPT_PARAMS.
 * @param {string} storedHash - a hash string previously produced by hashPassword
 * @returns {boolean} true when the hash should be re-hashed
 */
export function needsRehash(storedHash) {
  if (typeof storedHash !== "string") return true;

  const parts = storedHash.split(":");
  if (parts.length !== 5) return true;
  const [format, version, paramsPart] = parts;
  if (format !== "scrypt" || version !== FORMAT_VERSION) return true;
  if (!paramsPart.startsWith("params=")) return true;

  let params;
  try {
    params = JSON.parse(
      decodeBase64Url(paramsPart.slice("params=".length)).toString("utf8")
    );
  } catch {
    return true;
  }

  if (!isValidParams(params)) return true;

  return (
    params.cost !== SCRYPT_PARAMS.cost ||
    params.blockSize !== SCRYPT_PARAMS.blockSize ||
    params.parallelization !== SCRYPT_PARAMS.parallelization ||
    params.keylen !== SCRYPT_PARAMS.keylen ||
    params.maxmem !== SCRYPT_PARAMS.maxmem
  );
}