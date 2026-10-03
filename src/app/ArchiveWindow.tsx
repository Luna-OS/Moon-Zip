import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { formatBytes, formatPercent, plural, savedFraction } from "../lib/format";
import { isArchiveName } from "../lib/formats";
import { basename, dirname, join } from "../lib/paths";
import {
  buildTree,
  filesUnder,
  nameOf,
  parentOf,
  sortNodes,
  totals,
  type Tree,
  type TreeNode,
} from "../lib/tree";
import type { Listing } from "../lib/types";
import { MoonPhase } from "../theme/MoonPhase";
import {
  ChevronRightIcon,
  CompressIcon,
  ExtractIcon,
  FileIcon,
  FolderIcon,
  HashIcon,
  InfoIcon,
  LockIcon,
  MoonIcon,
  OpenIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SunIcon,
  TrashIcon,
  UpIcon,
  EditIcon,
  BackIcon,
} from "../theme/icons";
import type { ResolvedTheme, ThemeChoice } from "../theme/useTheme";
import { ContextMenu } from "../ui/ContextMenu";
import { anchorFromEvent, cleanMenu, type MenuAnchor, type MenuEntry } from "../ui/menu";
import { Checksums } from "./Checksums";
import { useBridge } from "./context";
import { badPassword, isCancelled, messageOf, needsPassword } from "./errors";
import { FileTable, type Sort } from "./FileTable";
import { Home } from "./Home";
import { ProgressCard } from "./ProgressCard";
import { forgetRecent, loadRecent, rememberRecent } from "./storage";
import { TitleBar } from "./TitleBar";
import { ToastStack } from "./Toasts";
import { useToasts } from "./useToasts";
import { useJob } from "./useJob";
import { CompressDialog, type CompressRequest } from "./dialogs/CompressDialog";
import { ConfirmDialog } from "./dialogs/ConfirmDialog";
import { Dialog } from "./dialogs/Dialog";
import { ExtractDialog, type ExtractChoice } from "./dialogs/ExtractDialog";
import { InfoDialog } from "./dialogs/InfoDialog";
import { PasswordDialog } from "./dialogs/PasswordDialog";
import { RenameDialog } from "./dialogs/RenameDialog";
import { SettingsDialog } from "./dialogs/SettingsDialog";

/** 7-Zip can write these; everything else (RAR, ISO, …) opens read-only. */
const WRITABLE = new Set(["7z", "zip", "tar", "wim"]);

interface Opened {
  /** The archive file (a temporary copy for an archive opened from inside another). */
  path: string;
  name: string;
  password?: string;
  /** The listing itself needed the password (7z with hidden names). */
  namesEncrypted: boolean;
  listing: Listing;
  tree: Tree;
  readOnly: boolean;
  parent: Opened | null;
}

type DialogState =
  | { kind: "extract"; paths: string[]; strip: string; what: string }
  | { kind: "compress"; sources: string[] }
  | { kind: "add"; sources: string[] }
  | { kind: "delete"; paths: string[] }
  | { kind: "rename"; node: TreeNode }
  | { kind: "info" }
  | { kind: "checksums" }
  | { kind: "settings" };

interface PasswordPrompt {
  name: string;
  wrong: boolean;
  resolve: (password: string | null) => void;
}

