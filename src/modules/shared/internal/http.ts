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
 * Maps any thrown value to a safe response; the client only ever sees a stable code and safe
 * message. Logging by status class: unknown throws and every status >= 500 log at error with the
 * error object (original code kept); UNAUTHENTICATED (401) logs at debug; every other status
 * below 500 logs at warn with { code, status } only (no err, so no stack). Every status >= 500
 * collapses to INTERNAL, except DependencyUnavailableError, which keeps its 503 code and
 * Retry-After. RateLimitedError adds Retry-After with its own seconds.
 */
export function toErrorResponse(error: unknown): Response {
  if (!isAppError(error)) {
    logger.error("request failed", { err: error, code: "INTERNAL" });
    return noStoreJson(INTERNAL_BODY, { status: 500 });
  }
  const status = error.httpStatus;
  if (status >= 500) logger.error("request failed", { err: error, code: error.code });
  else if (error.code === "UNAUTHENTICATED")
    logger.debug("request rejected", { code: error.code, status });
  else logger.warn("request rejected", { code: error.code, status });
  if (error instanceof DependencyUnavailableError) {
    return noStoreJson(
      { code: error.code, message: error.safeMessage },
      { status, headers: { "Retry-After": RETRY_AFTER_SECONDS } },
    );
  }
  if (status >= 500) return noStoreJson(INTERNAL_BODY, { status: 500 });
  const headers: Record<string, string> =
    error instanceof RateLimitedError ? { "Retry-After": String(error.retryAfterSeconds) } : {};
  return noStoreJson({ code: error.code, message: error.safeMessage }, { status, headers });
}
