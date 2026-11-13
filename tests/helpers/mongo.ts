import { MongoMemoryServer } from "mongodb-memory-server-core";
import { resetConfigForTests } from "@/modules/config";
import { closeDb } from "@/modules/database";

/** Points the database module at a new URI: set env, drop the memoized config, close the client. */
export async function useDatabaseUri(uri: string): Promise<void> {
  process.env.MONGODB_URI = uri;
  resetConfigForTests();
  await closeDb();
}

/** A dedicated standalone server that a test may stop to simulate an outage. */
export async function startStandalone(): Promise<MongoMemoryServer> {
  return MongoMemoryServer.create({ binary: { version: "7.0.12" } });
}
