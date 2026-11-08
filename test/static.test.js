import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeSegments } from "../src/http/static.js";

describe("safeSegments: URL path -> safe folder and file names", () => {
  test("normal paths become a list of names", () => {
    assert.deepEqual(safeSegments("/"), []);
    assert.deepEqual(safeSegments("/index.html"), ["index.html"]);
    assert.deepEqual(safeSegments("/css/site.css"), ["css", "site.css"]);
    assert.deepEqual(safeSegments("/sub/"), ["sub"]);
    assert.deepEqual(safeSegments("/my%20file.txt"), ["my file.txt"]);
  });

  test("every way of writing '..' is refused", () => {
    for (const bad of [
      "/..", "/../x", "/a/../x", "/%2e%2e/x", "/%2E%2E/x", "/..%2fx", "/%2e%2e%2fx",
      "/a/%2e%2e/%2e%2e/x", "/..%5cx", "/....//x", "/.",
    ]) {
      assert.equal(safeSegments(bad), null, bad);
    }
  });

  test("null bytes, backslashes, hidden files and broken %-escapes are refused", () => {
    for (const bad of ["/%00", "/a%00.png", "/a\\b", "/.env", "/sub/.git/config", "/%E0%A4%A"]) {
      assert.equal(safeSegments(bad), null, bad);
    }
  });

  test("a double-encoded '..' is just an odd file name, because we decode only once", () => {
    assert.deepEqual(safeSegments("/%252e%252e/x"), ["%2e%2e", "x"]);
  });
});
