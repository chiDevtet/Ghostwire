import { ConfigError, setLogLevel, type ConfigIssue, type LogLevel } from "@/modules/shared";
import type { SolanaNetwork } from "@/modules/validation";
import {
  ENV_KEYS,
  INVALID_REASONS,
  REQUIRED_REASON,
  envSchema,
  isEnvKey,
  type EnvKey,
  type NodeEnv,
} from "./schema";

export interface AppConfig {
  readonly NODE_ENV: NodeEnv;
  readonly MONGODB_URI: string;
  readonly MONGODB_DB_NAME: string;
  readonly LOG_LEVEL: LogLevel;
  /** Public origin, scheme://host[:port]. https gives the __Host- Secure cookie. */
  readonly APP_ORIGIN: string;
  /** Frozen, de-duplicated, non-empty. */
  readonly SOLANA_NETWORKS: readonly SolanaNetwork[];
  readonly TRUST_PROXY: boolean;
  readonly SESSION_IDLE_DAYS: number;
  readonly SESSION_MAX_DAYS: number;
  readonly RATE_LIMIT_CHALLENGE_PER_MIN: number;
  readonly RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: number;
  readonly RATE_LIMIT_VERIFY_PER_MIN: number;
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

let cached: AppConfig | undefined;

/**
 * With no argument: parses process.env once, memoizes, and applies LOG_LEVEL to the logger.
 * With an explicit env: pure, never reads or writes the cache.
 * @throws ConfigError listing failing key names and static reasons (never values).
 */
export function loadConfig(env?: EnvSource): AppConfig {
  if (env !== undefined) return parseConfig(env);
  if (cached === undefined) {
    const config = parseConfig(process.env);
    setLogLevel(config.LOG_LEVEL);
    cached = config;
  }
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}

function parseConfig(env: EnvSource): AppConfig {
  const input: Partial<Record<EnvKey, string>> = {};
  for (const key of ENV_KEYS) {
    const raw = env[key];
    if (raw !== undefined && raw !== "") input[key] = raw;
  }
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const failing = new Set(result.error.issues.map((issue) => issue.path[0]).filter(isEnvKey));
    const issues: ConfigIssue[] = ENV_KEYS.filter((key) => failing.has(key)).map((key) => ({
      key,
      reason: input[key] === undefined ? REQUIRED_REASON : INVALID_REASONS[key],
    }));
    throw new ConfigError(issues);
  }
  return Object.freeze({
    ...result.data,
    SOLANA_NETWORKS: Object.freeze([...result.data.SOLANA_NETWORKS]),
  });
}
