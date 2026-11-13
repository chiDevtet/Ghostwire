import { loadConfig } from "@/modules/config";
import { now } from "@/modules/shared";
import { parseSessionTokenValue, sessionCookieName } from "./cookies";
import { resolveSession } from "./sessions";
import type { CookieReader, PageSession } from "./types";

/**
 * For server components: reads the configured cookie name, then
 * resolveSession(token, now(), { slide: false }). Never writes. A missing or malformed value
 * returns null without touching the database.
 * @throws DependencyUnavailableError when the database is unreachable
 */
export async function resolvePageSession(cookies: CookieReader): Promise<PageSession | null> {
  const name = sessionCookieName(loadConfig().APP_ORIGIN);
  const token = parseSessionTokenValue(cookies.get(name)?.value);
  if (token === null) return null;
  const at = now();
  const resolution = await resolveSession(token, at, { slide: false });
  return resolution === null ? null : { at, session: resolution.session };
}
