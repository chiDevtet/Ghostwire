const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SECONDS_PER_DAY = 86_400;

export type SessionCookieName = "__Host-gw_session" | "gw_session";

const BOTH_NAMES: readonly string[] = ["__Host-gw_session", "gw_session"];

/** https origins get the __Host- prefix (and Secure); http (local dev only) gets gw_session. */
export function sessionCookieName(appOrigin: string): SessionCookieName {
  return appOrigin.startsWith("https://") ? "__Host-gw_session" : "gw_session";
}

function attributes(appOrigin: string, maxAgeSeconds: number): string {
  const secure = appOrigin.startsWith("https://") ? "; Secure" : "";
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secure}; SameSite=Lax`;
}

export function buildSessionCookie(
  token: string,
  maxAgeSeconds: number,
  appOrigin: string,
): string {
  return `${sessionCookieName(appOrigin)}=${token}; ${attributes(appOrigin, maxAgeSeconds)}`;
}

/** The same name and attributes with an empty value and Max-Age=0. */
export function clearSessionCookie(appOrigin: string): string {
  return `${sessionCookieName(appOrigin)}=; ${attributes(appOrigin, 0)}`;
}

/** The value when it is a 43-char base64url session token, else null. */
export function parseSessionTokenValue(value: string | undefined): string | null {
  return value !== undefined && TOKEN_PATTERN.test(value) ? value : null;
}

/** [name, value] for every "name=value" pair of the Cookie header (pairs without "=" skipped). */
function cookiePairs(request: Request): [string, string][] {
  const header = request.headers.get("cookie");
  if (header === null) return [];
  const pairs: [string, string][] = [];
  for (const part of header.split(";")) {
    const pair = part.trim();
    const eq = pair.indexOf("=");
    if (eq !== -1) pairs.push([pair.slice(0, eq), pair.slice(eq + 1)]);
  }
  return pairs;
}

/**
 * The first cookie with the configured name whose value is a 43-char base64url token, else null.
 * Malformed values never reach the database.
 */
export function readSessionToken(request: Request, appOrigin: string): string | null {
  const name = sessionCookieName(appOrigin);
  for (const [key, value] of cookiePairs(request)) {
    if (key !== name) continue;
    const token = parseSessionTokenValue(value);
    if (token !== null) return token;
  }
  return null;
}

/** True when the Cookie header carries a non-empty value under either session cookie name. */
export function carriesSessionCookie(request: Request): boolean {
  return cookiePairs(request).some(([key, value]) => BOTH_NAMES.includes(key) && value !== "");
}

/** True if the response already sets the session cookie (so a logout clear wins over a slide). */
export function hasSessionCookie(response: Response, appOrigin: string): boolean {
  const prefix = `${sessionCookieName(appOrigin)}=`;
  return response.headers.getSetCookie().some((value) => value.startsWith(prefix));
}

/** Max-Age for a freshly issued session. */
export function idleMaxAgeSeconds(idleDays: number): number {
  return idleDays * SECONDS_PER_DAY;
}

/** Max-Age after a slide: whole seconds from `at` to the session's (capped) expiresAt. */
export function remainingMaxAgeSeconds(expiresAt: Date, at: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - at.getTime()) / 1000));
}
