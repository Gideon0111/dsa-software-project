import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/http/app.js";
import { createSqliteRepository } from "../src/repositories/sqlite.js";
import { createAuthService } from "../src/services/authService.js";
import { registerAuthRoutes } from "../src/http/authRoutes.js";
import { registerApiRoutes } from "../src/http/apiRoutes.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { charge } from "../src/lib/mockPaymentGateway.js";
import { DomainError, ErrorCode } from "../src/domain/errors.js";

const TOKEN_SECRET = "test-secret-at-least-16-chars";

function makeRequest(port) {
  async function request(path, { method = "GET", body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path,
          method,
          headers: { "content-type": "application/json", ...headers },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (text += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, text }),
          );
        },
      );
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : "");
    });
  }

  async function json(path, opts = {}) {
    const res = await request(path, opts);
    const body = res.text ? JSON.parse(res.text) : null;
    return { status: res.status, headers: res.headers, body };
  }

  return { request, json };
}

describe("Build 7: Authentication", () => {
  describe("createAuthService (unit)", () => {
    let repo;
    let authService;

    before(async () => {
      process.env.TOKEN_SECRET = TOKEN_SECRET;
      repo = createSqliteRepository(":memory:");
      authService = createAuthService(repo);
    });

    after(async () => {
      repo.close();
      delete process.env.TOKEN_SECRET;
    });

    test("signup creates a user and returns a signed token", async () => {
      const result = await authService.signup({
        email: "alice1@example.com",
        password: "secret1234",
        role: "attendee",
      });
      assert.ok(result.token);
      assert.equal(result.user.email, "alice1@example.com");
      assert.equal(result.user.role, "attendee");
      assert.ok(result.user.id);
      assert.equal(Object.keys(result.user).length, 3);
    });

    test("signup normalizes email to lowercase", async () => {
      const result = await authService.signup({
        email: "ALICE2@Example.COM",
        password: "secret1234",
        role: "attendee",
      });
      assert.equal(result.user.email, "alice2@example.com");
    });

    test("signup rejects duplicate email with EMAIL_TAKEN", async () => {
      await authService.signup({
        email: "bob1@example.com",
        password: "secret1234",
        role: "attendee",
      });
      await assert.rejects(
        () =>
          authService.signup({
            email: "BOB1@EXAMPLE.COM",
            password: "secret1234",
            role: "organizer",
          }),
        (err) => err.code === ErrorCode.EMAIL_TAKEN
      );
    });

    test("signup rejects short password with VALIDATION", async () => {
      await assert.rejects(
        () =>
          authService.signup({
            email: "short@example.com",
            password: "short",
            role: "attendee",
          }),
        (err) => err.code === ErrorCode.VALIDATION
      );
    });

    test("signup rejects invalid role with VALIDATION", async () => {
      await assert.rejects(
        () =>
          authService.signup({
            email: "badrole@example.com",
            password: "secret1234",
            role: "god",
          }),
        (err) => err.code === ErrorCode.VALIDATION
      );
    });

    test("signup rejects invalid email with VALIDATION", async () => {
      await assert.rejects(
        () =>
          authService.signup({
            email: "not-an-email",
            password: "secret1234",
            role: "attendee",
          }),
        (err) => err.code === ErrorCode.VALIDATION
      );
    });

    test("login returns a token for valid credentials", async () => {
      await authService.signup({
        email: "carol1@example.com",
        password: "secret1234",
        role: "organizer",
      });
      const result = await authService.login({
        email: "carol1@example.com",
        password: "secret1234",
      });
      assert.ok(result.token);
      assert.equal(result.user.email, "carol1@example.com");
      assert.equal(result.user.role, "organizer");
    });

    test("login rejects wrong password with INVALID_CREDENTIALS", async () => {
      await assert.rejects(
        () =>
          authService.login({
            email: "carol1@example.com",
            password: "wrongpassword",
          }),
        (err) => err.code === ErrorCode.INVALID_CREDENTIALS
      );
    });

    test("login rejects unknown email with INVALID_CREDENTIALS (same error)", async () => {
      await assert.rejects(
        () =>
          authService.login({
            email: "nobody@example.com",
            password: "secret1234",
          }),
        (err) => err.code === ErrorCode.INVALID_CREDENTIALS
      );
    });

    test("me returns safe profile without password hash", async () => {
      const { user } = await authService.signup({
        email: "dave@example.com",
        password: "secret1234",
        role: "staff",
      });
      const profile = await authService.me(user.id);
      assert.equal(profile.email, "dave@example.com");
      assert.equal(profile.role, "staff");
      assert.equal(Object.keys(profile).length, 3);
      assert.equal(profile.passwordHash, undefined);
      assert.equal(profile.password, undefined);
    });

    test("me rejects unknown user with NOT_FOUND", async () => {
      await assert.rejects(
        () => authService.me("non-existent-user-id"),
        (err) => err.code === ErrorCode.NOT_FOUND
      );
    });
  });

  describe("HTTP auth routes", () => {
    let server;
    let json;
    let port;

    before(async () => {
      process.env.TOKEN_SECRET = TOKEN_SECRET;

      const repo = createSqliteRepository(":memory:");
      const authService = createAuthService(repo);
      const eventService = createEventService(repo);
      const bookingService = createBookingService(repo, { charge });

      const app = createApp({
        publicDir: "/tmp",
        maxBodyBytes: 1000,
        registerRoutes(router) {
          registerAuthRoutes(router, authService);
          registerApiRoutes(router, eventService, bookingService);
        },
      });

      await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
      port = app.address().port;
      json = makeRequest(port).json;

      server = app;
    });

    after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      delete process.env.TOKEN_SECRET;
    });

    test("POST /api/auth/signup creates account and returns token", async () => {
      const res = await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "eve@example.com",
          password: "secret1234",
          role: "attendee",
        },
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.token);
      assert.equal(res.body.user.email, "eve@example.com");
      assert.equal(res.body.user.role, "attendee");
      assert.equal(res.body.user.passwordHash, undefined);
    });

    test("POST /api/auth/signup rejects duplicate email", async () => {
      await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "frank@example.com",
          password: "secret1234",
          role: "attendee",
        },
      });
      const res = await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "FRANK@EXAMPLE.COM",
          password: "secret1234",
          role: "organizer",
        },
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "EMAIL_TAKEN");
    });

    test("POST /api/auth/signup rejects short password", async () => {
      const res = await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "grace@example.com",
          password: "short",
          role: "attendee",
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION");
    });

    test("POST /api/auth/login returns token for valid credentials", async () => {
      await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "heidi@example.com",
          password: "secret1234",
          role: "organizer",
        },
      });
      const res = await json("/api/auth/login", {
        method: "POST",
        body: {
          email: "heidi@example.com",
          password: "secret1234",
        },
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
      assert.equal(res.body.user.role, "organizer");
    });

    test("POST /api/auth/login rejects wrong password with INVALID_CREDENTIALS", async () => {
      const res = await json("/api/auth/login", {
        method: "POST",
        body: {
          email: "heidi@example.com",
          password: "wrongpassword",
        },
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
    });

    test("POST /api/auth/login rejects unknown email with INVALID_CREDENTIALS (same error)", async () => {
      const res = await json("/api/auth/login", {
        method: "POST",
        body: {
          email: "nobody@example.com",
          password: "secret1234",
        },
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
    });

    test("GET /api/auth/me returns safe profile with bearer token", async () => {
      const signupRes = await json("/api/auth/signup", {
        method: "POST",
        body: {
          email: "ivan@example.com",
          password: "secret1234",
          role: "staff",
        },
      });
      const token = signupRes.body.token;
      const res = await json("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, "ivan@example.com");
      assert.equal(res.body.user.role, "staff");
      assert.equal(res.body.user.passwordHash, undefined);
    });
  });
});