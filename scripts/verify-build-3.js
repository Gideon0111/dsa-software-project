// verify-build-3.js tests the finished project the way a reviewer would, and prints PASS or FAIL for each requirement.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const read = (rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), "utf8") : "");

const results = [];
let group = "";
const section = (title) => { group = title; console.log(`\n${title}`); };
function check(name, ok, detail = "") {
  results.push({ group, name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n          -> ${detail}` : ""}`);
}
const safely = async (fn) => { try { return await fn(); } catch (e) { return { threw: e }; } };

function rawRequest(port, requestPath, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: requestPath, method, headers: body ? { "content-type": "application/json" } : {} }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const isErrorShape = (text, code) => {
  try {
    const j = JSON.parse(text);
    return Object.keys(j).join() === "error" && Object.keys(j.error).sort().join() === "code,message" && (!code || j.error.code === code);
  } catch { return false; }
};

section("Done when #1: a diagram of the architecture and the booking states is in docs/");
const arch = read("docs/architecture.md");
const blocks = [...arch.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trim().split("\n")[0].trim());
check("docs/architecture.md exists", arch !== "");
check("it has three Mermaid diagrams", blocks.length === 3, `found ${blocks.length}`);
check("layer diagram (flowchart)", blocks.some((b) => b.startsWith("flowchart")));
check("data model diagram (erDiagram) with events, tiers, bookings, users",
  blocks.includes("erDiagram") && ["EVENT", "TICKET_TIER", "BOOKING", "USER"].every((e) => arch.includes(e)));
check("booking life cycle diagram (stateDiagram-v2)", blocks.includes("stateDiagram-v2"));
check("one sentence for each layer (Routes, Services, Rules, Data)",
  ["**Routes**", "**Services**", "**Rules**", "**Data**"].every((l) => arch.includes(l)));

section("Done when #2: invalid state changes are refused");
const sm = await safely(() => load("src/domain/bookingStateMachine.js"));
const { DomainError, ErrorCode } = await load("src/domain/errors.js");
check("bookingStateMachine.js exports canTransition and assertTransition",
  typeof sm.canTransition === "function" && typeof sm.assertTransition === "function");
if (sm.canTransition) {
  const states = ["pending", "paid", "cancelled", "refunded", "checked_in"];
  const allowed = new Set(["pending>paid", "pending>cancelled", "paid>checked_in", "paid>refunded", "paid>cancelled"]); // from build-3.md
  const wrong = [];
  for (const from of states) for (const to of states) {
    const expected = allowed.has(`${from}>${to}`);
    const threw = (() => { try { sm.assertTransition(from, to); return null; } catch (e) { return e; } })();
    const okMove = sm.canTransition(from, to) === expected &&
      (expected ? threw === null : threw instanceof DomainError && threw.code === "INVALID_TRANSITION");
    if (!okMove) wrong.push(`${from}>${to}`);
  }
  check("all 25 pairs of states behave exactly as the spec says (5 allowed, 20 refused)", wrong.length === 0, wrong.join(", "));
  check("cancelled, refunded and checked_in are final (nothing leaves them)",
    ["cancelled", "refunded", "checked_in"].every((f) => states.every((t) => !sm.canTransition(f, t))));
}
const inv = await load("src/domain/inventory.js");
{
  const store = inv.createStore();
  const ev = inv.createEvent(store, { title: "T", city: "Lagos", venue: "V", startsAt: "2027-01-01T10:00:00Z" });
  const tier = inv.addTier(store, ev.id, { name: "General", priceCents: 1000, capacity: 3 });
  const b = inv.bookTickets(store, { tierId: tier.id, quantity: 2, customerName: "Ada" });
  inv.cancelBooking(store, b.reference);
  const second = (() => { try { inv.cancelBooking(store, b.reference); return null; } catch (e) { return e; } })();
  check("a real booking cannot be cancelled twice (INVALID_TRANSITION)", second?.code === "INVALID_TRANSITION");
  check("...and the seats were released only once", inv.getTier(store, tier.id).available === 3);
  check("a new booking starts as 'pending' (inventory.js uses the state machine's names)", b.status === "pending");
}

section("Done when #3: the server starts and /health responds");
const pkg = JSON.parse(read("package.json") || "{}");
check('package.json has a "start" script', pkg.scripts?.start === "node src/server.js", `found: ${pkg.scripts?.start}`);

const port = await freePort();
const child = spawn(process.execPath, ["src/server.js"], { cwd: root, env: { ...process.env, PORT: String(port) } });
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const started = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 5000);
  const poll = setInterval(() => { if (out.includes("running at")) { clearTimeout(t); clearInterval(poll); resolve(true); } }, 50);
});
check("node src/server.js starts and prints its address", started, out.trim());
check("PORT from the environment is used", out.includes(`:${port}`), out.trim());

