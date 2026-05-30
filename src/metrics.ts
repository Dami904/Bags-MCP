import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = join(__dirname, "../metrics.json");
const REDIS_KEY = "bagsmcp:metrics";

export interface Metrics {
  totalCalls: number;
  toolCounts: Record<string, number>;
  modelCounts: Record<string, number>;
  recentCalls: { tool: string; model: string; timestamp: string }[];
  startedAt: string;
}

const DEFAULT: Metrics = {
  totalCalls: 0,
  toolCounts: {},
  modelCounts: {},
  recentCalls: [],
  startedAt: new Date().toISOString(),
};

function merge(data: Record<string, unknown>): Metrics {
  return {
    totalCalls: (data.totalCalls as number) ?? 0,
    toolCounts: (data.toolCounts as Record<string, number>) ?? {},
    modelCounts: (data.modelCounts as Record<string, number>) ?? {},
    recentCalls: (data.recentCalls as Metrics["recentCalls"]) ?? [],
    startedAt: (data.startedAt as string) ?? new Date().toISOString(),
  };
}

// ── Upstash Redis (persistent across restarts) ──────────────────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

async function redisGet(): Promise<Metrics | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const r = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", REDIS_KEY]),
    });
    const { result } = await r.json() as { result: string | null };
    return result ? merge(JSON.parse(result)) : null;
  } catch {
    return null;
  }
}

async function redisSet(m: Metrics): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(UPSTASH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", REDIS_KEY, JSON.stringify(m)]),
    });
  } catch {
    // non-fatal
  }
}

// ── Local file fallback ────────────────────────────────────────────────────
function fileLoad(): Metrics {
  if (existsSync(METRICS_FILE)) {
    try {
      return merge(JSON.parse(readFileSync(METRICS_FILE, "utf-8")));
    } catch {}
  }
  return { ...DEFAULT, startedAt: new Date().toISOString() };
}

function fileSave(m: Metrics): void {
  try { writeFileSync(METRICS_FILE, JSON.stringify(m, null, 2)); } catch {}
}

// ── In-memory state ────────────────────────────────────────────────────────
let state: Metrics = fileLoad();

// Hydrate from Redis on startup — overwrites file-based state if Redis has data
(async () => {
  const redis = await redisGet();
  if (redis) state = redis;
})();

// ── Public API ─────────────────────────────────────────────────────────────
export async function recordToolCall(toolName: string, model = "unknown"): Promise<void> {
  state.totalCalls++;
  state.toolCounts[toolName] = (state.toolCounts[toolName] ?? 0) + 1;
  state.modelCounts[model] = (state.modelCounts[model] ?? 0) + 1;
  state.recentCalls.unshift({ tool: toolName, model, timestamp: new Date().toISOString() });
  if (state.recentCalls.length > 100) state.recentCalls = state.recentCalls.slice(0, 100);
  fileSave(state);
  await redisSet(state);
}

export function getMetrics(): Metrics {
  return { ...state };
}
