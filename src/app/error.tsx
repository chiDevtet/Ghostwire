"use client";

import { Button } from "@/ui/button";

/** Root error boundary (landing page and anything outside (app)). Digest only, never details. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold">Something went wrong.</h1>
      {digest !== null && <p className="font-mono text-sm text-muted">Reference: {digest}</p>}
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
