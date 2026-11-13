import { randomUUID } from "node:crypto";
import { afterAll, afterEach, inject } from "vitest";
import { resetConfigForTests } from "@/modules/config";
import { closeDb, getDb } from "@/modules/database";
import { resetClockForTests } from "@/modules/shared";

// @types/next types NODE_ENV as read-only, hence the cast.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.MONGODB_URI = inject("mongoUri");
// One database per test file, so files can run in parallel safely.
process.env.MONGODB_DB_NAME = `gw_test_${randomUUID().slice(0, 8)}`;
// Auth config (PR 02a). https gives the __Host- cookie path. Flows in one file share the
// "unknown" client-IP bucket, so the rate limits are raised; rate-limit tests lower them with useEnv.
process.env.APP_ORIGIN = "https://ghostwire.test";
process.env.SOLANA_NETWORKS = "devnet,mainnet-beta";
process.env.TRUST_PROXY = "false";
process.env.RATE_LIMIT_CHALLENGE_PER_MIN = "1000";
process.env.RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS = "1000";
process.env.RATE_LIMIT_VERIFY_PER_MIN = "1000";
resetConfigForTests();

afterEach(() => {
  resetClockForTests();
});

afterAll(async () => {
  try {
    await (await getDb()).dropDatabase();
  } catch {
    // The server may have been stopped on purpose by the test file.
  }
  await closeDb();
  resetConfigForTests();
});
