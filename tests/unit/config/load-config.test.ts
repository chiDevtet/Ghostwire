import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, resetConfigForTests, type EnvSource } from "@/modules/config";
import { ConfigError, logger, setLogLevel } from "@/modules/shared";

/** Port 1: nothing listens there, so even an accidental connect can never reach a real mongod. */
const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:1/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "warn",
  APP_ORIGIN: "https://ghostwire.test",
} satisfies EnvSource;

const DEFAULTS = {
  SOLANA_NETWORKS: ["devnet", "mainnet-beta"],
  TRUST_PROXY: false,
  SESSION_IDLE_DAYS: 7,
  SESSION_MAX_DAYS: 30,
  RATE_LIMIT_CHALLENGE_PER_MIN: 10,
  RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: 20,
  RATE_LIMIT_VERIFY_PER_MIN: 10,
};

const SENTINEL = "SENTINEL-VALUE-123";

function configErrorOf(env: EnvSource): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("expected loadConfig to throw ConfigError");
}

describe("loadConfig(env)", () => {
  it("parses a valid environment into a frozen AppConfig with the documented defaults", () => {
    const config = loadConfig(VALID);
    expect(config).toEqual({ ...VALID, ...DEFAULTS });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.SOLANA_NETWORKS)).toBe(true);
  });

  it("defaults LOG_LEVEL to info", () => {
    expect(loadConfig({ ...VALID, LOG_LEVEL: undefined }).LOG_LEVEL).toBe("info");
  });

  it("treats empty strings as missing", () => {
    expect(configErrorOf({ ...VALID, MONGODB_DB_NAME: "" }).issues).toEqual([
      { key: "MONGODB_DB_NAME", reason: "Required" },
    ]);
    expect(loadConfig({ ...VALID, LOG_LEVEL: "" }).LOG_LEVEL).toBe("info");
    expect(loadConfig({ ...VALID, SOLANA_NETWORKS: "" }).SOLANA_NETWORKS).toEqual([
      "devnet",
      "mainnet-beta",
    ]);
  });

  it("ignores unknown keys", () => {
    const config = loadConfig({ ...VALID, EXTRA_SECRET: "x" });
    expect(Object.keys(config).sort()).toEqual([
      "APP_ORIGIN",
      "LOG_LEVEL",
      "MONGODB_DB_NAME",
      "MONGODB_URI",
      "NODE_ENV",
      "RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS",
      "RATE_LIMIT_CHALLENGE_PER_MIN",
      "RATE_LIMIT_VERIFY_PER_MIN",
      "SESSION_IDLE_DAYS",
      "SESSION_MAX_DAYS",
      "SOLANA_NETWORKS",
      "TRUST_PROXY",
    ]);
  });

  it("accepts mongodb+srv and multi-host seed lists", () => {
    expect(
      loadConfig({ ...VALID, MONGODB_URI: "mongodb+srv://cluster.example.net/" }).MONGODB_URI,
    ).toBe("mongodb+srv://cluster.example.net/");
    expect(
      loadConfig({ ...VALID, MONGODB_URI: "mongodb://h1:27017,h2:27017/?replicaSet=rs0" })
        .MONGODB_URI,
    ).toBe("mongodb://h1:27017,h2:27017/?replicaSet=rs0");
  });

  it.each(["https://ghostwire.app", "http://localhost:3000", "https://app.example.com:8443"])(
    "accepts the origin %s",
    (origin) => {
      expect(loadConfig({ ...VALID, APP_ORIGIN: origin }).APP_ORIGIN).toBe(origin);
    },
  );

  it("parses every override", () => {
    const config = loadConfig({
      ...VALID,
      SOLANA_NETWORKS: " devnet , devnet",
      TRUST_PROXY: "true",
      SESSION_IDLE_DAYS: "1",
      SESSION_MAX_DAYS: "90",
      RATE_LIMIT_CHALLENGE_PER_MIN: "1000",
      RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: "1",
      RATE_LIMIT_VERIFY_PER_MIN: "3",
    });
    expect(config.SOLANA_NETWORKS).toEqual(["devnet"]);
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.SESSION_IDLE_DAYS).toBe(1);
    expect(config.SESSION_MAX_DAYS).toBe(90);
    expect(config.RATE_LIMIT_CHALLENGE_PER_MIN).toBe(1000);
    expect(config.RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS).toBe(1);
    expect(config.RATE_LIMIT_VERIFY_PER_MIN).toBe(3);
  });

  it("accepts SESSION_MAX_DAYS equal to SESSION_IDLE_DAYS", () => {
    const config = loadConfig({ ...VALID, SESSION_IDLE_DAYS: "14", SESSION_MAX_DAYS: "14" });
    expect(config.SESSION_MAX_DAYS).toBe(14);
  });

  it.each([
    {
      key: "NODE_ENV",
      value: SENTINEL,
      reason: "Invalid option: expected one of development|test|production",
    },
    {
      key: "MONGODB_URI",
      value: `postgres://${SENTINEL}`,
      reason: "Must be a mongodb:// or mongodb+srv:// connection string",
    },
    {
      key: "MONGODB_DB_NAME",
      value: `bad/${SENTINEL}`,
      reason: "Must be 1-63 chars of A-Z a-z 0-9 _ -",
    },
    {
      key: "LOG_LEVEL",
      value: SENTINEL,
      reason: "Invalid option: expected one of debug|info|warn|error",
    },
    {
      key: "APP_ORIGIN",
      value: `https://${SENTINEL.toLowerCase()}.test/path`,
      reason: "Must be an http:// or https:// origin with no path, query or trailing slash",
    },
    {
      key: "APP_ORIGIN",
      value: `https://${SENTINEL.toLowerCase()}.test/`,
      reason: "Must be an http:// or https:// origin with no path, query or trailing slash",
    },
    {
      key: "APP_ORIGIN",
      value: `ftp://${SENTINEL.toLowerCase()}.test`,
      reason: "Must be an http:// or https:// origin with no path, query or trailing slash",
    },
    {
      key: "APP_ORIGIN",
      value: `https://${SENTINEL.toLowerCase()}.test?x=1`,
      reason: "Must be an http:// or https:// origin with no path, query or trailing slash",
    },
    {
      key: "SOLANA_NETWORKS",
      value: `devnet,${SENTINEL}`,
      reason: "Comma list of devnet and/or mainnet-beta, non-empty",
    },
    {
      key: "SOLANA_NETWORKS",
      value: ",",
      reason: "Comma list of devnet and/or mainnet-beta, non-empty",
    },
    { key: "TRUST_PROXY", value: SENTINEL, reason: "Must be true or false" },
    { key: "SESSION_IDLE_DAYS", value: "0", reason: "Integer 1-30" },
    { key: "SESSION_IDLE_DAYS", value: "31", reason: "Integer 1-30" },
    { key: "SESSION_IDLE_DAYS", value: SENTINEL, reason: "Integer 1-30" },
    {
      key: "SESSION_MAX_DAYS",
      value: "91",
      reason: "Integer 1-90 and at least SESSION_IDLE_DAYS",
    },
    { key: "RATE_LIMIT_CHALLENGE_PER_MIN", value: "0", reason: "Integer 1-1000" },
    { key: "RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS", value: "1001", reason: "Integer 1-1000" },
    { key: "RATE_LIMIT_VERIFY_PER_MIN", value: "1.5", reason: "Integer 1-1000" },
  ])("reports invalid $key ($value) without echoing its value", ({ key, value, reason }) => {
    const error = configErrorOf({ ...VALID, [key]: value });
    expect(error.issues).toEqual([{ key, reason }]);
    expect(error.message).toContain(key);
    expect(error.message).not.toContain(SENTINEL);
    expect(error.message.toLowerCase()).not.toContain(SENTINEL.toLowerCase());
    expect(JSON.stringify(error.issues)).not.toContain(SENTINEL);
  });

  it("reports SESSION_MAX_DAYS below SESSION_IDLE_DAYS on SESSION_MAX_DAYS", () => {
    expect(
      configErrorOf({ ...VALID, SESSION_IDLE_DAYS: "10", SESSION_MAX_DAYS: "9" }).issues,
    ).toEqual([{ key: "SESSION_MAX_DAYS", reason: "Integer 1-90 and at least SESSION_IDLE_DAYS" }]);
  });

  it("reports every missing required key in schema order", () => {
    const error = configErrorOf({});
    expect(error.issues).toEqual([
      { key: "NODE_ENV", reason: "Required" },
      { key: "MONGODB_URI", reason: "Required" },
      { key: "MONGODB_DB_NAME", reason: "Required" },
      { key: "APP_ORIGIN", reason: "Required" },
    ]);
  });

  it("rejects a database name longer than 63 characters", () => {
    expect(configErrorOf({ ...VALID, MONGODB_DB_NAME: "a".repeat(64) }).issues[0]?.key).toBe(
      "MONGODB_DB_NAME",
    );
  });

  it("formats the documented message", () => {
    const error = configErrorOf({ NODE_ENV: "test", MONGODB_DB_NAME: "x", LOG_LEVEL: "verbose" });
    expect(error.message).toBe(
      "Invalid configuration: MONGODB_URI (Required); LOG_LEVEL (Invalid option: expected one of debug|info|warn|error); APP_ORIGIN (Required)",
    );
  });
});

