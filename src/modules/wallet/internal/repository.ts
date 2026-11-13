import { safeEquals, type ClientSession, type ObjectId } from "@/modules/database";
import type { SolanaNetwork } from "@/modules/validation";
import type { SolanaAddress } from "./address";
import { wallets, type WalletDoc, type WalletStatus } from "./collection";

const MAX_WALLETS_LISTED = 100;

export interface WalletView {
  readonly id: string;
  readonly address: string;
  readonly network: SolanaNetwork;
  readonly provider: string | null;
  readonly status: WalletStatus;
  /** ISO-8601 */
  readonly linkedAt: string;
}

export function findWalletByAddress(
  address: SolanaAddress,
  network: SolanaNetwork,
  options: { session?: ClientSession } = {},
): Promise<WalletDoc | null> {
  return wallets.findOne(
    Object.assign({}, safeEquals("address", address), safeEquals("network", network)),
    { session: options.session },
  );
}

export function findWalletForUser(
  walletId: ObjectId,
  userId: ObjectId,
  options: { session?: ClientSession } = {},
): Promise<WalletDoc | null> {
  return wallets.findOne(
    Object.assign({}, safeEquals("_id", walletId), safeEquals("userId", userId)),
    { session: options.session },
  );
}

/** Sorted by linkedAt ascending, limit 100. */
export function listWalletsByUser(
  userId: ObjectId,
  options: { session?: ClientSession } = {},
): Promise<WalletDoc[]> {
  return wallets.find(safeEquals("userId", userId), {
    limit: MAX_WALLETS_LISTED,
    sort: { linkedAt: 1, _id: 1 },
    session: options.session,
  });
}

export function countActiveWallets(
  userId: ObjectId,
  options: { session: ClientSession },
): Promise<number> {
  return wallets.countDocuments(
    Object.assign({}, safeEquals("userId", userId), { status: "active" as const }),
    {
      session: options.session,
    },
  );
}

/** @throws ConflictError("DUPLICATE_KEY") when (address, network) already exists */
export function insertWallet(
  input: {
    userId: ObjectId;
    address: SolanaAddress;
    network: SolanaNetwork;
    provider: string | null;
    at: Date;
  },
  options: { session: ClientSession },
): Promise<WalletDoc> {
  return wallets.insertOne(
    {
      userId: input.userId,
      address: input.address,
      network: input.network,
      walletType: "external",
      provider: input.provider,
      status: "active",
      linkedAt: input.at,
      updatedAt: input.at,
    },
    { session: options.session },
  );
}

/**
 * Sets status and updatedAt=at. Setting "active" is a (re)link: it also sets linkedAt=at, and
 * provider when options.provider is given. Returns the updated doc, or null if it does not exist.
 */
export function setWalletStatus(
  walletId: ObjectId,
  status: WalletStatus,
  at: Date,
  options: { session: ClientSession; provider?: string | null },
): Promise<WalletDoc | null> {
  const $set =
    status === "active"
      ? Object.assign(
          { status, updatedAt: at, linkedAt: at },
          options.provider === undefined ? {} : { provider: options.provider },
        )
      : { status, updatedAt: at };
  return wallets.findOneAndUpdate(
    safeEquals("_id", walletId),
    { $set },
    {
      session: options.session,
    },
  );
}

/**
 * Writes updatedAt=at and nothing else. Sign-in calls it on an already-active wallet so that a
 * concurrent unlink of the same wallet write-conflicts with the sign-in (architecture §5.3).
 */
export function touchWallet(
  walletId: ObjectId,
  at: Date,
  options: { session: ClientSession },
): Promise<WalletDoc | null> {
  return wallets.findOneAndUpdate(
    safeEquals("_id", walletId),
    { $set: { updatedAt: at } },
    {
      session: options.session,
    },
  );
}

export function toWalletView(doc: WalletDoc): WalletView {
  return {
    id: doc._id.toHexString(),
    address: doc.address,
    network: doc.network,
    provider: doc.provider,
    status: doc.status,
    linkedAt: doc.linkedAt.toISOString(),
  };
}
