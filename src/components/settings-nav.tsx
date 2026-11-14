"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";

const LINKS = [
  { href: "/settings/wallets", label: "Wallets" },
  { href: "/settings/sessions", label: "Sessions" },
] as const;

/** The settings sub-navigation; aria-current marks the open page. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-2">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-medium",
                  active ? "border-violet text-violet" : "border-muted text-text hover:bg-elevated",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
