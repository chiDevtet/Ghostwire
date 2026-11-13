export const REDACTED = "[REDACTED]" as const;

const SENSITIVE_KEY_PARTS = [
  "key",
  "seed",
  "secret",
  "token",
  "password",
  "mnemonic",
  "viewingkey",
  "privatekey",
  "signature",
  "authorization",
  "cookie",
] as const;

const CREDENTIAL_URI = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const MAX_DEPTH = 8;
const CIRCULAR = "[Circular]";
const TRUNCATED = "[Truncated]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/** Replaces any `scheme://user:pass@` credential segment with `scheme://[REDACTED]@`. */
export function scrubString(value: string): string {
  return value.replace(CREDENTIAL_URI, `$1${REDACTED}@`);
}

/** Pure: returns a JSON-safe, redacted copy of `value`. Never mutates the input. */
export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet<object>());
}

function walk(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (ancestors.has(value)) return CIRCULAR;

  ancestors.add(value);
  try {
    if (value instanceof Error) return walkError(value, depth, ancestors);
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, ancestors));
    if (value instanceof Map) {
      return walkEntries(
        Array.from(value.entries(), ([k, v]) => [String(k), v] as const),
        depth,
        ancestors,
      );
    }
    if (value instanceof Set) return Array.from(value, (item) => walk(item, depth + 1, ancestors));
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") return walk(toJSON.call(value), depth, ancestors);
    return walkEntries(Object.entries(value), depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function walkEntries(
  entries: readonly (readonly [string, unknown])[],
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, ancestors);
  }
  return out;
}

function walkError(error: Error, depth: number, ancestors: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = { name: error.name, message: scrubString(error.message) };
  const { code, errorLabels } = error as { code?: unknown; errorLabels?: unknown };
  if (code !== undefined) out.code = walk(code, depth + 1, ancestors);
  if (Array.isArray(errorLabels)) out.errorLabels = walk(errorLabels, depth + 1, ancestors);
  if (typeof error.stack === "string") out.stack = scrubString(error.stack);
  if (error.cause !== undefined) out.cause = walk(error.cause, depth + 1, ancestors);
  return out;
}
