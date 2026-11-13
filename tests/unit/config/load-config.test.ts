import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, resetConfigForTests, type EnvSource } from "@/modules/config";
import { ConfigError, logger, setLogLevel } from "@/modules/shared";

const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "warn",
} satisfies EnvSource;

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
  it("parses a valid environment into a frozen AppConfig", () => {
    const config = loadConfig(VALID);
    expect(config).toEqual(VALID);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("defaults LOG_LEVEL to info", () => {
    expect(loadConfig({ ...VALID, LOG_LEVEL: undefined }).LOG_LEVEL).toBe("info");
  });

  it("treats empty strings as missing", () => {
    expect(configErrorOf({ ...VALID, MONGODB_DB_NAME: "" }).issues).toEqual([
      { key: "MONGODB_DB_NAME", reason: "Required" },
    ]);
    expect(loadConfig({ ...VALID, LOG_LEVEL: "" }).LOG_LEVEL).toBe("info");
  });

  it("ignores unknown keys", () => {
    const config = loadConfig({ ...VALID, EXTRA_SECRET: "x" });
    expect(Object.keys(config).sort()).toEqual([
      "LOG_LEVEL",
      "MONGODB_DB_NAME",
      "MONGODB_URI",
      "NODE_ENV",
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
  ])("reports invalid $key without echoing its value", ({ key, value, reason }) => {
    const error = configErrorOf({ ...VALID, [key]: value });
    expect(error.issues).toEqual([{ key, reason }]);
    expect(error.message).toContain(key);
    expect(error.message).not.toContain(SENTINEL);
    expect(JSON.stringify(error.issues)).not.toContain(SENTINEL);
  });

  it("reports every missing required key in schema order", () => {
    const error = configErrorOf({});
    expect(error.issues).toEqual([
      { key: "NODE_ENV", reason: "Required" },
      { key: "MONGODB_URI", reason: "Required" },
      { key: "MONGODB_DB_NAME", reason: "Required" },
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
      "Invalid configuration: MONGODB_URI (Required); LOG_LEVEL (Invalid option: expected one of debug|info|warn|error)",
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
});
