import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { createSqliteRepository } from "./repositories/sqlite.js";
import { DEFAULT_DB_PATH } from "./db/connection.js";
import { createEventService } from "./services/eventService.js";
import { createBookingService } from "./services/bookingService.js";
import { createAuthService } from "./services/authService.js";
import { charge } from "./lib/mockPaymentGateway.js";
import { registerApiRoutes } from "./http/apiRoutes.js";
import { registerAuthRoutes } from "./http/authRoutes.js";

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Fail fast if the token signing secret is not configured. Without it,
// every token is forgeable, so the server must not start.
if (!process.env.TOKEN_SECRET || process.env.TOKEN_SECRET.length < 16) {
  console.error(
    "TOKEN_SECRET: must be set to at least 16 characters before starting the server"
  );
  process.exit(1);
}

const repository = createSqliteRepository(process.env.TICKETING_DB_PATH || DEFAULT_DB_PATH);
const eventService = createEventService(repository);
const bookingService = createBookingService(repository, { charge });
const authService = createAuthService(repository);

const server = createApp({
  publicDir: config.publicDir,
  maxBodyBytes: config.maxBodyBytes,
  registerRoutes(router) {
    registerAuthRoutes(router, authService);
    registerApiRoutes(router, eventService, bookingService);
  },
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Try another one, for example: PORT=3001 npm start`);
  } else {
    console.error("Server error:", error);
  }
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`Event Ticketing server running at http://localhost:${server.address().port}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  repository.close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 10_000).unref(); // give up waiting after 10 seconds
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
