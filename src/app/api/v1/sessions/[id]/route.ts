import {
  clearSessionCookie,
  revokeSession,
  withOrigin,
  withSession,
  type RouteHandler,
} from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { noContent } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/sessions/:id -> 204 (own sessions only; otherwise 404). Revoking the current
 * session also clears the cookie. Body never read.
 */
export const DELETE: RouteHandler<{ id: string }> = withOrigin(
  withSession(async (_request, auth, context) => {
    const { id } = await context.params;
    const { revokedCurrent } = await revokeSession(id, auth);
    return revokedCurrent
      ? noContent({ headers: { "Set-Cookie": clearSessionCookie(loadConfig().APP_ORIGIN) } })
      : noContent();
  }),
);
