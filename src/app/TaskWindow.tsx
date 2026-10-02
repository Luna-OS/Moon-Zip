import { useCallback, useEffect, useRef, useState } from "react";
import { formatById } from "../lib/formats";
import { plural } from "../lib/format";
import { basename, dirname, join, stripArchiveExtension } from "../lib/paths";
import type { TaskAction } from "../lib/types";
import {
  AlertIcon,
  CheckIcon,
  CompressIcon,
  ExtractIcon,
  HashIcon,
  ShieldCheckIcon,
} from "../theme/icons";
import { Checksums } from "./Checksums";
import { useBridge } from "./context";
import { badPassword, isCancelled, messageOf, needsPassword } from "./errors";
import { ProgressCard } from "./ProgressCard";
import { TitleBar } from "./TitleBar";
import { useJob } from "./useJob";
import { CompressDialog, type CompressRequest } from "./dialogs/CompressDialog";
import { ExtractDialog, type ExtractChoice } from "./dialogs/ExtractDialog";
import { PasswordDialog } from "./dialogs/PasswordDialog";

const TITLES: Record<TaskAction, string> = {
  "extract-here": "Extract here",
  "extract-to-folder": "Extract to new folder",
  extract: "Extract to…",
  test: "Test archive",
  add: "Add to archive",
  "compress-7z": "Compress to .7z",
  "compress-zip": "Compress to .zip",
  checksums: "Checksums",
};

interface Outcome {
  ok: boolean;
  /** One line per archive or result. */
  lines: string[];
  /** Folder or archive to show afterwards. */
  reveal?: string;
  openArchive?: string;
}

/** Seconds a successful quick action stays on screen before the window closes itself. */
const AUTO_CLOSE = 4;

/**
 * A right-click-menu action from Windows Explorer in its own small window: the dialog where the action
 * has one, then the moon filling up while 7-Zip works, then the result.
 */
