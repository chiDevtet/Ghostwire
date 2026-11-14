"use client";

import { useEffect, useId, useRef } from "react";
import { isInFlight, type FlowMode, type FlowState } from "@/modules/wallet-connect";
import { Address } from "@/ui/address";
import { Button } from "@/ui/button";
import { networkLabel } from "@/ui/network-indicator";
import { Spinner } from "@/ui/spinner";
import { ACTION_LABELS, flowCopy, type FlowAction } from "./connect-wallet-copy";
import { useCountdown } from "./use-countdown";

/**
 * The modal's polite status region: the §5.2 copy (a spinner while in flight, a role="alert"
 * paragraph for failures), the signing preview, and the action button. The 429 retry stays
 * disabled until the countdown reaches 0. Focus never falls out of the dialog: when an attempt
 * starts (the wallet list hides) the region itself takes focus, and a newly shown action button
 * takes focus.
 */
export function FlowStatus({
  state,
  mode,
  walletName,
  onAction,
}: {
  readonly state: FlowState;
  readonly mode: FlowMode;
  readonly walletName: string;
  readonly onAction: (action: FlowAction) => void;
}) {
  const secondsLeft = useCountdown(state.status === "rate-limited" ? state.retryAt : null);
  const copy = flowCopy(state, { mode, walletName, secondsLeft });
  const messageId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const action = copy?.action ?? null;
  const inFlight = isInFlight(state);

  useEffect(() => {
    if (inFlight) regionRef.current?.focus();
  }, [inFlight, state.attemptId]);

  useEffect(() => {
    if (action !== null) actionRef.current?.focus();
  }, [action, state.attemptId]);

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-control"
    >
      {copy !== null &&
        (copy.tone === "error" ? (
          <p role="alert" id={messageId} className="text-sm text-error">
            {copy.message}
          </p>
        ) : inFlight ? (
          <Spinner label={copy.message} />
        ) : (
          <p id={messageId} className="text-sm text-success">
            {copy.message}
          </p>
        ))}
      {state.status === "awaiting-signature" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-control border border-border p-3 text-sm">
          <dt className="text-muted">Domain</dt>
          <dd>{state.preview.domain}</dd>
          <dt className="text-muted">Account</dt>
          <dd>
            <Address value={state.preview.address} />
          </dd>
          <dt className="text-muted">Network</dt>
          <dd>{networkLabel(state.preview.network)}</dd>
        </dl>
      )}
      {action !== null && (
        <Button
          ref={actionRef}
          variant={action === "close" ? "primary" : "secondary"}
          disabled={state.status === "rate-limited" && secondsLeft > 0}
          aria-describedby={messageId}
          onClick={() => onAction(action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      )}
    </div>
  );
}
