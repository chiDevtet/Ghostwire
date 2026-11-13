/**
 * Fail fast on invalid config and create the auth indexes at server boot (`next start` /
 * `next dev`). Skipped during `next build`, so a fresh clone builds without a .env. The Node-only
 * work lives in ./instrumentation-node behind a positive NEXT_RUNTIME check, so the Edge bundle
 * excludes it. Next runtime file: reading process.env here is an allowed exception to the
 * config-only rule.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { failFastOnInvalidConfig, prepareDatabase } = await import("./instrumentation-node");
    failFastOnInvalidConfig();
    await prepareDatabase();
  }
}
