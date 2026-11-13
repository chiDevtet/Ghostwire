import type { ObjectId } from "@/modules/database";
import type { SolanaNetwork, WalletView } from "@/modules/wallet";

/** Named HandlerContext, not RouteContext, to avoid Next's global RouteContext<'/route'>. */
export interface HandlerContext<P extends object = object> {
  readonly params: Promise<P>;
}

/** The shape Next 16 route handlers satisfy: (request, { params: Promise<P> }) => Promise<Response>. */
export type RouteHandler<P extends object = object> = (
  request: Request,
  context: HandlerContext<P>,
) => Promise<Response>;

export interface RequestMeta {
  /** now() once per request. */
  readonly at: Date;
  /** clientIp(request, TRUST_PROXY). Never persisted or logged. */
  readonly ip: string;
  /** Control characters stripped, at most 128 characters, "" -> null. */
  readonly userAgent: string | null;
}

export interface CurrentSession {
  readonly id: ObjectId;
  readonly userId: ObjectId;
  readonly walletId: ObjectId;
  readonly network: SolanaNetwork;
  readonly createdAt: Date;
  /** After sliding. */
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface AuthContext extends RequestMeta {
  readonly session: CurrentSession;
}

export type SessionHandler<P extends object = object> = (
  request: Request,
  auth: AuthContext,
  context: HandlerContext<P>,
) => Promise<Response>;

export interface ChallengeView {
  readonly challengeId: string;
  readonly message: string;
  readonly expiresAt: string;
}

export interface SignInResult {
  readonly body: {
    user: { id: string };
    wallet: { id: string; address: string; network: SolanaNetwork };
  };
  readonly setCookie: string;
}

export interface LinkResult {
  readonly wallet: WalletView;
  readonly created: boolean;
}

export interface SessionView {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly network: SolanaNetwork;
  readonly userAgent: string | null;
}

export interface MeView {
  readonly user: { id: string; createdAt: string };
  readonly session: { id: string; network: SolanaNetwork; expiresAt: string };
  readonly wallets: WalletView[];
}

export interface SessionResolution {
  readonly session: CurrentSession;
  readonly slid: boolean;
}

export interface UnlinkResult {
  readonly revokedCurrent: boolean;
}

export interface RevokeResult {
  readonly revokedCurrent: boolean;
}
