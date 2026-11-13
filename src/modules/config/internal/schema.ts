import { z } from "zod";
import { LOG_LEVELS } from "@/modules/shared";
import { solanaNetwork, type SolanaNetwork } from "@/modules/validation";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Schema key order; ConfigError issues are reported in this order. */
export const ENV_KEYS = [
  "NODE_ENV",
  "MONGODB_URI",
  "MONGODB_DB_NAME",
  "LOG_LEVEL",
  "APP_ORIGIN",
  "SOLANA_NETWORKS",
  "TRUST_PROXY",
  "SESSION_IDLE_DAYS",
  "SESSION_MAX_DAYS",
  "RATE_LIMIT_CHALLENGE_PER_MIN",
  "RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS",
  "RATE_LIMIT_VERIFY_PER_MIN",
] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

/** Scheme check only; WHATWG URL rejects valid multi-host seed lists. The driver parses fully. */
const MONGODB_URI_PATTERN = /^mongodb(\+srv)?:\/\/\S+$/;
/** MongoDB forbids /\. "$*<>:|? in database names. */
const DB_NAME_PATTERN = /^[A-Za-z0-9_-]{1,63}$/;
const INTEGER_PATTERN = /^[0-9]{1,4}$/;

function integerIn(min: number, max: number) {
  return z
    .string()
    .regex(INTEGER_PATTERN)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

/** scheme://host[:port] and nothing else: URL.origin must round-trip exactly. */
const appOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
});

const solanaNetworks = z
  .string()
  .transform((value) => value.split(",").map((part) => part.trim()))
  .pipe(z.array(solanaNetwork).min(1))
  .transform((list): readonly SolanaNetwork[] => Object.freeze(Array.from(new Set(list))));

const DEFAULT_SOLANA_NETWORKS: readonly SolanaNetwork[] = Object.freeze(["devnet", "mainnet-beta"]);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS),
    MONGODB_URI: z.string().regex(MONGODB_URI_PATTERN),
    MONGODB_DB_NAME: z.string().regex(DB_NAME_PATTERN),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    APP_ORIGIN: appOrigin,
    SOLANA_NETWORKS: solanaNetworks.default(DEFAULT_SOLANA_NETWORKS),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SESSION_IDLE_DAYS: integerIn(1, 30).default(7),
    SESSION_MAX_DAYS: integerIn(1, 90).default(30),
    RATE_LIMIT_CHALLENGE_PER_MIN: integerIn(1, 1000).default(10),
    RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: integerIn(1, 1000).default(20),
    RATE_LIMIT_VERIFY_PER_MIN: integerIn(1, 1000).default(10),
  })
  .superRefine(
    (config, ctx) => {
      if (config.SESSION_MAX_DAYS < config.SESSION_IDLE_DAYS) {
        ctx.addIssue({ code: "custom", path: ["SESSION_MAX_DAYS"], message: "max<idle" });
      }
    },
    // Compare the two lifetimes only once every field parsed, so an out-of-range
    // SESSION_IDLE_DAYS is reported on its own key and not also on SESSION_MAX_DAYS.
    { when: (payload) => payload.issues.length === 0 },
  );

/** Static reasons. They never contain the offending value. */
export const INVALID_REASONS: Readonly<Record<EnvKey, string>> = {
  NODE_ENV: "Invalid option: expected one of development|test|production",
  MONGODB_URI: "Must be a mongodb:// or mongodb+srv:// connection string",
  MONGODB_DB_NAME: "Must be 1-63 chars of A-Z a-z 0-9 _ -",
  LOG_LEVEL: "Invalid option: expected one of debug|info|warn|error",
  APP_ORIGIN: "Must be an http:// or https:// origin with no path, query or trailing slash",
  SOLANA_NETWORKS: "Comma list of devnet and/or mainnet-beta, non-empty",
  TRUST_PROXY: "Must be true or false",
  SESSION_IDLE_DAYS: "Integer 1-30",
  SESSION_MAX_DAYS: "Integer 1-90 and at least SESSION_IDLE_DAYS",
  RATE_LIMIT_CHALLENGE_PER_MIN: "Integer 1-1000",
  RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: "Integer 1-1000",
  RATE_LIMIT_VERIFY_PER_MIN: "Integer 1-1000",
};

export const REQUIRED_REASON = "Required";

export function isEnvKey(value: unknown): value is EnvKey {
  return typeof value === "string" && (ENV_KEYS as readonly string[]).includes(value);
}
