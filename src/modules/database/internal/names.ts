import { InternalError } from "@/modules/shared";

/** snake_case collection names, per docs/DATA_MODEL.md. */
const COLLECTION_NAME = /^[a-z][a-z0-9_]{0,62}$/;

export function assertCollectionName(name: string): void {
  if (!COLLECTION_NAME.test(name)) {
    throw new InternalError({
      code: "COLLECTION_NAME_INVALID",
      message: `invalid collection name ${JSON.stringify(name)}; expected ${COLLECTION_NAME.source}`,
    });
  }
}
