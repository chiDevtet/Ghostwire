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
  "passwd",
  "pwd",
  "passphrase",
  "credential",
  "bearer",
  "jwt",
  "session",
  "csrf",
  "nonce",
] as const;

/** A scheme plus the rest of its whitespace-delimited token. */
const URI_TOKEN = /([a-z][a-z0-9+.-]*:\/\/)(\S*)/gi;
/** `Bearer <token>` / `Basic <token>`, any case; the value ends at whitespace, a quote, <, >, a comma or a semicolon. */
const AUTH_SCHEME_VALUE = /\b(Bearer|Basic)\s+[^\s"'<>,;]+/gi;
/** `name=value` for credential-like parameter names; the value ends at &, whitespace or a quote. */
const SECRET_PARAM =
  /\b(token|access_token|api-key|api_key|apikey|secret|password|session|nonce|signature)=[^&\s"']*/gi;
const MAX_DEPTH = 8;
const CIRCULAR = "[Circular]";
const TRUNCATED = "[Truncated]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/**
 * Best-effort scrubbing of credentials embedded in free text. Three passes, in order:
 *
 * 1. URI userinfo: a credentialed URI becomes `scheme://[REDACTED]@host...`.
 *    Tokens are delimited by whitespace only, so quotes and angle brackets inside a password
 *    (`u:p'q@h`, `u:p"q@h`, `u:p<q>r@h`) cannot end the token early. Everything up to the LAST
 *    `@` in the same token counts as userinfo, so unencoded `@` or `/` in a password cannot leak.
 *    A token counts as credentialed when its first `@` comes before any `/` (`user@host`) or
 *    follows a `:` (`user:pass@host`). This keeps `https://example.com/a@b` intact.
 * 2. Authorization-style values: `Bearer <token>` and `Basic <token>` (any case) become
 *    `Bearer [REDACTED]` / `Basic [REDACTED]`.
 * 3. Credential parameters: `token`, `access_token`, `api-key`, `api_key`, `apikey`, `secret`,
 *    `password`, `session`, `nonce` and `signature` (any case) followed by `=` keep the name and
 *    lose the value up to `&`, whitespace, a quote or the end of the string.
 *
 * Accepted over-redaction (safe failure): a query-string `@`, comma-joined URIs, a
 * `host:port/path@x` token, everything before the last `@` in a token that also holds other
 * quoted JSON (for example `{"uri":"mongodb://u:p@h/x","o":"a@b"}`), and prose such as
 * "Basic plan" (the next word is redacted).
 * Accepted residual risks (not scrubbed):
 * - a password containing whitespace is not scrubbed past that space;
 * - a credential split across separate log fields or strings;
 * - a value containing whitespace after `Bearer`/`Basic` (only the first word is redacted);
 * - parameter names outside the list above (for example `sig=` or `x_api_key=`) and JSON-style
 *   `"nonce":"..."` pairs inside a string (sensitive KEYS are redacted by `redact`, not here).
 */
export function scrubString(value: string): string {
  return scrubUriUserinfo(value)
    .replace(AUTH_SCHEME_VALUE, `$1 ${REDACTED}`)
    .replace(SECRET_PARAM, `$1=${REDACTED}`);
}

function scrubUriUserinfo(value: string): string {
  return value.replace(URI_TOKEN, (match: string, scheme: string, rest: string) => {
    const lastAt = rest.lastIndexOf("@");
    if (lastAt === -1) return match;
    const firstAt = rest.indexOf("@");
    const firstSlash = rest.indexOf("/");
    const credentialed =
      rest.slice(0, firstAt).includes(":") || firstSlash === -1 || firstAt < firstSlash;
    if (!credentialed) return match;
    return `${scheme}${REDACTED}@${rest.slice(lastAt + 1)}`;
  });
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

function walkError(
  error: Error,
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { name: error.name, message: scrubString(error.message) };
  const { code, errorLabels } = error as { code?: unknown; errorLabels?: unknown };
  if (code !== undefined) out.code = walk(code, depth + 1, ancestors);
  if (Array.isArray(errorLabels)) out.errorLabels = walk(errorLabels, depth + 1, ancestors);
  if (typeof error.stack === "string") out.stack = scrubString(error.stack);
  if (error.cause !== undefined) out.cause = walk(error.cause, depth + 1, ancestors);
  return out;
}
