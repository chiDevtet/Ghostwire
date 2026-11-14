import Link from "next/link";
import { ConnectButton } from "@/components/connect-button";
import { GhostLogo } from "@/ui/ghost-logo";
import { loadShellState } from "./_server/shell-state";

/** Landing hero. An outage counts as signed out: this page must not fail. */
export default async function HomePage() {
  const state = await loadShellState();
  const signedIn = state.kind === "signed-in";
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-16"
    >
      <GhostLogo />
      <h1 className="font-heading text-4xl font-bold sm:text-5xl">
        Your money. Your business. Your privacy.
      </h1>
      <p className="text-lg text-silver">
        Private SOL and USDC payments on Solana, with clear privacy boundaries.
      </p>
      <p className="text-sm text-muted">
        Private payments are coming in a later release. Sender and recipient addresses can remain
        public on Solana.
      </p>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-control bg-violet px-4 text-sm font-medium text-obsidian hover:bg-violet-hover"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <ConnectButton>Open GHOST WIRE</ConnectButton>
            <ConnectButton variant="secondary">Connect wallet</ConnectButton>
          </>
        )}
      </div>
    </main>
  );
}
