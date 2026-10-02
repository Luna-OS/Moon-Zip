import { basename, dirname, join } from "./paths";
import type {
  AppInfo,
  ArchiveEntry,
  ChecksumResult,
  CodedError,
  CreateFormat,
  CreateOptions,
  ExtractRequest,
  Listing,
  LocalItem,
  MoonZipBridge,
  Progress,
  ShellIntegrationStatus,
  StartRequest,
} from "./types";

/**
 * An in-memory stand-in for the desktop app's bridge: `npm run dev` in a browser and the tests run
 * the whole UI on it. It holds a few sample archives (one needs the password "moon") and imitates
 * 7-Zip's answers, progress included.
 */

const HOME = "C:\\Users\\Luna";
const DOWNLOADS = `${HOME}\\Downloads`;
const t = (iso: string) => new Date(iso).getTime();

function file(
  path: string,
  size: number,
  ratio: number,
  mtime: string,
  extra: Partial<ArchiveEntry> = {},
): ArchiveEntry {
  return {
    path,
    isDir: false,
    size,
    packed: Math.round(size * ratio),
    mtime: t(mtime),
    crc: (Math.abs(hashCode(path)) >>> 0).toString(16).toUpperCase().padStart(8, "0"),
    method: "LZMA2:24",
    encrypted: false,
    attributes: "A",
    comment: "",
    ...extra,
  };
}

