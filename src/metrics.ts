import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = join(__dirname, "../metrics.json");

export interface Metrics {
  totalCalls: number;
  toolCounts: Record<string, number>;
  modelCounts: Record<string, number>;
  recentCalls: { tool: string; model: string; timestamp: string }[];
  startedAt: string;
}

function load(): Metrics {
  if (existsSync(METRICS_FILE)) {
    try {
      return JSON.parse(readFileSync(METRICS_FILE, "utf-8"));
    } catch {
      // fall through to default
    }
  }
  return {
    totalCalls: 0,
    toolCounts: {},
    modelCounts: {},
    recentCalls: [],
    startedAt: new Date().toISOString(),
  };
}

function save(m: Metrics) {
  try {
    writeFileSync(METRICS_FILE, JSON.stringify(m, null, 2));
  } catch {
    // non-fatal — metrics are still tracked in memory
  }
}

const state = load();

export function recordToolCall(toolName: string, model = "unknown") {
  state.totalCalls++;
  state.toolCounts[toolName] = (state.toolCounts[toolName] ?? 0) + 1;
  state.modelCounts[model] = (state.modelCounts[model] ?? 0) + 1;
  state.recentCalls.unshift({ tool: toolName, model, timestamp: new Date().toISOString() });
  if (state.recentCalls.length > 100) state.recentCalls = state.recentCalls.slice(0, 100);
  save(state);
}

export function getMetrics(): Metrics {
  return { ...state };
}
