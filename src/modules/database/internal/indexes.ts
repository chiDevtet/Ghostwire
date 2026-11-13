import { MongoServerError, type IndexDescription } from "mongodb";
import { InternalError } from "@/modules/shared";
import { getDb } from "./client";
import { mapMongoError } from "./errors";
import { assertCollectionName } from "./names";

export type IndexDirection = 1 | -1;

export interface IndexSpec {
  /** /^[A-Za-z0-9_]{1,64}$/, unique per collection. */
  readonly name: string;
  /** At least one field; insertion order is the index key order. */
  readonly key: Readonly<Record<string, IndexDirection>>;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  /** Integer >= 0. */
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
}

const INDEX_NAME = /^[A-Za-z0-9_]{1,64}$/;
const DIRECTIONS = new Set<unknown>([1, -1]);
/** IndexOptionsConflict (85) and IndexKeySpecsConflict (86). */
const INDEX_CONFLICT_CODES = new Set<unknown>([85, 86]);

const registry = new Map<string, Map<string, IndexSpec>>();

function invalid(collection: string, detail: string): InternalError {
  return new InternalError({ code: "INDEX_SPEC_INVALID", message: `${collection}: ${detail}` });
}

function validateSpec(collection: string, spec: IndexSpec): void {
  if (!INDEX_NAME.test(spec.name)) {
    throw invalid(collection, `invalid index name ${JSON.stringify(spec.name)}`);
  }
  const fields = Object.entries(spec.key);
  if (fields.length === 0) throw invalid(collection, `index ${spec.name} has no key fields`);
  if (fields.some(([, direction]) => !DIRECTIONS.has(direction))) {
    throw invalid(collection, `index ${spec.name} directions must be 1 or -1`);
  }
  const ttl = spec.expireAfterSeconds;
  if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 0)) {
    throw invalid(collection, `index ${spec.name} expireAfterSeconds must be an integer >= 0`);
  }
}

/** Order-sensitive for `key` (index key order matters); identical source literals always match. */
function fingerprint(spec: IndexSpec): string {
  return JSON.stringify([
    Object.entries(spec.key),
    spec.unique ?? false,
    spec.sparse ?? false,
    spec.expireAfterSeconds ?? null,
    spec.partialFilterExpression ?? null,
  ]);
}

/**
 * All-or-nothing per call. Re-registering an identical spec is a no-op (safe under HMR).
 * @throws InternalError INDEX_REGISTRY_CONFLICT | INDEX_SPEC_INVALID | COLLECTION_NAME_INVALID
 */
export function registerIndexes(collection: string, specs: readonly IndexSpec[]): void {
  assertCollectionName(collection);
  const current = registry.get(collection) ?? new Map<string, IndexSpec>();
  const pending = new Map<string, IndexSpec>();
  for (const spec of specs) {
    validateSpec(collection, spec);
    const prior = pending.get(spec.name) ?? current.get(spec.name);
    if (prior !== undefined && fingerprint(prior) !== fingerprint(spec)) {
      throw new InternalError({
        code: "INDEX_REGISTRY_CONFLICT",
        message: `${collection}.${spec.name} is already registered with a different spec`,
      });
    }
    pending.set(spec.name, Object.freeze({ ...spec, key: Object.freeze({ ...spec.key }) }));
  }
  if (pending.size === 0) return;
  for (const [name, spec] of pending) current.set(name, spec);
  registry.set(collection, current);
}

function toIndexDescription(spec: IndexSpec): IndexDescription {
  return {
    name: spec.name,
    key: { ...spec.key },
    ...(spec.unique === undefined ? {} : { unique: spec.unique }),
    ...(spec.sparse === undefined ? {} : { sparse: spec.sparse }),
    ...(spec.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: spec.expireAfterSeconds }),
    ...(spec.partialFilterExpression === undefined
      ? {}
      : { partialFilterExpression: { ...spec.partialFilterExpression } }),
  };
}

/**
 * Creates every registered index. Names are explicit, so a second run is a server no-op.
 * Not called by application code in this PR. The first PR that adds a collection picks the call site.
 * @throws InternalError("INDEX_CONFLICT") on server codes 85/86; DependencyUnavailableError on connectivity
 */
export async function ensureIndexes(): Promise<void> {
  if (registry.size === 0) return;
  const db = await getDb();
  for (const [collection, specs] of registry) {
    try {
      await db.collection(collection).createIndexes([...specs.values()].map(toIndexDescription));
    } catch (error) {
      if (error instanceof MongoServerError && INDEX_CONFLICT_CODES.has(error.code)) {
        throw new InternalError({
          code: "INDEX_CONFLICT",
          message: `${collection}: an existing index conflicts with the registered spec; write an index migration`,
          cause: error,
        });
      }
      throw mapMongoError(error);
    }
  }
}

export function resetIndexRegistryForTests(): void {
  registry.clear();
}
