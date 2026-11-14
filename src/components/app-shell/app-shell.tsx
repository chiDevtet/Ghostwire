import type { ReactNode } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { SessionExpiredHandler } from "../session-expired-handler";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** Plain, serializable data from the (app) layout. */
export interface ShellViewer {
  readonly address: string;
  readonly network: SolanaNetwork;
}

/** Server component: top bar, sidebar (≥ 768px), main, bottom nav (< 768px), session expiry. */
export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: ShellViewer;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar viewer={viewer} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4">
        <Sidebar />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pt-6 pb-28 md:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
      <SessionExpiredHandler />
    </div>
  );
}
