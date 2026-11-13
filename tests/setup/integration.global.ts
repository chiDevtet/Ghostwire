import type { TestProject } from "vitest/node";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * One single-node replica set for the whole integration run (transactions need a replica set).
 * MONGOMS_SYSTEM_BINARY=/usr/bin/mongod makes the library use the local 7.0.12 binary;
 * otherwise it downloads 7.0.12. MongoDB 8.x has no Ubuntu 20.04 build, so the version is pinned.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: "7.0.12" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  project.provide("mongoUri", replSet.getUri());
  return async () => {
    await replSet.stop({ doCleanup: true });
  };
}
