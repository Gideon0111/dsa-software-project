import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DomainError, ErrorCode } from "../src/domain/errors.js";
import {
  HttpError, HttpCode, HTTP_STATUS, DOMAIN_STATUS, toErrorResponse,
  badRequestUrl, badJson, notFound, methodNotAllowed, payloadTooLarge, internalError,
} from "../src/http/httpErrors.js";

const fakeLogger = () => {
  const calls = [];
  return { calls, error: (...args) => calls.push(args) };
};

describe("HTTP-only codes -> status table", () => {
  test("EVERY HttpCode has a status, and the table has no leftovers", () => {
    for (const code of Object.values(HttpCode)) {
      assert.ok(Object.hasOwn(HTTP_STATUS, code), `HttpCode.${code} has no status in HTTP_STATUS`);
    }
    for (const code of Object.keys(HTTP_STATUS)) {
      assert.ok(Object.values(HttpCode).includes(code), `${code} is not an HttpCode`);
    }
  });

  test("statuses are the agreed ones", () => {
    assert.deepEqual({ ...HTTP_STATUS }, {
      BAD_REQUEST: 400,
      BAD_JSON: 400,
      NOT_FOUND: 404,
      METHOD_NOT_ALLOWED: 405,
      PAYLOAD_TOO_LARGE: 413,
      INTERNAL: 500,
    });
  });
});

describe("HttpError", () => {
  test("takes its status from the table, so the status is never typed at the place that throws", () => {
    const e = new HttpError(HttpCode.PAYLOAD_TOO_LARGE, "too big");
    assert.equal(e.status, 413);
    assert.equal(e.code, "PAYLOAD_TOO_LARGE");
    assert.equal(e.message, "too big");
    assert.deepEqual(e.headers, {});
  });

  test("an unknown code fails loudly, like DomainError does", () => {
    assert.throws(() => new HttpError("NOPE", "x"), TypeError);
    assert.throws(() => new HttpError(413, "x"), TypeError); // the old (status, code, message) order is refused
  });
});

describe("one function per error", () => {
  const cases = [
    ["badRequestUrl", badRequestUrl(), 400, "BAD_REQUEST"],
    ["badJson", badJson(), 400, "BAD_JSON"],
    ["notFound", notFound(), 404, "NOT_FOUND"],
    ["methodNotAllowed", methodNotAllowed(["GET"]), 405, "METHOD_NOT_ALLOWED"],
    ["payloadTooLarge", payloadTooLarge(), 413, "PAYLOAD_TOO_LARGE"],
    ["internalError", internalError(), 500, "INTERNAL"],
  ];
  for (const [name, error, status, code] of cases) {
    test(`${name}() is ${status} ${code}`, () => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(typeof error.message, "string");
    });
  }

  test("notFound takes its own message", () => {
    assert.equal(notFound("File not found").message, "File not found");
  });

  test("methodNotAllowed puts the allowed methods in an Allow header", () => {
    assert.deepEqual(methodNotAllowed(["GET", "HEAD", "POST"]).headers, { Allow: "GET, HEAD, POST" });
  });

  test("payloadTooLarge tells the client the connection will close", () => {
    assert.deepEqual(payloadTooLarge().headers, { Connection: "close" });
  });
});

describe("domain code -> HTTP status table", () => {
  test("EVERY domain error code has a status (a new code cannot be forgotten)", () => {
    for (const code of Object.values(ErrorCode)) {
      assert.ok(Object.hasOwn(DOMAIN_STATUS, code), `ErrorCode.${code} has no HTTP status in DOMAIN_STATUS`);
    }
  });

  test("the table has no leftover codes that no longer exist", () => {
    for (const code of Object.keys(DOMAIN_STATUS)) {
      assert.ok(Object.values(ErrorCode).includes(code), `${code} is not an ErrorCode`);
    }
  });

  test("statuses are the agreed ones", () => {
    assert.deepEqual({ ...DOMAIN_STATUS }, {
      VALIDATION: 400,
      NOT_FOUND: 404,
      SOLD_OUT: 409,
      CONFLICT: 409,
      INVALID_STATE: 409,
      INVALID_TRANSITION: 409,
    });
  });
});

describe("toErrorResponse", () => {
  test("a domain error keeps its code and message and gets its mapped status", () => {
    const logger = fakeLogger();
    const out = toErrorResponse(new DomainError(ErrorCode.SOLD_OUT, "Only 1 ticket(s) left"), logger);
    assert.equal(out.status, 409);
    assert.deepEqual(out.body, { error: { code: "SOLD_OUT", message: "Only 1 ticket(s) left" } });
    assert.equal(logger.calls.length, 0);
  });

  test("domain error details are NOT sent to the client", () => {
    const out = toErrorResponse(new DomainError(ErrorCode.VALIDATION, "title: required", { field: "title", secret: 1 }), fakeLogger());
    assert.deepEqual(Object.keys(out.body.error).sort(), ["code", "message"]);
  });

  test("an HttpError keeps its status, code and headers", () => {
    const out = toErrorResponse(methodNotAllowed(["GET"]), fakeLogger());
    assert.equal(out.status, 405);
    assert.deepEqual(out.headers, { Allow: "GET" });
    assert.deepEqual(out.body, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  });

  test("anything unexpected becomes a generic 500, is logged, and leaks nothing", () => {
    const logger = fakeLogger();
    const boom = new TypeError("database password is hunter2");
    const out = toErrorResponse(boom, logger);
    assert.equal(out.status, 500);
    assert.deepEqual(out.body, { error: { code: "INTERNAL", message: "Something went wrong on our side" } });
    assert.ok(!JSON.stringify(out).includes("hunter2"));
    assert.ok(!JSON.stringify(out).includes(" at "));
    assert.equal(logger.calls.length, 1);
    assert.equal(logger.calls[0][1], boom); // the real error goes to the log
  });

  test("a thrown string or null is still handled", () => {
    assert.equal(toErrorResponse("oops", fakeLogger()).status, 500);
    assert.equal(toErrorResponse(null, fakeLogger()).status, 500);
  });
});
