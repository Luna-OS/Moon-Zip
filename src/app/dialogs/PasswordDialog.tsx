import { useId, useState } from "react";
import { LockIcon } from "../../theme/icons";
import { Dialog, PasswordField } from "./Dialog";

/** Asks for an archive's password; `wrong` shows that the last one didn't fit. */
export function PasswordDialog({
  archiveName,
  wrong,
  onSubmit,
  onCancel,
}: {
  archiveName: string;
  wrong: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const hint = useId();
  return (
    <Dialog
      eyebrow="Password"
      title={`Unlock ${archiveName}`}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <button type="button" className="mz-btn mz-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            form="mz-password"
            className="mz-btn mz-btn-primary"
            disabled={!password}
          >
            <LockIcon size={14} /> Unlock
          </button>
        </>
      }
    >
      <form
        id="mz-password"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onSubmit(password);
        }}
      >
        <p className="text-[0.8125rem] text-(--mz-text-muted)">
          This archive is protected. Enter its password to go on.
        </p>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          initialFocus
          invalid={wrong}
          describedBy={wrong ? hint : undefined}
        />
        {wrong && (
          <p id={hint} role="alert" className="text-[0.8125rem] text-(--mz-danger)">
            That password is wrong. Try again.
          </p>
        )}
      </form>
    </Dialog>
  );
}
