import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../src/http/router.js";

const noop = () => {};

describe("router: finding routes", () => {
  test("finds a plain route and returns its handler", () => {
    const router = createRouter();
    const handler = () => "x";
    router.get("/health", handler);
    const result = router.match("GET", "/health");
    assert.equal(result.kind, "found");
    assert.equal(result.handler, handler);
    assert.deepEqual(result.params, {});
  });

  test("reads :params, and decodes them", () => {
    const router = createRouter();
    router.get("/events/:eventId/tiers/:tierId", noop);
    const result = router.match("GET", "/events/e1/tiers/General%20Admission");
    assert.deepEqual(result.params, { eventId: "e1", tierId: "General Admission" });
  });

  test("a trailing slash makes no difference, and the root path works", () => {
    const router = createRouter();
    router.get("/events", noop);
    router.get("/", noop);
    assert.equal(router.match("GET", "/events/").kind, "found");
    assert.equal(router.match("GET", "/").kind, "found");
  });

  test("an encoded slash stays inside ONE parameter and never splits the path", () => {
    const router = createRouter();
    router.get("/files/:name", noop);
    assert.equal(router.match("GET", "/files/a%2Fb").params.name, "a/b");
    assert.equal(router.match("GET", "/files/a/b").kind, "not_found");
  });

  test("a parameter needs a value", () => {
    const router = createRouter();
    router.get("/events/:id", noop);
    assert.equal(router.match("GET", "/events").kind, "not_found"); 
    assert.equal(router.match("GET", "/events//").kind, "not_found");
  });

  test("the first registered route that fits wins, so list specific routes first", () => {
    const router = createRouter();
    const featured = () => "featured";
    const byId = () => "byId";
    router.get("/events/featured", featured);
    router.get("/events/:id", byId);
    assert.equal(router.match("GET", "/events/featured").handler, featured);
    assert.equal(router.match("GET", "/events/42").handler, byId);
  });

  test("same path, different methods, different handlers", () => {
    const router = createRouter();
    const read = () => "read";
    const create = () => "create";
    router.get("/events", read);
    router.post("/events", create);
    assert.equal(router.match("GET", "/events").handler, read);
    assert.equal(router.match("POST", "/events").handler, create);
  });

  test("HEAD is answered by the GET route", () => {
    const router = createRouter();
    router.get("/health", noop);
    assert.equal(router.match("HEAD", "/health").kind, "found");
  });
});

describe("router: when nothing fits", () => {
  test("an unknown path is not_found", () => {
    const router = createRouter();
    router.get("/health", noop);
    assert.deepEqual(router.match("GET", "/nope"), { kind: "not_found" });
  });

  test("a known path with the wrong method lists the allowed methods", () => {
    const router = createRouter();
    router.get("/events", noop);
    router.post("/events", noop);
    assert.deepEqual(router.match("DELETE", "/events"), {
      kind: "method_not_allowed",
      allow: ["GET", "HEAD", "POST"],
    });
  });

  test("a malformed %-escape or a path without a leading slash is not_found, never a crash", () => {
    const router = createRouter();
    router.get("/files/:name", noop);
    assert.equal(router.match("GET", "/files/%E0%A4%A").kind, "not_found");
    assert.equal(router.match("GET", "files/x").kind, "not_found");
    assert.equal(router.match("GET", undefined).kind, "not_found");
  });
});

describe("router: registering routes (mistakes are caught at start-up)", () => {
  test("a duplicate route is refused, even when the parameter has another name", () => {
    const router = createRouter();
    router.get("/events/:id", noop);
    assert.throws(() => router.get("/events/:id", noop), /already registered/);
    assert.throws(() => router.get("/events/:eventId", noop), /already registered/);
    assert.doesNotThrow(() => router.post("/events/:id", noop));
  });

  test("bad paths, bad names, bad methods and bad handlers are refused", () => {
    const router = createRouter();
    assert.throws(() => router.get("events", noop), TypeError);
    assert.throws(() => router.get("/a//b", noop), TypeError);
    assert.throws(() => router.get("/a?x=1", noop), TypeError);
    assert.throws(() => router.get("/a/:", noop), TypeError);
    assert.throws(() => router.get("/a/:1x", noop), TypeError);
    assert.throws(() => router.get("/a/:id/b/:id", noop), TypeError);
    assert.throws(() => router.add("TRACE", "/a", noop), TypeError);
    assert.throws(() => router.get("/a", "not a function"), TypeError);
  });
});
