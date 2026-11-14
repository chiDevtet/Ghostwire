import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { E2E_ORIGIN, E2E_PORT } from "./origin";

const require = createRequire(import.meta.url);
const READY_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;
const GROUP_TIMEOUT_MS = 3_000;

async function probe(url: string, timeoutMs: number): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

/** Signals only the process group this setup spawned (the server is its leader). */
async function stopServer(server: ChildProcess): Promise<void> {
  const pid = server.pid;
  if (pid === undefined) return;
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
    signalGroup(pid, "SIGTERM");
    await Promise.race([exited, sleep(STOP_TIMEOUT_MS)]);
  }
  // The leader is gone (or timed out): make sure no member of the group outlives it.
  const deadline = Date.now() + GROUP_TIMEOUT_MS;
  while (signalGroup(pid, 0)) {
    if (Date.now() > deadline) {
      signalGroup(pid, "SIGKILL");
      await sleep(200);
      return;
    }
    await sleep(100);
  }
}

/**
 * Starts an in-memory MongoDB replica set (MONGOMS_SYSTEM_BINARY is honoured), builds the app
 * (unless GW_E2E_SKIP_BUILD=1), starts `next start` on E2E_ORIGIN with an env built on top of
 * process.env (so a developer .env cannot leak in), waits for /api/ready and returns the teardown.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if ((await probe(`${E2E_ORIGIN}/api/health`, 500)) !== null) {
    throw new Error(`port ${E2E_PORT} is in use: stop that server or set GW_E2E_PORT`);
  }
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: "7.0.12" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri();
  if (/:27017(\/|,|\?|$)/.test(uri)) {
    await replSet.stop({ doCleanup: true });
    throw new Error("refusing to use port 27017 (the developer mongod)");
  }
  const nextBin = require.resolve("next/dist/bin/next");
  if (process.env.GW_E2E_SKIP_BUILD !== "1") {
    try {
      execFileSync(process.execPath, [nextBin, "build"], { stdio: "inherit" });
    } catch (error) {
      await replSet.stop({ doCleanup: true });
      throw error;
    }
  }

  mkdirSync("test-results", { recursive: true });
  const logPath = path.resolve("test-results", "e2e-server.log");
  const logFd = openSync(logPath, "w");
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", E2E_PORT], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: uri,
      MONGODB_DB_NAME: "gw_e2e",
      LOG_LEVEL: "warn",
      APP_ORIGIN: E2E_ORIGIN,
      SOLANA_NETWORKS: "devnet,mainnet-beta",
      TRUST_PROXY: "false",
      SESSION_IDLE_DAYS: "7",
      SESSION_MAX_DAYS: "30",
      RATE_LIMIT_CHALLENGE_PER_MIN: "1000",
      RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: "1000",
      RATE_LIMIT_VERIFY_PER_MIN: "1000",
    },
  });
  closeSync(logFd);
  let spawnFailed = false;
  server.on("error", () => {
    spawnFailed = true;
  });

  const teardown = async (): Promise<void> => {
    try {
      await stopServer(server);
    } finally {
      await replSet.stop({ doCleanup: true });
    }
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const ready = await probe(`${E2E_ORIGIN}/api/ready`, 2_000);
    if (ready?.status === 200) break;
    if (
      Date.now() > deadline ||
      spawnFailed ||
      server.exitCode !== null ||
      server.signalCode !== null
    ) {
      await teardown();
      throw new Error(`next start did not become ready; see ${logPath}`);
    }
    await sleep(250);
  }
  return teardown;
}
