import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { createApp } from "../src/http/app.js";
import { DomainError, ErrorCode } from "../src/domain/errors.js";

const SECRET = "TOP SECRET: this file is outside public/";
let tmp;
let server;
let base;
let port;
let symlinkWorks = true;
const logged = [];

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "ticketing-http-"));
  const publicDir = path.join(tmp, "public");
  await mkdir(path.join(publicDir, "sub"), { recursive: true });
  await writeFile(path.join(publicDir, "index.html"), "<h1>Home page</h1>");
  await writeFile(path.join(publicDir, "app.js"), "console.log('hi');");
  await writeFile(path.join(publicDir, "style.css"), "body{}");
  await writeFile(path.join(publicDir, "sub", "index.html"), "<h1>Sub page</h1>");
  await writeFile(path.join(publicDir, ".env"), "KEY=hidden");
  await writeFile(path.join(tmp, "secret.txt"), SECRET);
  try {
    await symlink(path.join(tmp, "secret.txt"), path.join(publicDir, "leak.txt"));
  } catch {
    symlinkWorks = false; // some systems do not allow symbolic links
  }

  server = createApp({
    publicDir,
    maxBodyBytes: 100,
    logger: { error: (...args) => logged.push(args) },
    registerRoutes(router) {
      router.post("/api/echo", ({ body }) => ({ status: 201, body: { received: body ?? null } }));
      router.get("/api/items/:id", ({ params, query }) => ({ body: { id: params.id, q: query.get("q") } }));
      router.get("/api/sold-out", () => { throw new DomainError(ErrorCode.SOLD_OUT, "Only 1 ticket(s) left"); });
      router.get("/api/invalid", () => { throw new DomainError(ErrorCode.VALIDATION, "title: must be a non-empty string"); });
      router.get("/api/missing", () => { throw new DomainError(ErrorCode.NOT_FOUND, "Event not found: x"); });
      router.get("/api/bad-move", () => { throw new DomainError(ErrorCode.INVALID_TRANSITION, "The booking is already cancelled"); });
      router.get("/api/boom", () => { throw new Error("database password is hunter2"); });
      router.get("/api/async-boom", async () => { throw new Error("async failure hunter2"); });
      router.delete("/api/nothing", () => undefined);
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); // port 0 = any free port
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
});

/** fetch() tidies up URLs like "/../x" before sending. For attack paths we need the raw text on the wire. */
function rawRequest(requestPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: requestPath, method }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject);
    req.end();
  });
}

const assertErrorShape = (json, code) => {
  assert.deepEqual(Object.keys(json), ["error"]);
  assert.deepEqual(Object.keys(json.error).sort(), ["code", "message"]);
  assert.equal(json.error.code, code);
  assert.equal(typeof json.error.message, "string");
};

describe("GET /health (a real HTTP request to a real server)", () => {
  test("answers 200 with {\"status\":\"ok\"} as JSON", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  test("HEAD /health answers 200 with no body", async () => {
    const res = await rawRequest("/health", "HEAD");
    assert.equal(res.status, 200);
    assert.equal(res.text, "");
  });

  test("every response says nosniff", async () => {
    for (const p of ["/health", "/api/nope", "/", "/missing.html"]) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff", p);
    }
  });
});

describe("errors always have the same JSON shape", () => {
  test("unknown /api path -> 404 JSON", async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assertErrorShape(await res.json(), "NOT_FOUND");
  });

  test("bare /api and deeper unknown paths are JSON 404 too, not static files", async () => {
    for (const p of ["/api", "/api/", "/api/a/b/c"]) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 404, p);
      assertErrorShape(await res.json(), "NOT_FOUND");
    }
  });

  test("bad JSON -> 400 BAD_JSON", async () => {
    const res = await fetch(`${base}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"title": ',
    });
    assert.equal(res.status, 400);
    assertErrorShape(await res.json(), "BAD_JSON");
  });

  test("wrong method -> 405 with an Allow header", async () => {
    const res = await fetch(`${base}/api/echo`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
    assertErrorShape(await res.json(), "METHOD_NOT_ALLOWED");
  });

  test("body bigger than the limit -> 413", async () => {
    const res = await fetch(`${base}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filler: "x".repeat(500) }),
    });
    assert.equal(res.status, 413);
    assertErrorShape(await res.json(), "PAYLOAD_TOO_LARGE");
  });

  test("domain errors keep their code and message and get the mapped status", async () => {
    const cases = [
      ["/api/sold-out", 409, "SOLD_OUT", "Only 1 ticket(s) left"],
      ["/api/invalid", 400, "VALIDATION", "title: must be a non-empty string"],
      ["/api/missing", 404, "NOT_FOUND", "Event not found: x"],
      ["/api/bad-move", 409, "INVALID_TRANSITION", "The booking is already cancelled"],
    ];
    for (const [p, status, code, message] of cases) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, status, p);
      const json = await res.json();
      assertErrorShape(json, code);
      assert.equal(json.error.message, message);
    }
  });

  test("an unexpected error is a generic 500: no message, no stack trace, but it IS logged", async () => {
    logged.length = 0;
    for (const p of ["/api/boom", "/api/async-boom"]) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 500, p);
      const text = await res.text();
      assertErrorShape(JSON.parse(text), "INTERNAL");
      assert.ok(!text.includes("hunter2"), "the secret leaked to the client");
      assert.ok(!/\bat .*\.js/.test(text), "a stack trace leaked to the client");
    }
    assert.equal(logged.length, 2);
  });

  test("the server keeps working after an error", async () => {
    await fetch(`${base}/api/boom`);
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});

