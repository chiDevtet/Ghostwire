import { ConfigError, DependencyUnavailableError } from "@/modules/shared";
import { getDb } from "./client";

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * Races a `ping` command against a timer. Does not retry (readiness is polled by the orchestrator).
 * @throws DependencyUnavailableError on any failure or timeout; ConfigError unchanged;
 *         RangeError if timeoutMs is outside [1, 30000].
 */
export async function ping(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be in [1, ${MAX_TIMEOUT_MS}]`);
  }
  const operation = getDb().then(async (db) => {
    await db.command({ ping: 1 });
  });
  // The losing promise must never surface as an unhandled rejection.
  operation.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new DependencyUnavailableError("database", { message: `ping timed out after ${timeoutMs}ms` }),
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof DependencyUnavailableError || error instanceof ConfigError) throw error;
    throw new DependencyUnavailableError("database", { message: "ping failed", cause: error });
  } finally {
    clearTimeout(timer);
  }
}