/** An archive window: the start page, or one archive to browse, extract from and change. */
export function ArchiveWindow({
  initialPath,
  theme,
  resolvedTheme,
  onTheme,
}: {
  initialPath: string | null;
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  onTheme: (t: ThemeChoice) => void;
}) {
  const bridge = useBridge();
  const { job, run, cancel } = useJob();
  const { toasts, push, dismiss } = useToasts();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [cwd, setCwd] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "name", desc: false });
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
  const [menu, setMenu] = useState<{
    anchor: MenuAnchor;
    items: MenuEntry[];
    label: string;
  } | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [sevenZip, setSevenZip] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const openedRef = useRef<Opened | null>(null);
  openedRef.current = opened;

  const fail = useCallback(
    (e: unknown) => {
      if (!isCancelled(e)) push({ tone: "error", text: messageOf(e) });
    },
    [push],
  );

  const askPassword = useCallback(
    (name: string, wrong: boolean) =>
      new Promise<string | null>((resolve) => setPrompt({ name, wrong, resolve })),
    [],
  );

  // ---------------------------------------------------------------- opening

  const openArchive = useCallback(
    async (
      path: string,
      { parent = null, name = basename(path) }: { parent?: Opened | null; name?: string } = {},
    ) => {
      let password: string | undefined;
      let needed = false;
      for (;;) {
        try {
          const listing = await bridge.list(path, password);
          const type = listing.archive.type.toLowerCase();
          setOpened({
            path,
            name,
            password,
            namesEncrypted: needed,
            listing,
            tree: buildTree(listing.entries, { solid: listing.archive.solid === true }),
            readOnly: !!parent || !WRITABLE.has(type) || (listing.archive.volumes ?? 1) > 1,
            parent,
          });
          setCwd("");
          setSelected(new Set());
          setFocused(null);
          setQuery("");
          if (!parent) setRecent(rememberRecent(path));
          return;
        } catch (e) {
          if (needsPassword(e) || badPassword(e)) {
            needed = true;
            const pw = await askPassword(name, badPassword(e));
            if (pw === null) return;
            password = pw;
            continue;
          }
          fail(e);
          return;
        }
      }
    },
    [bridge, askPassword, fail],
  );

  useEffect(() => {
    void bridge
      .info()
      .then((i) => setSevenZip(i.sevenZip))
      .catch(() => {});
    // After this render, not during it: opening sets state.
    if (initialPath) void Promise.resolve(initialPath).then(openArchive);
  }, [bridge, initialPath, openArchive]);

  useEffect(() => bridge.on("open-archive", (p) => void openArchive(p)), [bridge, openArchive]);

  useEffect(() => {
    void bridge.setIdle(!opened);
    void bridge.setTitle(opened ? `${opened.name} – Moon Zip` : "Moon Zip");
  }, [bridge, opened]);

  /** Lists the open archive again after a change. */
  const reload = useCallback(async () => {
    const o = openedRef.current;
    if (!o) return;
    try {
      const listing = await bridge.list(o.path, o.password);
      const tree = buildTree(listing.entries, { solid: listing.archive.solid === true });
      setOpened({ ...o, listing, tree });
      setSelected(new Set());
      if (!tree.has(cwd)) setCwd("");
    } catch (e) {
      fail(e);
    }
  }, [bridge, cwd, fail]);

  /** Runs fn with the archive's password, asking for it (again) when 7-Zip says it's needed or wrong. */
  const withPassword = useCallback(
    async <T,>(fn: (password?: string) => Promise<T>): Promise<T | null> => {
      const o = openedRef.current;
      let password = o?.password;
      for (;;) {
        try {
          const result = await fn(password);
          if (o && password !== o.password)
            setOpened((cur) => (cur && cur.path === o.path ? { ...cur, password } : cur));
          return result;
        } catch (e) {
          if ((needsPassword(e) || badPassword(e)) && o) {
            const pw = await askPassword(o.name, badPassword(e) || !!password);
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

  // ---------------------------------------------------------------- what the list shows

  const nodes = useMemo(() => {
    if (!opened) return [];
    const q = query.trim().toLowerCase();
    if (q) {
      const hits: TreeNode[] = [];
      for (const children of opened.tree.values())
        for (const n of children) if (n.name.toLowerCase().includes(q)) hits.push(n);
      return sortNodes(hits, sort.key, sort.desc);
    }
    return sortNodes(opened.tree.get(cwd) ?? [], sort.key, sort.desc);
  }, [opened, cwd, query, sort]);

  const all = useMemo(() => (opened ? totals(opened.tree) : null), [opened]);
  const selection = useMemo(() => nodes.filter((n) => selected.has(n.path)), [nodes, selected]);
  const encrypted =
    !!opened && (opened.namesEncrypted || opened.listing.entries.some((e) => e.encrypted));

  function go(path: string) {
    setQuery("");
    setCwd(path);
    setSelected(new Set());
    setFocused(null);
  }

  // ---------------------------------------------------------------- actions

  async function openNode(node: TreeNode) {
    const o = opened;
    if (!o) return;
    if (node.isDir) {
      go(node.path);
      return;
    }
    try {
      const file = await withPassword((password) =>
        run(`Opening ${node.name}`, () =>
          bridge.openEntry({ archive: o.path, path: node.path, password }),
        ),
      );
      if (!file) return;
      if (isArchiveName(node.name)) await openArchive(file, { parent: o, name: node.name });
      else await bridge.open(file);
    } catch (e) {
      fail(e);
    }
  }

  function startExtract(paths: string[]) {
    if (!opened) return;
    const what =
      paths.length === 0
        ? "everything"
        : paths.length === 1
          ? nameOf(paths[0])
          : plural(paths.length, "item");
    setDialog({ kind: "extract", paths, strip: query ? "" : cwd, what });
  }

  async function doExtract(paths: string[], strip: string, choice: ExtractChoice) {
    const o = opened;
    if (!o) return;
    setDialog(null);
    try {
      const res = await withPassword((password) =>
        run(`Extracting ${o.name}`, (id) =>
          bridge.extract(id, {
            archive: o.path,
            destDir: choice.destDir,
            paths,
            stripPrefix: paths.length ? strip : "",
            password: password ?? choice.password,
            overwrite: choice.overwrite,
          }),
        ),
      );
      if (!res) return;
      if (choice.password && !o.password)
        setOpened((cur) => (cur ? { ...cur, password: choice.password } : cur));
      if (choice.openAfter) void bridge.show(res.destDir).catch(fail);
      push({
        tone: "success",
        text: `Extracted to ${res.destDir}${res.warnings ? `\n${res.warnings}` : ""}`,
        action: choice.openAfter
          ? undefined
          : { label: "Show", run: () => void bridge.show(res.destDir).catch(fail) },
      });
    } catch (e) {
      fail(e);
    }
  }

  async function doTest() {
    const o = opened;
    if (!o || !all) return;
    try {
      const res = await withPassword((password) =>
        run(`Testing ${o.name}`, (id) => bridge.test(id, { archive: o.path, password })),
      );
      if (res)
        push({
          tone: "success",
          text: `No errors found in ${plural(all.files, "file")}.${res.warnings ? `\n${res.warnings}` : ""}`,
        });
    } catch (e) {
      fail(e);
    }
  }

  async function doAdd(sources: string[]) {
    const o = opened;
    if (!o || !sources.length) return;
    setDialog(null);
    try {
      const res = await withPassword((password) =>
        run(`Adding to ${o.name}`, (id) =>
          bridge.add(id, {
            archive: o.path,
            sources,
            intoDir: cwd,
            password,
            encryptNames: o.namesEncrypted,
          }),
        ),
      );
      if (!res) return;
      await reload();
      push({ tone: "success", text: `Added ${plural(sources.length, "item")}.` });
    } catch (e) {
      fail(e);
    }
  }

  async function doDelete(paths: string[]) {
    const o = opened;
    if (!o) return;
    setDialog(null);
    try {
      const res = await withPassword((password) =>
        run(`Deleting from ${o.name}`, (id) =>
          bridge.remove(id, { archive: o.path, paths, password }),
        ),
      );
      if (!res) return;
      await reload();
      push({ tone: "success", text: `Deleted ${plural(paths.length, "item")} from the archive.` });
    } catch (e) {
      fail(e);
    }
  }

  async function doRename(node: TreeNode, name: string) {
    const o = opened;
    if (!o) return;
    setDialog(null);
    const to = parentOf(node.path) ? `${parentOf(node.path)}/${name}` : name;
    try {
      const res = await withPassword((password) =>
        run(`Renaming ${node.name}`, (id) =>
          bridge.rename(id, { archive: o.path, from: node.path, to, password }),
        ),
      );
      if (res) await reload();
    } catch (e) {
      fail(e);
    }
  }

  async function doCompress(sources: string[], req: CompressRequest) {
    setDialog(null);
    try {
      const res = await run(`Compressing to ${basename(req.archive)}`, (id) =>
        bridge.create(id, { ...req, sources }),
      );
      push({
        tone: "success",
        text: `Created ${basename(res.archive)}${res.warnings ? `\n${res.warnings}` : ""}`,
        action: { label: "Open", run: () => void openArchive(res.archive) },
      });
    } catch (e) {
      fail(e);
    }
  }

  async function pickAndAdd(folders: boolean) {
    const sources = await bridge.pickFiles(folders);
    if (sources.length) await doAdd(sources);
  }

  async function pickAndCompress(folders: boolean) {
    const sources = await bridge.pickFiles(folders);
    if (sources.length) setDialog({ kind: "compress", sources });
  }

  async function dropOnHome(files: File[]) {
    const paths = files.map((f) => bridge.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    if (paths.length === 1 && isArchiveName(paths[0])) {
      const [item] = await bridge.stat(paths);
      if (!item?.isDir) {
        void openArchive(paths[0]);
        return;
      }
    }
    setDialog({ kind: "compress", sources: paths });
  }

  function dropOnArchive(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!opened || opened.readOnly) return;
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => bridge.pathForFile(f))
      .filter(Boolean);
    if (paths.length) setDialog({ kind: "add", sources: paths });
  }

  function showMenu(e: MouseEvent<HTMLElement>, node: TreeNode | null) {
    e.preventDefault();
    if (!opened) return;
    const ro = opened.readOnly;
    const paths = node ? (selected.has(node.path) ? [...selected] : [node.path]) : [];
    const items = node
      ? cleanMenu([
          {
            label: node.isDir ? "Open folder" : "Open",
            icon: <OpenIcon size={15} />,
            shortcut: "Enter",
            onSelect: () => void openNode(node),
          },
          {
            label: "Extract…",
            icon: <ExtractIcon size={15} />,
            onSelect: () => startExtract(paths),
          },
          "separator",
          !ro &&
            paths.length === 1 && {
              label: "Rename",
              icon: <EditIcon size={15} />,
              shortcut: "F2",
              onSelect: () => setDialog({ kind: "rename", node }),
            },
          !ro && {
            label: "Delete",
            icon: <TrashIcon size={15} />,
            shortcut: "Del",
            danger: true,
            onSelect: () => setDialog({ kind: "delete", paths }),
          },
        ])
      : cleanMenu([
          !ro && {
            label: "Add files…",
            icon: <FileIcon size={15} />,
            onSelect: () => void pickAndAdd(false),
          },
          !ro && {
            label: "Add a folder…",
            icon: <FolderIcon size={15} />,
            onSelect: () => void pickAndAdd(true),
          },
          "separator",
          {
            label: "Extract everything…",
            icon: <ExtractIcon size={15} />,
            onSelect: () => startExtract([]),
          },
          {
            label: "Select all",
            shortcut: "Ctrl+A",
            onSelect: () => setSelected(new Set(nodes.map((n) => n.path))),
          },
        ]);
    setMenu({
      anchor: anchorFromEvent(e),
      items,
      label: node ? `Actions for ${node.name}` : "Folder actions",
    });
  }

  function addMenu(e: MouseEvent<HTMLElement>, compress: boolean) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      anchor: { x: rect.left, y: rect.bottom + 4, returnFocusTo: e.currentTarget },
      label: compress ? "New archive from" : "Add",
      items: [
        {
          label: "Files…",
          icon: <FileIcon size={15} />,
          onSelect: () => void (compress ? pickAndCompress(false) : pickAndAdd(false)),
        },
        {
          label: "A folder…",
          icon: <FolderIcon size={15} />,
          onSelect: () => void (compress ? pickAndCompress(true) : pickAndAdd(true)),
        },
      ],
    });
  }

  // ---------------------------------------------------------------- render

  const themeButton = (
    <button
      type="button"
      className="mz-icon-btn"
      aria-label={
        resolvedTheme === "dark" ? "Switch to the day theme" : "Switch to the night theme"
      }
      title={resolvedTheme === "dark" ? "Day theme" : "Night theme"}
      onClick={() => onTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
  const settingsButton = (
    <button
      type="button"
      className="mz-icon-btn"
      aria-label="Settings"
      title="Settings"
      onClick={() => setDialog({ kind: "settings" })}
    >
      <SettingsIcon />
    </button>
  );

  const crumbs = cwd ? cwd.split("/") : [];
  const saved = all
    ? savedFraction(all.size, opened?.listing.archive.physicalSize ?? all.packed)
    : null;
  const selectedSize = selection.reduce((n, s) => n + s.size, 0);

  return (
    <div className="relative flex h-full flex-col">
      <TitleBar
        actions={
          <>
            {themeButton}
            {settingsButton}
          </>
        }
      >
        {opened && (
          <>
            <span className="text-(--mz-text-faint)" aria-hidden="true">
              <ChevronRightIcon size={13} />
            </span>
            {opened.parent && (
              <button
                type="button"
                className="mz-crumb max-w-48 truncate"
                title={`Back to ${opened.parent.name}`}
                onClick={() => {
                  setOpened(opened.parent);
                  go("");
                }}
              >
                {opened.parent.name}
              </button>
            )}
            <span
              className="truncate text-[0.8125rem] font-medium"
              title={opened.parent ? opened.name : opened.path}
            >
              {opened.name}
            </span>
            {encrypted && (
              <span className="mz-chip mz-chip-warning">
                <LockIcon size={10} /> Encrypted
              </span>
            )}
            {opened.readOnly && <span className="mz-chip mz-chip-muted">Read-only</span>}
          </>
        )}
      </TitleBar>

      {!opened ? (
        <Home
          recent={recent}
          sevenZip={sevenZip}
          onOpenArchive={(p) => void openArchive(p)}
          onPickArchive={() =>
            void bridge.pickArchive().then((p) => (p ? openArchive(p) : undefined))
          }
          onNewArchive={() => void pickAndCompress(false)}
          onDropPaths={(files) => void dropOnHome(files)}
          onForget={(p) => setRecent(forgetRecent(p))}
        />
      ) : (
        <main
          className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2 p-3"
          onDragOver={(e) => {
            if (opened.readOnly) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={dropOnArchive}
        >
          <div
            className="mz-glass flex flex-wrap items-center gap-1.5 p-1.5"
            role="toolbar"
            aria-label="Archive"
          >
            <button
              type="button"
              className="mz-btn mz-btn-primary"
              onClick={() => startExtract(selection.length ? selection.map((s) => s.path) : [])}
            >
              <ExtractIcon size={15} /> {selection.length ? "Extract selected" : "Extract"}
            </button>
            <button
              type="button"
              className="mz-btn mz-btn-ghost"
              disabled={opened.readOnly}
              aria-haspopup="menu"
              onClick={(e) => addMenu(e, false)}
            >
              <PlusIcon size={15} /> Add
            </button>
            <button type="button" className="mz-btn mz-btn-ghost" onClick={() => void doTest()}>
              <ShieldCheckIcon size={15} /> Test
            </button>
            <button
              type="button"
              className="mz-btn mz-btn-ghost"
              disabled={opened.readOnly || selection.length === 0}
              onClick={() => setDialog({ kind: "delete", paths: selection.map((s) => s.path) })}
            >
              <TrashIcon size={15} /> Delete
            </button>
            <span className="mx-1 h-5 w-px bg-(--mz-border)" aria-hidden="true" />
            <button
              type="button"
              className="mz-icon-btn"
              aria-label="Archive info"
              title="Archive info"
              onClick={() => setDialog({ kind: "info" })}
            >
              <InfoIcon />
            </button>
            <button
              type="button"
              className="mz-icon-btn"
              aria-label="Checksums of the archive file"
              title="Checksums of the archive file"
              onClick={() => setDialog({ kind: "checksums" })}
            >
              <HashIcon />
            </button>
            <button
              type="button"
              className="mz-icon-btn"
              aria-label="New archive"
              title="New archive"
              aria-haspopup="menu"
              onClick={(e) => addMenu(e, true)}
            >
              <CompressIcon />
            </button>
            <button
              type="button"
              className="mz-icon-btn"
              aria-label="Close the archive"
              title="Close the archive"
              onClick={() => setOpened(null)}
            >
              <BackIcon />
            </button>
            <label className="relative ml-auto flex items-center">
              <span className="pointer-events-none absolute left-2.5 text-(--mz-text-faint)">
                <SearchIcon size={14} />
              </span>
              <input
                className="mz-input w-60 pl-8"
                type="search"
                placeholder="Find in this archive"
                aria-label="Find in this archive"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(new Set());
                  setFocused(null);
                }}
              />
            </label>
          </div>

          <nav
            className="flex items-center gap-1 px-1 text-[0.8125rem]"
            aria-label="Folder in the archive"
          >
            <button
              type="button"
              className="mz-icon-btn h-7 w-7"
              aria-label="Up one folder"
              disabled={!cwd || !!query}
              onClick={() => go(parentOf(cwd))}
            >
              <UpIcon size={14} />
            </button>
            <button
              type="button"
              className="mz-crumb"
              aria-current={!cwd && !query ? "page" : undefined}
              onClick={() => go("")}
            >
              {opened.name}
            </button>
            {!query &&
              crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-(--mz-text-faint)" aria-hidden="true">
                    <ChevronRightIcon size={12} />
                  </span>
                  <button
                    type="button"
                    className="mz-crumb"
                    aria-current={i === crumbs.length - 1 ? "page" : undefined}
                    onClick={() => go(crumbs.slice(0, i + 1).join("/"))}
                  >
                    {c}
                  </button>
                </span>
              ))}
            {query && (
              <span className="pl-1 text-(--mz-text-muted)">
                · {plural(nodes.length, "match", "matches")}
              </span>
            )}
          </nav>

          <section className="mz-glass relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <FileTable
              nodes={nodes}
              selected={selected}
              focused={focused}
              sort={sort}
              showFolderOf={!!query}
              showPacked={opened.listing.archive.solid !== true}
              onSort={setSort}
              onSelect={setSelected}
              onFocus={setFocused}
              onOpen={(n) => void openNode(n)}
              onUp={() => cwd && go(parentOf(cwd))}
              onDelete={() =>
                !opened.readOnly && setDialog({ kind: "delete", paths: [...selected] })
              }
              onRename={() => {
                const node = selection[0];
                if (node && !opened.readOnly) setDialog({ kind: "rename", node });
              }}
              onContextMenu={showMenu}
            />
            {dragOver && (
              <div
                className="mz-drop pointer-events-none absolute inset-2 grid place-items-center"
                data-active="true"
              >
                <p className="text-[0.9375rem] font-medium">
                  Drop to add to {cwd ? nameOf(cwd) : opened.name}
                </p>
              </div>
            )}
          </section>

          {all && (
            <footer
              className="flex items-center gap-3 px-1 text-xs text-(--mz-text-muted) tabular-nums"
              aria-label="Archive summary"
            >
              <span>
                {plural(all.files, "file")}, {plural(all.folders, "folder")}
              </span>
              {selection.length > 0 && (
                <span>
                  · {plural(selection.length, "item")} selected ({formatBytes(selectedSize)})
                </span>
              )}
              <span className="ml-auto mz-chip mz-chip-muted uppercase">
                {opened.listing.archive.innerType || opened.listing.archive.type || "?"}
              </span>
              <span>
                {formatBytes(all.size)} →{" "}
                {formatBytes(opened.listing.archive.physicalSize ?? all.packed)}
              </span>
              <span className="flex items-center gap-1.5" title="How much smaller the archive is">
                <MoonPhase fraction={saved ?? 0} size={18} /> {formatPercent(saved)} smaller
              </span>
            </footer>
          )}
        </main>
      )}

      {job && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[rgb(5_4_18/0.5)] p-6"
          role="dialog"
          aria-modal="true"
          aria-label={job.title}
        >
          <div className="mz-popover w-full max-w-lg p-5">
            <ProgressCard title={job.title} progress={job.progress} onCancel={cancel} />
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          label={menu.label}
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.kind === "extract" && opened && (
        <ExtractDialog
          archive={opened.parent ? join(dirname(rootOf(opened).path), opened.name) : opened.path}
          what={dialog.what}
          askPassword={encrypted && !opened.password}
          onCancel={() => setDialog(null)}
          onSubmit={(c) => void doExtract(dialog.paths, dialog.strip, c)}
        />
      )}
      {dialog?.kind === "compress" && (
        <CompressDialog
          sources={dialog.sources}
          onCancel={() => setDialog(null)}
          onSubmit={(r) => void doCompress(dialog.sources, r)}
        />
      )}
      {dialog?.kind === "add" && opened && (
        <ConfirmDialog
          eyebrow="Add"
          title={`Add ${plural(dialog.sources.length, "item")}?`}
          confirmLabel="Add"
          onCancel={() => setDialog(null)}
          onConfirm={() => void doAdd(dialog.sources)}
        >
          <p>
            {dialog.sources.length === 1
              ? basename(dialog.sources[0])
              : plural(dialog.sources.length, "item")}{" "}
            will be added to{" "}
            <strong className="text-(--mz-text)">
              {cwd ? `${opened.name} › ${cwd.replace(/\//g, " › ")}` : opened.name}
            </strong>
            . Items with the same name are replaced.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "delete" && opened && (
        <ConfirmDialog
          eyebrow="Delete"
          title={
            dialog.paths.length === 1
              ? `Delete ${nameOf(dialog.paths[0])}?`
              : `Delete ${plural(dialog.paths.length, "item")}?`
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => void doDelete(dialog.paths)}
        >
          <p>
            {plural(filesUnder(opened.tree, dialog.paths).length, "file")} will be removed from{" "}
            {opened.name}. This can't be undone.
          </p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "rename" && opened && (
        <RenameDialog
          name={dialog.node.name}
          taken={(opened.tree.get(parentOf(dialog.node.path)) ?? [])
            .filter((n) => n.path !== dialog.node.path)
            .map((n) => n.name)}
          onCancel={() => setDialog(null)}
          onSubmit={(name) => void doRename(dialog.node, name)}
        />
      )}
      {dialog?.kind === "info" && opened && all && (
        <InfoDialog
          path={opened.parent ? opened.name : opened.path}
          listing={opened.listing}
          totals={all}
          passwordProtected={opened.namesEncrypted}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "checksums" && opened && (
        <Dialog
          eyebrow="Checksums"
          title={opened.name}
          onClose={() => setDialog(null)}
          width="max-w-2xl"
        >
          <Checksums paths={[opened.path]} />
        </Dialog>
      )}
      {dialog?.kind === "settings" && (
        <SettingsDialog theme={theme} onTheme={onTheme} onClose={() => setDialog(null)} />
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

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/** The archive on disk that a nested archive was opened from (for "next to the archive"). */
function rootOf(o: Opened): Opened {
  return o.parent ? rootOf(o.parent) : o;
}