describe("routes: bodies, params and query", () => {
  test("a JSON body reaches the handler, and the handler's status is used", async () => {
    const res = await fetch(`${base}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Jazz Night" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { received: { title: "Jazz Night" } });
  });

  test("an empty body is allowed and reaches the handler as undefined", async () => {
    const res = await fetch(`${base}/api/echo`, { method: "POST" });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { received: null });
  });

  test("route params are decoded and the query string is available", async () => {
    const res = await fetch(`${base}/api/items/blue%20cap?q=lagos`);
    assert.deepEqual(await res.json(), { id: "blue cap", q: "lagos" });
  });

  test("a handler that returns nothing answers 204 with no body", async () => {
    const res = await fetch(`${base}/api/nothing`, { method: "DELETE" });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
  });
});

describe("static files", () => {
  test("/ serves public/index.html as HTML", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    assert.equal(await res.text(), "<h1>Home page</h1>");
  });

  test("files get the right content type", async () => {
    assert.match((await fetch(`${base}/app.js`)).headers.get("content-type"), /^text\/javascript/);
    assert.match((await fetch(`${base}/style.css`)).headers.get("content-type"), /^text\/css/);
  });

  test("a folder serves its index.html, with or without a trailing slash", async () => {
    assert.equal(await (await fetch(`${base}/sub/`)).text(), "<h1>Sub page</h1>");
    assert.equal(await (await fetch(`${base}/sub`)).text(), "<h1>Sub page</h1>");
  });

  test("HEAD returns the headers but no body", async () => {
    const res = await rawRequest("/index.html", "HEAD");
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-length"], "18");
    assert.equal(res.text, "");
  });

  test("a missing file is a JSON 404", async () => {
    const res = await fetch(`${base}/missing.html`);
    assert.equal(res.status, 404);
    assertErrorShape(await res.json(), "NOT_FOUND");
  });

  test("hidden files are never served", async () => {
    const res = await fetch(`${base}/.env`);
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes("hidden"));
  });

  test("POST to a static path is 405 and says GET and HEAD are allowed", async () => {
    const res = await fetch(`${base}/index.html`, { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD");
  });
});

describe("static files: nothing outside public/ can ever be read", () => {
  const attacks = [
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/%2E%2E/secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/..%5csecret.txt",
    "/sub/../../secret.txt",
    "/sub/%2e%2e/%2e%2e/secret.txt",
    "/....//secret.txt",
    "/%252e%252e/secret.txt",
    "//secret.txt",
    "/secret.txt",
    "/etc/passwd",
    "/%00",
    "/index.html%00.png",
    "/%E0%A4%A",
  ];

  for (const attack of attacks) {
    test(`refuses ${attack}`, async () => {
      const res = await rawRequest(attack);
      assert.equal(res.status, 404);
      assert.ok(!res.text.includes("TOP SECRET"), "the secret file was served");
      assertErrorShape(JSON.parse(res.text), "NOT_FOUND");
    });
  }

  test("refuses a symbolic link inside public/ that points outside it", async (t) => {
    if (!symlinkWorks) return t.skip("symbolic links are not available here");
    const res = await rawRequest("/leak.txt");
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes("TOP SECRET"), "the secret file was served through a symbolic link");
  });
});

describe("createApp", () => {
  test("refuses to start without a public folder", () => {
    assert.throws(() => createApp({}), TypeError);
    assert.throws(() => createApp({ publicDir: "" }), TypeError);
  });

  test("a missing public folder gives 404s, not a crash", async () => {
    const lonely = createApp({ publicDir: path.join(tmp, "does-not-exist"), logger: { error() {} } });
    await new Promise((resolve) => lonely.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${lonely.address().port}/`);
      assert.equal(res.status, 404);
      const health = await fetch(`http://127.0.0.1:${lonely.address().port}/health`);
      assert.equal(health.status, 200);
    } finally {
      lonely.closeAllConnections();
      await new Promise((resolve) => lonely.close(resolve));
    }
  });
});
