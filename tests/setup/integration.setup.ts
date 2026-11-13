import { randomUUID } from "node:crypto";
import { afterAll, inject } from "vitest";
import { resetConfigForTests } from "@/modules/config";
import { closeDb, getDb } from "@/modules/database";

// @types/next types NODE_ENV as read-only, hence the cast.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.MONGODB_URI = inject("mongoUri");
// One database per test file, so files can run in parallel safely.
process.env.MONGODB_DB_NAME = `gw_test_${randomUUID().slice(0, 8)}`;
resetConfigForTests();

afterAll(async () => {
  try {
    await (await getDb()).dropDatabase();
  } catch {
    // The server may have been stopped on purpose by the test file.
  }
  await closeDb();
  resetConfigForTests();
});
