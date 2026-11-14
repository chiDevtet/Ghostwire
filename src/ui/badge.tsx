import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "violet" | "success" | "warning" | "error";

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "border-muted text-silver",
  violet: "border-violet text-violet",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  error: "border-error text-error",
};

/** A text label; the tone only reinforces the text, never replaces it. */
export function Badge({
  tone = "neutral",
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
