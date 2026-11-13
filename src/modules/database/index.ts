export type { ClientSession, Db, Filter, ObjectId, Sort, WithId } from "mongodb";
export { closeDb, getDb } from "./internal/client";
export { ping } from "./internal/ping";
export { withTransaction } from "./internal/transaction";
export type { WithTransactionOptions } from "./internal/transaction";
export { ensureIndexes, registerIndexes, resetIndexRegistryForTests } from "./internal/indexes";
export type { IndexDirection, IndexSpec } from "./internal/indexes";
export { typedCollection } from "./internal/typed-collection";
export type { TypedCollection } from "./internal/typed-collection";
