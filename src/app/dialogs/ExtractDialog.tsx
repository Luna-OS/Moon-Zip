import { useEffect, useId, useState } from "react";
import { dirname } from "../../lib/paths";
import type { OverwriteMode } from "../../lib/types";
import { ExtractIcon } from "../../theme/icons";
import { useBridge } from "../context";
import { Dialog, OptionGroup, PasswordField } from "./Dialog";

export interface ExtractChoice {
  destDir: string;
  overwrite: OverwriteMode;
  password?: string;
  openAfter: boolean;
}

/**
 * "Extract to…": the destination (a new folder named after the archive by default, or next to it),
 * what to do with files that exist already, and the password when one is needed and not known yet.
 */
export function ExtractDialog({
  archive,
  what,
  askPassword,
  startNextToArchive = false,
  onSubmit,
  onCancel,
}: {
  archive: string;
  /** Start with the archive's own folder instead of a new one (several archives at once). */
  startNextToArchive?: boolean;
  /** "everything" or e.g. "3 selected items". */
  what: string;
  askPassword: boolean;
  onSubmit: (choice: ExtractChoice) => void;
  onCancel: () => void;
}) {
  const bridge = useBridge();
  const ids = useId();
  const [destDir, setDestDir] = useState("");
  const [ownFolder, setOwnFolder] = useState("");
  const [overwrite, setOverwrite] = useState<OverwriteMode>("rename");
  const [password, setPassword] = useState("");
  const [openAfter, setOpenAfter] = useState(true);
  const next = dirname(archive);

  useEffect(() => {
    let live = true;
    void bridge.folderFor(archive).then((f) => {
      if (!live) return;
      setOwnFolder(f);
      setDestDir((d) => d || (startNextToArchive ? dirname(archive) : f));
    });
    return () => {
      live = false;
    };
  }, [bridge, archive, startNextToArchive]);

  const canSubmit = destDir.trim() !== "" && (!askPassword || password !== "");
  return (
    <Dialog
      eyebrow="Extract"
      title={`Extract ${what}`}
      onClose={onCancel}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className="mz-btn mz-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            form={`${ids}-form`}
            className="mz-btn mz-btn-primary"
            disabled={!canSubmit}
            data-autofocus={!askPassword || undefined}
          >
            <ExtractIcon size={15} /> Extract
          </button>
        </>
      }
    >
      <form
        id={`${ids}-form`}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit)
            onSubmit({
              destDir: destDir.trim(),
              overwrite,
              password: password || undefined,
              openAfter,
            });
        }}
      >
        <div>
          <label className="mz-label" htmlFor={`${ids}-dest`}>
            Extract to
          </label>
          <div className="flex gap-2">
            <input
              id={`${ids}-dest`}
              className="mz-input w-full"
              value={destDir}
              spellCheck={false}
              onChange={(e) => setDestDir(e.target.value)}
            />
            <button
              type="button"
              className="mz-btn mz-btn-ghost shrink-0"
              onClick={() => {
                void bridge.pickFolder(destDir || next).then((p) => p && setDestDir(p));
              }}
            >
              Browse…
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ownFolder && (
              <button
                type="button"
                className={`mz-chip cursor-pointer ${destDir === ownFolder ? "" : "mz-chip-muted"}`}
                aria-pressed={destDir === ownFolder}
                onClick={() => setDestDir(ownFolder)}
              >
                New folder
              </button>
            )}
            {next && (
              <button
                type="button"
                className={`mz-chip cursor-pointer ${destDir === next ? "" : "mz-chip-muted"}`}
                aria-pressed={destDir === next}
                onClick={() => setDestDir(next)}
              >
                Next to the archive
              </button>
            )}
          </div>
        </div>

        <OptionGroup
          label="When a file exists already"
          value={overwrite}
          onChange={setOverwrite}
          options={[
            { value: "rename", title: "Keep both", hint: "Adds (2) to the new one" },
            { value: "overwrite", title: "Replace", hint: "The archive's copy wins" },
            { value: "skip", title: "Skip", hint: "Keeps what is there" },
          ]}
        />

        {askPassword && (
          <PasswordField label="Password" value={password} onChange={setPassword} initialFocus />
        )}

        <label className="flex items-center gap-2 text-[0.8125rem]">
          <input
            type="checkbox"
            className="mz-checkbox"
            checked={openAfter}
            onChange={(e) => setOpenAfter(e.target.checked)}
          />
          Show the files when they're out
        </label>
      </form>
    </Dialog>
  );
}
