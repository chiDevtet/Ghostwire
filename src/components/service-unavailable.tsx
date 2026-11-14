"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";

/**
 * Shown when the database is unreachable. "page" (default) is a whole page with its own <main>
 * and <h1> (the (app) layout renders it instead of the shell, so nobody is signed out by an
 * outage); "section" sits inside the shell's <main>, under the page's own <h1>.
 */
export function ServiceUnavailable({
  variant = "page",
}: {
  readonly variant?: "page" | "section";
}) {
  const router = useRouter();
  const Container = variant === "page" ? "main" : "section";
  const Heading = variant === "page" ? "h1" : "h2";
  return (
    <Container
      id={variant === "page" ? "main" : undefined}
      tabIndex={variant === "page" ? -1 : undefined}
      aria-labelledby="unavailable-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16"
    >
      <Heading id="unavailable-heading" className="font-heading text-2xl font-semibold">
        We can&apos;t reach GHOST WIRE right now.
      </Heading>
      <p className="text-muted">Check your connection and try again.</p>
      <div>
        <Button onClick={() => router.refresh()}>Try again</Button>
      </div>
    </Container>
  );
}