describe("loadConfig() from process.env", () => {
  function stubValidEnv(): void {
    for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);
  }

  afterEach(() => {
    resetConfigForTests();
    setLogLevel("info");
    vi.unstubAllEnvs();
  });

  it("parses once and returns the cached object until reset", () => {
    stubValidEnv();
    resetConfigForTests();
    const first = loadConfig();
    vi.stubEnv("MONGODB_DB_NAME", "other_db");
    expect(loadConfig()).toBe(first);
    resetConfigForTests();
    expect(loadConfig().MONGODB_DB_NAME).toBe("other_db");
  });

  it("applies LOG_LEVEL to the shared logger", () => {
    stubValidEnv();
    vi.stubEnv("LOG_LEVEL", "error");
    resetConfigForTests();
    loadConfig();
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.info("dropped");
    expect(out).not.toHaveBeenCalled();
  });

  it("explicit env neither reads nor writes the cache", () => {
    stubValidEnv();
    resetConfigForTests();
    const cached = loadConfig();
    expect(loadConfig({ ...VALID, MONGODB_DB_NAME: "explicit_db" }).MONGODB_DB_NAME).toBe(
      "explicit_db",
    );
    expect(loadConfig()).toBe(cached);
  });

  it("throws ConfigError and caches nothing when process.env is invalid", () => {
    stubValidEnv();
    vi.stubEnv("MONGODB_URI", "");
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(ConfigError);
    vi.stubEnv("MONGODB_URI", VALID.MONGODB_URI);
    expect(loadConfig().MONGODB_URI).toBe(VALID.MONGODB_URI);
  });

  it("requires APP_ORIGIN at runtime", () => {
    stubValidEnv();
    vi.stubEnv("APP_ORIGIN", "");
    resetConfigForTests();
    expect(() => loadConfig()).toThrow("APP_ORIGIN (Required)");
  });
});
