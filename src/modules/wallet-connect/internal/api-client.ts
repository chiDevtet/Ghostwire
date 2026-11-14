import type * as z from "zod/mini";
import type { SolanaNetwork } from "@/modules/validation";
import {
  challengeSchema,
  errorBodySchema,
  linkSchema,
  meSchema,
  sessionsSchema,
  signInSchema,
  walletsSchema,
  type ChallengeData,
  type LinkData,
  type MeData,
  type SessionItem,
  type SignInData,
  type WalletItem,
} from "./schemas";

export interface ApiFailure {
  readonly ok: false;
  /**
   * Server code (UNAUTHENTICATED, AUTH_FAILED, VALIDATION_FAILED, NETWORK_UNSUPPORTED, NOT_FOUND,
   * LAST_WALLET, WALLET_ALREADY_LINKED, ORIGIN_REJECTED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE,
   * INTERNAL, …) or a client code: NETWORK, UNEXPECTED_RESPONSE, ABORTED.
   */
  readonly code: string;
  /** Server safeMessage or a fixed client string; never shown to users. */
  readonly message: string;
  /** Seconds; 429 only. */
  readonly retryAfter?: number;
}

export type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure;

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

interface ChallengeInput {
  readonly address: string;
  readonly network: SolanaNetwork;
}

interface VerifyInput {
  readonly challengeId: string;
  readonly signature: string;
  /** Omitted from the JSON body when undefined. */
  readonly provider?: string;
}

type Expect = 200 | 204 | "200|201";

interface Spec<T> {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly expect: Expect;
  /** Parses a 2xx JSON body; null means a schema mismatch. Unused for 204. */
  readonly parse: (json: unknown, status: number) => T | null;
  readonly signal?: AbortSignal;
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
const RETRY_AFTER_FALLBACK_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;

let unauthenticatedHandler: (() => void) | null = null;

/** One global slot. Returns an unregister that clears the slot only if it still holds `handler`. */
export function onUnauthenticated(handler: () => void): () => void {
  unauthenticatedHandler = handler;
  return () => {
    if (unauthenticatedHandler === handler) unauthenticatedHandler = null;
  };
}

function failure(code: string, message: string, retryAfter?: number): ApiFailure {
  return retryAfter === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, retryAfter };
}

const UNEXPECTED = (): ApiFailure => failure("UNEXPECTED_RESPONSE", "unexpected response");

/** Retry-After in whole seconds, clamped to 1..3600; 60 when missing or not a number. */
function retryAfterSeconds(header: string | null): number {
  const seconds = header === null ? Number.NaN : Number.parseInt(header, 10);
  if (!Number.isFinite(seconds)) return RETRY_AFTER_FALLBACK_SECONDS;
  return Math.min(RETRY_AFTER_MAX_SECONDS, Math.max(1, seconds));
}

function statusMatches(expect: Expect, status: number): boolean {
  if (expect === "200|201") return status === 200 || status === 201;
  return status === expect;
}

function parser<S extends z.ZodMiniType>(schema: S): (json: unknown) => z.infer<S> | null {
  return (json) => {
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  };
}

async function sendOnce<T>(spec: Spec<T>): Promise<ApiResult<T>> {
  const aborted = (): boolean => spec.signal?.aborted === true;
  let response: Response;
  try {
    const init: RequestInit = {
      method: spec.method,
      credentials: "same-origin",
      cache: "no-store",
      signal: spec.signal,
    };
    if (spec.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(spec.body);
    }
    response = await fetch(spec.path, init);
  } catch {
    return aborted() ? failure("ABORTED", "aborted") : failure("NETWORK", "network error");
  }
  try {
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(await response.json());
      if (!parsed.success) return UNEXPECTED();
      const { code, message } = parsed.data;
      return response.status === 429
        ? failure(code, message, retryAfterSeconds(response.headers.get("Retry-After")))
        : failure(code, message);
    }
    if (!statusMatches(spec.expect, response.status)) return UNEXPECTED();
    if (spec.expect === 204) return { ok: true, data: null as T };
    const data = spec.parse(await response.json(), response.status);
    return data === null ? UNEXPECTED() : { ok: true, data };
  } catch {
    return aborted() ? failure("ABORTED", "aborted") : UNEXPECTED();
  }
}

