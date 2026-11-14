"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { ApiFailure } from "@/modules/wallet-connect";
import { useToast } from "@/ui/toast";
import { panelErrorCopy } from "./panel-copy";
import { useFreshNavigation } from "./use-fresh-navigation";

export interface ConfirmSuccess {
  readonly message: string;
  readonly tone?: "success";
  /** The action ended this session: navigate to the start page instead of refreshing. */
  readonly signedOut?: boolean;
}

export interface UseConfirmActionOptions<T extends { readonly id: string }> {
  readonly run: (id: string) => Promise<{ readonly ok: true } | ApiFailure>;
  readonly onSuccess: (target: T) => ConfirmSuccess;
}

export interface ConfirmAction<T> {
  /** The item awaiting confirmation; null while the dialog is closed. */
  readonly target: T | null;
  /** The most recent target, kept while the dialog closes so its copy doesn't flip. */
  readonly lastTarget: T | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly open: (target: T) => void;
  readonly close: () => void;
  readonly confirm: () => Promise<void>;
}

/**
 * The confirm → request → toast/refresh flow shared by the wallets and sessions panels.
 * Each attempt gets a token; open, close and newer attempts invalidate it, so a result
 * arriving after Cancel (the dialog stays dismissible while pending) changes no state.
 * A success after Cancel still toasts and refreshes, because the DELETE did happen.
 */
export function useConfirmAction<T extends { readonly id: string }>({
  run,
  onSuccess,
}: UseConfirmActionOptions<T>): ConfirmAction<T> {
  const router = useRouter();
  const navigate = useFreshNavigation();
  const toast = useToast();
  const [target, setTarget] = useState<T | null>(null);
  const [lastTarget, setLastTarget] = useState<T | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);

  const reset = useCallback((): void => {
    attempt.current += 1;
    setTarget(null);
    setPending(false);
    setError(null);
  }, []);

  const open = useCallback((next: T): void => {
    attempt.current += 1;
    setTarget(next);
    setLastTarget(next);
    setPending(false);
    setError(null);
  }, []);

  const confirm = async (): Promise<void> => {
    if (target === null) return;
    const token = ++attempt.current;
    const current = (): boolean => attempt.current === token;
    setPending(true);
    setError(null);
    const result = await run(target.id);
    if (result.ok) {
      if (current()) reset();
      const { message, tone, signedOut } = onSuccess(target);
      toast.show(tone === undefined ? { message } : { message, tone });
      if (signedOut === true) navigate("/");
      else router.refresh();
      return;
    }
    if (!current()) return;
    if (result.code === "NOT_FOUND") {
      reset();
      router.refresh();
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      // SessionExpiredHandler shows the toast and navigates.
      reset();
      return;
    }
    setPending(false);
    setError(panelErrorCopy(result));
  };

  return { target, lastTarget, pending, error, open, close: reset, confirm };
}
