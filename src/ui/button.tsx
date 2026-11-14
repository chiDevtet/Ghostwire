import type { ComponentPropsWithRef, MouseEvent } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Default "primary". */
  readonly variant?: ButtonVariant;
  /**
   * aria-busy="true" + aria-disabled="true"; clicks are ignored; the label stays rendered
   * (invisible) so the width is kept, and a spinner overlays it.
   */
  readonly loading?: boolean;
  /** Screen-reader text while loading; default "Working…". */
  readonly loadingLabel?: string;
}

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-violet text-obsidian hover:bg-violet-hover",
  secondary: "border border-muted bg-transparent text-text hover:bg-elevated",
  ghost: "bg-transparent text-text hover:bg-elevated",
  danger: "bg-error text-obsidian hover:bg-error/90",
};

/** type="button" by default; at least 44px tall. Violet is reserved for the primary variant. */
export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Working…",
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      onClick={handleClick}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : rest["aria-disabled"]}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
      {loading && (
        <>
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:hidden" />
            <span className="hidden size-2 rounded-full bg-current motion-reduce:inline-block" />
          </span>
          <span className="sr-only">{loadingLabel}</span>
        </>
      )}
    </button>
  );
}
