export { SOLANA_NETWORK_IDS } from "@/modules/validation";
export type { SolanaNetwork } from "@/modules/validation";
export { addressToPublicKey, parseSignature, parseSolanaAddress } from "./internal/address";
export type { SolanaAddress } from "./internal/address";
export { verifyEd25519 } from "./internal/ed25519";
export { buildSignInMessage, parseSignInMessage } from "./internal/sign-in-message";
export type { SignInMessageFields, SignInPurpose } from "./internal/sign-in-message";
export { PROVIDER_PATTERN, WALLET_STATUSES, registerWalletIndexes } from "./internal/collection";
export type { WalletDoc, WalletStatus } from "./internal/collection";
export {
  countActiveWallets,
  findWalletByAddress,
  findWalletForUser,
  insertWallet,
  listWalletsByUser,
  setWalletStatus,
  toWalletView,
  touchWallet,
} from "./internal/repository";
export type { WalletView } from "./internal/repository";
