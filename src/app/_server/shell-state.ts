import { cookies } from "next/headers";
import { cache } from "react";
import { getMe, resolvePageSession, type MeView, type PageSession } from "@/modules/auth";
import { DependencyUnavailableError, UnauthenticatedError, logger } from "@/modules/shared";
import type { WalletView } from "@/modules/wallet";

export interface Viewer {
  readonly me: MeView;
  readonly currentWallet: WalletView;
  readonly pageSession: PageSession;
}

export type ShellState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "signed-in"; readonly viewer: Viewer };

const SIGNED_OUT: ShellState = { kind: "signed-out" };
const UNAVAILABLE: ShellState = { kind: "unavailable" };

/**
 * One evaluation per request (React cache), shared by layouts and pages that render in
 * parallel. Reads the session without sliding it (server components never write). Never calls
 * redirect()/notFound(): callers do that outside any try block.
 */
export const loadShellState = cache(async (): Promise<ShellState> => {
  const store = await cookies();
  try {
    const pageSession = await resolvePageSession(store);
    if (pageSession === null) return SIGNED_OUT;
    const me = await getMe(pageSession);
    const walletId = pageSession.session.walletId.toHexString();
    const currentWallet = me.wallets.find((wallet) => wallet.id === walletId);
    // Wallet missing from the list or not active: treat as signed out (defense in depth).
    if (currentWallet === undefined || currentWallet.status !== "active") return SIGNED_OUT;
    return { kind: "signed-in", viewer: { me, currentWallet, pageSession } };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return SIGNED_OUT;
    if (error instanceof DependencyUnavailableError) {
      logger.warn("page dependency unavailable", { code: error.code });
      return UNAVAILABLE;
    }
    throw error;
  }
});
