"use client";

import Link from "next/link";
import { useId } from "react";
import { Badge } from "@/ui/badge";
import { cn } from "@/ui/cn";
import type { NavItem } from "./nav-items";

/**
 * One nav entry. A live item is a Link (aria-current="page" when active, violet treatment).
 * A "Soon" item is a button with aria-disabled="true", described by its "Soon" badge; it does
 * nothing when pressed.
 */
export function NavEntry({
  item,
  label,
  active,
  compact,
}: {
  readonly item: NavItem;
  readonly label: string;
  readonly active: boolean;
  readonly compact: boolean;
}) {
  const soonId = useId();
  const Icon = item.icon;
  const layout = compact
    ? "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs"
    : "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm";
  if (item.href === null || item.soon) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={soonId}
        className={cn(layout, "cursor-not-allowed text-muted")}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span>{label}</span>
        <Badge>
          <span id={soonId}>Soon</span>
        </Badge>
      </button>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        layout,
        "font-medium",
        active ? "text-violet" : "text-text hover:bg-elevated",
        active && !compact && "bg-elevated",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
