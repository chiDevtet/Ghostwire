import { listWallets, withSession, type RouteHandler } from "@/modules/auth";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/wallets -> 200 { wallets: [{ id, address, network, provider, status, linkedAt }] } */
export const GET: RouteHandler = withSession(async (_request, auth) =>
  noStoreJson({ wallets: await listWallets(auth) }),
);
