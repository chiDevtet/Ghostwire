import {
  clearSessionCookie,
  logout,
  withOrigin,
  withSession,
  type RouteHandler,
} from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { noContent } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/logout -> 204, revokes the current session and clears the cookie. Body never read. */
export const POST: RouteHandler = withOrigin(
  withSession(async (_request, auth) => {
    await logout(auth);
    return noContent({ headers: { "Set-Cookie": clearSessionCookie(loadConfig().APP_ORIGIN) } });
  }),
);
