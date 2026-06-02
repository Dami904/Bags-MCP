import express, { Request, Response, NextFunction } from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getMetrics, recordToolCall } from "./metrics.js";
import { getTopTokens } from "./api/bags.js";
import { chatStream, type StreamEvent } from "./chat.js";
import { geminiStream } from "./gemini.js";
import { humanizeError, isProviderUnavailable } from "./errors.js";

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

  // ── MCP endpoint — all methods required by Streamable HTTP spec ────────────
  app.all("/mcp", async (req: Request, res: Response) => {
    try {
      const mcpServer = await createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => transport.close());
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Chat (SSE streaming — Claude with graceful Gemini fallback) ───────────
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { message, history = [], model = "gemini", apiKey } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Please type a message first." });
      return;
    }

    // Per-model keys. A user-supplied key only applies to the model they picked;
    // Gemini fallback always uses the server's own key.
    const claudeKey = model === "claude" ? (apiKey || process.env.ANTHROPIC_API_KEY) : process.env.ANTHROPIC_API_KEY;
    const geminiKey = model === "gemini" ? (apiKey || process.env.GEMINI_API_KEY) : process.env.GEMINI_API_KEY;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: StreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Track whether anything user-visible was streamed, so we only fall back
    // when the answer hasn't started yet (avoids duplicate/partial output).
    let streamed = false;
    const track = (event: StreamEvent) => {
      if (event.type === "text" || event.type === "tool_start") streamed = true;
      send(event);
    };

    const runGemini = async (notice?: string): Promise<void> => {
      if (!geminiKey) {
        send({ type: "error", message: "Gemini isn't set up on this server yet. Add your own Gemini key in Settings to start chatting." });
        return;
      }
      if (notice) send({ type: "notice", message: notice, model: "gemini" });
      recordToolCall("chat_request", "gemini", "chat").catch(() => {});
      await geminiStream(message, history, track, geminiKey);
    };

    try {
      if (model === "gemini") {
        if (!geminiKey) {
          send({ type: "error", message: "Gemini isn't set up on this server yet. Add your own Gemini key in Settings to start chatting." });
        } else {
          recordToolCall("chat_request", "gemini", "chat").catch(() => {});
          await geminiStream(message, history, track, geminiKey);
        }
      } else {
        // Claude selected.
        if (!claudeKey) {
          // No Claude key configured → gracefully answer with Gemini.
          await runGemini("Claude isn't set up on this server, so I answered with Gemini instead. You can add your own Claude key in Settings.");
        } else {
          recordToolCall("chat_request", "claude", "chat").catch(() => {});
          try {
            await chatStream(message, history, track, claudeKey);
          } catch (err) {
            // Claude failed (out of credits, rate-limited, bad key, outage…).
            // If nothing was shown yet and Gemini is available, fall back to it.
            if (!streamed && geminiKey && isProviderUnavailable(err)) {
              await runGemini("Claude is unavailable right now, so I answered with Gemini instead.");
            } else {
              send({ type: "error", message: humanizeError(err, "claude") });
            }
          }
        }
      }
    } catch (err) {
      // A Gemini failure (primary or fallback) lands here.
      if (!streamed) send({ type: "error", message: humanizeError(err, "gemini") });
    }
    res.end();
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  app.get("/api/metrics", async (_: Request, res: Response) => {
    res.json(await getMetrics());
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
