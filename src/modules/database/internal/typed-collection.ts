import type {
  ClientSession,
  Document,
  Filter,
  ObjectId,
  Sort,
  UpdateFilter,
  WithId,
} from "mongodb";
import { z } from "zod";
import { InternalError, ValidationError } from "@/modules/shared";
import { getDb } from "./client";
import { mapMongoError } from "./errors";
import { assertCollectionName } from "./names";

const MAX_FIND_LIMIT = 1000;
/** Server-side time limit for every read, update and count (entry gate 4). Inserts take none. */
export const QUERY_MAX_TIME_MS = 5000;

/** The update operators typedCollection supports. Values are validated against the schema. */
export interface TypedUpdate<S extends z.ZodObject> {
  /** Each value is parsed by schema.shape[key]; an unknown key or a failed parse -> DOCUMENT_INVALID. */
  readonly $set?: Partial<z.input<S>>;
  readonly $setOnInsert?: Partial<z.input<S>>;
  /** Keys must exist in schema.shape; values must be safe integers. */
  readonly $inc?: Partial<Record<keyof z.output<S> & string, number>>;
}

/**
 * Filters must never be built from request data except through `safeEquals`. Constant clauses
 * written in code (`revokedAt: null`, `status: "active"`, `expiresAt: { $gt: now }`) are allowed.
 */
export interface TypedCollection<S extends z.ZodObject> {
  readonly name: string;
  /** @throws ValidationError("DOCUMENT_INVALID"), ConflictError("DUPLICATE_KEY"), DependencyUnavailableError */
  insertOne(
    doc: z.input<S>,
    options?: { session?: ClientSession; id?: ObjectId },
  ): Promise<WithId<z.output<S>>>;
  /** @throws InternalError("DATA_INTEGRITY") if a stored doc fails the schema; DependencyUnavailableError */
  findOne(
    filter: Filter<z.output<S>>,
    options?: { session?: ClientSession },
  ): Promise<WithId<z.output<S>> | null>;
  /** limit is required, integer in [1, 1000] (no unbounded reads). Same throws as findOne, plus RangeError. */
  find(
    filter: Filter<z.output<S>>,
    options: { limit: number; sort?: Sort; session?: ClientSession },
  ): Promise<WithId<z.output<S>>[]>;
  /** returnDocument defaults to "after". @throws as findOne, plus ValidationError("DOCUMENT_INVALID"), ConflictError("DUPLICATE_KEY") */
  findOneAndUpdate(
    filter: Filter<z.output<S>>,
    update: TypedUpdate<S>,
    options?: { session?: ClientSession; upsert?: boolean; returnDocument?: "before" | "after" },
  ): Promise<WithId<z.output<S>> | null>;
  /** @throws ValidationError("DOCUMENT_INVALID"), ConflictError("DUPLICATE_KEY"), DependencyUnavailableError */
  updateOne(
    filter: Filter<z.output<S>>,
    update: TypedUpdate<S>,
    options?: { session?: ClientSession; upsert?: boolean },
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId: ObjectId | null }>;
  /** @throws ValidationError("DOCUMENT_INVALID"), DependencyUnavailableError */
  updateMany(
    filter: Filter<z.output<S>>,
    update: TypedUpdate<S>,
    options?: { session?: ClientSession },
  ): Promise<{ matchedCount: number; modifiedCount: number }>;
  /** limit, when given, is an integer in [1, 1000]; otherwise RangeError. @throws DependencyUnavailableError */
  countDocuments(
    filter: Filter<z.output<S>>,
    options?: { session?: ClientSession; limit?: number },
  ): Promise<number>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function asDocumentFilter(filter: unknown): Filter<Document> {
  return filter as Filter<Document>;
}

function issuePaths(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".")))
    .join(", ");
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FIND_LIMIT) {
    throw new RangeError(`limit must be an integer in [1, ${MAX_FIND_LIMIT}]`);
  }
}

/**
 * The Zod schema is the single source of truth for the document shape, excluding `_id` (schemas
 * must not declare `_id`). Writes store the parsed output; reads are parsed. Sync, no I/O.
 * Filters must never be built from request data except through `safeEquals`.
 * @throws InternalError("COLLECTION_NAME_INVALID")
 */
