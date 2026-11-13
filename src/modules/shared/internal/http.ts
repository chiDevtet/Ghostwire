import { DependencyUnavailableError, isAppError } from "./errors";
import { logger } from "./logger";

const RETRY_AFTER_SECONDS = "5";

export function noStoreJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** Logs the full error server-side; the client only ever sees a stable code and safe message. */
export function toErrorResponse(error: unknown): Response {
  logger.error("request failed", { err: error });
  if (isAppError(error)) {
    const headers: Record<string, string> =
      error instanceof DependencyUnavailableError ? { "Retry-After": RETRY_AFTER_SECONDS } : {};
    return noStoreJson(
      { code: error.code, message: error.safeMessage },
      { status: error.httpStatus, headers },
    );
  }
  return noStoreJson({ code: "INTERNAL", message: "Internal error" }, { status: 500 });
}
