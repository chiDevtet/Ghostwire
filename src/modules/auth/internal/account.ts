import { safeEquals } from "@/modules/database";
import { UnauthenticatedError } from "@/modules/shared";
import { listWalletsByUser, toWalletView, type WalletView } from "@/modules/wallet";
import { users } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { MeView, SessionReader } from "./types";

/** GET /me. Lists every wallet of the user, disconnected ones included, with their status. */
export async function getMe(auth: SessionReader): Promise<MeView> {
  await ensureAuthReady();
  const user = await users.findOne(safeEquals("_id", auth.session.userId));
  if (user === null) throw new UnauthenticatedError();
  const wallets = await listWalletsByUser(auth.session.userId);
  return {
    user: { id: user._id.toHexString(), createdAt: user.createdAt.toISOString() },
    session: {
      id: auth.session.id.toHexString(),
      network: auth.session.network,
      expiresAt: auth.session.expiresAt.toISOString(),
    },
    wallets: wallets.map((wallet) => toWalletView(wallet)),
  };
}

/** GET /wallets. Same view as /me, disconnected wallets included. */
export async function listWallets(auth: SessionReader): Promise<WalletView[]> {
  await ensureAuthReady();
  const wallets = await listWalletsByUser(auth.session.userId);
  return wallets.map((wallet) => toWalletView(wallet));
}
