import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: no dependency checks; it cannot fail because of the database or config. */
export function GET(_request: Request): Response {
  return noStoreJson({ status: "ok" }, { status: 200 });
}
