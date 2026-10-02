import { useState, type DragEvent } from "react";
import { basename, dirname } from "../lib/paths";
import { ArchiveIcon, CloseIcon, CompressIcon, OpenIcon } from "../theme/icons";
import { EntryIcon } from "./EntryIcon";

const READS = [
  "7z",
  "ZIP",
  "RAR",
  "TAR",
  "GZ",
  "XZ",
  "BZ2",
  "ZST",
  "ISO",
  "CAB",
  "WIM",
  "DMG",
  "DEB",
  "RPM",
];

/**
 * The start page: drop an archive to open it (or files to pack them), open one, start a new one,
 * or pick up a recent archive.
 */
export function Home({
  recent,
  sevenZip,
  onOpenArchive,
  onPickArchive,
  onNewArchive,
  onDropPaths,
  onForget,
}: {
  recent: string[];
  sevenZip: string;
  onOpenArchive: (path: string) => void;
  onPickArchive: () => void;
  onNewArchive: () => void;
  onDropPaths: (paths: File[]) => void;
  onForget: (path: string) => void;
}) {
  const [over, setOver] = useState(false);

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onDropPaths(files);
  }

  return (
    <main className="relative z-[1] flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <section className="mz-glass flex flex-col items-center gap-5 px-8 pt-9 pb-8 text-center">
          <img src="./moon-zip-logo.svg" alt="" width={84} height={84} draggable={false} />
          <div>
            <h1 className="mz-title text-4xl font-semibold tracking-tight">Moon Zip</h1>
            <p className="mt-1.5 text-[0.9375rem] text-(--mz-text-muted)">
              Your archives, calmly under the moon.
            </p>
          </div>

          <div
            className="mz-drop flex w-full flex-col items-center gap-3 px-6 py-8"
            data-active={over}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            <span className="text-(--mz-accent)">
              <ArchiveIcon size={30} />
            </span>
            <p className="text-[0.9375rem] font-medium">Drop an archive here to open it</p>
            <p className="text-[0.8125rem] text-(--mz-text-muted)">
              or drop files and folders to pack them into a new one
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" className="mz-btn mz-btn-primary" onClick={onPickArchive}>
                <OpenIcon size={15} /> Open archive…
              </button>
              <button type="button" className="mz-btn mz-btn-ghost" onClick={onNewArchive}>
                <CompressIcon size={15} /> New archive…
              </button>
            </div>
          </div>

          <div
            className="flex flex-wrap justify-center gap-1.5"
            aria-label="Formats Moon Zip opens"
          >
            {READS.map((f) => (
              <span key={f} className="mz-chip mz-chip-muted">
                {f}
              </span>
            ))}
            <span className="mz-chip">+ 40 more</span>
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mz-glass p-4" aria-labelledby="mz-recent">
            <h2 id="mz-recent" className="mz-eyebrow mb-2 px-2">
              Recent archives
            </h2>
            <ul className="flex flex-col">
              {recent.map((p) => (
                <li key={p} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className="mz-menu-item min-w-0 flex-1"
                    title={p}
                    onClick={() => onOpenArchive(p)}
                  >
                    <EntryIcon name={basename(p)} isDir={false} />
                    <span className="max-w-[55%] shrink-0 truncate">{basename(p)}</span>
                    <span className="ml-auto min-w-0 truncate pl-4 text-xs text-(--mz-text-faint)">
                      {dirname(p)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mz-icon-btn h-7 w-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                    aria-label={`Remove ${basename(p)} from the recent list`}
                    onClick={() => onForget(p)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-(--mz-text-faint)">
          {sevenZip ? `7-Zip ${sevenZip} inside` : "7-Zip inside"} · right-click files in Windows
          Explorer for “Compress with Moon Zip”
        </p>
      </div>
    </main>
  );
}
