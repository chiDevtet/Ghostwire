"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./button";
import { cn } from "./cn";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  readonly message: string;
  /** Default "info". */
  readonly tone?: ToastTone;
}

interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

interface ToastApi {
  show(input: ToastInput): void;
  dismiss(id: number): void;
}

const AUTO_DISMISS_MS = 6000;
const ToastContext = createContext<ToastApi | null>(null);

const TONE_BORDER: Readonly<Record<ToastTone, string>> = {
  info: "border-border",
  success: "border-success",
  error: "border-error",
};

/**
 * Renders two always-present live regions (they exist before any content is inserted): a polite
 * role="status" for info/success and a role="alert" for errors. Each toast has a Dismiss button
 * and auto-dismisses after 6000 ms. Mounted once in the root layout so toasts survive navigation.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ message, tone = "info" }: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const render = (toast: ToastItem) => (
    <div
      key={toast.id}
      className={cn(
        "pointer-events-auto flex items-center justify-between gap-3 rounded-control border bg-elevated px-4 py-2 text-sm text-text shadow-lg",
        TONE_BORDER[toast.tone],
      )}
    >
      <span>{toast.message}</span>
      <Button variant="ghost" className="px-3 text-xs" onClick={() => dismiss(toast.id)}>
        Dismiss
      </Button>
    </div>
  );

  return (
    <ToastContext value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.filter((toast) => toast.tone !== "error").map(render)}
        </div>
        <div role="alert" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.filter((toast) => toast.tone === "error").map(render)}
        </div>
      </div>
    </ToastContext>
  );
}

/** show/dismiss from the nearest ToastProvider. Throws outside one (a wiring bug). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside ToastProvider");
  return api;
}
