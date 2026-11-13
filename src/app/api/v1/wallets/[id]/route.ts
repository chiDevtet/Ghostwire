import {
  clearSessionCookie,
  unlinkWallet,
  withOrigin,
  withSession,
  type RouteHandler,
} from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { noContent } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/wallets/:id -> 204; 409 LAST_WALLET for the only active wallet; 404 if not
 * owned. Unlinking the wallet the current session was created with also clears the cookie.
 */
export const DELETE: RouteHandler<{ id: string }> = withOrigin(
  withSession(async (_request, auth, context) => {
    const { id } = await context.params;
    const { revokedCurrent } = await unlinkWallet(id, auth);
    return revokedCurrent
      ? noContent({ headers: { "Set-Cookie": clearSessionCookie(loadConfig().APP_ORIGIN) } })
      : noContent();
  }),
);
