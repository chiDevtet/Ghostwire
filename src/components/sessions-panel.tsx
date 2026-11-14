"use client";

import { revokeSession, type SessionItem } from "@/modules/wallet-connect";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DateTime, formatUtc } from "@/ui/date-time";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useConfirmAction } from "./use-confirm-action";

const OTHER_COPY = {
  title: "Revoke this session?",
  body: "That device will be signed out of GHOST WIRE.",
  confirmLabel: "Revoke",
} as const;
const CURRENT_COPY = {
  title: "Sign out this device?",
  body: "You'll be signed out and returned to the start page.",
  confirmLabel: "Sign out",
} as const;

/** /settings/sessions: active sessions, "This device" marker, revoke with confirmation. */
export function SessionsPanel({ sessions }: { readonly sessions: readonly SessionItem[] }) {
  const { target, lastTarget, pending, error, open, close, confirm } =
    useConfirmAction<SessionItem>({
      run: revokeSession,
      onSuccess: (session) =>
        session.current
          ? { message: "This device was signed out.", signedOut: true }
          : { message: "Session revoked.", tone: "success" },
    });

  // Keep the last target's copy while the dialog closes so the title doesn't flip.
  const copy = lastTarget?.current === true ? CURRENT_COPY : OTHER_COPY;

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
      <h2 id="sessions-heading" className="font-heading text-xl font-semibold">
        Active sessions
      </h2>
      <ul className="flex flex-col gap-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            {session.current && (
              <div>
                <Badge tone="violet">This device</Badge>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Network</dt>
              <dd>
                <NetworkIndicator network={session.network} />
              </dd>
              <dt className="text-muted">Device</dt>
              <dd className="min-w-0 truncate" title={session.userAgent ?? undefined}>
                {session.userAgent ?? "Unknown device"}
              </dd>
              <dt className="text-muted">Last seen</dt>
              <dd>
                <DateTime iso={session.lastSeenAt} />
              </dd>
              <dt className="text-muted">Expires</dt>
              <dd>
                <DateTime iso={session.expiresAt} />
              </dd>
            </dl>
            <div>
              <Button variant="secondary" onClick={() => open(session)}>
                {session.current ? (
                  "Sign out this device"
                ) : (
                  <>
                    Revoke
                    <span className="sr-only">
                      {" "}
                      session last seen {formatUtc(session.lastSeenAt)}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title={copy.title}
        body={copy.body}
        confirmLabel={copy.confirmLabel}
        pending={pending}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={close}
      />
    </section>
  );
}
