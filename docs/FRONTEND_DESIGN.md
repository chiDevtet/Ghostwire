# GHOST WIRE — Frontend Product Design Direction

**Status:** Product/design specification. Visual references are inspiration, not approved final screens.

## 1. Design objective

The interface should feel like a premium financial application. Make view balance, send, receive, and review activity obvious. Avoid DeFi-dashboard clutter. Users should not need to understand proof generation, RPC providers, or cryptographic primitives.

Responsive and mobile-first. Initial target is polished mobile web, not native apps.

## 2. Design system

Use tokens from [Brand Identity](BRAND_IDENTITY.md). Main background #09090E, surfaces #111118 and #17151F, subtle border #292936, white primary text, gray secondary text, electric violet #A78BFA as a restrained accent.

- Cards: approximately 14–18px radius.
- Buttons: approximately 10–12px radius.
- Inputs: dark elevated surface with clear label/focus state.
- Borders: thin and understated.
- Shadows: subtle; violet glow only for selected brand moments.
- Spacing: consistent 4px/8px scale.
- Motion: typical transitions 150–250ms; support reduced motion.

Typography: Space Grotesk headings, Inter body/labels/controls, Geist Mono addresses/signatures/numeric detail.

Icons: consistent line icon set. Icons supplement labels; do not make critical actions icon-only.

## 3. Application information architecture

Desktop sidebar:
- Dashboard
- Send
- Receive
- Payments
- Activity
- Settings

Top bar:
- GHOST WIRE mark/wordmark
- Network indicator
- Wallet connection/status
- Profile/settings

Mobile bottom navigation:
- Home
- Send
- Receive
- Activity

Settings lives under profile/menu. Avoid horizontal scrolling.

## 4. Screen specifications

### 4.1 Public landing page
Explain value and drive wallet creation/connection.

Hero:
- “Your money. Your business. Your privacy.”
- Supporting copy: private SOL and USDC payments on Solana with clear privacy boundaries.
- Primary CTA: “Open GHOST WIRE”.
- Secondary CTA: “Connect wallet”.

Sections:
- How private payments work.
- Features: private transfers, payment links, QR, self-custody.
- Privacy explained: what is hidden and what remains public.
- FAQ and footer links to docs, terms, privacy policy.

Do not promise anonymity. Explain that sender/recipient addresses may remain public under the default Ring and deposits/withdrawals can reveal public-side activity.

### 4.2 Onboarding
Two routes:
1. Create an embedded wallet (only when provider capability, recovery, and production readiness are verified).
2. Connect existing wallet (Phantom/Solflare where compatible).

Show progress and plain-language explanations for privacy initialization, authorization, recovery, and network selection. Connecting an ordinary wallet does not automatically initialize private balances.

### 4.3 Dashboard
- Welcome/profile row.
- Large private portfolio value card with eye toggle.
- Separate SOL and USDC cards.
- Primary actions: Send, Receive, Deposit, Withdraw.
- Recent activity with View all.
- Wallet/privacy readiness status, freshness timestamp, and network indicator.

Distinguish unavailable, loading, stale, and successfully retrieved balance states. Do not fabricate fallback balances.

### 4.4 Send
Fields: recipient address or supported payment request; asset selector; amount; optional note; available balance; public SOL fee reserve/estimated fee.

Flow:
1. Validate recipient and asset.
2. Retrieve current balance and fee context.
3. Review recipient, amount, asset, route, and privacy implications.
4. Ask wallet to authorize/sign.
5. Show submitted state.
6. Wait for confirmed execution and reconcile private history.
7. Show success only after defined confirmation/reconciliation policy.

### 4.5 Receive
- Asset selection.
- Optional fixed or open amount.
- Optional description.
- Create request.
- Display QR and shareable opaque link.
- Copy/share fallback.
- Request status and expiry.

A payment request is application-level, not the private transaction itself. Distinguish payment to private balance from payment to public address. Test first-time recipient onboarding.

### 4.6 Activity
Filters: All, Sent, Received, Deposits, Withdrawals, Pending.

Each item shows direction, asset, authorized-user amount, date/time, counterparty label, and status. Paginate. Do not leak sensitive values into analytics or URLs.

### 4.7 Transaction details and receipt
Display confirmed/pending/failed status, direction, asset/amount (authorized user only), counterparty label/address where appropriate, timestamp, network, signature/reference, and fee detail.

Actions: copy reference, share/download receipt, view transaction.

An application receipt is not automatically a cryptographic proof of confidential amount. Label accurately. Implement selective disclosure only after verification.

### 4.8 Settings
Account/sessions; wallets; embedded recovery; privacy/disclosure; notifications; network; security/active sessions; support/docs.

Never implement custom seed-phrase/password recovery. Use verified provider/wallet recovery.

## 5. Reusable components

GhostLogo, AppSidebar, MobileNavigation, TopBar, NetworkIndicator, WalletStatus, PrivateBalanceCard, AssetBalanceCard, PrivacyStatus, SendPaymentForm, ReviewPaymentPanel, ReceivePaymentCard, PaymentRequestForm, QRPaymentCard, TransactionRow, TransactionList, TransactionDetails, PaymentReceipt, WalletConnectModal, EmbeddedWalletSetup, ConfirmTransactionModal, EmptyState, ErrorState, LoadingSkeleton, ToastNotification.

Keep domain/payment state logic out of UI components.

## 6. Interaction and animation

- Balance visibility toggle: blur/reveal.
- Payment processing: subtle signal animation, not a fake countdown.
- Confirmation: only after confirmed execution.
- Privacy status: reflect actual initialized/ready/error state.
- QR: camera permissions and manual fallback.
- Sharing: native share where supported, copy fallback.
- Support reduced motion.
- Include loading, disabled, validation, pending, success, and error states.

## 7. Required edge states

No wallet; wallet disconnect; privacy not initialized; balance loading/stale; no funds; unsupported asset; unsupported recipient route; insufficient private balance; insufficient public SOL for fees; signature rejected; proof failure; RPC timeout; submitted/unconfirmed; confirmed with interrupted browser; duplicate submission; expired/cancelled/already-paid request; recovery required; network mismatch.

## 8. Accessibility and responsiveness

Keyboard navigation, visible focus, labels, semantic headings, contrast, screen-reader status announcements, adequate touch targets, color-independent status, reduced motion, no horizontal scrolling, copy controls for addresses/signatures, QR manual alternative.

## 9. Proposed frontend stack

Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui as a starting library, Lucide icons, Framer Motion selectively, React Hook Form + Zod, TanStack Query where appropriate.

Signing and privacy operations are not ordinary data fetches. Use explicit transaction lifecycle state and wallet authorization boundaries.

## 10. Design acceptance criteria

- Landing page communicates value and privacy limitations.
- Both wallet options are clear.
- Dashboard prioritizes balance and core actions.
- SOL/USDC clearly distinguished.
- Send/receive work at mobile widths.
- All transaction states represented honestly.
- Error/recovery paths designed.
- No sensitive values in query strings, analytics, logs, or public share metadata.
- Accessibility checks pass.
