import { listSessions, withSession, type RouteHandler } from "@/modules/auth";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/sessions -> 200 { sessions: [{ id, current, createdAt, lastSeenAt, expiresAt, userAgent }] } */
export const GET: RouteHandler = withSession(async (_request, auth) =>
  noStoreJson({ sessions: await listSessions(auth) }),
);