if (started) {
  const health = await safely(() => rawRequest(port, "/health"));
  check("GET /health -> 200", health.status === 200, JSON.stringify(health));
  check('...with body {"status":"ok"}', health.text === '{"status":"ok"}', health.text);
  check("...as JSON", /^application\/json/.test(health.headers?.["content-type"] ?? ""));

  const bodies = [];
  const page = await rawRequest(port, "/");
  bodies.push(page.text);
  check("GET / serves public/index.html", page.status === 200 && /^text\/html/.test(page.headers["content-type"]) && page.text.includes("<h1>"));
  const js = await rawRequest(port, "/app.js");
  check("static files get the right content type (app.js is text/javascript)", js.status === 200 && /^text\/javascript/.test(js.headers["content-type"]));

  section("Server behaviour in the prompt: errors, 404, safe static serving");
  const api404 = await rawRequest(port, "/api/does-not-exist");
  bodies.push(api404.text);
  check("unknown /api path -> JSON 404", api404.status === 404 && /^application\/json/.test(api404.headers["content-type"]) && isErrorShape(api404.text, "NOT_FOUND"), api404.text);
  const wrong = await rawRequest(port, "/health", { method: "POST" });
  bodies.push(wrong.text);
  check("wrong method -> JSON 405 with an Allow header", wrong.status === 405 && isErrorShape(wrong.text, "METHOD_NOT_ALLOWED") && !!wrong.headers.allow, wrong.text);
  const missing = await rawRequest(port, "/no-such-file.html");
  bodies.push(missing.text);
  check("missing file -> the same JSON error shape", missing.status === 404 && isErrorShape(missing.text, "NOT_FOUND"));

  const attacks = ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/%2e%2e%2fpackage.json", "/..%5cpackage.json", "/sub/../../package.json", "/%00", "/.env"];
  const leaked = [];
  for (const a of attacks) {
    const r = await rawRequest(port, a);
    bodies.push(r.text);
    if (r.status !== 404 || r.text.includes('"scripts"')) leaked.push(`${a} -> ${r.status}`);
  }
  check(`${attacks.length} path-escape attempts all refused (nothing outside public/ is served)`, leaked.length === 0, leaked.join("; "));
  check("no stack trace in any response seen so far", bodies.every((b) => !/\n\s+at .*[:(]\d+/.test(b)));
}
child.kill("SIGINT");

const badPort = spawnSync(process.execPath, ["src/server.js"], { cwd: root, env: { ...process.env, PORT: "abc" }, encoding: "utf8" });
check("a bad PORT stops with a clear message instead of starting", badPort.status === 1 && /PORT must be/.test(badPort.stderr), badPort.stderr);
const { loadConfig } = await load("src/config.js");
check("PORT defaults to 3000", loadConfig({}).port === 3000);

section("Rules that need a test route (no real route takes a body or fails until Build 4)");
{
  const { createApp } = await load("src/http/app.js");
  const app = createApp({
    publicDir: path.join(root, "public"),
    logger: { error() {} },
    registerRoutes(r) {
      r.post("/api/echo", ({ body }) => ({ status: 201, body: { received: body ?? null } }));
      r.get("/api/boom", () => { throw new Error("secret internal detail"); });
    },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const p = app.address().port;
  const bad = await rawRequest(p, "/api/echo", { method: "POST", body: '{"oops": ' });
  check("bad JSON -> JSON 400 (BAD_JSON)", bad.status === 400 && isErrorShape(bad.text, "BAD_JSON"), bad.text);
  const good = await rawRequest(p, "/api/echo", { method: "POST", body: '{"ok":true}' });
  check("good JSON reaches the handler", good.status === 201 && good.text === '{"received":{"ok":true}}');
  const boom = await rawRequest(p, "/api/boom");
  check("an unexpected error -> generic 500; the message and stack stay on the server",
    boom.status === 500 && isErrorShape(boom.text, "INTERNAL") && !boom.text.includes("secret") && !/\n\s+at /.test(boom.text), boom.text);
  app.closeAllConnections();
  await new Promise((r) => app.close(r));
}

section("Design rules from the prompt");
const jsFiles = (dir) => (existsSync(path.join(root, dir)) ? readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`) : []);

const importsOf = (rel) => [...read(rel).matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]);
const domainBad = jsFiles("src/domain").filter((f) => importsOf(f).some((i) => i.includes("/http") || i === "node:http" || i === "node:https"));
check("nothing calls upwards: src/domain never imports the HTTP layer", domainBad.length === 0, domainBad.join(", "));
const httpBad = jsFiles("src/http").filter((f) => importsOf(f).some((i) => i.includes("inventory")));
check("no business rules in the HTTP layer: src/http does not import inventory.js", httpBad.length === 0, httpBad.join(", "));
check("only node:http and friends, no outside packages (no dependencies in package.json)", !pkg.dependencies && !pkg.devDependencies);
const strays = jsFiles("src/http").filter((f) => !f.endsWith("/httpErrors.js") && /new\s+HttpError\s*\(/.test(read(f)));
check("every HTTP error is defined in ONE file: only src/http/httpErrors.js calls new HttpError(", strays.length === 0 && existsSync(path.join(root, "src/http/httpErrors.js")), strays.join(", "));
check("no leftover src/http/errors.js (it was renamed to httpErrors.js)", !existsSync(path.join(root, "src/http/errors.js")));
const [maj, min] = process.versions.node.split(".").map(Number);
check(`Node is 22.13 or newer (this is ${process.versions.node})`, maj > 22 || (maj === 22 && min >= 13));
check("required files exist: router, app, server, config, public/index.html",
  ["src/http/router.js", "src/http/app.js", "src/server.js", "src/config.js", "public/index.html"].every((f) => existsSync(path.join(root, f))));
check("tests exist for: state machine, router, a real /health request",
  existsSync(path.join(root, "test/bookingStateMachine.test.js")) && existsSync(path.join(root, "test/router.test.js")) && read("test/app.test.js").includes("/health"));

section("The whole test suite");
const t = spawnSync(process.execPath, ["--test", "test/**/*.test.js"], { cwd: root, encoding: "utf8" });
// Node 22 prints "# pass 156"; Node 24 prints "ℹ pass 156". Accept both, and trust the exit code first.
const summary = (word) => {
  const m = new RegExp(`^\\s*[#ℹ]\\s+${word}\\s+(\\d+)`, "m").exec(t.stdout + t.stderr);
  return m ? Number(m[1]) : null;
};
const pass = summary("pass");
const fail = summary("fail");
check(`npm test: exit code ${t.status}, ${pass ?? "?"} passed, ${fail ?? "?"} failed`,
  t.status === 0 && fail !== null && fail === 0 && pass !== null && pass > 0,
  pass === null ? "could not read the test summary; run `npm test` and read the output" : "");

section("Other deliverables");
check("docs/ai-log.md has a Build 3 entry", /build[\s-]*3/i.test(read("docs/ai-log.md")));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} automatic checks passed.`);
console.log(`
YOU STILL CHECK BY HAND (a script cannot judge these):
  [ ] You read src/http/app.js and src/http/static.js and understand every line
  [ ] docs/ai-log.md says what was really wrong, in your own words
  [ ] The diagrams look right when rendered on GitHub
  [ ] Branch build-3 is pushed, the pull request is open, and it is merged into main
`);
process.exit(failed.length ? 1 : 0);
