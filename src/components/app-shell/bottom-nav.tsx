"use client";

import { usePathname } from "next/navigation";
import { NavEntry } from "./nav-entry";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Mobile navigation (< 768px): fixed to the bottom, padded for the safe area. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main mobile"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-obsidian pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.filter((item) => item.mobile).map((item) => (
          <li key={item.key}>
            <NavEntry
              item={item}
              label={item.mobileLabel ?? item.label}
              active={isActive(item, pathname)}
              compact
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
