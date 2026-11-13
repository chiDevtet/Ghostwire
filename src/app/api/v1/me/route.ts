import { getMe, withSession, type RouteHandler } from "@/modules/auth";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/me -> 200 { user, session, wallets } */
export const GET: RouteHandler = withSession(async (_request, auth) =>
  noStoreJson(await getMe(auth)),
);
