import type { ClientSession, Document, Filter, Sort, WithId } from "mongodb";
import type { z } from "zod";
import { InternalError, ValidationError } from "@/modules/shared";
import { getDb } from "./client";
import { mapMongoError } from "./errors";
import { assertCollectionName } from "./names";

const MAX_FIND_LIMIT = 1000;

export interface TypedCollection<S extends z.ZodObject> {
  readonly name: string;
  /** @throws ValidationError("DOCUMENT_INVALID"), ConflictError("DUPLICATE_KEY"), DependencyUnavailableError */
  insertOne(doc: z.input<S>, options?: { session?: ClientSession }): Promise<WithId<z.output<S>>>;
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

/**
 * The Zod schema is the single source of truth for the document shape, excluding `_id` (schemas
 * must not declare `_id`). Writes store the parsed output; reads are parsed. Sync, no I/O.
 * @throws InternalError("COLLECTION_NAME_INVALID")
 */
export function typedCollection<S extends z.ZodObject>(
  name: string,
  schema: S,
): TypedCollection<S> {
  assertCollectionName(name);
  type Stored = WithId<z.output<S>>;

  async function collection() {
    return (await getDb()).collection<Document>(name);
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

  return {
    name,

    async insertOne(doc, options = {}) {
      const parsed = schema.safeParse(doc);
      if (!parsed.success) {
        throw new ValidationError({
          code: "DOCUMENT_INVALID",
          safeMessage: "Invalid document",
          message: `${name}: ${issuePaths(parsed.error)}`,
          cause: parsed.error,
        });
      }
      const data = asRecord(parsed.data);
      try {
        // Copy: the driver mutates the inserted object to add _id.
        const { insertedId } = await (
          await collection()
        ).insertOne({ ...data }, { session: options.session });
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
        });
        return doc === null ? null : parseStored(doc);
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async find(filter, options) {
      const { limit, sort, session } = options;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FIND_LIMIT) {
        throw new RangeError(`limit must be an integer in [1, ${MAX_FIND_LIMIT}]`);
      }
      try {
        const cursor = (await collection()).find(asDocumentFilter(filter), { limit, session });
        const docs = await (sort === undefined ? cursor : cursor.sort(sort)).toArray();
        return docs.map((doc) => parseStored(doc));
      } catch (error) {
        throw mapMongoError(error);
      }
    },
  };
}
