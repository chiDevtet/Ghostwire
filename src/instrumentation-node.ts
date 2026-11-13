import { loadConfig } from "@/modules/config";
import { ConfigError, logger } from "@/modules/shared";

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
