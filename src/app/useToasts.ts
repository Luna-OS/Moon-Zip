import { useCallback, useState } from "react";

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
  action?: { label: string; run: () => void };
}

let seq = 0;

/** Short messages in the bottom-right corner ("Extracted to …"); errors stay until closed. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    return id;
  }, []);
  return { toasts, push, dismiss };
}
