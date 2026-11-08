import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig, parsePort, DEFAULT_PORT } from "../src/config.js";

describe("PORT", () => {
  test("defaults to 3000 when unset or empty", () => {
    assert.equal(DEFAULT_PORT, 3000);
    assert.equal(parsePort(undefined), 3000);
    assert.equal(parsePort(""), 3000);
    assert.equal(parsePort("   "), 3000);
    assert.equal(loadConfig({}).port, 3000);
  });

  test("reads a valid port from the environment", () => {
    assert.equal(parsePort("8080"), 8080);
    assert.equal(parsePort(" 4000 "), 4000);
    assert.equal(parsePort("0"), 0);
    assert.equal(parsePort("65535"), 65535);
    assert.equal(loadConfig({ PORT: "5001" }).port, 5001);
  });

  test("refuses anything that is not a whole port number", () => {
    for (const bad of ["abc", "3000abc", "-1", "1.5", "65536", "99999", "0x50", "1e3"]) {
      assert.throws(() => parsePort(bad), /PORT must be a whole number/, bad);
    }
  });
});

describe("loadConfig", () => {
  test("points publicDir at the project's public folder and is frozen", () => {
    const config = loadConfig({});
    assert.equal(path.basename(config.publicDir), "public");
    assert.ok(path.isAbsolute(config.publicDir));
    assert.ok(Object.isFrozen(config));
  });
});