function dir(path: string, mtime: string): ArchiveEntry {
  return {
    path,
    isDir: true,
    size: 0,
    packed: 0,
    mtime: t(mtime),
    crc: "",
    method: "",
    encrypted: false,
    attributes: "D",
    comment: "",
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

interface DemoArchive {
  listing: Listing;
  password?: string;
  encryptedHeaders?: boolean;
}

function sampleArchives(): Map<string, DemoArchive> {
  const info = (
    type: string,
    physicalSize: number,
    method = "LZMA2:24",
    solid: boolean | null = true,
  ) => ({
    type,
    innerType: "",
    physicalSize,
    headersSize: 412,
    method,
    solid,
    blocks: 1,
    volumes: null,
    comment: "",
    warnings: [],
  });
  const photos: ArchiveEntry[] = [
    dir("Night sky", "2026-09-21T22:14:00"),
    dir("Night sky/Raw", "2026-09-21T22:14:00"),
    file("Night sky/Crescent over the lake.jpg", 4_812_331, 0.97, "2026-09-21T22:10:00"),
    file("Night sky/Milky Way, long exposure.jpg", 7_204_118, 0.96, "2026-09-21T23:41:00"),
    file("Night sky/Orion.png", 2_310_442, 0.71, "2026-09-18T21:02:00"),
    file("Night sky/Raw/IMG_2041.cr3", 28_103_220, 0.92, "2026-09-21T22:10:00"),
    file("Night sky/Raw/IMG_2042.cr3", 27_991_004, 0.92, "2026-09-21T22:11:00"),
    dir("Notes", "2026-09-30T10:00:00"),
    file("Notes/Moon phases.md", 8_204, 0.31, "2026-09-30T09:58:00"),
    file("Notes/Telescope checklist.txt", 1_930, 0.42, "2026-09-12T18:20:00"),
    file("Notes/Observation log.csv", 51_220, 0.18, "2026-09-29T23:59:00"),
    file("Notes/Star map.svg", 120_448, 0.22, "2026-09-02T12:30:00"),
    file("README.md", 2_412, 0.45, "2026-10-01T08:00:00"),
    file("Sky tour.mp4", 84_120_998, 0.99, "2026-09-25T20:15:00"),
  ];
  const sizeOf = (es: ArchiveEntry[]) => es.reduce((n, e) => n + (e.packed ?? 0), 0);
  const project: ArchiveEntry[] = [
    dir("moon-app", "2026-09-28T16:00:00"),
    dir("moon-app/src", "2026-09-28T16:00:00"),
    file("moon-app/src/main.ts", 4_102, 0.28, "2026-09-28T15:44:00", { method: "Deflate" }),
    file("moon-app/src/theme.css", 9_812, 0.21, "2026-09-28T15:12:00", { method: "Deflate" }),
    file("moon-app/package.json", 1_204, 0.4, "2026-09-27T11:00:00", { method: "Deflate" }),
    file("moon-app/LICENSE", 1_061, 0.55, "2026-09-01T09:00:00", { method: "Deflate" }),
  ];
  const secret: ArchiveEntry[] = [
    file("Passwords.kdbx", 48_211, 0.98, "2026-09-10T08:00:00", {
      encrypted: true,
      method: "AES-256 Deflate",
    }),
    file("Tax 2025.pdf", 912_004, 0.88, "2026-04-02T14:00:00", {
      encrypted: true,
      method: "AES-256 Deflate",
    }),
  ];
  return new Map<string, DemoArchive>([
    [
      `${DOWNLOADS}\\Moon photos.7z`,
      { listing: { archive: info("7z", sizeOf(photos), "LZMA2:24", false), entries: photos } },
    ],
    [
      `${DOWNLOADS}\\moon-app.zip`,
      { listing: { archive: info("zip", sizeOf(project), "Deflate", null), entries: project } },
    ],
    [
      `${DOWNLOADS}\\Secret.7z`,
      {
        listing: { archive: info("7z", sizeOf(secret), "LZMA2:24 7zAES"), entries: secret },
        password: "moon",
        encryptedHeaders: true,
      },
    ],
  ]);
}

function coded(message: string, code: string): CodedError {
  const e: CodedError = new Error(message);
  e.code = code;
  return e;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Runs fn on a later tick, so the demo answers like the real (asynchronous) bridge, errors included. */
const later = <T>(fn: () => T): Promise<T> => Promise.resolve().then(fn);

export class DemoBridge implements MoonZipBridge {
  kind = "demo" as const;
  /** Milliseconds per progress step; the tests set 0. */
  stepMs: number;
  archives = sampleArchives();
  /** Files "on disk" for adding and compressing. */
  local = new Map<string, LocalItem>([
    [
      `${HOME}\\Pictures\\Comet.jpg`,
      {
        path: `${HOME}\\Pictures\\Comet.jpg`,
        name: "Comet.jpg",
        isDir: false,
        size: 3_200_412,
        exists: true,
      },
    ],
    [
      `${HOME}\\Documents\\Essay.docx`,
      {
        path: `${HOME}\\Documents\\Essay.docx`,
        name: "Essay.docx",
        isDir: false,
        size: 84_120,
        exists: true,
      },
    ],
    [
      `${HOME}\\Documents\\Moon project`,
      {
        path: `${HOME}\\Documents\\Moon project`,
        name: "Moon project",
        isDir: true,
        size: 0,
        exists: true,
      },
    ],
  ]);
  shell: ShellIntegrationStatus = { supported: true, enabled: true, stale: false };
  start: StartRequest;
  opened: string[] = [];
  revealed: string[] = [];
  private listeners = new Map<string, Set<(data: never) => void>>();
  private cancelled = new Set<string>();

  constructor({
    start = { kind: "home" },
    stepMs = 120,
  }: { start?: StartRequest; stepMs?: number } = {}) {
    this.start = start;
    this.stepMs = stepMs;
  }

  private emit(channel: string, data: unknown) {
    for (const fn of this.listeners.get(channel) ?? []) (fn as (d: unknown) => void)(data);
  }

  /** Imitates a running 7-Zip: progress in steps, then the result (or "Cancelled."). */
  private async progress(id: string, names: string[]) {
    const steps = Math.max(4, names.length);
    for (let i = 0; i <= steps; i++) {
      if (this.cancelled.has(id)) throw coded("Cancelled.", "ECANCELLED");
      const p: Progress = {
        percent: Math.round((i / steps) * 100),
        files: i,
        current: names[i % Math.max(1, names.length)] ?? "",
      };
      this.emit("job:progress", { id, ...p });
      if (this.stepMs) await wait(this.stepMs);
    }
  }

  private get(archive: string): DemoArchive {
    const a = this.archives.get(archive);
    if (!a)
      throw coded("This file isn't an archive Moon Zip can open, or it is damaged.", "ENOTARCHIVE");
    return a;
  }

  private checkPassword(a: DemoArchive, password?: string) {
    if (!a.password) return;
    if (!password) throw coded("This archive is protected with a password.", "ENEEDPASS");
    if (password !== a.password) throw coded("The password is wrong.", "EBADPASS");
  }

  takeStart() {
    return Promise.resolve(this.start);
  }

  info(): Promise<AppInfo> {
    return Promise.resolve({
      platform: "demo",
      version: "0.1.0",
      sevenZip: "26.03",
      formats: ["7z", "zip", "tar", "tar.gz", "tar.xz", "tar.bz2"],
    });
  }

  shellIntegration() {
    return Promise.resolve({ ...this.shell });
  }

  setShellIntegration(enabled: boolean) {
    this.shell = { ...this.shell, enabled, stale: false };
    return Promise.resolve({ ...this.shell });
  }

  list(archive: string, password?: string): Promise<Listing> {
    return later(() => {
      const a = this.get(archive);
      if (a.encryptedHeaders) this.checkPassword(a, password);
      return structuredClone(a.listing);
    });
  }

  openEntry({ archive, path, password }: { archive: string; path: string; password?: string }) {
    return later(() => {
      const a = this.get(archive);
      if (a.listing.entries.some((e) => e.path === path && e.encrypted))
        this.checkPassword(a, password);
      return `C:\\Temp\\moon-zip\\${basename(path)}`;
    });
  }

  folderFor(archive: string) {
    return Promise.resolve(join(dirname(archive), basename(archive).replace(/\.[^.]+$/, "")));
  }

  suggestName(paths: string[], ext: string) {
    const base =
      paths.length === 1 ? basename(paths[0]).replace(/\.[^.]+$/, "") : basename(dirname(paths[0]));
    return Promise.resolve(join(dirname(paths[0]), `${base}${ext}`));
  }

  async extract(id: string, opts: ExtractRequest) {
    const a = this.get(opts.archive);
    const names = (opts.paths?.length ? opts.paths : a.listing.entries.map((e) => e.path)).map(
      (p) => p,
    );
    if (a.listing.entries.some((e) => e.encrypted)) this.checkPassword(a, opts.password);
    await this.progress(id, names);
    return { destDir: opts.destDir, warnings: "" };
  }

  async create(
    id: string,
    opts: { archive: string; sources: string[]; format: CreateFormat; options: CreateOptions },
  ) {
    await this.progress(
      id,
      opts.sources.map((s) => basename(s)),
    );
    const entries: ArchiveEntry[] = opts.sources.map((s) => {
      const item = this.local.get(s);
      return item?.isDir
        ? dir(basename(s), "2026-10-02T12:00:00")
        : file(basename(s), item?.size ?? 1000, 0.6, "2026-10-02T12:00:00", {
            encrypted: !!opts.options.password,
          });
    });
    this.archives.set(opts.archive, {
      listing: {
        archive: {
          type: opts.format,
          innerType: "",
          physicalSize: 1000,
          headersSize: null,
          method: "",
          solid: null,
          blocks: null,
          volumes: null,
          comment: "",
          warnings: [],
        },
        entries,
      },
      password: opts.options.password || undefined,
      encryptedHeaders: !!opts.options.encryptNames,
    });
    return { archive: opts.archive, warnings: "" };
  }

  async add(
    id: string,
    opts: { archive: string; sources: string[]; intoDir?: string; password?: string },
  ) {
    const a = this.get(opts.archive);
    await this.progress(
      id,
      opts.sources.map((s) => basename(s)),
    );
    const prefix = opts.intoDir ? `${opts.intoDir}/` : "";
    for (const s of opts.sources) {
      const item = this.local.get(s);
      const path = `${prefix}${basename(s)}`;
      a.listing.entries = a.listing.entries.filter((e) => e.path !== path);
      a.listing.entries.push(
        item?.isDir
          ? dir(path, "2026-10-02T12:00:00")
          : file(path, item?.size ?? 1000, 0.6, "2026-10-02T12:00:00"),
      );
    }
    return { warnings: "" };
  }

  async remove(id: string, opts: { archive: string; paths: string[] }) {
    const a = this.get(opts.archive);
    await this.progress(id, opts.paths);
    a.listing.entries = a.listing.entries.filter(
      (e) => !opts.paths.some((p) => e.path === p || e.path.startsWith(`${p}/`)),
    );
    return { warnings: "" };
  }

  rename(_id: string, opts: { archive: string; from: string; to: string }) {
    return later(() => {
      const a = this.get(opts.archive);
      a.listing.entries = a.listing.entries.map((e) =>
        e.path === opts.from || e.path.startsWith(`${opts.from}/`)
          ? { ...e, path: opts.to + e.path.slice(opts.from.length) }
          : e,
      );
      return { warnings: "" };
    });
  }

  async test(id: string, opts: { archive: string; password?: string }) {
    const a = this.get(opts.archive);
    this.checkPassword(a, opts.password);
    await this.progress(
      id,
      a.listing.entries.map((e) => e.path),
    );
    return { warnings: "" };
  }

  async checksums(
    id: string,
    opts: { paths: string[]; algorithms: string[] },
  ): Promise<ChecksumResult[]> {
    await this.progress(
      id,
      opts.paths.map((p) => basename(p)),
    );
    return opts.paths.map((p) => ({
      name: basename(p),
      path: p,
      size: this.local.get(p)?.size ?? 1234,
      hashes: Object.fromEntries(
        opts.algorithms.map((alg) => {
          const len =
            { crc32: 8, md5: 32, sha1: 40, sha256: 64, sha512: 128, blake2b: 128 }[alg] ?? 16;
          const seed = (Math.abs(hashCode(p + alg)) >>> 0).toString(16);
          const hex = seed.repeat(Math.ceil(len / seed.length)).slice(0, len);
          return [alg, alg === "crc32" ? hex.toUpperCase() : hex];
        }),
      ),
    }));
  }

  cancel(id: string) {
    this.cancelled.add(id);
    return Promise.resolve();
  }

  stat(paths: string[]): Promise<LocalItem[]> {
    return later(() =>
      paths.map(
        (p) =>
          this.local.get(p) ?? {
            path: p,
            name: basename(p),
            isDir: false,
            size: 0,
            exists: this.archives.has(p),
          },
      ),
    );
  }

  pathForFile(f: File) {
    return join(DOWNLOADS, f.name);
  }

  pickArchive() {
    return Promise.resolve(`${DOWNLOADS}\\Moon photos.7z`);
  }

  pickFiles(folders: boolean) {
    return Promise.resolve(
      folders ? [`${HOME}\\Documents\\Moon project`] : [`${HOME}\\Pictures\\Comet.jpg`],
    );
  }

  pickFolder(defaultPath?: string) {
    return Promise.resolve(defaultPath ?? `${HOME}\\Desktop`);
  }

  pickSaveArchive(defaultPath: string) {
    return Promise.resolve(defaultPath);
  }

  open(path: string) {
    return later(() => void this.opened.push(path));
  }

  reveal(path: string) {
    return later(() => void this.revealed.push(path));
  }

  openArchiveWindow(path: string) {
    return later(() => void this.opened.push(path));
  }

  newWindow() {
    return Promise.resolve();
  }
  setTheme() {
    return Promise.resolve();
  }
  setIdle() {
    return Promise.resolve();
  }
  setTitle(title: string) {
    return later(() => void (document.title = title));
  }
  close() {
    return Promise.resolve();
  }
  devtools() {
    return Promise.resolve();
  }

  on(channel: string, fn: (data: never) => void): () => void {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(fn);
    return () => this.listeners.get(channel)?.delete(fn);
  }
}

export const DEMO_ARCHIVES = {
  photos: `${DOWNLOADS}\\Moon photos.7z`,
  project: `${DOWNLOADS}\\moon-app.zip`,
  secret: `${DOWNLOADS}\\Secret.7z`,
};
