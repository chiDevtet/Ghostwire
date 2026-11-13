import { DependencyUnavailableError, RateLimitedError, isAppError } from "./errors";
import { logger } from "./logger";

const RETRY_AFTER_SECONDS = "5";
const INTERNAL_BODY = { code: "INTERNAL", message: "Internal error" } as const;

/** JSON.stringify replacer: bigint becomes its decimal string (JSON has no bigint). */
function bigintAsString(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function noStoreJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, bigintAsString), {
    status: init.status ?? 200,
    headers,
  });
}

/** 204 with Cache-Control: no-store and no body (a 204 Response cannot carry a body). */
export function noContent(init: { headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 204, headers });
}

/**
 * Logs the full error server-side (with its original code); the client only ever sees a stable
 * code and safe message. Every status >= 500 collapses to INTERNAL, except
 * DependencyUnavailableError, which keeps its 503 code and Retry-After. RateLimitedError adds
 * Retry-After with its own seconds.
 */
export function toErrorResponse(error: unknown): Response {
  const code = isAppError(error) ? error.code : "INTERNAL";
  logger.error("request failed", { err: error, code });
  if (!isAppError(error)) return noStoreJson(INTERNAL_BODY, { status: 500 });
  if (error instanceof DependencyUnavailableError) {
    return noStoreJson(
      { code: error.code, message: error.safeMessage },
      { status: error.httpStatus, headers: { "Retry-After": RETRY_AFTER_SECONDS } },
    );
  }
  if (error.httpStatus >= 500) return noStoreJson(INTERNAL_BODY, { status: 500 });
  const headers: Record<string, string> =
    error instanceof RateLimitedError ? { "Retry-After": String(error.retryAfterSeconds) } : {};
  return noStoreJson(
    { code: error.code, message: error.safeMessage },
    { status: error.httpStatus, headers },
  );
}
