import { describe, expect, it } from "vitest";
import { GENERIC, UNREACHABLE, panelErrorCopy } from "@/components/panel-copy";

const failure = (code: string) => ({ ok: false as const, code, message: "server text" });

describe("panelErrorCopy", () => {
  it.each([
    ["LAST_WALLET", "You can't unlink your only wallet."],
    ["DEPENDENCY_UNAVAILABLE", UNREACHABLE],
    ["NETWORK", UNREACHABLE],
    ["NOT_FOUND", GENERIC],
    ["INTERNAL", GENERIC],
    ["UNEXPECTED_RESPONSE", GENERIC],
    ["UNAUTHENTICATED", GENERIC],
  ])("%s → %s", (code, copy) => {
    expect(panelErrorCopy(failure(code))).toBe(copy);
  });

  it("uses the exact spec strings and never the server message or code", () => {
    expect(UNREACHABLE).toBe(
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
    );
    expect(GENERIC).toBe("Something went wrong. Try again.");
    expect(panelErrorCopy(failure("INTERNAL"))).not.toContain("server text");
    expect(panelErrorCopy(failure("INTERNAL"))).not.toContain("INTERNAL");
  });
});
