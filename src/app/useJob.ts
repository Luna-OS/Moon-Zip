import { useCallback, useEffect, useRef, useState } from "react";
import type { Progress } from "../lib/types";
import { useBridge } from "./context";

let seq = 0;
const newId = () => `job-${Date.now().toString(36)}-${++seq}`;

export interface JobState {
  /** What the progress card says, e.g. "Extracting Moon photos.7z". */
  title: string;
  progress: Progress;
}

/**
 * Runs bridge jobs (extract, compress, …) one at a time and follows their progress events.
 * `run(title, (id) => bridge.extract(id, …))` resolves with the job's result; `cancel()` stops it.
 */
export function useJob() {
  const bridge = useBridge();
  const [job, setJob] = useState<JobState | null>(null);
  const current = useRef<string | null>(null);

  useEffect(
    () =>
      bridge.on("job:progress", (p) => {
        if (p.id !== current.current) return;
        setJob((j) =>
          j ? { ...j, progress: { percent: p.percent, files: p.files, current: p.current } } : j,
        );
      }),
    [bridge],
  );

  const run = useCallback(async <T>(title: string, fn: (id: string) => Promise<T>): Promise<T> => {
    const id = newId();
    current.current = id;
    setJob({ title, progress: { percent: 0, files: null, current: "" } });
    try {
      return await fn(id);
    } finally {
      if (current.current === id) {
        current.current = null;
        setJob(null);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    if (current.current) void bridge.cancel(current.current);
  }, [bridge]);

  return { job, run, cancel };
}
