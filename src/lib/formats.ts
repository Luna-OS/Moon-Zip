import type { CreateFormat } from "./types";

/** Extensions Moon Zip opens as archives (a double-click inside an archive opens these in place). */
export const ARCHIVE_EXTENSIONS = new Set(
  (
    "7z zip rar tar gz tgz bz2 tbz tbz2 xz txz lzma z taz zst tzst cab iso wim swm esd arj lzh lha " +
    "cpio rpm deb dmg xar squashfs 001 apk jar xpi"
  ).split(" "),
);

export function isArchiveName(name: string): boolean {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return ARCHIVE_EXTENSIONS.has(ext);
}

export interface FormatInfo {
  id: CreateFormat;
  label: string;
  ext: string;
  hint: string;
  methods: string[];
  levels: boolean;
  password: boolean;
  encryptNames: boolean;
  volumes: boolean;
}

/** The formats of the Compress dialog, in the same order as electron/engine/args.cjs. */
export const CREATE_FORMATS: FormatInfo[] = [
  {
    id: "7z",
    label: "7z",
    ext: ".7z",
    hint: "Smallest, with AES-256 and hidden names",
    methods: ["LZMA2", "LZMA", "PPMd", "BZip2"],
    levels: true,
    password: true,
    encryptNames: true,
    volumes: true,
  },
  {
    id: "zip",
    label: "ZIP",
    ext: ".zip",
    hint: "Opens everywhere, Windows included",
    methods: ["Deflate", "Deflate64", "BZip2", "LZMA"],
    levels: true,
    password: true,
    encryptNames: false,
    volumes: true,
  },
  {
    id: "tar.gz",
    label: "tar.gz",
    ext: ".tar.gz",
    hint: "Linux and macOS, keeps permissions",
    methods: [],
    levels: true,
    password: false,
    encryptNames: false,
    volumes: false,
  },
  {
    id: "tar.xz",
    label: "tar.xz",
    ext: ".tar.xz",
    hint: "Like tar.gz, but smaller",
    methods: [],
    levels: true,
    password: false,
    encryptNames: false,
    volumes: false,
  },
  {
    id: "tar.bz2",
    label: "tar.bz2",
    ext: ".tar.bz2",
    hint: "The classic tarball",
    methods: [],
    levels: true,
    password: false,
    encryptNames: false,
    volumes: false,
  },
  {
    id: "tar",
    label: "tar",
    ext: ".tar",
    hint: "Packs without compressing",
    methods: [],
    levels: false,
    password: false,
    encryptNames: false,
    volumes: true,
  },
];

export const LEVELS = [
  { value: 0, label: "Store", hint: "No compression" },
  { value: 1, label: "Fastest", hint: "" },
  { value: 3, label: "Fast", hint: "" },
  { value: 5, label: "Normal", hint: "" },
  { value: 7, label: "Maximum", hint: "" },
  { value: 9, label: "Ultra", hint: "Slowest, smallest" },
];

export const VOLUME_PRESETS = [
  { value: "", label: "One file" },
  { value: "100m", label: "100 MB pieces" },
  { value: "700m", label: "700 MB (CD)" },
  { value: "4092m", label: "4 GB (FAT32)" },
];

export const HASH_ALGORITHMS = [
  { id: "crc32", label: "CRC-32" },
  { id: "md5", label: "MD5" },
  { id: "sha1", label: "SHA-1" },
  { id: "sha256", label: "SHA-256" },
  { id: "sha512", label: "SHA-512" },
  { id: "blake2b", label: "BLAKE2b" },
];

export function formatById(id: CreateFormat): FormatInfo {
  return CREATE_FORMATS.find((f) => f.id === id) ?? CREATE_FORMATS[0];
}

/** Replaces the archive extension of `path` with the one for `format`. */
export function withFormatExtension(path: string, format: CreateFormat): string {
  const known = CREATE_FORMATS.map((f) => f.ext.replace(".", "\\.")).join("|");
  const base = path.replace(new RegExp(`(${known})$`, "i"), "");
  return `${base}${formatById(format).ext}`;
}
