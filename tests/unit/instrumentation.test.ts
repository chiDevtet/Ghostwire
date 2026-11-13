import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { resetConfigForTests } from "@/modules/config";
import {
  ConfigError,
  DependencyUnavailableError,
  InternalError,
  logger,
  setLogLevel,
} from "@/modules/shared";

// The unit project has no database: ensureIndexesOnce is replaced, everything else is real.
const { ensureIndexesOnce } = vi.hoisted(() => ({
  ensureIndexesOnce: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/modules/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/database")>()),
  ensureIndexesOnce,
}));

/** Port 1: nothing listens there, so the unit project can never reach a developer mongod. */
const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:1/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "error",
  APP_ORIGIN: "https://ghostwire.test",
};

const SERVER = { ...VALID, NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-server" };

function stubEnv(env: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetConfigForTests();
}

function stubExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);
}

beforeEach(() => {
  ensureIndexesOnce.mockReset();
  ensureIndexesOnce.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetConfigForTests();
  setLogLevel("info");
  vi.unstubAllEnvs();
});

describe("instrumentation register()", () => {
  it("skips config validation on the edge runtime", async () => {
    const exit = stubExit();
    stubEnv({ NEXT_RUNTIME: "edge", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(ensureIndexesOnce).not.toHaveBeenCalled();
  });

  it("skips config validation during the production build phase", async () => {
    const exit = stubExit();
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(ensureIndexesOnce).not.toHaveBeenCalled();
  });

  it("logs the invalid keys and exits with code 1 on the Node runtime when config is invalid", async () => {
    const exit = stubExit();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    stubEnv({ ...SERVER, MONGODB_URI: "" });
    await expect(register()).rejects.toThrow("exit:1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledTimes(1);
    const [message, fields] = error.mock.calls[0] ?? [];
    expect(message).toBe("invalid configuration, exiting");
    const logged = fields?.err;
    expect(logged).toBeInstanceOf(ConfigError);
    expect((logged as ConfigError).message).toContain("MONGODB_URI");
    expect((logged as ConfigError).message).not.toContain("ghostwire_test");
    expect(ensureIndexesOnce).not.toHaveBeenCalled();
  });

  it("loads config and prepares the database on the Node runtime when config is valid", async () => {
    const exit = stubExit();
    stubEnv(SERVER);
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(ensureIndexesOnce).toHaveBeenCalledTimes(1);
  });
});

describe("instrumentation prepareDatabase()", () => {
  it("logs at warn and keeps serving when the database is unavailable at boot", async () => {
    const exit = stubExit();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    ensureIndexesOnce.mockRejectedValue(new DependencyUnavailableError("database"));
    stubEnv(SERVER);
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "database unavailable at boot; index creation deferred to first request",
      expect.objectContaining({ err: expect.any(DependencyUnavailableError) }),
    );
  });

  it("logs at error and exits with code 1 on INDEX_CONFLICT", async () => {
    const exit = stubExit();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const conflict = new InternalError({ code: "INDEX_CONFLICT" });
    ensureIndexesOnce.mockRejectedValue(conflict);
    stubEnv(SERVER);
    await expect(register()).rejects.toThrow("exit:1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith("index preparation failed, exiting", { err: conflict });
  });
});
