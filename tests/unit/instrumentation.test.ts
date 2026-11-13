import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { resetConfigForTests } from "@/modules/config";
import { ConfigError, setLogLevel } from "@/modules/shared";

const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "error",
};

function stubEnv(env: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetConfigForTests();
}

afterEach(() => {
  resetConfigForTests();
  setLogLevel("info");
  vi.unstubAllEnvs();
});

describe("instrumentation register()", () => {
  it("skips config validation on the edge runtime", async () => {
    stubEnv({ NEXT_RUNTIME: "edge", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("skips config validation during the production build phase", async () => {
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("fails fast with ConfigError on the Node runtime when config is invalid", async () => {
    stubEnv({ ...VALID, MONGODB_URI: "", NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-server" });
    await expect(register()).rejects.toBeInstanceOf(ConfigError);
  });

  it("loads config on the Node runtime when config is valid", async () => {
    stubEnv({ ...VALID, NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-server" });
    await expect(register()).resolves.toBeUndefined();
  });
});
