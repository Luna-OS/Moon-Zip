import type { ReactNode } from "react";
import { Dialog } from "./Dialog";

export function ConfirmDialog({
  eyebrow,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      eyebrow={eyebrow}
      title={title}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <button type="button" className="mz-btn mz-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            className={`mz-btn ${danger ? "mz-btn-danger" : "mz-btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[0.8125rem] text-(--mz-text-muted)">{children}</div>
    </Dialog>
  );
}
