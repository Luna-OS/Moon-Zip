"use strict";
// Command lines for 7-Zip. Pure functions (args.test.cjs checks them); engine.cjs runs them.
//
// Every command gets -sccUTF-8 (console output in UTF-8, so non-ASCII names survive on Windows),
// -bb0 and -y. Commands that read an archive always get a password switch: without one, 7-Zip
// would stop and wait for a password on the console. NO_PASSWORD stands in when the user gave
// none; 7-Zip then reports "Wrong password", which the engine turns into "a password is needed".

const NO_PASSWORD = "moon-zip:no-password";

const COMMON = ["-sccUTF-8", "-bb0", "-y"];
const PROGRESS = ["-bsp1", "-bso1", "-bse1"];

const readPassword = (password) => `-p${password || NO_PASSWORD}`;

/** Formats Moon Zip creates. `tar` is the inner type of the compressed tarballs. */
const CREATE_FORMATS = {
  "7z": { type: "7z", ext: ".7z", methods: ["LZMA2", "LZMA", "PPMd", "BZip2"], encrypt: true },
  zip: {
    type: "zip",
    ext: ".zip",
    methods: ["Deflate", "Deflate64", "BZip2", "LZMA"],
    encrypt: true,
  },
  tar: { type: "tar", ext: ".tar", methods: [], encrypt: false },
  "tar.gz": { type: "gzip", ext: ".tar.gz", methods: [], encrypt: false, tarball: true },
  "tar.xz": { type: "xz", ext: ".tar.xz", methods: [], encrypt: false, tarball: true },
  "tar.bz2": { type: "bzip2", ext: ".tar.bz2", methods: [], encrypt: false, tarball: true },
};

const LEVELS = [0, 1, 3, 5, 7, 9];

/** `7z l -slt` – the technical listing that listing.cjs parses. */
function listArgs(archive, password) {
  return ["l", "-slt", ...COMMON, readPassword(password), "--", archive];
}

/**
 * Extracts everything, or only `paths` (archive paths; a folder brings its contents along),
 * keeping the folder structure. overwrite: "overwrite" | "skip" | "rename".
 */
function extractArgs(archive, destDir, { password, paths = [], overwrite = "overwrite" } = {}) {
  const mode = { overwrite: "-aoa", skip: "-aos", rename: "-aou" }[overwrite] || "-aoa";
  return [
    "x",
    ...COMMON,
    ...PROGRESS,
    readPassword(password),
    mode,
    `-o${destDir}`,
    "--",
    archive,
    ...paths,
  ];
}

function testArgs(archive, password) {
  return ["t", ...COMMON, ...PROGRESS, readPassword(password), "--", archive];
}

function deleteArgs(archive, paths, password) {
  return [
    "d",
    ...COMMON,
    ...PROGRESS,
    ...(password ? [`-p${password}`] : []),
    "--",
    archive,
    ...paths,
  ];
}

function renameArgs(archive, from, to, password) {
  return [
    "rn",
    ...COMMON,
    ...PROGRESS,
    ...(password ? [`-p${password}`] : []),
    "--",
    archive,
    from,
    to,
  ];
}

/** The switches for one archive format and the user's choices in the Compress dialog. */
function formatSwitches(format, options = {}) {
  const f = CREATE_FORMATS[format];
  if (!f) throw new Error(`Moon Zip can't create ${format} archives.`);
  const level = LEVELS.includes(Number(options.level)) ? Number(options.level) : 5;
  const out = [`-t${format === "tar" ? "tar" : f.type}`];
  if (format !== "tar") out.push(`-mx${level}`);
  if (f.methods.length && options.method && f.methods.includes(options.method) && level > 0)
    out.push(`-m0=${options.method}`);
  if (format === "7z" && options.solid === false) out.push("-ms=off");
  if (options.password) {
    if (!f.encrypt) throw new Error(`${format} archives can't have a password.`);
    out.push(`-p${options.password}`);
    if (format === "7z" && options.encryptNames) out.push("-mhe=on");
    if (format === "zip")
      out.push(`-mem=${options.zipEncryption === "ZipCrypto" ? "ZipCrypto" : "AES256"}`);
  }
  if (options.volumeSize && /^\d+[kmg]?$/i.test(String(options.volumeSize)))
    out.push(`-v${String(options.volumeSize).toLowerCase()}`);
  return out;
}

/**
 * Creates (or adds to) `archive` from `sources`. 7-Zip stores each source under its own name,
 * with folders' contents below it. For .tar.gz and friends this is two commands: tarArgs writes
 * the tar to stdout and these arguments compress stdin.
 */
function addArgs(archive, sources, format, options = {}) {
  const f = CREATE_FORMATS[format];
  if (f && f.tarball) {
    // The tar's name inside: the archive's name without .gz/.xz/.bz2 (either kind of slash).
    const name = archive
      .split(/[\\/]/)
      .pop()
      .replace(/\.(gz|xz|bz2)$/i, "");
    return {
      tar: ["a", ...COMMON, "-ttar", "-so", "-an", "-bsp2", "-bse2", "--", ...sources],
      compress: [
        "a",
        ...COMMON,
        "-bso0",
        "-bsp0",
        "-bse1",
        ...formatSwitches(format, options),
        `-si${name}`,
        "--",
        archive,
      ],
    };
  }
  return {
    compress: [
      "a",
      ...COMMON,
      ...PROGRESS,
      ...formatSwitches(format, options),
      "--",
      archive,
      ...sources,
    ],
  };
}

/** Adds to an existing archive of any type 7-Zip can update; it keeps the archive's own format. */
function updateArgs(archive, sources, password) {
  return [
    "a",
    ...COMMON,
    ...PROGRESS,
    ...(password ? [`-p${password}`] : []),
    "--",
    archive,
    ...sources,
  ];
}

module.exports = {
  NO_PASSWORD,
  CREATE_FORMATS,
  LEVELS,
  listArgs,
  extractArgs,
  testArgs,
  deleteArgs,
  renameArgs,
  formatSwitches,
  addArgs,
  updateArgs,
};
