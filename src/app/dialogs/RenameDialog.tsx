import { useId, useState } from "react";
import { nameProblem } from "../../lib/names";
import { Dialog } from "./Dialog";

export function RenameDialog({
  name,
  taken,
  onSubmit,
  onCancel,
}: {
  name: string;
  /** Names of the other items in the same folder. */
  taken: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  const id = useId();
  const problem = value === name ? null : nameProblem(value, taken);
  return (
    <Dialog
      eyebrow="Rename"
      title={`Rename ${name}`}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <button type="button" className="mz-btn mz-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            form="mz-rename"
            className="mz-btn mz-btn-primary"
            disabled={!!problem || value.trim() === name}
          >
            Rename
          </button>
        </>
      }
    >
      <form
        id="mz-rename"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem && value.trim() !== name) onSubmit(value.trim());
        }}
      >
        <label className="mz-label" htmlFor={id}>
          New name
        </label>
        <input
          id={id}
          className="mz-input w-full"
          value={value}
          data-autofocus
          spellCheck={false}
          aria-invalid={!!problem || undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            const dot = name.lastIndexOf(".");
            e.target.setSelectionRange(0, dot > 0 ? dot : name.length);
          }}
        />
        {problem && (
          <p id={`${id}-problem`} className="mt-2 text-[0.8125rem] text-(--mz-danger)">
            {problem}
          </p>
        )}
      </form>
    </Dialog>
  );
}
