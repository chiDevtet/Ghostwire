"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeSession, type SessionItem } from "@/modules/wallet-connect";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DateTime, formatUtc } from "@/ui/date-time";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { panelErrorCopy } from "./panel-copy";
import { useFreshNavigation } from "./use-fresh-navigation";

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
  const router = useRouter();
  const navigate = useFreshNavigation();
  const toast = useToast();
  const [target, setTarget] = useState<SessionItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeConfirm = (): void => {
    setTarget(null);
    setPending(false);
    setError(null);
  };

  const confirmRevoke = async (): Promise<void> => {
    if (target === null) return;
    setPending(true);
    setError(null);
    const result = await revokeSession(target.id);
    if (result.ok) {
      closeConfirm();
      if (target.current) {
        toast.show({ message: "This device was signed out." });
        navigate("/");
      } else {
        toast.show({ message: "Session revoked.", tone: "success" });
        router.refresh();
      }
      return;
    }
    if (result.code === "NOT_FOUND") {
      closeConfirm();
      router.refresh();
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      closeConfirm();
      return;
    }
    setPending(false);
    setError(panelErrorCopy(result));
  };

  const copy = target?.current === true ? CURRENT_COPY : OTHER_COPY;

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
              <Button variant="secondary" onClick={() => setTarget(session)}>
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
        onConfirm={() => void confirmRevoke()}
        onCancel={closeConfirm}
      />
    </section>
  );
}
