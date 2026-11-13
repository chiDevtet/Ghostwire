import { isIP } from "node:net";

const UNKNOWN = "unknown";
const MAPPED_V4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

function canonical(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  // WHATWG URL serializes IPv6 to compressed lowercase form, so equal addresses compare equal.
  const host = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = MAPPED_V4.exec(host);
  if (mapped === null) return host;
  const high = parseInt(mapped[1] ?? "", 16);
  const low = parseInt(mapped[2] ?? "", 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * trustProxy=false -> "unknown" (one shared bucket: fails safe toward stricter limits).
 * trustProxy=true -> the LAST comma-separated X-Forwarded-For entry, trimmed: the one the nearest
 * trusted proxy appended (earlier entries are client-controlled). It must pass net.isIP() and carry
 * no zone id ("%"); otherwise "unknown", with no fallback to other entries. IPv4-mapped IPv6 maps to
 * dotted IPv4 and IPv6 is canonicalized (compressed, lowercase). The result is used only inside
 * rate-limit key hashes and is never persisted or logged.
 */
export function clientIp(request: Request, trustProxy: boolean): string {
  if (!trustProxy) return UNKNOWN;
  const header = request.headers.get("x-forwarded-for");
  if (header === null) return UNKNOWN;
  const entries = header.split(",");
  const last = (entries[entries.length - 1] ?? "").trim();
  if (last.includes("%") || isIP(last) === 0) return UNKNOWN;
  return canonical(last);
}
