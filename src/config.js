import path from "node:path";

export const DEFAULT_PORT = 3000;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export function parsePort(value) {
  if (value === undefined || String(value).trim() === "") return DEFAULT_PORT;
  const text = String(value).trim();
  const port = Number(text);
  if (!/^\d+$/.test(text) || port > 65535) {
    throw new Error(`PORT must be a whole number from 0 to 65535, but it is "${value}"`);
  }
  return port;
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    port: parsePort(env.PORT),
    publicDir: path.resolve(import.meta.dirname, "..", "public"),
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  });
}
