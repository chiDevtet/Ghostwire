import { verifyLink, withOrigin, withSession, type RouteHandler } from "@/modules/auth";
import { readJsonBody } from "@/modules/security";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/wallets/link/verify { challengeId, signature, provider? } -> 201 { wallet } (200 if it already existed) */
export const POST: RouteHandler = withOrigin(
  withSession(async (request, auth) => {
    const { wallet, created } = await verifyLink(await readJsonBody(request), auth);
    return noStoreJson({ wallet }, { status: created ? 201 : 200 });
  }),
);
