import type { SolanaNetwork } from "@/modules/validation";
import { cn } from "./cn";

export function networkLabel(network: SolanaNetwork): "Devnet" | "Mainnet-beta" {
  return network === "devnet" ? "Devnet" : "Mainnet-beta";
}

/** A dot (aria-hidden) plus the network name as text, so colour is never the only signal. */
export function NetworkIndicator({ network }: { readonly network: SolanaNetwork }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-silver">
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", network === "devnet" ? "bg-success" : "bg-warning")}
      />
      {networkLabel(network)}
    </span>
  );
}
