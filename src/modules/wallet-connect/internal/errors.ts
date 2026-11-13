export type WalletErrorKind = "rejected" | "disconnected" | "other";

const REJECTED = /reject|denied|cancel/i;
const DISCONNECTED = /disconnect|not ?connected/i;
const MAX_DEPTH = 5;

/** The node itself when it is a string, else "name message" when either is a string. */
function textOf(node: object | string): string | null {
  if (typeof node === "string") return node;
  const { name, message } = node as { name?: unknown; message?: unknown };
  if (typeof name !== "string" && typeof message !== "string") return null;
  return `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`;
}

function kindOf(node: object | string): WalletErrorKind | null {
  if (typeof node === "object") {
    const code = (node as { code?: unknown }).code;
    if (code === 4001 || code === "4001") return "rejected";
  }
  const text = textOf(node);
  if (text === null) return null;
  if (REJECTED.test(text)) return "rejected";
  if (DISCONNECTED.test(text)) return "disconnected";
  return null;
}

/**
 * Classifies a wallet error by walking the value, then `.cause`, then `.error` (how
 * wallet-adapter-style wrappers nest the inner error), breadth-first, at most 5 levels deep,
 * never visiting a node twice. The first matching node decides; within a node, rejection wins.
 * Code 4001 (EIP-1193 user rejection, used by Phantom) or text matching /reject|denied|cancel/i
 * is "rejected"; text matching /disconnect|not ?connected/i is "disconnected"; else "other".
 */
export function classifyWalletError(error: unknown): WalletErrorKind {
  const visited = new Set<unknown>();
  let level: unknown[] = [error];
  for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth += 1) {
    const next: unknown[] = [];
    for (const node of level) {
      if ((typeof node !== "object" && typeof node !== "string") || node === null) continue;
      if (visited.has(node)) continue;
      visited.add(node);
      const kind = kindOf(node);
      if (kind !== null) return kind;
      if (typeof node === "object") {
        const { cause, error: inner } = node as { cause?: unknown; error?: unknown };
        next.push(cause, inner);
      }
    }
    level = next;
  }
  return "other";
}