export function TaskWindow({ action, paths }: { action: TaskAction; paths: string[] }) {
  const bridge = useBridge();
  const { job, run, cancel } = useJob();
  const [stage, setStage] = useState<"dialog" | "running" | "done">(
    action === "add" || action === "extract" || action === "checksums" ? "dialog" : "running",
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [prompt, setPrompt] = useState<{
    name: string;
    wrong: boolean;
    resolve: (p: string | null) => void;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    void bridge.setTitle(`${TITLES[action]} – Moon Zip`);
  }, [bridge, action]);

  const askPassword = useCallback(
    (name: string, wrong: boolean) =>
      new Promise<string | null>((resolve) => setPrompt({ name, wrong, resolve })),
    [],
  );

  /** Runs fn, asking for the archive's password when 7-Zip needs it. Null when the user gave up. */
  const withPassword = useCallback(
    async <T,>(
      name: string,
      fn: (password?: string) => Promise<T>,
      first?: string,
    ): Promise<T | null> => {
      let password = first;
      for (;;) {
        try {
          return await fn(password);
        } catch (e) {
          if (needsPassword(e) || badPassword(e)) {
            const pw = await askPassword(name, badPassword(e) || !!password);
            if (pw === null) return null;
            password = pw;
            continue;
          }
          throw e;
        }
      }
    },
    [askPassword],
  );

  const finish = useCallback((o: Outcome, autoClose: boolean) => {
    setOutcome(o);
    setStage("done");
    if (o.ok && autoClose) setCountdown(AUTO_CLOSE);
  }, []);

  /** Extracts every archive in `paths`; dest(archive) says where. */
  const extractAll = useCallback(
    async (dest: (archive: string) => Promise<string>, choice?: Partial<ExtractChoice>) => {
      setStage("running");
      const lines: string[] = [];
      let ok = true;
      let reveal: string | undefined;
      for (const archive of paths) {
        const name = basename(archive);
        try {
          const destDir = await dest(archive);
          const res = await withPassword(
            name,
            (password) =>
              run(`Extracting ${name}`, (id) =>
                bridge.extract(id, {
                  archive,
                  destDir,
                  password,
                  overwrite: choice?.overwrite ?? "rename",
                }),
              ),
            choice?.password,
          );
          if (!res) {
            lines.push(`${name}: skipped`);
            continue;
          }
          reveal = res.destDir;
          lines.push(`${name} → ${res.destDir}${res.warnings ? ` (${res.warnings})` : ""}`);
        } catch (e) {
          if (isCancelled(e)) {
            lines.push(`${name}: cancelled`);
            break;
          }
          ok = false;
          lines.push(`${name}: ${messageOf(e)}`);
        }
      }
      if (ok && choice?.openAfter && reveal) void bridge.open(reveal);
      finish({ ok, lines, reveal }, ok && !choice?.openAfter);
    },
    [bridge, paths, run, withPassword, finish],
  );

  const compress = useCallback(
    async (req: CompressRequest) => {
      setStage("running");
      const name = basename(req.archive);
      try {
        const res = await run(`Compressing to ${name}`, (id) =>
          bridge.create(id, { ...req, sources: paths }),
        );
        finish(
          {
            ok: true,
            lines: [
              `Created ${basename(res.archive)} in ${dirname(res.archive)}${res.warnings ? `\n${res.warnings}` : ""}`,
            ],
            reveal: res.archive,
            openArchive: res.archive,
          },
          true,
        );
      } catch (e) {
        finish({ ok: false, lines: [isCancelled(e) ? "Cancelled." : messageOf(e)] }, false);
      }
    },
    [bridge, paths, run, finish],
  );

  const testAll = useCallback(async () => {
    const lines: string[] = [];
    let ok = true;
    for (const archive of paths) {
      const name = basename(archive);
      try {
        const res = await withPassword(name, (password) =>
          run(`Testing ${name}`, (id) => bridge.test(id, { archive, password })),
        );
        lines.push(
          res
            ? `${name}: no errors${res.warnings ? ` (${res.warnings})` : ""}`
            : `${name}: skipped`,
        );
      } catch (e) {
        if (isCancelled(e)) {
          lines.push(`${name}: cancelled`);
          break;
        }
        ok = false;
        lines.push(`${name}: ${messageOf(e)}`);
      }
    }
    finish({ ok, lines }, false);
  }, [bridge, paths, run, withPassword, finish]);

  // The actions without a dialog start right away (after this render: starting sets state).
  useEffect(() => {
    if (started.current || stage !== "running") return;
    started.current = true;
    void Promise.resolve().then(() => {
      if (action === "extract-here") return extractAll((a) => Promise.resolve(dirname(a)));
      if (action === "extract-to-folder") return extractAll((a) => bridge.folderFor(a));
      if (action === "test") return testAll();
      if (action === "compress-7z" || action === "compress-zip") {
        const format = action === "compress-7z" ? "7z" : "zip";
        return bridge
          .suggestName(paths, formatById(format).ext)
          .then((archive) => compress({ archive, format, options: { level: 5 } }));
      }
    });
  }, [action, stage, paths, bridge, extractAll, testAll, compress]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void bridge.close();
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, bridge]);

  const Icon = action.startsWith("extract")
    ? ExtractIcon
    : action === "test"
      ? ShieldCheckIcon
      : action === "checksums"
        ? HashIcon
        : CompressIcon;
  const subject = paths.length === 1 ? basename(paths[0]) : plural(paths.length, "item");

  return (
    <div className="relative flex h-full flex-col">
      <TitleBar>
        <span className="truncate text-[0.8125rem] text-(--mz-text-muted)">{TITLES[action]}</span>
      </TitleBar>
      <main className="relative z-[1] flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-(--mz-selected) text-(--mz-accent)">
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <p className="mz-eyebrow">{TITLES[action]}</p>
            <h1 className="truncate text-lg font-semibold tracking-tight" title={paths.join("\n")}>
              {subject}
            </h1>
          </div>
        </div>

        {action === "checksums" && (
          <section className="mz-glass p-4">
            <Checksums paths={paths} />
          </section>
        )}

        {stage === "running" && (
          <section className="mz-glass p-5">
            {job ? (
              <ProgressCard title={job.title} progress={job.progress} onCancel={cancel} />
            ) : (
              <p className="text-[0.8125rem] text-(--mz-text-muted)">Getting ready…</p>
            )}
          </section>
        )}

        {stage === "done" && outcome && (
          <section
            className="mz-glass flex flex-col gap-3 p-5"
            role={outcome.ok ? "status" : "alert"}
          >
            <div
              className="flex items-center gap-2 text-[0.9375rem] font-semibold"
              style={{ color: outcome.ok ? "var(--mz-success)" : "var(--mz-danger)" }}
            >
              {outcome.ok ? <CheckIcon /> : <AlertIcon />}
              {outcome.ok ? "Done" : "Something went wrong"}
            </div>
            <ul className="flex flex-col gap-1 text-[0.8125rem] break-words whitespace-pre-line text-(--mz-text-muted)">
              {outcome.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {countdown !== null && (
                <button
                  type="button"
                  className="mz-btn mz-btn-sm mr-auto text-(--mz-text-faint)"
                  onClick={() => setCountdown(null)}
                >
                  Closing in {countdown}s · keep open
                </button>
              )}
              {outcome.openArchive && (
                <button
                  type="button"
                  className="mz-btn mz-btn-ghost"
                  onClick={() =>
                    void bridge.openArchiveWindow(outcome.openArchive!).then(() => bridge.close())
                  }
                >
                  Open in Moon Zip
                </button>
              )}
              {outcome.reveal && (
                <button
                  type="button"
                  className="mz-btn mz-btn-ghost"
                  onClick={() => void bridge.reveal(outcome.reveal!)}
                >
                  Show in folder
                </button>
              )}
              <button
                type="button"
                className="mz-btn mz-btn-primary"
                data-autofocus
                onClick={() => void bridge.close()}
              >
                Close
              </button>
            </div>
          </section>
        )}
      </main>

      {stage === "dialog" && action === "add" && (
        <CompressDialog
          sources={paths}
          onCancel={() => void bridge.close()}
          onSubmit={(r) => void compress(r)}
        />
      )}
      {stage === "dialog" && action === "extract" && (
        <ExtractDialog
          archive={paths[0]}
          what={paths.length === 1 ? basename(paths[0]) : plural(paths.length, "archive")}
          askPassword={false}
          startNextToArchive={paths.length > 1}
          onCancel={() => void bridge.close()}
          onSubmit={(c) =>
            void extractAll(
              (a) =>
                Promise.resolve(
                  paths.length === 1
                    ? c.destDir
                    : join(c.destDir, stripArchiveExtension(basename(a))),
                ),
              c,
            )
          }
        />
      )}

      {prompt && (
        <PasswordDialog
          archiveName={prompt.name}
          wrong={prompt.wrong}
          onCancel={() => {
            prompt.resolve(null);
            setPrompt(null);
          }}
          onSubmit={(pw) => {
            prompt.resolve(pw);
            setPrompt(null);
          }}
        />
      )}
    </div>
  );
}
