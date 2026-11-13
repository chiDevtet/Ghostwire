import { describe, expect, it } from "vitest";
import { classifyWalletError } from "@/modules/wallet-connect";

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** cause chain with the innermost value at `depth` (1 = the value itself). */
function nested(depth: number, inner: unknown): unknown {
  let value = inner;
  for (let i = 1; i < depth; i += 1) value = { cause: value };
  return value;
}

describe("classifyWalletError", () => {
  it.each<[string, unknown]>([
    ["code 4001", { code: 4001 }],
    ["code '4001'", { code: "4001" }],
    ["standard Error + code 4001", Object.assign(new Error("x"), { code: 4001 })],
    ["Phantom plain object", { code: 4001, message: "User rejected the request." }],
    [
      "Solflare WalletSignMessageError",
      named("WalletSignMessageError", "User rejected the request"),
    ],
    ["wrapped .error", { name: "WalletSignMessageError", error: { code: 4001 } }],
    ["Error cause", new Error("x", { cause: { code: 4001 } })],
    ["Approval Denied", new Error("Approval Denied")],
    ["Transaction cancelled", new Error("Transaction cancelled")],
    ["UserRejectedRequestError", named("UserRejectedRequestError", "")],
    ["rejection at depth 5", nested(5, { code: 4001 })],
  ])("rejected: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("rejected");
  });

  it.each<[string, unknown]>([
    ["WalletDisconnectedError", named("WalletDisconnectedError", "")],
    ["WalletNotConnectedError", named("WalletNotConnectedError", "")],
    ["Wallet not connected", new Error("Wallet not connected")],
    ["the string 'disconnected'", "disconnected"],
  ])("disconnected: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("disconnected");
  });

  it.each<[string, unknown]>([
    ["TypeError", new TypeError("x")],
    ["a plain string", "boom"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an empty object", {}],
    ["rejection at depth 6 (walk stops at 5)", nested(6, { code: 4001 })],
  ])("other: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("other");
  });

  it("terminates on a self-referential cause cycle", () => {
    const a: { cause?: unknown; message: string } = { message: "a" };
    const b = { cause: a, message: "b" };
    a.cause = b;
    expect(classifyWalletError(a)).toBe("other");
  });

  it("prefers rejection over disconnect within one node", () => {
    expect(classifyWalletError(new Error("User rejected; wallet disconnected"))).toBe("rejected");
  });
});
