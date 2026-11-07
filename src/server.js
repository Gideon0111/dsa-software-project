import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = createApp({ publicDir: config.publicDir, maxBodyBytes: config.maxBodyBytes });

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
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref(); // give up waiting after 10 seconds
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