/** Never throws. An UNAUTHENTICATED result calls the registered handler once before resolving. */
async function send<T>(spec: Spec<T>): Promise<ApiResult<T>> {
  const result = await sendOnce(spec);
  if (!result.ok && result.code === "UNAUTHENTICATED") {
    try {
      unauthenticatedHandler?.();
    } catch {
      // A failing handler must not turn into a thrown API call.
    }
  }
  return result;
}

const parseChallenge = parser(challengeSchema);
const parseSignIn = parser(signInSchema);
const parseLink = parser(linkSchema);
const parseMe = parser(meSchema);
const parseWallets = parser(walletsSchema);
const parseSessions = parser(sessionsSchema);
const noBody = (): null => null;

export function challenge(
  input: ChallengeInput,
  options: RequestOptions = {},
): Promise<ApiResult<ChallengeData>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/challenge",
    body: { address: input.address, network: input.network },
    expect: 200,
    parse: parseChallenge,
    signal: options.signal,
  });
}

export function verify(
  input: VerifyInput,
  options: RequestOptions = {},
): Promise<ApiResult<SignInData>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/verify",
    body: { challengeId: input.challengeId, signature: input.signature, provider: input.provider },
    expect: 200,
    parse: parseSignIn,
    signal: options.signal,
  });
}

export function logout(options: RequestOptions = {}): Promise<ApiResult<null>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/logout",
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export function me(options: RequestOptions = {}): Promise<ApiResult<MeData>> {
  return send({
    method: "GET",
    path: "/api/v1/me",
    expect: 200,
    parse: parseMe,
    signal: options.signal,
  });
}

export function listWallets(
  options: RequestOptions = {},
): Promise<ApiResult<readonly WalletItem[]>> {
  return send({
    method: "GET",
    path: "/api/v1/wallets",
    expect: 200,
    parse: (json) => parseWallets(json)?.wallets ?? null,
    signal: options.signal,
  });
}

export function linkChallenge(
  input: ChallengeInput,
  options: RequestOptions = {},
): Promise<ApiResult<ChallengeData>> {
  return send({
    method: "POST",
    path: "/api/v1/wallets/link/challenge",
    body: { address: input.address, network: input.network },
    expect: 200,
    parse: parseChallenge,
    signal: options.signal,
  });
}

export function linkVerify(
  input: VerifyInput,
  options: RequestOptions = {},
): Promise<ApiResult<LinkData>> {
  return send({
    method: "POST",
    path: "/api/v1/wallets/link/verify",
    body: { challengeId: input.challengeId, signature: input.signature, provider: input.provider },
    expect: "200|201",
    parse: (json, status) => {
      const body = parseLink(json);
      return body === null ? null : { wallet: body.wallet, created: status === 201 };
    },
    signal: options.signal,
  });
}

export async function unlinkWallet(
  walletId: string,
  options: RequestOptions = {},
): Promise<ApiResult<null>> {
  if (!OBJECT_ID.test(walletId)) return failure("VALIDATION_FAILED", "invalid id");
  return send({
    method: "DELETE",
    path: `/api/v1/wallets/${encodeURIComponent(walletId)}`,
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export function listSessions(
  options: RequestOptions = {},
): Promise<ApiResult<readonly SessionItem[]>> {
  return send({
    method: "GET",
    path: "/api/v1/sessions",
    expect: 200,
    parse: (json) => parseSessions(json)?.sessions ?? null,
    signal: options.signal,
  });
}

export async function revokeSession(
  sessionId: string,
  options: RequestOptions = {},
): Promise<ApiResult<null>> {
  if (!OBJECT_ID.test(sessionId)) return failure("VALIDATION_FAILED", "invalid id");
  return send({
    method: "DELETE",
    path: `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export interface ApiClient {
  readonly challenge: typeof challenge;
  readonly verify: typeof verify;
  readonly logout: typeof logout;
  readonly me: typeof me;
  readonly listWallets: typeof listWallets;
  readonly linkChallenge: typeof linkChallenge;
  readonly linkVerify: typeof linkVerify;
  readonly unlinkWallet: typeof unlinkWallet;
  readonly listSessions: typeof listSessions;
  readonly revokeSession: typeof revokeSession;
}

export const apiClient: ApiClient = {
  challenge,
  verify,
  logout,
  me,
  listWallets,
  linkChallenge,
  linkVerify,
  unlinkWallet,
  listSessions,
  revokeSession,
};
