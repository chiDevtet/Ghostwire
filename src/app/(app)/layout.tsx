import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { loadShellState } from "../_server/shell-state";

/** Signed out → "/" (redirect throws, so it stays outside any try). Outage → no shell, no redirect. */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const state = await loadShellState();
  if (state.kind === "signed-out") redirect("/");
  if (state.kind === "unavailable") return <ServiceUnavailable />;
  const { me, currentWallet } = state.viewer;
  return (
    <AppShell viewer={{ address: currentWallet.address, network: me.session.network }}>
      {children}
    </AppShell>
  );
}
