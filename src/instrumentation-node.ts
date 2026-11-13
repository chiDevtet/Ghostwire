import { registerAuthIndexes } from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { ensureIndexesOnce } from "@/modules/database";
import { ConfigError, DependencyUnavailableError, logger } from "@/modules/shared";

/**
 * Node-only boot check, kept in its own file so the Edge instrumentation bundle never
 * contains process.exit. Next 16 catches an error thrown from register() and keeps serving,
 * so an invalid config logs the key names and exits with code 1 instead.
 */
export function failFastOnInvalidConfig(): void {
  try {
    loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    logger.error("invalid configuration, exiting", { err: error });
    process.exit(1);
  }
}

/**
 * Creates the auth indexes at boot. Database unreachable -> logged at warn and deferred to the
 * first request (ensureAuthReady), because a database outage must not crash-loop the app.
 * Anything else (INDEX_CONFLICT: an index migration is required, or an invalid spec) -> logged
 * at error and process.exit(1), like bad config.
 */
export async function prepareDatabase(): Promise<void> {
  try {
    registerAuthIndexes();
    await ensureIndexesOnce();
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      logger.warn("database unavailable at boot; index creation deferred to first request", {
        err: error,
      });
      return;
    }
    logger.error("index preparation failed, exiting", { err: error });
    process.exit(1);
  }
}
