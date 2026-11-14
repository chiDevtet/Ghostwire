import {
  readSessionToken,
  requestMeta,
  verifySignIn,
  withOrigin,
  type RouteHandler,
} from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { readJsonBody } from "@/modules/security";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/verify { challengeId, signature, provider? } -> 200 { user, wallet } + Set-Cookie.
 * The request's current session cookie (if any) is passed on so sign-in replaces that session.
 */
export const POST: RouteHandler = withOrigin(async (request) => {
  const meta = requestMeta(request);
  const previousToken = readSessionToken(request, loadConfig().APP_ORIGIN);
  const result = await verifySignIn(await readJsonBody(request), meta, { previousToken });
  const response = noStoreJson(result.body, { status: 200 });
  response.headers.append("Set-Cookie", result.setCookie);
  return response;
});
