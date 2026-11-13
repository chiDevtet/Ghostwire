import { resetConfigForTests } from "@/modules/config";

/**
 * Sets (or, for undefined, deletes) process.env keys and drops the memoized config.
 * Returns a restore function that puts the previous values back and drops the config again.
 */
export function useEnv(overrides: Readonly<Record<string, string | undefined>>): () => void {
  const env = process.env as Record<string, string | undefined>;
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, env[key]);
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  resetConfigForTests();
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    resetConfigForTests();
  };
}
