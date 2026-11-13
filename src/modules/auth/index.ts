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
