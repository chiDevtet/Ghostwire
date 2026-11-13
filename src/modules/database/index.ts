export type { ClientSession, Db, Filter, ObjectId, Sort, WithId } from "mongodb";
export { closeDb, getDb } from "./internal/client";
export { ping } from "./internal/ping";
export { withTransaction } from "./internal/transaction";
export type { WithTransactionOptions } from "./internal/transaction";
export {
  ensureIndexes,
  ensureIndexesOnce,
  registerIndexes,
  resetIndexRegistryForTests,
} from "./internal/indexes";
export type { IndexDirection, IndexSpec } from "./internal/indexes";
export { QUERY_MAX_TIME_MS, typedCollection } from "./internal/typed-collection";
export type { TypedCollection, TypedUpdate } from "./internal/typed-collection";
export { safeEquals } from "./internal/safe-filter";
export type { SafeScalar } from "./internal/safe-filter";
export { objectIdSchema, parseObjectId, randomObjectId } from "./internal/ids";
