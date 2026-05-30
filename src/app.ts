import express, { Request, Response, NextFunction } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getMetrics } from "./metrics.js";
import { getTopTokens } from "./api/bags.js";
import { chatStream } from "./chat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, "../public")));

  // ── Auth for /mcp ──────────────────────────────────────────────────────────
  const authToken = process.env.MCP_AUTH_TOKEN;
  app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
    if (authToken) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${authToken}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  // ── MCP endpoint ───────────────────────────────────────────────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const mcpServer = await createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Chat (SSE streaming) ───────────────────────────────────────────────────
  app.post("/api/chat", async (req: Request, res: Response) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: "Chat not available — ANTHROPIC_API_KEY not configured." });
      return;
    }
    const { message, history = [] } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering if behind proxy
    res.flushHeaders();
    try {
      await chatStream(message, history, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Chat error" })}\n\n`);
    }
    res.end();
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  app.get("/api/metrics", (_: Request, res: Response) => {
    res.json(getMetrics());
  });

  app.get("/api/trending", async (_: Request, res: Response) => {
    try {
      const tokens = await getTopTokens(10);
      res.json(tokens);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch trending tokens" });
    }
  });

  app.get("/health", (_: Request, res: Response) => {
    res.json({ status: "ok", name: "bags-mcp-server" });
  });

  // ── Pages ──────────────────────────────────────────────────────────────────
  app.get("/dashboard", (_: Request, res: Response) => {
    res.sendFile(join(__dirname, "../public/dashboard.html"));
  });
  app.get("/chat", (_: Request, res: Response) => {
    res.sendFile(join(__dirname, "../public/chat.html"));
  });

  return app;
}
