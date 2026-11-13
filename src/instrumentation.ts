/**
 * Fail fast on invalid config at server boot (`next start` / `next dev`). Skipped during
 * `next build`, so a fresh clone builds without a .env. Next runtime file: reading
 * process.env here is an allowed exception to the config-only rule.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { loadConfig } = await import("@/modules/config");
  loadConfig();
}
