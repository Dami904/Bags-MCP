import "dotenv/config";
import { startStdioServer } from "./server.js";
import { startHttpServer } from "./http-server.js";

if (process.env.NODE_ENV === "production") {
  startHttpServer().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  startStdioServer().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