export function typedCollection<S extends z.ZodObject>(
  name: string,
  schema: S,
): TypedCollection<S> {
  assertCollectionName(name);
  type Stored = WithId<z.output<S>>;
  const shape: Readonly<Record<string, z.ZodType | undefined>> = schema.shape;

  async function collection() {
    return (await getDb()).collection<Document>(name);
  }

  function documentInvalid(detail: string, cause?: unknown): ValidationError {
    return new ValidationError({
      code: "DOCUMENT_INVALID",
      safeMessage: "Invalid document",
      message: `${name}: ${detail}`,
      cause,
    });
  }

  function parseStored(doc: WithId<Document>): Stored {
    const { _id, ...rest } = doc;
    const parsed = schema.safeParse(rest);
    if (!parsed.success) {
      throw new InternalError({
        code: "DATA_INTEGRITY",
        message: `${name}: stored document failed schema validation at ${issuePaths(parsed.error)}`,
        cause: parsed.error,
      });
    }
    return { _id, ...asRecord(parsed.data) } as unknown as Stored;
  }

  /** Validates every field of a typed update against the schema. Error messages name keys only. */
  function toDriverUpdate(update: TypedUpdate<S>): UpdateFilter<Document> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const operator of ["$set", "$setOnInsert"] as const) {
      const fields: Record<string, unknown> | undefined = update[operator];
      if (fields === undefined) continue;
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        const fieldSchema = shape[key];
        if (fieldSchema === undefined)
          throw documentInvalid(`${operator}.${key} is not in the schema`);
        const result = z.safeParse(fieldSchema, value);
        if (!result.success) throw documentInvalid(`${operator}.${key}`, result.error);
        parsed[key] = result.data;
      }
      out[operator] = parsed;
    }
    if (update.$inc !== undefined) {
      const increments: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(update.$inc)) {
        if (shape[key] === undefined || !Number.isSafeInteger(value)) {
          throw documentInvalid(`$inc.${key}`);
        }
        increments[key] = value;
      }
      out.$inc = increments;
    }
    if (Object.keys(out).length === 0) throw documentInvalid("empty update");
    return out as UpdateFilter<Document>;
  }

  return {
    name,

    async insertOne(doc, options = {}) {
      const parsed = schema.safeParse(doc);
      if (!parsed.success) throw documentInvalid(issuePaths(parsed.error), parsed.error);
      const data = asRecord(parsed.data);
      try {
        // Copy: the driver mutates the inserted object to add _id.
        const toInsert = options.id === undefined ? { ...data } : { _id: options.id, ...data };
        const { insertedId } = await (
          await collection()
        ).insertOne(toInsert, { session: options.session });
        return { _id: insertedId, ...data } as unknown as Stored;
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async findOne(filter, options = {}) {
      try {
        const doc = await (
          await collection()
        ).findOne(asDocumentFilter(filter), {
          session: options.session,
          maxTimeMS: QUERY_MAX_TIME_MS,
        });
        return doc === null ? null : parseStored(doc);
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async find(filter, options) {
      const { limit, sort, session } = options;
      assertLimit(limit);
      try {
        const cursor = (await collection()).find(asDocumentFilter(filter), {
          limit,
          session,
          maxTimeMS: QUERY_MAX_TIME_MS,
        });
        const docs = await (sort === undefined ? cursor : cursor.sort(sort)).toArray();
        return docs.map((doc) => parseStored(doc));
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async findOneAndUpdate(filter, update, options = {}) {
      const driverUpdate = toDriverUpdate(update);
      try {
        const doc = await (
          await collection()
        ).findOneAndUpdate(asDocumentFilter(filter), driverUpdate, {
          session: options.session,
          upsert: options.upsert ?? false,
          returnDocument: options.returnDocument ?? "after",
          maxTimeMS: QUERY_MAX_TIME_MS,
        });
        return doc === null ? null : parseStored(doc);
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async updateOne(filter, update, options = {}) {
      const driverUpdate = toDriverUpdate(update);
      try {
        const result = await (
          await collection()
        ).updateOne(asDocumentFilter(filter), driverUpdate, {
          session: options.session,
          upsert: options.upsert ?? false,
          maxTimeMS: QUERY_MAX_TIME_MS,
        });
        return {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          upsertedId: (result.upsertedId as ObjectId | null | undefined) ?? null,
        };
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async updateMany(filter, update, options = {}) {
      const driverUpdate = toDriverUpdate(update);
      try {
        const result = await (
          await collection()
        ).updateMany(asDocumentFilter(filter), driverUpdate, {
          session: options.session,
          maxTimeMS: QUERY_MAX_TIME_MS,
        });
        return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async countDocuments(filter, options = {}) {
      if (options.limit !== undefined) assertLimit(options.limit);
      try {
        return await (
          await collection()
        ).countDocuments(asDocumentFilter(filter), {
          session: options.session,
          maxTimeMS: QUERY_MAX_TIME_MS,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        });
      } catch (error) {
        throw mapMongoError(error);
      }
    },
  };
}
