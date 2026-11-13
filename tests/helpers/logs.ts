import { vi } from "vitest";
import { resetConfigForTests } from "@/modules/config";
import { setLogLevel } from "@/modules/shared";

export interface CapturedLogs {
  /** Every captured line, one JSON log line per entry. */
  lines(): string[];
  restore(): void;
}

/**
 * Captures every log line at debug level by spying on process.stdout/stderr.write. Sets
 * LOG_LEVEL=debug in the env too, so a config reload during the test keeps the debug level.
 */
export function captureLogLines(): CapturedLogs {
  const env = process.env as Record<string, string | undefined>;
  const previousLevel = env.LOG_LEVEL;
  env.LOG_LEVEL = "debug";
  resetConfigForTests();
  setLogLevel("debug");
  const chunks: string[] = [];
  const capture = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  const out = vi.spyOn(process.stdout, "write").mockImplementation(capture);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(capture);
  return {
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line !== ""),
    restore() {
      out.mockRestore();
      err.mockRestore();
      if (previousLevel === undefined) delete env.LOG_LEVEL;
      else env.LOG_LEVEL = previousLevel;
      resetConfigForTests();
      setLogLevel("error");
    },
  };
}
