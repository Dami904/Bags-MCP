// Turns raw provider/SDK errors into short, friendly, human-readable messages,
// and decides when a provider failure is worth falling back to another model.

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; statusCode?: number } | null;
  return e?.status ?? e?.statusCode;
}

// True when the failure means "this model can't answer right now" — i.e. it's
// safe/sensible to try the other model instead (billing, auth, rate, network, outage).
export function isProviderUnavailable(err: unknown): boolean {
  const msg = extractMessage(err).toLowerCase();
  const status = statusOf(err);
  if (status && [401, 402, 403, 429, 500, 503, 529].includes(status)) return true;
  return [
    "credit balance", "too low", "quota", "rate limit", "rate_limit",
    "overloaded", "unauthorized", "invalid api key", "invalid x-api-key",
    "authentication", "insufficient", "billing", "payment", "exceeded",
    "permission", "fetch failed", "network", "timeout", "econn", "enotfound",
  ].some(k => msg.includes(k));
}

// Maps any error into a calm, user-facing sentence (never raw JSON / stack traces).
export function humanizeError(err: unknown, provider: "claude" | "gemini" = "claude"): string {
  const msg = extractMessage(err).toLowerCase();
  const status = statusOf(err);
  const name = provider === "gemini" ? "Gemini" : "Claude";

  if (msg.includes("credit balance") || msg.includes("billing") || msg.includes("payment") ||
      status === 402 || (provider === "claude" && msg.includes("too low"))) {
    return `${name} is temporarily unavailable — the account is out of API credits. Try switching models in Settings, or add your own ${name} API key.`;
  }
  if (msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("quota") ||
      msg.includes("exceeded") || status === 429) {
    return `${name} is getting a lot of requests right now (rate limit reached). Give it a few seconds and try again, or switch models in Settings.`;
  }
  if (msg.includes("overloaded") || status === 529 || status === 503) {
    return `${name} is overloaded at the moment. Please try again in a few seconds.`;
  }
  if (msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("invalid x-api-key") ||
      msg.includes("authentication") || msg.includes("api key") || status === 401 || status === 403) {
    return `${name} didn't accept the API key. Check or update the key in Settings — or switch models.`;
  }
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("enotfound") ||
      msg.includes("econn") || msg.includes("timeout")) {
    return `Couldn't reach ${name} — looks like a network hiccup. Please try again in a moment.`;
  }
  if (msg.includes("not found") || status === 404) {
    return `The ${name} model couldn't be reached (it may be misconfigured). Try the other model in Settings.`;
  }
  return `Something went wrong while talking to ${name}. Please try again in a moment — or switch models in Settings.`;
}
