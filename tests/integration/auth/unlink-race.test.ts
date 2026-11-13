import { describe, expect, it } from "vitest";
import {
  issueChallenge,
  issueLinkChallenge,
  resolveSession,
  unlinkWallet,
  verifyLink,
  verifySignIn,
  type AuthContext,
} from "@/modules/auth";
import { getDb } from "@/modules/database";
import { ConflictError } from "@/modules/shared";
import { createTestWallet } from "../../helpers/ed25519";

const AT = new Date("2026-11-13T10:00:00.000Z");
const META = { at: AT, ip: "unknown", userAgent: null };

/** Signs in with one wallet, links a second, and returns the session context and both ids. */
async function userWithTwoWallets(): Promise<{ auth: AuthContext; ids: [string, string] }> {
  const first = createTestWallet();
  const view = await issueChallenge({ address: first.address, network: "devnet" }, META);
  const signedIn = await verifySignIn(
    { challengeId: view.challengeId, signature: first.sign(view.message) },
    META,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(signedIn.setCookie)?.[1] ?? null;
  const resolution = await resolveSession(token, AT);
  if (resolution === null) throw new Error("session did not resolve");
  const auth: AuthContext = { ...META, session: resolution.session };
  const second = createTestWallet();
  const link = await issueLinkChallenge({ address: second.address, network: "devnet" }, auth);
  const linked = await verifyLink(
    { challengeId: link.challengeId, signature: second.sign(link.message) },
    auth,
  );
  return { auth, ids: [signedIn.body.wallet.id, linked.wallet.id] };
}

describe("unlink write-skew guard", () => {
  it.each([1, 2, 3, 4, 5])(
    "run %i: two concurrent unlinks of the last two wallets -> one success, one LAST_WALLET",
    async () => {
      const { auth, ids } = await userWithTwoWallets();
      const results = await Promise.allSettled(ids.map((id) => unlinkWallet(id, auth)));
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reason = (rejected[0] as PromiseRejectedResult).reason as unknown;
      expect(reason).toBeInstanceOf(ConflictError);
      expect((reason as ConflictError).code).toBe("LAST_WALLET");
      const active = await (
        await getDb()
      )
        .collection("wallets")
        .countDocuments({ userId: auth.session.userId, status: "active" });
      expect(active).toBe(1);
    },
  );
});
