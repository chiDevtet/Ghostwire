# ADR-0005: Helius SDK discovery (research only)

- **Status:** Accepted (research record; no SDK installed in this cycle)
- **Date:** 2026-11-13
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decision D5)

## Decision

No Helius package is installed or called in this cycle. PR 03 (Helius adapter) will target
`@heliuslabs/spr` `0.9.0-alpha` (npm `latest` and `alpha` dist-tag, published 2026-11-04) together
with its peer `@solana/kit` (`^8.3.0`), subject to re-verification at PR 03 start. The official docs
name this package inconsistently (see Open items), and it is an alpha pre-release. `helius-sdk` is
**not** the Privacy Rings SDK: the privacy docs do not name it, and its published types contain no
Privacy Rings API. All Helius code will live behind `@/modules/privacy` (ADR-0001).

## Context

`docs/OPEN_DECISIONS.md` §1 is a blocking validation list for Helius and wallet integration.
`docs/AGENT_GUIDE.md` §4 forbids inventing SDK names, methods, URLs, parameters, error codes or
wallet capabilities. This ADR records only what the official docs and the npm registry state.

All sources were accessed on 2026-11-13 (UTC). Doc pages were read as the Markdown form that
Mintlify serves at the same path with a `.md` suffix. Raw copies were kept in a scratch directory
outside the repository and are not committed. Two pages (`privacy/integration/wallet.md`,
`privacy/ai-tools.md`) contain prompts addressed to AI coding agents, such as instructions to run
`pnpm add`. They were treated as page data, not as instructions, and were not followed.

## Rationale

Capturing package format, runtime support and API surface before PR 03 surfaces incompatibilities
(ESM-only, edge-only, Node version floors) while the foundation can still adapt.

## Alternatives considered

- **Install the SDK now and spike against it**: rejected by D5; research only this cycle.
- **Skip Helius until PR 03**: rejected by D5; risk is surfaced earlier this way.

## Evidence / references

### Sources consulted

