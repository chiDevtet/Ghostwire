import type { ApiFailure } from "@/modules/wallet-connect";

export const UNREACHABLE =
  "We can't reach GHOST WIRE right now. Check your connection and try again.";
export const GENERIC = "Something went wrong. Try again.";
export const LAST_WALLET_COPY = "You can't unlink your only wallet.";

/** User-facing copy for a failed panel action. Raw codes are never shown. */
export function panelErrorCopy(failure: ApiFailure): string {
  switch (failure.code) {
    case "LAST_WALLET":
      return LAST_WALLET_COPY;
    case "DEPENDENCY_UNAVAILABLE":
    case "NETWORK":
      return UNREACHABLE;
    default:
      return GENERIC;
  }
}
