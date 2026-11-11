# GHOST WIRE — User Flows

## 1. New embedded-wallet user

1. Visit GHOST WIRE.
2. Choose Create a GHOST WIRE wallet.
3. Complete supported authentication.
4. Embedded integration creates/provisions the user-controlled wallet using verified provider flow.
5. Complete recovery/security setup.
6. Review wallet and privacy initialization explanation.
7. Initialize applicable privacy functionality for supported assets.
8. Dashboard displays readiness and funding instructions.

Acceptance:
- No seed phrase/private key passes through application backend.
- Recovery is usable and tested.
- User is told whether private SOL, USDC, or both are ready.
- Errors are recoverable and understandable.

## 2. Existing-wallet user

1. Choose Connect existing wallet.
2. Select Phantom or Solflare.
3. Wallet connects.
4. GHOST WIRE issues one-time challenge with nonce, expiry, domain binding, wallet and network.
5. User signs.
6. Server verifies signature and replay protection.
7. User sees privacy setup explanation.
8. Initialize capability using documented integration.
9. Dashboard shows wallet/capability status.

Acceptance:
- Connection alone does not imply privacy initialized.
- Signature rejection is handled.
- Wrong network and unsupported provider states are explicit.
- No viewing key or secret is logged or exposed to unauthorized systems.

## 3. Deposit into private balance

1. Select Deposit and SOL or USDC.
2. Show public-to-private boundary disclosure.
3. Validate supported asset and destination/context.
4. Enter amount.
5. Show fee reserve and review.
6. Wallet authorizes/signs according to documented SDK flow.
7. Submit and track execution.
8. Retrieve authorized private balance/history.
9. Mark complete only after confirmation policy is satisfied.

Explain that public deposits can expose public-side transaction details.

## 4. Private-to-private payment

1. Select Send.
2. Enter recipient or select supported request.
3. Validate recipient receiving route.
4. Select SOL or USDC.
5. Enter amount with decimal-safe validation.
6. Read private balance and public SOL fee reserve as required.
7. Review recipient, amount, asset, fees and privacy implications.
8. User authorizes signing.
9. Proof is generated/obtained through documented Helius flow.
10. Submit transaction.
11. Track chain confirmation.
12. Reconcile sender/recipient private state where authorized and available.
13. Update application status.
14. Show receipt/reference.

No success before confirmed execution. Retry must not create a duplicate payment.

## 5. Receive payment

1. Recipient creates fixed-amount or open request.
2. Application creates opaque request ID.
3. QR/link shows only safe request information.
4. Payer opens link.
5. Payer connects/creates wallet if needed.
6. App determines whether payment credits intended private balance or follows an explicitly disclosed public route.
7. Payer reviews and signs.
8. Transaction confirms.
9. Request transitions to paid.
10. Recipient sees updated activity/balance and receipt.

Payment link is not itself a confidential transaction. Verify exact SDK behavior for embedded onboarding and ordinary public destinations.

## 6. Withdraw to public balance

1. Select Withdraw.
2. Select asset and public destination.
3. Enter amount.
4. Explain that this leaves private balance and public-side details may be visible.
5. Validate address, amount, balance and fee.
6. Review and sign.
7. Submit and confirm.
8. Reconcile private balance and public destination status.
9. Show receipt/reference.

## 7. Payment request lifecycle

States: pending, paid, expired, cancelled.

Rules:
- Fixed request amount/asset is immutable after creation unless cancelled/replaced.
- Open request allows payer-entered amount within validated bounds.
- IDs are opaque and unguessable.
- Expiry is checked server-side.
- Paid request cannot be paid again.
- Cancellation is authenticated to recipient.
- Concurrency is resolved with transactional/idempotent payment association.

## 8. Failure and recovery

Design explicit behavior for wallet rejection, wrong network, wallet disconnect, privacy not initialized, insufficient private balance, insufficient public SOL, unsupported recipient route, proof error, RPC timeout, submitted/unconfirmed, chain failure, browser closes after confirmation, private history delay, duplicate retry, expired/cancelled/already-paid request, and embedded wallet recovery.

## 9. Status language

- Created: “Preparing your payment.”
- Awaiting signature: “Approve the transaction in your wallet.”
- Submitted: “Your payment was submitted.”
- Pending: “Waiting for network confirmation.”
- Confirmed: “Transmission complete.”
- Reconciliation delayed: “The transaction is confirmed. Updating your private activity.”
- Rejected: “You cancelled the transaction.”
- Failed: “The transaction did not complete. No payment confirmation was recorded.”

Use only when it matches actual state.
