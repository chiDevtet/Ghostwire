# Wallet compatibility checklist (manual)

Acceptance criterion 6 of PR 02b: Phantom and Solflare results on **devnet** are recorded here
**before merge**. Rows are filled in only from real runs; never copy a result from another row or
from an automated test.

## Setup

1. Start the app (`bun run build && bun run start`, or a preview deployment) with
   `SOLANA_NETWORKS=devnet,mainnet-beta`.
2. Use a fresh browser profile (desktop) or a freshly opened in-app browser (mobile).
3. Switch the wallet to devnet in its own network or developer settings. Use a throwaway account;
   never use an account that holds real funds. Write the exact steps you used in the Notes column.
4. Have at least two accounts in the wallet (for the account-switch and link checks).

## Checklist per run

| Check | Steps | Expected result |
| --- | --- | --- |
| Connect | `/` → Connect wallet → pick the wallet | The wallet asks to connect; the modal shows "Approve the sign-in request in your wallet." with this site's domain, your truncated address and "Devnet" |
| Sign-in | Approve the message | Lands on `/dashboard`; the top bar shows "Devnet" and your address; no transaction prompt ever appears |
| Sign rejection | Start again, reject in the wallet | "You cancelled the sign-in." and Try again works |
| Wallet disconnect | Start, then disconnect the site in the wallet before approving | "Your wallet disconnected." and Reconnect works |
| Account switch | Start, then switch accounts in the wallet before approving | "Your wallet switched accounts. Start again with the new account." and Start again works |
| Link | `/settings/wallets` → Link another wallet → the second account | "Wallet linked."; the list shows two wallets |
| Unlink | Unlink the second wallet; then try the last one | "Wallet unlinked."; then "You can't unlink your only wallet." |

## Results

| Date | Wallet | Wallet version | Platform (desktop extension / mobile in-app) | Browser + version | Connect | Sign-in | Reject | Disconnect | Account switch | Link | Unlink | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | Phantom |  | desktop extension |  |  |  |  |  |  |  |  |  |
|  | Phantom |  | mobile in-app |  |  |  |  |  |  |  |  |  |
|  | Solflare |  | desktop extension |  |  |  |  |  |  |  |  |  |
|  | Solflare |  | mobile in-app |  |  |  |  |  |  |  |  |  |

Use `pass`, `fail` or `n/a` (with a note) in each check column.

## Error shapes seen

Record the exact error each wallet produced, from the browser console (`classifyWalletError` maps
code 4001 or text matching /reject|denied|cancel/ to "rejected", and /disconnect|not ?connected/
to "disconnected"; anything else shows the generic retry). If a real shape is classified wrongly,
open a fix before merge.

| Wallet | Action | Error `name` | Error `message` | `code` | Nested `cause` / `error` | Classified as |
| --- | --- | --- | --- | --- | --- | --- |
| Phantom | reject sign |  |  |  |  |  |
| Phantom | disconnect |  |  |  |  |  |
| Solflare | reject sign |  |  |  |  |  |
| Solflare | disconnect |  |  |  |  |  |
