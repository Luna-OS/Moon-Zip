import { formatBytes, formatDate, formatPercent, plural, savedFraction } from "../../lib/format";
import { basename } from "../../lib/paths";
import type { ArchiveEntry, Listing } from "../../lib/types";
import { MoonPhase } from "../../theme/MoonPhase";
import { Dialog } from "./Dialog";

/** The archive's properties, as 7-Zip reports them, and its totals. */
export function InfoDialog({
  path,
  listing,
  totals,
  passwordProtected,
  onClose,
}: {
  path: string;
  listing: Listing;
  totals: { size: number; packed: number | null; files: number; folders: number };
  passwordProtected: boolean;
  onClose: () => void;
}) {
  const a = listing.archive;
  const packed = a.physicalSize ?? totals.packed;
  const saved = savedFraction(totals.size, packed);
  const newest = listing.entries.reduce<ArchiveEntry | null>(
    (m, e) => (e.mtime && (!m || (m.mtime ?? 0) < e.mtime) ? e : m),
    null,
  );
  const encrypted = passwordProtected || listing.entries.some((e) => e.encrypted);
  const rows: [string, string][] = [
    ["Location", path],
    ["Type", a.innerType ? `${a.type} → ${a.innerType}` : a.type || "Unknown"],
    ["Method", a.method || "—"],
    [
      "Solid",
      a.solid === null
        ? "—"
        : a.solid
          ? `Yes${a.blocks ? `, ${plural(a.blocks, "block")}` : ""}`
          : "No",
    ],
    ["Contents", `${plural(totals.files, "file")}, ${plural(totals.folders, "folder")}`],
    ["Original size", formatBytes(totals.size)],
    ["Archive size", formatBytes(packed)],
    ["Headers", a.headersSize === null ? "—" : formatBytes(a.headersSize)],
    ["Encrypted", encrypted ? (passwordProtected ? "Yes, names included" : "Yes") : "No"],
    ["Newest item", newest ? formatDate(newest.mtime) : "—"],
  ];
  if (a.volumes) rows.push(["Volumes", String(a.volumes)]);
  return (
    <Dialog eyebrow="Archive info" title={basename(path)} onClose={onClose} width="max-w-xl">
      <div className="mz-inset mb-4 flex items-center gap-4 p-4">
        <MoonPhase fraction={saved ?? 0} size={56} />
        <div>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatPercent(saved)}
          </p>
          <p className="text-xs text-(--mz-text-muted)">
            {saved === null
              ? "The archive doesn't say how much it saves."
              : "smaller than the original files"}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-[0.8125rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-(--mz-text-muted)">{k}</dt>
            <dd className="min-w-0 break-words tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {a.comment && (
        <>
          <h3 className="mz-eyebrow mt-4 mb-1">Comment</h3>
          <pre className="mz-inset max-h-40 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
            {a.comment}
          </pre>
        </>
      )}
      {a.warnings.length > 0 && (
        <p role="note" className="mt-4 text-[0.8125rem] whitespace-pre-line text-(--mz-warning)">
          {a.warnings.join("\n")}
        </p>
      )}
    </Dialog>
  );
}
