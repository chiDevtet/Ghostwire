export { ensureAuthReady, registerAuthIndexes } from "./internal/indexes";
export type { ChallengeDoc, SessionDoc, UserDoc } from "./internal/collections";
export type {
  AuthContext,
  ChallengeView,
  CurrentSession,
  HandlerContext,
  LinkResult,
  MeView,
  RequestMeta,
  RevokeResult,
  RouteHandler,
  SessionHandler,
  SessionResolution,
  SessionView,
  SignInResult,
  UnlinkResult,
} from "./internal/types";
export {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "./internal/cookies";
export type { SessionCookieName } from "./internal/cookies";
export { requestMeta } from "./internal/request";
export { issueChallenge, verifySignIn } from "./internal/sign-in";
export { createSession, logout, resolveSession } from "./internal/sessions";
export { listSessions, revokeSession } from "./internal/session-management";
export { issueLinkChallenge, unlinkWallet, verifyLink } from "./internal/link";
export { getMe, listWallets } from "./internal/account";
export { withOrigin, withSession } from "./internal/wrappers";
