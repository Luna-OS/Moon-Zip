import { useEffect, useRef } from "react";
import type { Toast } from "./useToasts";
import { AlertIcon, CheckIcon, CloseIcon } from "../theme/icons";

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-12 z-40 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (toast.tone === "error") return;
    timer.current = window.setTimeout(() => onDismiss(toast.id), 6000);
    return () => window.clearTimeout(timer.current);
  }, [toast, onDismiss]);
  const color = {
    success: "var(--mz-success)",
    error: "var(--mz-danger)",
    info: "var(--mz-accent)",
  }[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="mz-popover pointer-events-auto flex items-start gap-3 p-3"
    >
      <span className="mt-0.5" style={{ color }}>
        {toast.tone === "error" ? <AlertIcon /> : <CheckIcon />}
      </span>
      <p className="min-w-0 flex-1 text-[0.8125rem] break-words whitespace-pre-line">
        {toast.text}
      </p>
      {toast.action && (
        <button
          type="button"
          className="mz-btn mz-btn-sm mz-btn-ghost"
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="mz-icon-btn h-6 w-6"
        aria-label="Close message"
        onClick={() => onDismiss(toast.id)}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