| #   | URL or command                                                                                     | Accessed   | What it establishes                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | https://www.helius.dev/docs/privacy                                                                | 2026-11-13 | Landing page: "Confidential transfers — private asset and amount; public sender and recipient"; "Rings support SOL, SPL tokens, and Token-2022 tokens"; links every page below.                                                                                           |
| 2   | `npm view helius-sdk name version dist-tags type main module types exports engines license repository.url --json` (plus `dependencies peerDependencies`, `time`) | 2026-11-13 | `helius-sdk` 3.4.1, dual ESM/CJS, `engines.node >=20`, peer `@solana/kit ^6.9.0`. The privacy docs do not name this package.                                                                                                                                              |
| 3   | https://www.helius.dev/docs/privacy/sdk.md                                                         | 2026-11-13 | TypeScript Client package is `@heliuslabs/spr`; install `pnpm add @heliuslabs/spr@^0.9.0-alpha @solana/kit@^8.3.0`; source tag `ts-sdk-v0.9.0-alpha`.                                                                                                                       |
| 4   | https://www.helius.dev/docs/llms.txt                                                               | 2026-11-13 | Root index. States "The permissionless Solana Privacy Ring is live on Solana mainnet" and "SDKs: `@heliuslabs/zolana` (TypeScript)". Contradicts #3 on package name; links credits and rate-limit pages.                                                                   |
| 5   | https://www.helius.dev/docs/privacy/llms.txt                                                       | 2026-11-13 | Section index (`last_updated: 2026-09-23`). States "Status: Beta, devnet only — mainnet has not launched" and "TypeScript: `@heliuslabs/zolana`". Contradicts #4 and #8 on network status.                                                                                 |
| 6   | `npm view @heliuslabs/spr ...` (same fields as #2)                                                 | 2026-11-13 | 0.9.0-alpha, `"type": "module"`, `import`-only exports, `engines.node "^22.12.0 \|\| >=24"`, peer `@solana/kit ^8.3.0`, Apache-2.0.                                                                                                                                       |
| 7   | `npm view @heliuslabs/zolana ...` (same fields as #2)                                              | 2026-11-13 | Exists: `latest` 0.5.0-alpha, `alpha` 0.8.0-alpha (last publish 2026-11-03), ESM-only, `engines.node ">=24"`, peer `@solana/kit ^8.3.0`. Not marked deprecated (`npm view @heliuslabs/zolana deprecated` printed nothing).                                                 |
| 8   | https://www.helius.dev/docs/privacy/endpoints.md                                                   | 2026-11-13 | Heading "Beta Endpoints"; devnet and mainnet URLs `https://devnet.helius-rpc.com/` and `https://mainnet.helius-rpc.com/` with the API key as the `api-key` query parameter; indexer path `/v1/spr/{method}`; `createSprClient({ solanaRpcUrl })`.                          |
| 9   | https://www.helius.dev/docs/privacy/concepts/overview.md                                           | 2026-11-13 | Defines confidentiality vs anonymity; Default Ring is "Confidential, Self-custodial, Permissionless, No auditor visibility"; per-flow visibility tables for deposit, transfer, withdraw.                                                                                   |
| 10  | https://www.helius.dev/docs/privacy/concepts/architecture.md                                       | 2026-11-13 | One Helius RPC URL exposes Solana RPC, indexer and prover; Forester tree fee "5,000 lamports (0.000005 SOL) for each state Merkle tree an instruction updates"; ~430 TPS per tree.                                                                                         |
| 11  | https://www.helius.dev/docs/privacy/concepts/encryption.md                                         | 2026-11-13 | Shielded keypair (signing, viewing, nullifier keys); local vs delegated decryption; native wallet integration vs embedded wallet custody table; selective disclosure.                                                                                                     |
| 12  | https://www.helius.dev/docs/privacy/concepts/utxo.md                                               | 2026-11-13 | Private balance is a set of UTXOs; at most 40 UTXOs per transfer; merging; concurrency ("Users can spend private balances as soon as transactions are final").                                                                                                            |
| 13  | https://www.helius.dev/docs/privacy/integration/wallet.md                                          | 2026-11-13 | Private Wallet guide "For wallet providers with their own key management": derivation from signature over `"TSPP/derive/v1"`, registry registration, transfer-to-unregistered fallback to withdrawal.                                                                     |
| 14  | https://www.helius.dev/docs/privacy/integration/embedded-wallet.md                                 | 2026-11-13 | "The embedded privacy wallet is not live yet. It will be integrated into Helius Wallet-as-a-Service."                                                                                                                                                                     |
| 15  | https://www.helius.dev/docs/privacy/integration/on-off-ramp.md                                     | 2026-11-13 | Ramp-provider guide; names USDC only as an example asset ("such as USDC, SOL, or any SPL or Token-2022 token").                                                                                                                                                           |
| 16  | https://www.helius.dev/docs/privacy/integration/enterprise.md                                      | 2026-11-13 | "Custom Rings are currently being audited, with a target mainnet release in Q4 2026." Not used by this project.                                                                                                                                                           |
| 17  | https://www.helius.dev/docs/privacy/guides/deposit.md                                              | 2026-11-13 | Deposit flow (`depositInstruction`, `DepositAsset.sol()` / `DepositAsset.spl`); per-mint interface creation; "The TypeScript examples require Node.js 24 or later, pnpm 11.18.0, and the Solana CLI."                                                                    |
| 18  | https://www.helius.dev/docs/privacy/guides/transfer.md                                             | 2026-11-13 | Transfer flow (`ConfidentialTransfer`, `ProofInputUtxo.fromKeypair`, `LocalKeys.fromKeypair`, `client.proveTransact`, `transactInstruction`, `client.confirmTransaction`).                                                                                                |
| 19  | https://www.helius.dev/docs/privacy/guides/withdraw.md                                             | 2026-11-13 | Withdraw flow (`withdrawal.withdraw`, `WithdrawalTarget.sol` / `.spl`, `TransactWithdrawal.sol` / `.spl`); withdrawn asset and amount are public.                                                                                                                          |
| 20  | https://www.helius.dev/docs/privacy/guides/read-balance.md                                         | 2026-11-13 | `confidentialViewTag()`, `client.getShieldedTransactionsByTags`, `atSlot`, `decryptToBalances`; "The indexer returns encrypted output data. It does not decrypt the private balance."                                                                                     |
| 21  | https://www.helius.dev/docs/privacy/guides/read-history.md                                         | 2026-11-13 | `Wallet`, `decryptTransactions`, `LocalShieldedKeys.fromKeypair`, `wallet.privateTransactions()`; example entry carries `status: "confirmed"`.                                                                                                                            |
| 22  | https://www.helius.dev/docs/privacy/addresses.md                                                   | 2026-11-13 | Program IDs, the same on mainnet and devnet (Solana Privacy Program `ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW`, User Registry `regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ`); SPL interfaces are per-mint.                                                             |
| 23  | https://www.helius.dev/docs/privacy/security.md                                                    | 2026-11-13 | Audits: Certora (October 2026), zkSecurity (August 2026), OtterSec "Awaiting report"; trusted setup completed November 2, 2026.                                                                                                                                           |
| 24  | https://www.helius.dev/docs/privacy/ai-tools.md                                                    | 2026-11-13 | Docs MCP and search setup only; no API facts used.                                                                                                                                                                                                                        |
| 25  | https://www.helius.dev/docs/api-reference/privacy.md                                               | 2026-11-13 | Indexer JSON-RPC methods; "The API is available on mainnet and devnet"; pagination; error codes `-32600`, `-32601`, `-32602`, `-32603`, `-32016`; "HTTP 429 indicates rate limiting".                                                                                     |
| 26  | https://www.helius.dev/docs/api-reference/privacy/llms.txt                                         | 2026-11-13 | API index (`last_updated: 2026-11-05`): lists 8 methods, says "Beta on devnet" and lists only a devnet URL. Contradicts #25 on mainnet availability.                                                                                                                       |
| 27  | https://www.helius.dev/docs/billing/credits.md                                                     | 2026-11-13 | Privacy Rings credits: Reads 10 per request; Proof generation 1,000 per proof; plans Free, Developer, Business, Professional.                                                                                                                                              |
| 28  | https://www.helius.dev/docs/billing/rate-limits.md                                                 | 2026-11-13 | Privacy Rings rate limits: Reads 2/10/50/100 per sec; Proof generation 1/5/10/20 per sec (Free/Developer/Business/Professional).                                                                                                                                           |
| 29  | `npm pack @heliuslabs/spr@0.9.0-alpha --ignore-scripts` + `grep` over `package/dist/**/*.d.ts` and `package/README.md` | 2026-11-13 | Documented symbols exist at the documented subpaths (table below); README: "Node.js 22.12 or a newer 22.x, or Node.js 24 or newer". Tarball read only, never executed.                                                                                                   |
| 30  | `npm pack helius-sdk@3.4.1 --ignore-scripts` + `grep` over `package/dist/**/*.d.ts`                | 2026-11-13 | No `createSprClient`, `getShieldedTransactionsByTags`, `getEncryptedUtxosByTags`, `/v1/spr` or `@heliuslabs` in its types (only unrelated Token-2022 `ConfidentialTransfer*` DAS fields).                                                                               |
| 31  | `npm view @solana/kit name version dist-tags engines type peerDependencies exports --json`        | 2026-11-13 | Peer named by the docs: `latest` 8.6.0 (satisfies `^8.3.0`), `engines.node >=20.18.0`, peer `typescript >=5.4.0`, conditional `node` / `browser` / `workerd` / `edge-light` exports.                                                                                   |

### Package metadata (npm)

`@heliuslabs/spr` is the package the SDK page names, so it is the primary target.

| Field                                        | Value                                                                                                                                                                                                                   | Source                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| name                                         | `@heliuslabs/spr`                                                                                                                                                                                                       | `npm view`                   |
| version (latest)                             | `0.9.0-alpha` (dist-tags `latest` and `alpha` both `0.9.0-alpha`; the only other version is `0.0.0-stage`)                                                                                                              | `npm view ... dist-tags`     |
| published                                    | 2026-11-04T23:58:17.846Z                                                                                                                                                                                                | `npm view ... time`          |
| module type (`type`)                         | `module`                                                                                                                                                                                                                | `npm view`                   |
| entry points (`exports` / `main` / `module`) | `exports` only, `import` condition only (no `require`): `.`, `./client`, `./wallet`, `./keypair`, `./program`, `./internal`, `./addresses`, `./interface`, `./transaction`, `./instructions`. No `main` or `module`. | `npm view`                   |
| type declarations (`types`)                  | Per-export `types` condition (e.g. `./dist/index.d.ts`); no top-level `types` field                                                                                                                                     | `npm view`                   |
| `engines.node`                               | `^22.12.0 \|\| >=24`                                                                                                                                                                                                    | `npm view`                   |
| peer dependencies                            | `@solana/kit ^8.3.0`                                                                                                                                                                                                    | `npm view`                   |
| license                                      | `Apache-2.0` (no `repository.url` in registry metadata)                                                                                                                                                                 | `npm view`                   |

`@heliuslabs/zolana` is the name in the `llms.txt` indexes (sources #4, #5).

| Field                                        | Value                                                                                                                    | Source                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| name                                         | `@heliuslabs/zolana`                                                                                                     | `npm view`               |
| version (latest)                             | `0.5.0-alpha` (`latest`); `alpha` tag is `0.8.0-alpha`                                                                   | `npm view ... dist-tags` |
| published                                    | `0.8.0-alpha` on 2026-11-03T00:19:28.190Z (most recent)                                                                  | `npm view ... time`      |
| module type (`type`)                         | `module`                                                                                                                 | `npm view`               |
| entry points (`exports` / `main` / `module`) | `exports` only, `import` condition only; same subpaths as `@heliuslabs/spr` except no `./program` and no `./internal` | `npm view`               |
| type declarations (`types`)                  | Per-export `types` condition                                                                                             | `npm view`               |
| `engines.node`                               | `>=24`                                                                                                                   | `npm view`               |
| peer dependencies                            | `@solana/kit ^8.3.0`                                                                                                     | `npm view`               |
| license                                      | `Apache-2.0`                                                                                                             | `npm view`               |

`helius-sdk` was checked because the brief named it. The privacy docs do not name it.

| Field                                        | Value                                                                                                                                                                            | Source                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| name                                         | `helius-sdk`                                                                                                                                                                     | `npm view`               |
| version (latest)                             | `3.4.1`                                                                                                                                                                          | `npm view ... dist-tags` |
| published                                    | 2026-11-10T13:15:32.200Z                                                                                                                                                         | `npm view ... time`      |
| module type (`type`)                         | `module`                                                                                                                                                                         | `npm view`               |
| entry points (`exports` / `main` / `module`) | `exports` with both `import` and `require` conditions (`.`, `./rpc`, `./zk/*`, `./wallet/*`, `./webhooks/*` and others); no Privacy Rings subpath. No `main` or `module`. | `npm view`               |
| type declarations (`types`)                  | Per-export `types` condition (`.d.ts` / `.d.cts`)                                                                                                                                | `npm view`               |
| `engines.node`                               | `>=20`                                                                                                                                                                           | `npm view`               |
| peer dependencies                            | `@solana/kit ^6.9.0`, `@solana-program/stake ^0.6.1`, `@solana-program/token ^0.13.0`, `@solana-program/system ^0.12.0`, `@solana-program/compute-budget ^0.15.0`              | `npm view`               |
| license                                      | `MIT`                                                                                                                                                                            | `npm view`               |

### Runtime and module format

- ESM / CommonJS: `@heliuslabs/spr` is ESM-only. Its exports have an `import` condition and no
  `require` condition (source #6).
- Node vs edge/browser support (as documented): the docs state only Node requirements. The guides
  say "The TypeScript examples require Node.js 24 or later" (sources #17–#21), and the package
  README and `engines` allow Node `^22.12.0 || >=24` (#6, #29). Browser and edge runtimes are not
  documented as of 2026-11-13 (checked: https://www.helius.dev/docs/privacy/sdk.md and the five
  guides). The exports map has no `browser` or `edge-light` condition, and a grep of the published
  JS found no `node:`-prefixed builtin imports (#29). That is not evidence of browser support. The
  peer `@solana/kit` 8.6.0 does ship `browser`, `workerd` and `edge-light` conditions (#31).
- Fit with this repository (ESM project, Node 24, Next.js 16 Node-runtime route handlers): **compatible on
  package format and Node version; unknown on browser use and Bun installs.** No conflict with our
  pins: ESM-only suits `"type": "module"`, the Node floor admits Node 24, and `@solana/kit`'s peer
  `typescript >=5.4.0` admits TypeScript 6.0.3. The SDK declares no TypeScript requirement.
  Unknowns: the docs install with pnpm 11.18.0, and installs with Bun 1.4.4 (which blocks untrusted
  lifecycle scripts) are not documented. Browser bundling via Next.js is not documented either. That
  matters because the docs place key operations in the wallet (see Security).
- Conflict to avoid: `helius-sdk` 3.4.1 peers `@solana/kit ^6.9.0`, while `@heliuslabs/spr` peers
  `@solana/kit ^8.3.0`. Both cannot be satisfied by one `@solana/kit` install. `helius-sdk` is also on
  the do-not-add list in the global constraints.

### Documented API surface

Doc symbols checked in `@heliuslabs/spr@0.9.0-alpha` published types. Paths are relative to
`package/dist/`, and the line is where the symbol first appears in the entry file for the documented
import subpath.

| Capability                                   | Exact documented name                                                                              | Doc URL                                                       | In published `.d.ts`? (file:line)                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client creation                              | `createSprClient({ solanaRpcUrl })` from `@heliuslabs/spr`                                         | https://www.helius.dev/docs/privacy/endpoints.md              | `index.d.ts:12`; `solanaRpcUrl` at `endpoint.d.ts:16`                                                                                                            |
| Shielded keypair / address                   | `ShieldedKeypair`, `shieldedAddress()`, `confidentialViewTag()`, `ownerHash()`                     | https://www.helius.dev/docs/privacy/guides/deposit.md         | `index.d.ts:15`; `program/shielded-pda.d.ts:27`; `keypair/shielded.d.ts:25`; `program/program-owner.d.ts:19`                                                     |
| Key-management interface                     | `ShieldedKeypairLike`, `ViewingKeyLike`                                                            | https://www.helius.dev/docs/privacy/integration/wallet.md     | `keypair/shielded.d.ts:53` and `:76`; re-exported `keypair/index.d.ts:17`                                                                                        |
| Recipient registration                       | `getRegisterInstructionAsync`, `getSetMergeEncryptionInstructionAsync` from `@heliuslabs/spr/instructions`; `MergeEncryptionScheme` | https://www.helius.dev/docs/privacy/integration/wallet.md | `instructions.d.ts:2` (aliases of `registerInstruction` / `setMergeEncryptionInstruction`); `index.d.ts:14`                                                       |
| Registration check                           | `isWalletRegistered({ rpc, owner })` from `@heliuslabs/spr/wallet`                                 | https://www.helius.dev/docs/privacy/integration/wallet.md     | `wallet/index.d.ts:16`                                                                                                                                           |
| Deposit                                      | `depositInstruction`, `DepositAsset.sol()` / `DepositAsset.spl` from `@heliuslabs/spr/interface`   | https://www.helius.dev/docs/privacy/guides/deposit.md         | `interface/index.d.ts:11` and `:13`                                                                                                                              |
| SPL interface setup                          | `getSplAssetVaultAddress` (`/addresses`), `getCreateSplInterfaceInstructionAsync` (`/instructions`) | https://www.helius.dev/docs/privacy/guides/deposit.md         | `addresses.d.ts:1`; `instructions.d.ts:1`                                                                                                                        |
| Transfer                                     | `ConfidentialTransfer`, `ProofInputUtxo.fromKeypair` from `@heliuslabs/spr/transaction`            | https://www.helius.dev/docs/privacy/guides/transfer.md        | `transaction/index.d.ts:7` and `:9`                                                                                                                              |
| Proving                                      | `LocalKeys.fromKeypair(sender, client.proofService)` (`/client`), `client.proveTransact`           | https://www.helius.dev/docs/privacy/guides/transfer.md        | `client/index.d.ts:3`; `client/client.d.ts:79` (`proofService`), `:110` (`proveTransact`)                                                                         |
| Transaction instruction (transfer, withdraw) | `transactInstruction`, `TransactWithdrawal.sol` / `.spl` from `@heliuslabs/spr/interface`          | https://www.helius.dev/docs/privacy/guides/withdraw.md        | `interface/index.d.ts:11` and `:13`                                                                                                                              |
| Withdraw target                              | `WithdrawalTarget.sol` / `.spl` from `@heliuslabs/spr/transaction`                                 | https://www.helius.dev/docs/privacy/guides/withdraw.md        | `transaction/index.d.ts:7`                                                                                                                                       |
| Transaction confirmation                     | `client.confirmTransaction(signature)` returns the landed slot; `atSlot(slot)` (`/client`)         | https://www.helius.dev/docs/privacy/guides/transfer.md        | `client/client.d.ts:105` (`Promise<bigint>`); `client/index.d.ts:17`                                                                                             |
| Balance read                                 | `client.getShieldedTransactionsByTags`, `decryptToBalances` (`/transaction`), `SOL_MINT`           | https://www.helius.dev/docs/privacy/guides/read-balance.md    | `client/client.d.ts:90`; `transaction/index.d.ts:11`; `index.d.ts:16`                                                                                            |
| History read                                 | `Wallet`, `decryptTransactions`, `LocalShieldedKeys.fromKeypair`, `wallet.privateTransactions()`   | https://www.helius.dev/docs/privacy/guides/read-history.md    | `index.d.ts:16`; `transaction/index.d.ts:11`; `transaction/wallet/state.d.ts:168`                                                                                |
| Reconciliation by signature                  | Indexer method `getShieldedTransactionsBySignature`                                                | https://www.helius.dev/docs/api-reference/privacy.md          | `client/client.d.ts:92`                                                                                                                                          |
| Public registry lookup                       | Indexer method `getUserRecords`                                                                    | https://www.helius.dev/docs/api-reference/privacy.md          | `client/client.d.ts:108`                                                                                                                                         |
| SDK error codes                              | Not documented as of 2026-11-13 (checked: the five guides and https://www.helius.dev/docs/privacy/sdk.md) | —                                                         | Types only: `CANONICAL_CLIENT_ERROR_CODES` at `client/error.d.ts:15`, exported from `client/index.d.ts:5`. Undocumented, so not to be relied on without re-checking. |
| Indexer error codes                          | `-32600`, `-32601`, `-32602`, `-32603`, `-32016`; HTTP 429                                         | https://www.helius.dev/docs/api-reference/privacy.md          | n/a (JSON-RPC wire contract)                                                                                                                                     |
| Send to public address (auto-fallback)       | Described only in prose ("The Privacy SDK can resolve a private transfer to a private-to-public withdrawal"); no TypeScript call is shown | https://www.helius.dev/docs/privacy/integration/wallet.md | Not checked: no documented name to search for                                                                                                                    |
| Phantom / Solflare integration               | Not documented as of 2026-11-13 (checked: all pages above; "phantom" and "solflare" do not appear) | —                                                             | n/a                                                                                                                                                              |
| Embedded private wallet                      | Not live ("The embedded privacy wallet is not live yet")                                           | https://www.helius.dev/docs/privacy/integration/embedded-wallet.md | n/a                                                                                                                                                         |

The send helper `sendAndConfirmFactory` in the guides is example code imported from
`"../src/lib.js"`. It is not an SDK export.

### OPEN_DECISIONS §1 assessment

| §1 item                                                                                           | Status (Answered / Partially answered / Unanswered) | Evidence summary | Link(s) |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------- | ------- |
| Confirm current Helius TypeScript SDK package/version, installation, API surface | Partially answered | The SDK page names `@heliuslabs/spr` `^0.9.0-alpha` with peer `@solana/kit@^8.3.0`, and its documented API surface exists in the published types. But both `llms.txt` indexes name `@heliuslabs/zolana`, which is also published, and the package is alpha. | https://www.helius.dev/docs/privacy/sdk.md; https://www.helius.dev/docs/privacy/llms.txt |
| Confirm embedded private wallet production availability, onboarding, custody, recovery, signing | Partially answered | "The embedded privacy wallet is not live yet". Planned onboarding is "Passkey, email, or existing-wallet sign-in"; custody: "Helius does not receive or export private spending keys". Recovery is not documented. | https://www.helius.dev/docs/privacy/integration/embedded-wallet.md; https://www.helius.dev/docs/privacy/concepts/encryption.md |
| Confirm Phantom integration for private balance reads, viewing context and signing | Unanswered | Phantom is not mentioned. The Private Wallet guide targets "wallet providers with their own key management" and tells them to "Reject any sign request for the `"TSPP/derive/v1"` message from a third party". | https://www.helius.dev/docs/privacy/integration/wallet.md |
| Confirm Solflare integration for same | Unanswered | Solflare is not mentioned. The same third-party-signing constraint applies. | https://www.helius.dev/docs/privacy/integration/wallet.md |
| Confirm whether external-wallet viewing-key handling differs by provider | Unanswered | The docs describe local vs delegated decryption generically. Nothing is provider-specific. | https://www.helius.dev/docs/privacy/concepts/encryption.md |
| Confirm SOL support per wallet path | Partially answered | SOL is supported by the protocol and the SDK (`SOL_MINT`, `DepositAsset.sol()`). Per-wallet-path support is not documented, and no wallet path is documented for a dapp like ours. | https://www.helius.dev/docs/privacy/guides/deposit.md |
| Confirm USDC official mint, token program and Ring support per wallet path | Partially answered | SPL and Token-2022 are supported generically, with a per-mint SPL interface created on first deposit. USDC appears only as an example asset. The privacy docs give no USDC mint address or token program, and nothing per wallet path. | https://www.helius.dev/docs/privacy/addresses.md; https://www.helius.dev/docs/privacy/concepts/architecture.md |
| Confirm private recipient initialization requirements | Answered | Derive the shielded keypair, then register in the onchain registry (`getRegisterInstructionAsync` and `getSetMergeEncryptionInstructionAsync`). "Creating a private wallet does not require a deposit". `isWalletRegistered` / `getUserRecords` check registration. | https://www.helius.dev/docs/privacy/integration/wallet.md |
| Confirm exact behavior sending to normal public Solana address | Partially answered | "The Privacy SDK can resolve a private transfer to a private-to-public withdrawal, when the recipient does not have a Private Wallet". Withdrawals make the asset and amount public. No TypeScript call or opt-in/automatic semantics is documented. | https://www.helius.dev/docs/privacy/integration/wallet.md; https://www.helius.dev/docs/privacy/guides/withdraw.md |
| Confirm public SOL fee payer/reserve requirements | Partially answered | The payer "signs and pays for the Solana transaction. A gas sponsor can pay the fee". The Forester tree fee is 5,000 lamports per tree updated, plus normal fees. Interface creators pay rent. No minimum reserve is documented. | https://www.helius.dev/docs/privacy/guides/transfer.md; https://www.helius.dev/docs/privacy/concepts/architecture.md |
| Confirm deposit, transfer, history, withdrawal and confirmation/reconciliation APIs | Answered | Each flow has a TypeScript guide with exact names, all present in the 0.9.0-alpha types. Confirmation uses `client.confirmTransaction` + `atSlot`; reconciliation uses `getShieldedTransactionsBySignature` and slot-resumable pagination. | https://www.helius.dev/docs/privacy/guides/transfer.md; https://www.helius.dev/docs/api-reference/privacy.md |
| Confirm production RPC/prover rate limits, pricing, failure modes and support | Partially answered | Credits and per-plan rate limits are published, as are indexer error codes and HTTP 429. Support is Telegram, email and contact form. Mainnet status is contradictory ("Beta, devnet only" vs "live on Solana mainnet"), and no SLA is documented. | https://www.helius.dev/docs/billing/rate-limits.md; https://www.helius.dev/docs/billing/credits.md; https://www.helius.dev/docs/api-reference/privacy.md |
| Review latest audits and formal verification status | Partially answered | Certora (October 2026) and zkSecurity (August 2026) reports are listed; OtterSec is "Awaiting report"; trusted setup completed November 2, 2026. Formal verification status is not stated. The report PDFs were not reviewed in this task. | https://www.helius.dev/docs/privacy/security.md |

Status rule: **Answered** only when the official docs state it clearly and the link is given.
Items about behavior "per wallet path" or in production are at most **Partially answered** from
documentation alone. They still need the hands-on validation gate in the README ("Development rule").

## Consequences

- PR 03 must start by resolving the package name (`@heliuslabs/spr` vs `@heliuslabs/zolana`) with
  Helius or from the source repository release notes. It must then pin one exact version. Both are
  alpha releases, and `@heliuslabs/spr` 0.9.0-alpha was 9 days old on 2026-11-13, so the API can
  change between minor alphas.
- PR 03 must add `@solana/kit` (peer `^8.3.0`) as a pinned direct dependency and must not add
  `helius-sdk`, whose peer `@solana/kit ^6.9.0` conflicts.
- The SDK is ESM-only. It imports cleanly in this ESM project, but it cannot be `require`d from
  any CommonJS tooling.
- **Architecture risk (blocks PR 03 design):** the docs put the shielded keypair in the user's
  wallet key management. "Local decryption keeps the viewing key on the device", and the derivation
  signature "is the derivation seed". For a self-custodial web app, the private operations
  (decrypt, sign, prepare proof inputs) therefore need to run where the keys are, in the browser or
  in the wallet. SDK browser support is undocumented. No documented path lets a dapp use Phantom or
  Solflare as the key holder: the only documented integration is a wallet provider implementing
  the Privacy Interface itself. Embedded wallets are not live. The wallet strategy needs a product
  decision (OPEN_DECISIONS §2 "Is embedded wallet recommended") and hands-on validation before
  adapter code.
- Server-side SDK use is limited to non-secret work (indexer reads of encrypted data, registry
  lookups, confirmation tracking). Those calls carry the Helius API key in a URL query parameter.
  Per the global constraints, our redactor scrubs `user:pass@` URIs and secret-named keys but not query strings, so PR 03 must
  keep the RPC URL out of logs or extend redaction.
- Mainnet availability is contradictory across official pages. PR 03 should target devnet and treat
  mainnet as unconfirmed until Helius confirms it.
- Proofs cost 1,000 credits each and are limited to 1–20 per second by plan. Both feed the hosting
  and plan decision.

## Scope / privacy / security impact

- Scope: possible change. The wallet path is undetermined. If no external-wallet path exists and
  embedded wallets stay unavailable, the planned Phantom/Solflare support may need to change. No
  scope change is made by this ADR.
- Privacy: the Default Ring is confidential, not anonymous. Per the docs, in a private transfer the
  "Asset" and "Amount" are "Private. Encrypted onchain", while "Sender" and "Recipient" are
  "Public. The Default Ring is confidential." A deposit from a public balance makes asset, amount,
  sender and recipient public. A withdrawal makes asset, amount and destination public. "The
  transaction hash remains public." Sources:
  https://www.helius.dev/docs/privacy/concepts/overview.md,
  https://www.helius.dev/docs/privacy/guides/deposit.md,
  https://www.helius.dev/docs/privacy/guides/withdraw.md. A transfer to an unregistered recipient
  can become a public withdrawal. The docs recommend "requesting a separate user signature in the
  UI to ensure the user does not withdraw to a public balance by accident"
  (https://www.helius.dev/docs/privacy/integration/wallet.md).
- Security: the docs describe transfers as self-custodial ("transfers require the owner's
  signature"). The shielded keypair is the Solana signing key plus a viewing key and nullifier key
  derived from a signature over `"TSPP/derive/v1"`. "Whoever holds it can derive the nullifier and
  viewing keys and can decrypt user transactions." Delegated decryption shares the viewing key with
  a provider and "does not grant spending authority". Proof generation "requires plaintext inputs of
  the complete user transaction data and nullifier keys". "The SDKs' default prover is an attested
  AWS Nitro enclave", and "Local proof generation is coming soon"
  (https://www.helius.dev/docs/privacy/integration/wallet.md,
  https://www.helius.dev/docs/privacy/concepts/encryption.md). The remote prover therefore receives
  transaction plaintext and nullifier keys. That is a trust assumption for the security review. No
  private material is recorded here.

## Open items carried forward

- SDK package/version: close with written confirmation from Helius (or matching release notes in
  https://github.com/helius-labs/zolana/releases) of which npm name is current, then re-run `npm view`.
- Embedded private wallet: close when Helius documents it as live, including its recovery flow.
- Phantom: close with documentation or hands-on proof of a dapp path for derivation, decryption and
  signing with Phantom.
- Solflare: same evidence as Phantom, for Solflare.
- External-wallet viewing-key handling: close once at least one external-wallet path exists and is
  documented per provider.
- SOL per wallet path: close with a devnet deposit/transfer/withdraw of SOL on each chosen wallet path.
- USDC: close with the official USDC mint and token program from Circle or Solana documentation,
  confirmation that a USDC SPL interface exists on the target cluster, and a devnet round trip per
  wallet path.
- Public-address send: close with the exact SDK call and whether the fallback is automatic or
  explicit, verified on devnet.
- Fee payer/reserve: close with measured fees on devnet and a documented or measured minimum SOL
  reserve for registration, deposit and withdrawal.
- Production limits/pricing/failure modes/support: close with Helius confirmation of mainnet
  status, an SLA or support terms, and the meaning of the SDK error codes.
- Audits/formal verification: close by reading the Certora and zkSecurity reports, the OtterSec
  report once published, and any formal-verification statement.
