import http from "node:http";
import { createRouter } from "./router.js";
import { createStaticServer } from "./static.js";
import { badRequestUrl, badJson, notFound, methodNotAllowed, payloadTooLarge, toErrorResponse } from "./httpErrors.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

const isApiPath = (pathname) => pathname === "/api" || pathname.startsWith("/api/");

function parseRequestUrl(rawUrl) {
  const raw = rawUrl ?? "/";
  if (!raw.startsWith("/")) throw badRequestUrl();
  const q = raw.indexOf("?");
  return {
    pathname: q === -1 ? raw : raw.slice(0, q),
    query: new URLSearchParams(q === -1 ? "" : raw.slice(q + 1)),
  };
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) return reject(payloadTooLarge());

    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return; 
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(payloadTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.trim() === "") return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(badJson());
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body, { headers = {}, headOnly = false } = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const base = { "X-Content-Type-Options": "nosniff", "Content-Length": Buffer.byteLength(payload) };
  if (body !== undefined) base["Content-Type"] = "application/json; charset=utf-8";
  res.writeHead(status, { ...base, ...headers });
  res.end(headOnly ? undefined : payload);
}

/**
 * Builds the web server (it does not start listening; server.js does that).
 *   registerRoutes(router)  lets later builds add their API routes without touching this file.
 * A route handler receives { req, params, query, body } and returns { status?, body? }.
 * It never writes to the response itself, and it may throw: every error leaves through one door.
 */
export function createApp({
  publicDir,
  registerRoutes,
  logger = console,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
} = {}) {
  if (typeof publicDir !== "string" || publicDir === "") {
    throw new TypeError("createApp needs a publicDir");
  }

  const router = createRouter();
  router.get("/health", () => ({ status: 200, body: { status: "ok" } }));
  if (registerRoutes) registerRoutes(router);
  const serveStatic = createStaticServer(publicDir);

  async function handle(req, res) {
    const { pathname, query } = parseRequestUrl(req.url);
    const route = router.match(req.method, pathname);
    const headOnly = req.method === "HEAD";

    if (route.kind === "found") {
      const body = BODY_METHODS.has(req.method) ? await readJsonBody(req, maxBodyBytes) : undefined;
      const result = await route.handler({ req, params: route.params, query, body });
      const status = result?.status ?? (result?.body === undefined ? 204 : 200);
      return sendJson(res, status, result?.body, { headOnly });
    }

    if (route.kind === "method_not_allowed") {
      throw methodNotAllowed(route.allow);
    }

    if (isApiPath(pathname)) throw notFound("No such API route");
    if (req.method !== "GET" && req.method !== "HEAD") {
      throw methodNotAllowed(["GET", "HEAD"]);
    }
    return serveStatic(req, res, pathname);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) {
        res.destroy(); 
        return;
      }
      const { status, headers, body } = toErrorResponse(error, logger);
      sendJson(res, status, body, { headers, headOnly: req.method === "HEAD" });
    });
  });
}
