import { MoonPhase } from "../theme/MoonPhase";
import type { Progress } from "../lib/types";

/**
 * A running job: the moon fills up as 7-Zip works, with the percentage, the file it is on and a
 * Cancel button. Used in the archive window's overlay and in the task windows.
 */
export function ProgressCard({
  title,
  progress,
  onCancel,
}: {
  title: string;
  progress: Progress;
  onCancel?: () => void;
}) {
  const percent = Math.round(progress.percent);
  return (
    <div className="flex items-center gap-5" aria-live="polite">
      <MoonPhase fraction={percent / 100} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate text-[0.9375rem] font-semibold">{title}</h2>
          <span className="text-sm font-semibold text-(--mz-accent) tabular-nums">{percent}%</span>
        </div>
        <div
          className="mz-meter mt-2"
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%`, transition: "width 200ms" }} />
        </div>
        <p className="mt-2 truncate text-xs text-(--mz-text-muted)" title={progress.current}>
          {progress.current || "Starting…"}
        </p>
      </div>
      {onCancel && (
        <button type="button" className="mz-btn mz-btn-ghost self-start" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
