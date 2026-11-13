import { describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import * as unlinkRoute from "@/app/api/v1/wallets/[id]/route";
import { parseSignInMessage } from "@/modules/wallet";
import { linkWallet, requestChallenge, signIn, verify } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { captureLogLines } from "../../../helpers/logs";
import { sha256Hex } from "@/modules/security";

function leaks(lines: readonly string[], secrets: readonly string[]): string[] {
  return secrets.filter((secret) => lines.some((line) => line.includes(secret)));
}

describe("logs never contain credentials", () => {
  it("has a working leak detector (positive control)", () => {
    expect(leaks(['{"msg":"x secret-abc"}'], ["secret-abc", "other"])).toEqual(["secret-abc"]);
  });

  it("logs no token, token hash, nonce, signature or message across success and failure paths", async () => {
    const capture = captureLogLines();
    const secrets: string[] = [];
    try {
      const clock = useTestClock(new Date("2026-11-13T10:00:00.000Z"));
      const client = new TestClient();
      const wallet = createTestWallet();
      const signedIn = await signIn(client, wallet);
      const token = client.cookie ?? "";
      const nonce = parseSignInMessage(signedIn.challenge.message)?.nonce ?? "";
      secrets.push(
        token,
        sha256Hex(token),
        nonce,
        sha256Hex(nonce),
        signedIn.signature,
        signedIn.challenge.message,
        JSON.stringify(signedIn.challenge.message).slice(1, -1),
      );

      // Failure paths: replay, foreign signature, tampered message, expired challenge.
      await verify(new TestClient(), signedIn.challenge, signedIn.signature);
      const second = await requestChallenge(new TestClient(), wallet);
      const forged = createTestWallet().sign(second.message);
      secrets.push(
        forged,
        second.message,
        JSON.stringify(second.message).slice(1, -1),
        parseSignInMessage(second.message)?.nonce ?? "",
      );
      await verify(new TestClient(), second, forged);
      const third = await requestChallenge(new TestClient(), wallet);
      const tampered = wallet.sign(third.message.replace("solana:devnet", "solana:mainnet-beta"));
      secrets.push(tampered);
      await verify(new TestClient(), third, tampered);
      const fourth = await requestChallenge(new TestClient(), wallet);
      clock.advance(301_000);
      const late = wallet.sign(fourth.message);
      secrets.push(late);
      await verify(new TestClient(), fourth, late);

      // Session paths: slide, list, link, an unlink that succeeds, a real LAST_WALLET 409, a
      // forged cookie, and logout (the main client's, plus a separate client that logs out OK).
      clock.advance(2 * 3_600_000);
      await client.call(meRoute.GET, { method: "GET", path: "/api/v1/me" });
      await client.call(sessionsRoute.GET, { method: "GET", path: "/api/v1/sessions" });
      const linked = await linkWallet(client, createTestWallet());
      const linkedId = (linked.json as { wallet: { id: string } }).wallet.id;
      const unlink = (id: string) =>
        client.call(unlinkRoute.DELETE, {
          method: "DELETE",
          path: `/api/v1/wallets/${id}`,
          params: { id },
        });
      expect((await unlink(linkedId)).status).toBe(204);
      const lastWallet = await unlink(signedIn.walletId);
      expect(lastWallet.status).toBe(409);
      expect(lastWallet.json).toMatchObject({ code: "LAST_WALLET" });
      const forgedCookie = "F".repeat(43);
      secrets.push(forgedCookie);
      const stranger = new TestClient();
      stranger.setCookie(forgedCookie);
      await stranger.call(meRoute.GET, { method: "GET", path: "/api/v1/me" });
      const other = new TestClient();
      const otherSignedIn = await signIn(other, createTestWallet());
      const otherToken = other.cookie ?? "";
      secrets.push(
        otherToken,
        sha256Hex(otherToken),
        otherSignedIn.signature,
        otherSignedIn.challenge.message,
        JSON.stringify(otherSignedIn.challenge.message).slice(1, -1),
        parseSignInMessage(otherSignedIn.challenge.message)?.nonce ?? "",
      );
      const loggedOut = await other.call(logoutRoute.POST, {
        method: "POST",
        path: "/api/v1/auth/logout",
      });
      expect(loggedOut.status).toBe(204);
      await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    } finally {
      capture.restore();
    }
    const lines = capture.lines();
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.some((line) => line.includes('"reason":"signature_invalid"'))).toBe(true);
    expect(
      leaks(
        lines,
        secrets.filter((s) => s !== ""),
      ),
    ).toEqual([]);
  });
});
