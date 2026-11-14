import { vi } from "vitest";
import { buildSignInMessage, type SolanaAddress, type SolanaNetwork } from "@/modules/wallet";

export type ApiRouteKey =
  | "POST /api/v1/auth/challenge"
  | "POST /api/v1/auth/verify"
  | "POST /api/v1/auth/logout"
  | "GET /api/v1/me"
  | "GET /api/v1/wallets"
  | "POST /api/v1/wallets/link/challenge"
  | "POST /api/v1/wallets/link/verify"
  | "DELETE /api/v1/wallets/:id"
  | "GET /api/v1/sessions"
  | "DELETE /api/v1/sessions/:id";

export type FakeHandler = (
  request: Request,
  params: { readonly id?: string },
) => Response | Promise<Response>;

export interface FakeApi {
  /** Clones of every request fetch received, in order (bodies still readable). */
  readonly requests: readonly Request[];
  restore(): void;
}

/** happy-dom's default location; relative fetch paths resolve against it in node too. */
const BASE = "http://localhost:3000";

const EXACT: ReadonlySet<string> = new Set<ApiRouteKey>([
  "POST /api/v1/auth/challenge",
  "POST /api/v1/auth/verify",
  "POST /api/v1/auth/logout",
  "GET /api/v1/me",
  "GET /api/v1/wallets",
  "POST /api/v1/wallets/link/challenge",
  "POST /api/v1/wallets/link/verify",
  "GET /api/v1/sessions",
]);

function route(method: string, pathname: string): { key: ApiRouteKey | null; id?: string } {
  const exact = `${method} ${pathname}`;
  if (EXACT.has(exact)) return { key: exact as ApiRouteKey };
  const wallet = /^\/api\/v1\/wallets\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && wallet !== null && wallet[1] !== "link") {
    return { key: "DELETE /api/v1/wallets/:id", id: decodeURIComponent(wallet[1] ?? "") };
  }
  const session = /^\/api\/v1\/sessions\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && session !== null) {
    return { key: "DELETE /api/v1/sessions/:id", id: decodeURIComponent(session[1] ?? "") };
  }
  return { key: null };
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Stubs globalThis.fetch with vi.stubGlobal. Each call is routed by method and path to a
 * handler; unknown routes return 500 { code: "INTERNAL" } and are recorded too. An aborted
 * signal rejects with an AbortError like real fetch, even while a handler is still pending.
 */
export function mockApi(handlers: Partial<Record<ApiRouteKey, FakeHandler>>): FakeApi {
  const requests: Request[] = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((resolve, reject) => {
        const abortError = () => new DOMException("The operation was aborted.", "AbortError");
        const signal = init?.signal ?? undefined;
        if (signal?.aborted === true) {
          reject(abortError());
          return;
        }
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        const url = input instanceof Request ? input.url : String(input);
        const request = new Request(new URL(url, BASE), {
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
          credentials: init?.credentials,
          cache: init?.cache,
        });
        requests.push(request.clone());
        const { key, id } = route(request.method, new URL(request.url).pathname);
        const handler = key === null ? undefined : handlers[key];
        if (handler === undefined) {
          resolve(json(500, { code: "INTERNAL", message: "Internal error" }));
          return;
        }
        Promise.resolve(handler(request, id === undefined ? {} : { id })).then(resolve, reject);
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}

let challengeCounter = 0;

/**
 * A challenge whose message is the real 02a layout for the given domain, address and network.
 * domain defaults to happy-dom's "localhost:3000". The id is a fresh 24-hex string.
 */
export function challengeFor(input: {
  readonly address: string;
  readonly network: SolanaNetwork;
  readonly domain?: string;
  readonly purpose?: "signin" | "link";
}): { challengeId: string; message: string; expiresAt: string } {
  challengeCounter += 1;
  const issuedAt = new Date("2026-11-13T10:00:00.000Z");
  const expiresAt = new Date("2026-11-13T10:05:00.000Z");
  const domain = input.domain ?? "localhost:3000";
  const message = buildSignInMessage({
    purpose: input.purpose ?? "signin",
    domain,
    address: input.address as SolanaAddress,
    uri: `http://${domain}`,
    network: input.network,
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    issuedAt,
    expiresAt,
  });
  return {
    challengeId: challengeCounter.toString(16).padStart(24, "0"),
    message,
    expiresAt: expiresAt.toISOString(),
  };
}
