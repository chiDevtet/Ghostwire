import { MongoClient, type Db, type MongoClientOptions } from "mongodb";
import { loadConfig, type AppConfig } from "@/modules/config";
import { ConfigError, DependencyUnavailableError, logger } from "@/modules/shared";
import { clearIndexMemo } from "./index-memo";

/** Every external call is bounded (architecture §5.2). */
const CLIENT_OPTIONS: MongoClientOptions = {
  appName: "ghostwire",
  serverSelectionTimeoutMS: 2000,
  connectTimeoutMS: 2000,
  socketTimeoutMS: 30_000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  retryWrites: true,
  retryReads: true,
};

interface ClientEntry {
  readonly mongo: MongoClient;
  readonly connected: Promise<MongoClient>;
}

/** Development only: survives Next dev hot reloads so pools are not leaked. */
const GLOBAL_KEY = Symbol.for("ghostwire.mongoClient");
const globalSlot = globalThis as unknown as Record<symbol, ClientEntry | undefined>;
let moduleEntry: ClientEntry | undefined;

function readEntry(): ClientEntry | undefined {
  return moduleEntry ?? globalSlot[GLOBAL_KEY];
}

function writeEntry(entry: ClientEntry | undefined, config?: AppConfig): void {
  moduleEntry = entry;
  if (entry === undefined || config?.NODE_ENV === "development") globalSlot[GLOBAL_KEY] = entry;
}

function createClient(uri: string): MongoClient {
  try {
    return new MongoClient(uri, CLIENT_OPTIONS);
  } catch {
    // The driver's parse error can echo the URI, so it is deliberately not attached as cause.
    throw new ConfigError([{ key: "MONGODB_URI", reason: "Rejected by the MongoDB driver" }]);
  }
}

async function connect(mongo: MongoClient): Promise<MongoClient> {
  try {
    return await mongo.connect();
  } catch (cause) {
    if (readEntry()?.mongo === mongo) writeEntry(undefined);
    await mongo.close().catch(() => undefined);
    throw new DependencyUnavailableError("database", {
      message: "MongoDB connection failed",
      cause,
    });
  }
}

/**
 * Internal: the shared connected client. Concurrent callers share one connect; a failed connect
 * clears the cache so the next call retries.
 * @throws ConfigError, DependencyUnavailableError
 */
export async function getClient(): Promise<MongoClient> {
  const config = loadConfig();
  const existing = readEntry();
  if (existing !== undefined) return existing.connected;
  const mongo = createClient(config.MONGODB_URI);
  const entry: ClientEntry = { mongo, connected: connect(mongo) };
  writeEntry(entry, config);
  return entry.connected;
}

/** @throws DependencyUnavailableError (connect failed/timed out), ConfigError (invalid config) */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(loadConfig().MONGODB_DB_NAME);
}

/**
 * Idempotent; never throws (close errors are logged at warn). Also clears the
 * ensureIndexesOnce() memo, because the next client may point at another server.
 */
export async function closeDb(): Promise<void> {
  const entry = readEntry();
  writeEntry(undefined);
  clearIndexMemo();
  if (entry === undefined) return;
  try {
    await entry.mongo.close();
  } catch (error) {
    logger.warn("mongodb close failed", { err: error });
  }
}
