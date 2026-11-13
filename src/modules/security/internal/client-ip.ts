import { isIP } from "node:net";

const UNKNOWN = "unknown";

/**
 * trustProxy=false -> "unknown" (one shared bucket: fails safe toward stricter limits).
 * trustProxy=true -> the first comma-separated X-Forwarded-For entry, trimmed, only if
 * net.isIP() accepts it; otherwise "unknown". The result is used only inside rate-limit key
 * hashes and is never persisted or logged.
 */
export function clientIp(request: Request, trustProxy: boolean): string {
  if (!trustProxy) return UNKNOWN;
  const header = request.headers.get("x-forwarded-for");
  if (header === null) return UNKNOWN;
  const first = (header.split(",")[0] ?? "").trim();
  return isIP(first) === 0 ? UNKNOWN : first;
}
