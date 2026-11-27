import { requireUser } from "./guards.js";

export function registerAuthRoutes(router, authService) {
  router.post("/api/auth/signup", async ({ body }) => {
    const { user, token } = await authService.signup({
      email: body.email,
      password: body.password,
      role: body.role,
    });
    return { status: 201, body: { user, token } };
  });

  router.post("/api/auth/login", async ({ body }) => {
    const { user, token } = await authService.login({
      email: body.email,
      password: body.password,
    });
    return { status: 200, body: { user, token } };
  });

  router.get("/api/auth/me", async ({ req }) => {
    requireUser(req);
    const user = await authService.me(req.user.id);
    return { status: 200, body: { user } };
  });
}