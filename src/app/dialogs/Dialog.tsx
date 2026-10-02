import { useId, useState, type ReactNode } from "react";
import { Modal } from "../../ui/Modal";
import { CloseIcon } from "../../theme/icons";

/** The frame every Moon Zip dialog shares: eyebrow, title, close button, body and button row. */
export function Dialog({
  eyebrow,
  title,
  onClose,
  footer,
  width = "max-w-lg",
  children,
}: {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Modal
      labelledBy={`${id}-title`}
      onClose={onClose}
      className={`${width} flex max-h-[90vh] flex-col`}
    >
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="mz-eyebrow">{eyebrow}</p>}
          <h2 id={`${id}-title`} className="truncate text-lg font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        <button type="button" className="mz-icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-(--mz-border) px-5 py-3">
          {footer}
        </div>
      )}
    </Modal>
  );
}

/** A labelled row of radio cards (format, overwrite mode, theme). */
export function OptionGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <span className="mz-label">{label}</span>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={o.disabled}
            className="mz-option disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onChange(o.value)}
          >
            <span className="mz-option-title">{o.title}</span>
            {o.hint && <span className="mz-option-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A password field with a show/hide button. */
export function PasswordField({
  label,
  value,
  onChange,
  initialFocus,
  invalid,
  describedBy,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  initialFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label className="mz-label" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="mz-input w-full"
          type={shown ? "text" : "password"}
          value={value}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          data-autofocus={initialFocus || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="mz-btn mz-btn-ghost w-20 shrink-0"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
