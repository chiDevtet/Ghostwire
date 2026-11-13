import type { SecurityReason } from "@/modules/security";
import { AuthFailedError, ConflictError, ValidationError } from "@/modules/shared";

/** 400 NETWORK_UNSUPPORTED: a string network outside config SOLANA_NETWORKS. */
export function networkUnsupported(): ValidationError {
  return new ValidationError({ code: "NETWORK_UNSUPPORTED", safeMessage: "Network not supported" });
}

/** 409 WALLET_ALREADY_LINKED */
export function walletAlreadyLinked(): ConflictError {
  return new ConflictError({
    code: "WALLET_ALREADY_LINKED",
    safeMessage: "Wallet is linked to another account",
  });
}

/** 409 LAST_WALLET */
export function lastWallet(): ConflictError {
  return new ConflictError({
    code: "LAST_WALLET",
    safeMessage: "Cannot unlink the only active wallet",
  });
}

/** 401 AUTH_FAILED with a static reason that is also a security_events reason. */
export function authFailed(reason: SecurityReason): AuthFailedError {
  return new AuthFailedError(reason);
}
