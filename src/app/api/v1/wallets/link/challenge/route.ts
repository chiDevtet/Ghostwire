import { issueLinkChallenge, withOrigin, withSession, type RouteHandler } from "@/modules/auth";
import { readJsonBody } from "@/modules/security";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/wallets/link/challenge { address, network } -> 200 { challengeId, message, expiresAt } */
export const POST: RouteHandler = withOrigin(
  withSession(async (request, auth) =>
    noStoreJson(await issueLinkChallenge(await readJsonBody(request), auth), { status: 200 }),
  ),
);
