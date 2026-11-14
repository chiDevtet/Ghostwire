import { cn } from "./cn";

/** Text wordmark until the final logo artwork is approved (BRAND_IDENTITY §4). */
export function GhostLogo({ className }: { readonly className?: string }) {
  return (
    <span className={cn("font-heading text-lg font-bold tracking-[0.2em] text-text", className)}>
      GHOST WIRE
    </span>
  );
}
