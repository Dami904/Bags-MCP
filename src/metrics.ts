import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = join(__dirname, "../metrics.json");

export interface Metrics {
  totalCalls: number;
  toolCounts: Record<string, number>;
  modelCounts: Record<string, number>;
  recentCalls: { tool: string; model: string; timestamp: string; type?: string }[];
  startedAt: string;
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

const K = {
  total:     "bagsmcp:v2:total",
  tools:     "bagsmcp:v2:tools",
  models:    "bagsmcp:v2:models",
  recent:    "bagsmcp:v2:recent",
  startedAt: "bagsmcp:v2:started_at",
};

let state: Metrics = {
  totalCalls: 0,
  toolCounts: {},
  modelCounts: {},
  recentCalls: [],
  startedAt: new Date().toISOString(),
};

// ── Upstash pipeline (atomic multi-command) ────────────────────────────────
async function pipeline(commands: unknown[][]): Promise<unknown[]> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return [];
  try {
    const r = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    const results = await r.json() as { result: unknown }[];
    return results.map(x => x.result);
  } catch {
    return [];
  }
}

function hgetallToRecord(arr: unknown): Record<string, number> {
  if (!Array.isArray(arr)) return {};
  const rec: Record<string, number> = {};
  for (let i = 0; i < arr.length; i += 2) {
    rec[arr[i] as string] = parseInt(arr[i + 1] as string, 10) || 0;
  }
  return rec;
}

// ── Local file fallback ────────────────────────────────────────────────────
function fileSave(m: Metrics): void {
  try { writeFileSync(METRICS_FILE, JSON.stringify(m, null, 2)); } catch {}
}

function fileLoad(): Metrics {
  if (existsSync(METRICS_FILE)) {
    try {
      const d = JSON.parse(readFileSync(METRICS_FILE, "utf-8"));
      return {
        totalCalls:  d.totalCalls  ?? 0,
        toolCounts:  d.toolCounts  ?? {},
        modelCounts: d.modelCounts ?? {},
        recentCalls: d.recentCalls ?? [],
        startedAt:   d.startedAt   ?? new Date().toISOString(),
      };
    } catch {}
  }
  return { totalCalls: 0, toolCounts: {}, modelCounts: {}, recentCalls: [], startedAt: new Date().toISOString() };
}

// ── Startup: hydrate from Redis before accepting any writes ────────────────
let readyResolve!: () => void;
const readyPromise = new Promise<void>(res => { readyResolve = res; });

(async () => {
  state = fileLoad();

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const [total, tools, models, recent, startedAt] = await pipeline([
      ["GET",     K.total],
      ["HGETALL", K.tools],
      ["HGETALL", K.models],
      ["LRANGE",  K.recent, 0, 99],
      ["GET",     K.startedAt],
    ]);

    if (total !== null && total !== undefined) {
      state.totalCalls  = parseInt(total as string, 10) || 0;
      state.toolCounts  = hgetallToRecord(tools);
      state.modelCounts = hgetallToRecord(models);
      state.recentCalls = ((recent as string[]) ?? [])
        .map(s => { try { return JSON.parse(s); } catch { return null; } })
        .filter(Boolean);
      if (startedAt) state.startedAt = startedAt as string;
    } else {
      // First ever run — persist the start time
      await pipeline([["SET", K.startedAt, state.startedAt, "NX"]]);
    }
  }

  readyResolve();
})();

// ── Public API ─────────────────────────────────────────────────────────────
export async function recordToolCall(
  toolName: string,
  model = "unknown",
  type: "tool" | "chat" = "tool",
): Promise<void> {
  // Wait for Redis hydration so we never overwrite real data with stale in-memory state
  await readyPromise;

  const entry = { tool: toolName, model, timestamp: new Date().toISOString(), type };

  // Update in-memory immediately
  state.totalCalls++;
  state.toolCounts[toolName]  = (state.toolCounts[toolName]  ?? 0) + 1;
  state.modelCounts[model]    = (state.modelCounts[model]    ?? 0) + 1;
  state.recentCalls.unshift(entry);
  if (state.recentCalls.length > 100) state.recentCalls = state.recentCalls.slice(0, 100);
  fileSave(state);

  // Atomic Redis increments — numbers can only go up, never get overwritten
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await pipeline([
      ["INCR",    K.total],
      ["HINCRBY", K.tools,  toolName, 1],
      ["HINCRBY", K.models, model,    1],
      ["LPUSH",   K.recent, JSON.stringify(entry)],
      ["LTRIM",   K.recent, 0, 99],
    ]);
  }
}

export function getMetrics(): Metrics {
  return { ...state, recentCalls: [...state.recentCalls] };
}
