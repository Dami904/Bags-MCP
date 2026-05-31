import express, { Request, Response, NextFunction } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getMetrics, recordToolCall } from "./metrics.js";
import { getTopTokens } from "./api/bags.js";
import { chatStream } from "./chat.js";
import { geminiStream } from "./gemini.js";

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

  // ── MCP endpoint (GET + POST + DELETE required by Streamable HTTP spec) ────
  const mcpHandler = async (req: Request, res: Response) => {
    try {
      const mcpServer = await createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  };
  app.get("/mcp", mcpHandler);
  app.post("/mcp", mcpHandler);
  app.delete("/mcp", mcpHandler);

  // ── Chat (SSE streaming — supports Claude and Gemini) ─────────────────────
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { message, history = [], model = "claude", apiKey } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Resolve API key: user-provided key takes priority, then server env var
    const resolvedClaudeKey = model === "claude" ? (apiKey || process.env.ANTHROPIC_API_KEY) : null;
    const resolvedGeminiKey = model === "gemini" ? (apiKey || process.env.GEMINI_API_KEY) : null;

    if (model === "claude" && !resolvedClaudeKey) {
      res.status(503).json({ error: "No Anthropic API key. Provide your own key in Settings or ask the admin to configure one." });
      return;
    }
    if (model === "gemini" && !resolvedGeminiKey) {
      res.status(503).json({ error: "No Gemini API key. Provide your own key in Settings." });
      return;
    }

    // Record every chat request (fire-and-forget, don't block the stream)
    recordToolCall("chat_request", model, "chat").catch(() => {});

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    try {
      if (model === "gemini") {
        await geminiStream(message, history, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`), resolvedGeminiKey!);
      } else {
        await chatStream(message, history, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`), resolvedClaudeKey!);
      }
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
