import { useEffect, useId, useState } from "react";
import {
  CREATE_FORMATS,
  LEVELS,
  VOLUME_PRESETS,
  formatById,
  withFormatExtension,
} from "../../lib/formats";
import { formatBytes, plural } from "../../lib/format";
import { basename } from "../../lib/paths";
import type { CreateFormat, CreateOptions, LocalItem } from "../../lib/types";
import { CompressIcon } from "../../theme/icons";
import { useBridge } from "../context";
import { EntryIcon } from "../EntryIcon";
import { Dialog, OptionGroup, PasswordField } from "./Dialog";

export interface CompressRequest {
  archive: string;
  format: CreateFormat;
  options: CreateOptions;
  /** The path came from the Save dialog, which already asked about replacing an existing file. */
  replace?: boolean;
}

/**
 * "Add to archive…": where the new archive goes, its format, how hard to compress, a password and
 * splitting into volumes. 7z and ZIP get AES-256; 7z can hide the file names too.
 */
export function CompressDialog({
  sources,
  initialFormat = "7z",
  onSubmit,
  onCancel,
}: {
  sources: string[];
  initialFormat?: CreateFormat;
  onSubmit: (req: CompressRequest) => void;
  onCancel: () => void;
}) {
  const bridge = useBridge();
  const ids = useId();
  const [items, setItems] = useState<LocalItem[]>([]);
  const [archive, setArchive] = useState("");
  const [format, setFormat] = useState<CreateFormat>(initialFormat);
  const [level, setLevel] = useState(5);
  const [method, setMethod] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [encryptNames, setEncryptNames] = useState(true);
  const [zipEncryption, setZipEncryption] = useState<"AES256" | "ZipCrypto">("AES256");
  const [volumeSize, setVolumeSize] = useState("");
  const [confirmedPath, setConfirmedPath] = useState("");

  const info = formatById(format);
  useEffect(() => {
    let live = true;
    void bridge.stat(sources).then((s) => live && setItems(s));
    void bridge
      .suggestName(sources, formatById(initialFormat).ext)
      .then((p) => live && setArchive((a) => a || p));
    return () => {
      live = false;
    };
  }, [bridge, sources, initialFormat]);

  function chooseFormat(f: CreateFormat) {
    setFormat(f);
    setMethod("");
    if (archive) setArchive(withFormatExtension(archive, f));
  }

  const passwordsDiffer = info.password && password !== "" && password !== confirm;
  const canSubmit = archive.trim() !== "" && !passwordsDiffer;
  const total = items.reduce((n, i) => n + i.size, 0);

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      archive: archive.trim(),
      replace: archive.trim() === confirmedPath,
      format,
      options: {
        level: info.levels ? level : 0,
        method: method || undefined,
        password: info.password && password ? password : undefined,
        encryptNames: info.encryptNames && password ? encryptNames : false,
        zipEncryption,
        volumeSize: info.volumes ? volumeSize : "",
      },
    });
  }

  return (
    <Dialog
      eyebrow="New archive"
      title={
        sources.length === 1
          ? `Compress ${basename(sources[0])}`
          : `Compress ${plural(sources.length, "item")}`
      }
      onClose={onCancel}
      width="max-w-2xl"
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
            data-autofocus
          >
            <CompressIcon size={15} /> Compress
          </button>
        </>
      }
    >
      <form
        id={`${ids}-form`}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mz-inset flex max-h-28 flex-col gap-1 overflow-y-auto p-2.5 text-[0.8125rem]">
          {items.map((i) => (
            <div key={i.path} className="flex items-center gap-2">
              <EntryIcon name={i.name} isDir={i.isDir} />
              <span className="min-w-0 flex-1 truncate" title={i.path}>
                {i.name}
              </span>
              <span className="text-(--mz-text-muted) tabular-nums">
                {i.isDir ? "Folder" : formatBytes(i.size)}
              </span>
            </div>
          ))}
          {items.length > 1 && !items.some((i) => i.isDir) && (
            <div className="text-right text-xs text-(--mz-text-faint)">
              Together {formatBytes(total)}
            </div>
          )}
        </div>

        <div>
          <label className="mz-label" htmlFor={`${ids}-archive`}>
            Save as
          </label>
          <div className="flex gap-2">
            <input
              id={`${ids}-archive`}
              className="mz-input w-full"
              value={archive}
              spellCheck={false}
              onChange={(e) => setArchive(e.target.value)}
            />
            <button
              type="button"
              className="mz-btn mz-btn-ghost shrink-0"
              onClick={() => {
                void bridge.pickSaveArchive(archive).then((p) => {
                  if (!p) return;
                  // Only the exact path the Save dialog confirmed may replace a file.
                  setArchive(withFormatExtension(p, format));
                  setConfirmedPath(p);
                });
              }}
            >
              Browse…
            </button>
          </div>
        </div>

        <OptionGroup
          label="Format"
          value={format}
          onChange={chooseFormat}
          options={CREATE_FORMATS.map((f) => ({ value: f.id, title: f.label, hint: f.hint }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mz-label" htmlFor={`${ids}-level`}>
              Compression
            </label>
            <select
              id={`${ids}-level`}
              className="mz-input w-full"
              value={info.levels ? level : 0}
              disabled={!info.levels}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                  {l.hint ? ` – ${l.hint}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mz-label" htmlFor={`${ids}-method`}>
              Method
            </label>
            <select
              id={`${ids}-method`}
              className="mz-input w-full"
              value={method}
              disabled={info.methods.length === 0 || level === 0}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">
                {info.methods[0] ? `${info.methods[0]} (default)` : "Default"}
              </option>
              {info.methods.slice(1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mz-label" htmlFor={`${ids}-volumes`}>
              Split into
            </label>
            <select
              id={`${ids}-volumes`}
              className="mz-input w-full"
              value={info.volumes ? volumeSize : ""}
              disabled={!info.volumes}
              onChange={(e) => setVolumeSize(e.target.value)}
            >
              {VOLUME_PRESETS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          {format === "zip" && (
            <div>
              <label className="mz-label" htmlFor={`${ids}-zipenc`}>
                ZIP encryption
              </label>
              <select
                id={`${ids}-zipenc`}
                className="mz-input w-full"
                value={zipEncryption}
                onChange={(e) =>
                  setZipEncryption(e.target.value === "ZipCrypto" ? "ZipCrypto" : "AES256")
                }
              >
                <option value="AES256">AES-256 (safe)</option>
                <option value="ZipCrypto">ZipCrypto (opens in Windows Explorer, weak)</option>
              </select>
            </div>
          )}
        </div>

        <fieldset className="mz-inset flex flex-col gap-3 p-3" disabled={!info.password}>
          <legend className="sr-only">Password</legend>
          {!info.password && (
            <p className="text-[0.8125rem] text-(--mz-text-muted)">
              {info.label} archives can't have a password. Choose 7z or ZIP for one.
            </p>
          )}
          {info.password && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <PasswordField
                  label="Password (optional)"
                  value={password}
                  onChange={setPassword}
                />
                <PasswordField
                  label="Repeat it"
                  value={confirm}
                  onChange={setConfirm}
                  invalid={!!passwordsDiffer}
                  describedBy={passwordsDiffer ? `${ids}-differ` : undefined}
                />
              </div>
              {passwordsDiffer && (
                <p id={`${ids}-differ`} className="text-[0.8125rem] text-(--mz-danger)">
                  The two passwords aren't the same.
                </p>
              )}
              {info.encryptNames && (
                <label className="flex items-center gap-2 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    className="mz-checkbox"
                    checked={encryptNames}
                    disabled={!password}
                    onChange={(e) => setEncryptNames(e.target.checked)}
                  />
                  Hide the file names too (the archive only opens with the password)
                </label>
              )}
            </>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
