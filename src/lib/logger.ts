/**
 * Minimal structured logger (JSON lines), suitable for Vercel / any log drain.
 * Keys that may carry secrets or sensitive personal data are redacted.
 */
const REDACT =
  /pass(word)?|token|secret|authorization|cookie|signature|otp|code|narrative|whatHappened|document|card/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(redact(ctx ?? {}) as object),
  });
  if (level === "error" || level === "warn") console.error(line);
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};

export { redact as redactForLog };
