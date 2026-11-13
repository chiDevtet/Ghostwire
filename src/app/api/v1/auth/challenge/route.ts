import { issueChallenge, requestMeta, withOrigin, type RouteHandler } from "@/modules/auth";
import { readJsonBody } from "@/modules/security";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/challenge { address, network } -> 200 { challengeId, message, expiresAt } */
export const POST: RouteHandler = withOrigin(async (request) => {
  const meta = requestMeta(request);
  return noStoreJson(await issueChallenge(await readJsonBody(request), meta), { status: 200 });
});
