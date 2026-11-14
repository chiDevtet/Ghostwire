"use client";

import { usePathname } from "next/navigation";
import { NavEntry } from "./nav-entry";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Desktop navigation (≥ 768px). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 py-6 md:block">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => item.desktop).map((item) => (
          <li key={item.key}>
            <NavEntry
              item={item}
              label={item.label}
              active={isActive(item, pathname)}
              compact={false}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
