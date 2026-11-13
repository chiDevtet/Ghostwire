import { ping } from "@/modules/database";
import { logger, noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness: reflects MongoDB (<= 2 s via ping). Any failure, ConfigError included, is "not ready". */
export async function GET(_request: Request): Promise<Response> {
  try {
    await ping();
    return noStoreJson({ status: "ready", checks: { database: "up" } }, { status: 200 });
  } catch (error) {
    logger.warn("readiness check failed", { err: error });
    return noStoreJson({ status: "unavailable", checks: { database: "down" } }, { status: 503 });
  }
}
