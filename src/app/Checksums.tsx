import { useState } from "react";
import { HASH_ALGORITHMS } from "../lib/formats";
import { formatBytes } from "../lib/format";
import type { ChecksumResult } from "../lib/types";
import { CheckIcon, CopyIcon, HashIcon } from "../theme/icons";
import { useBridge } from "./context";
import { isCancelled, messageOf } from "./errors";
import { ProgressCard } from "./ProgressCard";
import { useJob } from "./useJob";

const normal = (s: string) => s.trim().toLowerCase().replace(/^0x/, "");

/**
 * Checksums of files and folders (every file below them): pick the algorithms, calculate, copy a
 * value, or paste one to compare. Runs in the main process, reading each file once.
 */
export function Checksums({ paths }: { paths: string[] }) {
  const bridge = useBridge();
  const { job, run, cancel } = useJob();
  const [algorithms, setAlgorithms] = useState<string[]>(["crc32", "sha256"]);
  const [results, setResults] = useState<ChecksumResult[] | null>(null);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState("");
  const [copied, setCopied] = useState("");

  async function calculate() {
    setError("");
    setResults(null);
    try {
      setResults(
        await run("Calculating checksums", (id) => bridge.checksums(id, { paths, algorithms })),
      );
    } catch (e) {
      if (!isCancelled(e)) setError(messageOf(e));
    }
  }

  const wanted = normal(compare);
  const matched =
    wanted !== "" &&
    !!results?.some((r) => Object.values(r.hashes).some((h) => normal(h) === wanted));

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mz-label">Algorithms</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {HASH_ALGORITHMS.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                className="mz-checkbox"
                checked={algorithms.includes(a.id)}
                onChange={(e) =>
                  setAlgorithms((list) =>
                    e.target.checked
                      ? HASH_ALGORITHMS.map((x) => x.id).filter(
                          (id) => id === a.id || list.includes(id),
                        )
                      : list.filter((x) => x !== a.id),
                  )
                }
              />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>

      {job ? (
        <div className="mz-inset p-4">
          <ProgressCard title={job.title} progress={job.progress} onCancel={cancel} />
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="mz-btn mz-btn-primary"
            disabled={algorithms.length === 0}
            onClick={() => void calculate()}
          >
            <HashIcon size={15} /> {results ? "Calculate again" : "Calculate"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[0.8125rem] text-(--mz-danger)">
          {error}
        </p>
      )}

      {results && (
        <>
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {results.map((r) => (
              <div key={r.path} className="mz-inset p-3">
                <div className="mb-2 flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="truncate font-semibold" title={r.path}>
                    {r.name}
                  </span>
                  <span className="shrink-0 text-xs text-(--mz-text-muted) tabular-nums">
                    {formatBytes(r.size)}
                  </span>
                </div>
                <dl className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 gap-y-1">
                  {Object.entries(r.hashes).map(([alg, value]) => {
                    const hit = wanted !== "" && normal(value) === wanted;
                    const label = HASH_ALGORITHMS.find((a) => a.id === alg)?.label ?? alg;
                    const key = `${r.path}:${alg}`;
                    return (
                      <div key={alg} className="contents">
                        <dt className="text-xs text-(--mz-text-muted)">{label}</dt>
                        <dd
                          className="min-w-0 font-mono text-xs break-all"
                          style={hit ? { color: "var(--mz-success)" } : undefined}
                        >
                          {value}
                        </dd>
                        <button
                          type="button"
                          className="mz-icon-btn h-7 w-7"
                          aria-label={`Copy the ${label} of ${r.name}`}
                          onClick={() => {
                            void navigator.clipboard?.writeText(value).then(() => setCopied(key));
                          }}
                        >
                          {copied === key ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
            {results.length === 0 && (
              <p className="text-[0.8125rem] text-(--mz-text-muted)">
                There are no files to check.
              </p>
            )}
          </div>
          <div>
            <label className="mz-label" htmlFor="mz-compare">
              Compare with
            </label>
            <input
              id="mz-compare"
              className="mz-input w-full font-mono"
              placeholder="Paste a checksum, e.g. from a download page"
              value={compare}
              spellCheck={false}
              onChange={(e) => setCompare(e.target.value)}
            />
            {wanted !== "" && (
              <p
                role="status"
                className="mt-2 text-[0.8125rem]"
                style={{ color: matched ? "var(--mz-success)" : "var(--mz-danger)" }}
              >
                {matched ? "It matches." : "No checksum above matches this one."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
