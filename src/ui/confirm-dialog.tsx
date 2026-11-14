"use client";

import { Button } from "./button";
import { Dialog } from "./dialog";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** Default "Cancel". */
  readonly cancelLabel?: string;
  /** Default "danger". */
  readonly tone?: "danger" | "primary";
  /** Puts the confirm Button in its loading state. */
  readonly pending?: boolean;
  /** Shown inside the dialog as a role="alert" paragraph. */
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** A Dialog with Cancel (initial focus) and a confirm button. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={body}>
      {error !== null && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" data-autofocus onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone} loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
