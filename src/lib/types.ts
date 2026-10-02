/** One item of an archive, as electron/engine/listing.cjs parses it from 7-Zip. */
export interface ArchiveEntry {
  /** Full path inside the archive with forward slashes, e.g. "docs/readme.md". */
  path: string;
  isDir: boolean;
  size: number;
  /** Compressed size; null when the format doesn't say (or the item shares a solid block). */
  packed: number | null;
  mtime: number | null;
  crc: string;
  method: string;
  encrypted: boolean;
  attributes: string;
  comment: string;
}

export interface ArchiveInfo {
  type: string;
  innerType: string;
  physicalSize: number | null;
  headersSize: number | null;
  method: string;
  solid: boolean | null;
  blocks: number | null;
  volumes: number | null;
  comment: string;
  warnings: string[];
}

export interface Listing {
  archive: ArchiveInfo;
  entries: ArchiveEntry[];
}

export interface Progress {
  percent: number;
  files: number | null;
  current: string;
}

export type OverwriteMode = "overwrite" | "skip" | "rename";

export type CreateFormat = "7z" | "zip" | "tar" | "tar.gz" | "tar.xz" | "tar.bz2";

export interface CreateOptions {
  level: number;
  method?: string;
  password?: string;
  encryptNames?: boolean;
  zipEncryption?: "AES256" | "ZipCrypto";
  /** "100m", "4g", … or "" for one file. */
  volumeSize?: string;
  solid?: boolean;
}

export interface ExtractRequest {
  archive: string;
  destDir: string;
  paths?: string[];
  stripPrefix?: string;
  password?: string;
  overwrite?: OverwriteMode;
}

export interface ChecksumResult {
  name: string;
  path: string;
  size: number;
  hashes: Record<string, string>;
}

export interface LocalItem {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  exists: boolean;
}

/** Shell actions from the right-click menu (electron/start.cjs). */
export type TaskAction =
  | "extract-here"
  | "extract-to-folder"
  | "extract"
  | "test"
  | "add"
  | "compress-7z"
  | "compress-zip"
  | "checksums";

export type StartRequest =
  | { kind: "home" }
  | { kind: "open"; path: string }
  | { kind: "task"; action: TaskAction; paths: string[] };

export interface ShellIntegrationStatus {
  supported: boolean;
  enabled: boolean;
  stale: boolean;
}

export interface AppInfo {
  platform: string;
  version: string;
  sevenZip: string;
  formats: string[];
}

/** An error from the engine: code is ENEEDPASS, EBADPASS, ENOTARCHIVE, ECANCELLED, E7ZIP, … */
export interface CodedError extends Error {
  code?: string;
}

/** What electron/preload.cjs exposes as window.moonZip (and src/lib/demo.ts imitates). */
export interface MoonZipBridge {
  kind: "electron" | "demo";
  takeStart(): Promise<StartRequest>;
  info(): Promise<AppInfo>;
  shellIntegration(): Promise<ShellIntegrationStatus>;
  setShellIntegration(enabled: boolean): Promise<ShellIntegrationStatus>;

  list(archive: string, password?: string): Promise<Listing>;
  openEntry(opts: { archive: string; path: string; password?: string }): Promise<string>;
  folderFor(archive: string): Promise<string>;
  suggestName(paths: string[], ext: string): Promise<string>;

  extract(id: string, opts: ExtractRequest): Promise<{ destDir: string; warnings: string }>;
  create(
    id: string,
    opts: {
      archive: string;
      sources: string[];
      format: CreateFormat;
      options: CreateOptions;
      /** The user agreed to replace an existing file of that name (the Save dialog asked). */
      replace?: boolean;
    },
  ): Promise<{ archive: string; warnings: string }>;
  add(
    id: string,
    opts: {
      archive: string;
      sources: string[];
      intoDir?: string;
      password?: string;
      encryptNames?: boolean;
    },
  ): Promise<{ warnings: string }>;
  remove(
    id: string,
    opts: { archive: string; paths: string[]; password?: string },
  ): Promise<{ warnings: string }>;
  rename(
    id: string,
    opts: { archive: string; from: string; to: string; password?: string },
  ): Promise<{ warnings: string }>;
  test(id: string, opts: { archive: string; password?: string }): Promise<{ warnings: string }>;
  checksums(id: string, opts: { paths: string[]; algorithms: string[] }): Promise<ChecksumResult[]>;
  cancel(id: string): Promise<void>;

  stat(paths: string[]): Promise<LocalItem[]>;
  pathForFile(file: File): string;

  pickArchive(): Promise<string | null>;
  pickFiles(folders: boolean): Promise<string[]>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  pickSaveArchive(defaultPath: string): Promise<string | null>;

  open(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  openArchiveWindow(path: string): Promise<void>;
  newWindow(): Promise<void>;

  setTheme(theme: "dark" | "light"): Promise<void>;
  setIdle(idle: boolean): Promise<void>;
  setTitle(title: string): Promise<void>;
  close(): Promise<void>;
  devtools(): Promise<void>;

  on(channel: "job:progress", fn: (p: Progress & { id: string }) => void): () => void;
  on(channel: "open-archive", fn: (path: string) => void): () => void;
}
