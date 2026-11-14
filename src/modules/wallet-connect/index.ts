export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption,
  FlowEvent,
  FlowFailureCode,
  FlowMode,
  FlowState,
  FlowStatus,
  SignPreview,
} from "./internal/flow";
export { classifyWalletError } from "./internal/errors";
export type { WalletErrorKind } from "./internal/errors";
export { parseChallengePreview } from "./internal/challenge-preview";
export { toProviderId } from "./internal/provider-id";
export { encodeBase58 } from "./internal/base58";
export {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
} from "./internal/api-client";
export type { ApiClient, ApiFailure, ApiResult, RequestOptions } from "./internal/api-client";
export type {
  ChallengeData,
  LinkData,
  MeData,
  SessionItem,
  SignInData,
  WalletItem,
} from "./internal/schemas";
