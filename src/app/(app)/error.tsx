"use client";

import { Button } from "@/ui/button";

/** Renders inside the shell, so navigation stays available. Never shows the message or stack. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;
  return (
    <section aria-labelledby="app-error-heading" className="flex flex-col gap-4 py-10">
      <h1 id="app-error-heading" className="font-heading text-2xl font-semibold">
        Something went wrong.
      </h1>
      {digest !== null && <p className="font-mono text-sm text-muted">Reference: {digest}</p>}
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </section>
  );
}
