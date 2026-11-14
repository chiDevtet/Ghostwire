import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  LayoutDashboard,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { AppPath } from "../use-fresh-navigation";

export interface NavItem {
  readonly key: string;
  readonly label: string;
  /** The bottom-nav label when it differs ("Home"). */
  readonly mobileLabel?: string;
  readonly icon: LucideIcon;
  /** null for "Soon" items, which are not links. */
  readonly href: AppPath | null;
  readonly soon: boolean;
  readonly mobile: boolean;
  readonly desktop: boolean;
}

/** Shared by the desktop sidebar and the mobile bottom nav. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    mobileLabel: "Home",
    icon: LayoutDashboard,
    href: "/dashboard",
    soon: false,
    mobile: true,
    desktop: true,
  },
  {
    key: "send",
    label: "Send",
    icon: ArrowUpRight,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "receive",
    label: "Receive",
    icon: ArrowDownLeft,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "payments",
    label: "Payments",
    icon: ReceiptText,
    href: null,
    soon: true,
    mobile: false,
    desktop: true,
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings/wallets",
    soon: false,
    mobile: false,
    desktop: true,
  },
];

/** Settings stays active on every /settings/* page. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === null) return false;
  return item.key === "settings" ? pathname.startsWith("/settings") : pathname === item.href;
}
