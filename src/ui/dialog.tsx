"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./button";

export interface DialogProps {
  readonly open: boolean;
  /** Escape, the Close button, and the native cancel/close events. */
  readonly onClose: () => void;
  /** Rendered as an <h2> wired through aria-labelledby. */
  readonly title: string;
  /** A <p> wired through aria-describedby. */
  readonly description?: string;
  readonly children: ReactNode;
  /** Default "Close". */
  readonly closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Native <dialog> opened with showModal(). The component owns focus, Escape and the Tab trap, so
 * it behaves the same in browsers and in happy-dom (whose showModal() only sets `open`):
 * opening focuses [data-autofocus] or the first focusable element; Tab and Shift+Tab wrap;
 * Escape calls onClose; closing (or unmounting while open) returns focus to the element that was
 * focused when it opened.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  closeLabel = "Close",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || dialog === null) return;
    const active = document.activeElement;
    const returnTo = active instanceof HTMLElement ? active : null;
    if (!dialog.open) dialog.showModal();
    const target = dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(dialog)[0];
    target?.focus();
    // Runs when open turns false and when the dialog unmounts while open.
    return () => {
      if (dialog.open) dialog.close();
      returnTo?.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(event.currentTarget);
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser closed it on its own (for example a close watcher): keep state in sync.
        if (open) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-card border border-border bg-surface p-0 text-text backdrop:bg-obsidian/80"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-semibold">
            {title}
          </h2>
          <Button variant="ghost" className="px-3" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
            {closeLabel}
          </Button>
        </div>
        {description !== undefined && (
          <p id={descriptionId} className="text-sm text-muted">
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
