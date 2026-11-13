import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as verifyRoute from "@/app/api/v1/auth/verify/route";
import type { ChallengeView } from "@/modules/auth";
import type { TestWallet } from "./ed25519";
import type { CallResult, TestClient } from "./http";

export interface SignedIn {
  readonly userId: string;
  readonly walletId: string;
  readonly challenge: ChallengeView;
  readonly signature: string;
}

/** POSTs a challenge for `wallet` and returns its view. Throws unless the route returns 200. */
export async function requestChallenge(
  client: TestClient,
  wallet: TestWallet,
  network: "devnet" | "mainnet-beta" = "devnet",
): Promise<ChallengeView> {
  const result = await client.call(challengeRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/challenge",
    body: { address: wallet.address, network },
  });
  if (result.status !== 200) throw new Error(`challenge failed: ${JSON.stringify(result.json)}`);
  return result.json as ChallengeView;
}

/** POSTs a verify for a challenge view, signed by `wallet`. Returns the raw result. */
export function verify(
  client: TestClient,
  challenge: ChallengeView,
  signature: string,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<CallResult> {
  return client.call(verifyRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/verify",
    body: { challengeId: challenge.challengeId, signature, ...extra },
  });
}

/** Full sign-in through the routes; the client's jar then holds the session cookie. */
export async function signIn(
  client: TestClient,
  wallet: TestWallet,
  network: "devnet" | "mainnet-beta" = "devnet",
): Promise<SignedIn> {
  const challenge = await requestChallenge(client, wallet, network);
  const signature = wallet.sign(challenge.message);
  const result = await verify(client, challenge, signature);
  if (result.status !== 200) throw new Error(`verify failed: ${JSON.stringify(result.json)}`);
  const body = result.json as { user: { id: string }; wallet: { id: string } };
  return { userId: body.user.id, walletId: body.wallet.id, challenge, signature };
}
