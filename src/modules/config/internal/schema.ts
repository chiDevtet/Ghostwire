import { z } from "zod";
import { LOG_LEVELS } from "@/modules/shared";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Schema key order; ConfigError issues are reported in this order. */
export const ENV_KEYS = ["NODE_ENV", "MONGODB_URI", "MONGODB_DB_NAME", "LOG_LEVEL"] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

/** Scheme check only; WHATWG URL rejects valid multi-host seed lists. The driver parses fully. */
const MONGODB_URI_PATTERN = /^mongodb(\+srv)?:\/\/\S+$/;
/** MongoDB forbids /\. "$*<>:|? in database names. */
const DB_NAME_PATTERN = /^[A-Za-z0-9_-]{1,63}$/;

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS),
  MONGODB_URI: z.string().regex(MONGODB_URI_PATTERN),
  MONGODB_DB_NAME: z.string().regex(DB_NAME_PATTERN),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

/** Static reasons. They never contain the offending value. */
export const INVALID_REASONS: Readonly<Record<EnvKey, string>> = {
  NODE_ENV: "Invalid option: expected one of development|test|production",
  MONGODB_URI: "Must be a mongodb:// or mongodb+srv:// connection string",
  MONGODB_DB_NAME: "Must be 1-63 chars of A-Z a-z 0-9 _ -",
  LOG_LEVEL: "Invalid option: expected one of debug|info|warn|error",
};

export const REQUIRED_REASON = "Required";

export function isEnvKey(value: unknown): value is EnvKey {
  return typeof value === "string" && (ENV_KEYS as readonly string[]).includes(value);
}
