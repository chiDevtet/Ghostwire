"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** The fixed in-app routes. Never put an address, token or id in a navigation. */
export type AppPath = "/" | "/dashboard" | "/settings/wallets" | "/settings/sessions";

/**
 * router.replace(path) then router.refresh(): replace fetches the new page (dynamic stale time
 * is 0), and refresh re-renders shared layouts such as the (app) shell's network indicator.
 */
export function useFreshNavigation(): (path: AppPath) => void {
  const router = useRouter();
  return useCallback(
    (path: AppPath) => {
      router.replace(path);
      router.refresh();
    },
    [router],
  );
}
