import type { ClientSession, TransactionOptions } from "mongodb";
import { DependencyUnavailableError, logger } from "@/modules/shared";
import { getClient } from "./client";
import { hasErrorLabelDeep } from "./errors";

export interface WithTransactionOptions {
  /** Default 3; integer in [1, 10]. Shared by fn re-runs and commit retries. */
  readonly maxAttempts?: number;
}

const TRANSIENT = "TransientTransactionError";
const UNKNOWN_COMMIT = "UnknownTransactionCommitResult";
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS_LIMIT = 10;

const TRANSACTION_OPTIONS: TransactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
  readPreference: "primary",
};

interface AttemptCounter {
  value: number;
}

/**
 * Runs `fn` in a transaction with bounded, label-driven retries. This deliberately does not use
 * the driver's session.withTransaction, which retries for up to 120 s with no count bound.
 *
 * Contract for `fn`: it may run up to `maxAttempts` times. It must only perform database
 * operations that pass `session`, and it must have no external side effects (HTTP, chain
 * submission, email).
 *
 * @throws whatever fn throws (non-retryable, unchanged); DependencyUnavailableError when labelled
 *         retries are exhausted; RangeError for an invalid maxAttempts.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  options: WithTransactionOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS_LIMIT) {
    throw new RangeError(`maxAttempts must be an integer in [1, ${MAX_ATTEMPTS_LIMIT}]`);
  }

  const client = await getClient();
  const session = client.startSession();
  const attempt: AttemptCounter = { value: 1 };
  try {
    for (;;) {
      session.startTransaction(TRANSACTION_OPTIONS);
      let result: T;
      try {
        result = await fn(session);
      } catch (error) {
        await abortQuietly(session);
        if (!hasErrorLabelDeep(error, TRANSIENT)) throw error;
        if (attempt.value >= maxAttempts) throw exhausted(error);
        await backoff(attempt.value);
        attempt.value += 1;
        continue;
      }
      if ((await commit(session, attempt, maxAttempts)) === "committed") return result;
    }
  } finally {
    await session.endSession();
  }
}

/** Commits, retrying only the commit on UnknownTransactionCommitResult (never re-running fn). */
async function commit(
  session: ClientSession,
  attempt: AttemptCounter,
  maxAttempts: number,
): Promise<"committed" | "rerun"> {
  for (;;) {
    try {
      await session.commitTransaction();
      return "committed";
    } catch (error) {
      if (hasErrorLabelDeep(error, UNKNOWN_COMMIT)) {
        if (attempt.value >= maxAttempts) throw exhausted(error);
        attempt.value += 1;
        await backoff(attempt.value);
        continue;
      }
      await abortQuietly(session);
      if (hasErrorLabelDeep(error, TRANSIENT)) {
        if (attempt.value >= maxAttempts) throw exhausted(error);
        await backoff(attempt.value);
        attempt.value += 1;
        return "rerun";
      }
      throw error;
    }
  }
}

async function abortQuietly(session: ClientSession): Promise<void> {
  if (!session.inTransaction()) return;
  try {
    await session.abortTransaction();
  } catch (error) {
    logger.warn("transaction abort failed", { err: error });
  }
}

function exhausted(cause: unknown): DependencyUnavailableError {
  return new DependencyUnavailableError("database", {
    message: "transaction retries exhausted",
    cause,
  });
}

/** Full jitter: random(0, min(250, 10 * 2^attempt)) ms, i.e. at most 20, 40 and 80 ms for attempts 1-3. */
function backoff(attempt: number): Promise<void> {
  const ceiling = Math.min(250, 10 * 2 ** attempt);
  const delay = Math.floor(Math.random() * ceiling);
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}
