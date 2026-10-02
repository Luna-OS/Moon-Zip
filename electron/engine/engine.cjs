"use strict";
// Moon Zip's archive engine: runs the bundled 7-Zip console tool (7z.exe with 7z.dll on Windows,
// 7zz on Linux for development) and reports progress. Everything the UI does with an archive goes
// through here. No Electron imports, so the tests run it under plain Node (engine.test.cjs).

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const args = require("./args.cjs");
const { parseListing, parseProgress, errorText, classifyFailure } = require("./listing.cjs");

const ROOT = path.join(__dirname, "..", "..");

/**
 * Where 7-Zip is: MOON_ZIP_7Z if set, the installed app's resources/7zip, then vendor/7zip from
 * npm run fetch-7zip, then a 7-Zip on PATH.
 */
function findSevenZip({
  resourcesPath = process.resourcesPath,
  env = process.env,
  platform = process.platform,
} = {}) {
  const exe = platform === "win32" ? "7z.exe" : "7zz";
  const candidates = [
    env.MOON_ZIP_7Z,
    resourcesPath && path.join(resourcesPath, "7zip", exe),
    path.join(ROOT, "vendor", "7zip", platform === "win32" ? "win-x64" : `${platform}-x64`, exe),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return exe;
}

let sevenZip = null;
const binary = () => (sevenZip ??= findSevenZip());

/** An error with a code (ENEEDPASS, EBADPASS, ENOTARCHIVE, ECANCELLED, E7ZIP) for the UI. */
function fail(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** The last few non-empty lines of 7-Zip's error output, without its progress redraws. */
function lastLines(text, n = 3) {
  return String(text)
    .split(/[\r\n\b]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+%/.test(l))
    .slice(-n)
    .join("\n");
}

/** A handle the UI can cancel; `kill` stops the running 7-Zip processes. */
function makeToken() {
  const children = new Set();
  return {
    cancelled: false,
    children,
    cancel() {
      this.cancelled = true;
      for (const c of children) c.kill();
    },
  };
}

/**
 * Runs 7-Zip with `argv`. Progress reports (-bsp1) go to onProgress({ percent, files, current }).
 * Resolves to the full output; rejects with a coded error when 7-Zip fails.
 */
function run(argv, { onProgress, token, cwd, passwordGiven = false, stdin, stdout: pipeOut } = {}) {
  return new Promise((resolve, reject) => {
    if (token && token.cancelled) return reject(fail("Cancelled.", "ECANCELLED"));
    const child = spawn(binary(), argv, {
      cwd,
      windowsHide: true,
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    if (token) token.children.add(child);
    if (stdin) stdin.pipe(child.stdin);
    let out = "";
    let err = "";
    const onChunk = (chunk) => {
      const s = chunk.toString("utf8");
      if (onProgress) {
        const p = parseProgress(s);
        if (p) onProgress(p);
      }
      return s;
    };
    if (pipeOut) child.stdout.pipe(pipeOut);
    else
      child.stdout.on("data", (c) => {
        out += onChunk(c);
        if (out.length > 64 << 20) out = out.slice(-1 << 20);
      });
    child.stderr.on("data", (c) => {
      err += onChunk(c);
    });
    child.on("error", (e) => {
      if (token) token.children.delete(child);
      reject(fail(`7-Zip could not be started (${e.message}).`, "ENO7ZIP"));
    });
    child.on("close", (code) => {
      if (token) token.children.delete(child);
      const all = `${out}\n${err}`;
      if (token && token.cancelled) return reject(fail("Cancelled.", "ECANCELLED"));
      // 1 is "warning" (e.g. a locked file was skipped): the work is done, so it isn't a failure.
      if (code === 0 || code === 1)
        return resolve({ stdout: out, stderr: err, warnings: code === 1 ? errorText(all) : "" });
      const kind = classifyFailure(all, { passwordGiven });
      const messages = {
        ENEEDPASS: "This archive is protected with a password.",
        EBADPASS: "The password is wrong.",
        ENOTARCHIVE: "This file isn't an archive Moon Zip can open, or it is damaged.",
      };
      const detail = errorText(all) || lastLines(err);
      reject(fail(messages[kind] || detail || `7-Zip stopped with code ${code}.`, kind || "E7ZIP"));
    });
  });
}

// ---------------------------------------------------------------- reading

async function list(archive, password) {
  const { stdout, warnings } = await run(args.listArgs(archive, password), {
    passwordGiven: !!password,
  });
  const result = parseListing(stdout);
  if (warnings) result.archive.warnings.push(warnings);
  return result;
}

async function test(archive, { password, onProgress, token } = {}) {
  const { warnings } = await run(args.testArgs(archive, password), {
    onProgress,
    token,
    passwordGiven: !!password,
  });
  return { ok: true, warnings };
}

// ---------------------------------------------------------------- extracting

async function exists(p) {
  try {
    await fsp.lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** "name (2).ext", "name (3).ext", … – the first free name in dir. */
async function freeName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; await exists(path.join(dir, candidate)); n++) candidate = `${base} (${n})${ext}`;
  return candidate;
}

/** Moves `from` to `to`, merging folders, with the overwrite rule for files that exist already. */
async function moveInto(from, to, overwrite) {
  const st = await fsp.lstat(from);
  if (st.isDirectory() && (await exists(to)) && (await fsp.lstat(to)).isDirectory()) {
    for (const name of await fsp.readdir(from))
      await moveInto(path.join(from, name), path.join(to, name), overwrite);
    return;
  }
  if (await exists(to)) {
    if (overwrite === "skip") return;
    if (overwrite === "rename")
      to = path.join(path.dirname(to), await freeName(path.dirname(to), path.basename(to)));
    else await fsp.rm(to, { recursive: true, force: true });
  }
  try {
    await fsp.rename(from, to);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    await fsp.cp(from, to, { recursive: true });
  }
}

/**
 * Extracts `paths` (or everything) from the archive into destDir. With `stripPrefix` (the archive
 * folder the user is looking at) the items land in destDir without that folder around them: 7-Zip
 * extracts into a hidden staging folder first, and the items are moved out of it.
 */
async function extract(
  { archive, destDir, paths = [], stripPrefix = "", password, overwrite = "overwrite" },
  { onProgress, token } = {},
) {
  await fsp.mkdir(destDir, { recursive: true });
  const prefix = stripPrefix.replace(/^\/+|\/+$/g, "");
  if (!prefix) {
    const { warnings } = await run(
      args.extractArgs(archive, destDir, { password, paths, overwrite }),
      {
        onProgress,
        token,
        passwordGiven: !!password,
      },
    );
    return { destDir, warnings };
  }
  const staging = path.join(destDir, `.moon-zip-${crypto.randomBytes(4).toString("hex")}`);
  try {
    const { warnings } = await run(
      args.extractArgs(archive, staging, { password, paths, overwrite: "overwrite" }),
      {
        onProgress,
        token,
        passwordGiven: !!password,
      },
    );
    const base = path.join(staging, ...prefix.split("/"));
    if (await exists(base))
      for (const name of await fsp.readdir(base))
        await moveInto(path.join(base, name), path.join(destDir, name), overwrite);
    return { destDir, warnings };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

/** The folder "Extract to <name>\" uses: the archive's name without its extensions, made unique. */
async function folderFor(archive) {
  const dir = path.dirname(archive);
  let name = path.basename(archive);
  name =
    name.replace(
      /\.(tar\.(gz|xz|bz2|zst)|tgz|tbz2?|txz|7z\.\d{3}|zip\.\d{3}|part\d+\.rar|[^.]+)$/i,
      "",
    ) || name;
  if (!(await exists(path.join(dir, name)))) return path.join(dir, name);
  return path.join(dir, await freeName(dir, name));
}

// ---------------------------------------------------------------- writing

/** Removes a half-written archive (and the volumes of a split one) after a failure or cancel. */
async function removePartial(archive) {
  await fsp.rm(archive, { force: true });
  const dir = path.dirname(archive);
  const base = path.basename(archive);
  for (const name of await fsp.readdir(dir).catch(() => []))
    if (/^\.\d{3}$/.test(name.slice(base.length)) && name.startsWith(base))
      await fsp.rm(path.join(dir, name), { force: true });
}

/**
 * Creates a new archive. An existing file of that name is never overwritten silently: without
 * `replace` this fails with EEXIST (main.cjs moves the old one to the Recycle Bin first when the
 * user confirmed replacing it).
 */
async function create(
  { archive, sources, format, options = {}, replace = false },
  { onProgress, token } = {},
) {
  if (!sources.length) throw fail("Nothing to compress.", "E7ZIP");
  if (await exists(archive)) {
    if (!replace)
      throw fail(`${path.basename(archive)} already exists. Choose another name.`, "EEXIST");
    await fsp.rm(archive, { force: true });
  }
  const plan = args.addArgs(archive, sources, format, options);
  try {
    if (plan.tar) {
      // tar → stdout → compressor. The tar step reports the progress.
      const { PassThrough } = require("stream");
      const pipe = new PassThrough();
      const compress = run(plan.compress, { token, stdin: pipe });
      const tar = run(plan.tar, { onProgress, token, stdout: pipe });
      const [, result] = await Promise.all([tar, compress]);
      return { archive, warnings: result.warnings };
    }
    const { warnings } = await run(plan.compress, { onProgress, token });
    return { archive, warnings };
  } catch (e) {
    await removePartial(archive).catch(() => {});
    throw e;
  }
}

/**
 * Lays out `sources` under `intoDir` in a temporary folder (hard links for files, junctions or
 * symbolic links for folders, a copy when linking isn't possible), so `7z a` stores them at that
 * place inside the archive. Returns the folder and the top-level name to add.
 */
async function stage(sources, intoDir) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "moon-zip-add-"));
  const parts = intoDir.split("/").filter(Boolean);
  const target = path.join(root, ...parts);
  await fsp.mkdir(target, { recursive: true });
  for (const src of sources) {
    const dst = path.join(target, path.basename(src));
    const st = await fsp.stat(src);
    try {
      if (st.isDirectory())
        await fsp.symlink(src, dst, process.platform === "win32" ? "junction" : "dir");
      else await fsp.link(src, dst);
    } catch {
      await fsp.cp(src, dst, { recursive: true });
    }
  }
  return { root, top: parts[0] };
}

/** Adds files and folders to an existing archive, at its root or inside the folder `intoDir`. */
async function add(
  { archive, sources, intoDir = "", password, encryptNames = false },
  { onProgress, token } = {},
) {
  const argv = (items) => {
    const a = args.updateArgs(archive, items, password);
    // Keep the names encrypted when the archive had them encrypted.
    if (password && encryptNames) a.splice(a.indexOf("--"), 0, "-mhe=on");
    return a;
  };
  if (!intoDir.replace(/\//g, "")) {
    const { warnings } = await run(argv(sources), { onProgress, token, passwordGiven: !!password });
    return { warnings };
  }
  const staged = await stage(sources, intoDir);
  try {
    // Without -snl, 7-Zip follows the links and stores the files themselves.
    const { warnings } = await run(argv([staged.top]), {
      onProgress,
      token,
      cwd: staged.root,
      passwordGiven: !!password,
    });
    return { warnings };
  } finally {
    await fsp.rm(staged.root, { recursive: true, force: true });
  }
}

async function remove({ archive, paths, password }, { onProgress, token } = {}) {
  const { warnings } = await run(args.deleteArgs(archive, paths, password), {
    onProgress,
    token,
    passwordGiven: !!password,
  });
  return { warnings };
}

async function rename({ archive, from, to, password }, { token } = {}) {
  const { warnings } = await run(args.renameArgs(archive, from, to, password), {
    token,
    passwordGiven: !!password,
  });
  return { warnings };
}

// ---------------------------------------------------------------- checksums

const HASHES = {
  crc32: () => {
    let crc = 0;
    return {
      update: (b) => (crc = zlib.crc32(b, crc)),
      digest: () => (crc >>> 0).toString(16).toUpperCase().padStart(8, "0"),
    };
  },
  md5: () => wrapHash("md5"),
  sha1: () => wrapHash("sha1"),
  sha256: () => wrapHash("sha256"),
  sha512: () => wrapHash("sha512"),
  blake2b: () => wrapHash("blake2b512"),
};

function wrapHash(name) {
  const h = crypto.createHash(name);
  return { update: (b) => h.update(b), digest: () => h.digest("hex") };
}

/** Lists the files below `paths` (folders recursively), sorted, with their sizes. */
async function filesBelow(paths) {
  const out = [];
  const visit = async (p, rel) => {
    const st = await fsp.stat(p);
    if (st.isDirectory()) {
      for (const name of (await fsp.readdir(p)).sort())
        await visit(path.join(p, name), `${rel}/${name}`);
    } else out.push({ path: p, name: rel, size: st.size });
  };
  for (const p of paths) await visit(p, path.basename(p));
  return out;
}

/** Hashes of every file below `paths`, read once for all algorithms. */
async function checksums(paths, algorithms = ["crc32", "sha256"], { onProgress, token } = {}) {
  const files = await filesBelow(paths);
  const total = files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  let last = 0;
  const results = [];
  for (const f of files) {
    if (token && token.cancelled) throw fail("Cancelled.", "ECANCELLED");
    const hs = algorithms.map((a) => HASHES[a]());
    for await (const chunk of fs.createReadStream(f.path, { highWaterMark: 1 << 20 })) {
      if (token && token.cancelled) throw fail("Cancelled.", "ECANCELLED");
      for (const h of hs) h.update(chunk);
      done += chunk.length;
      const percent = total ? Math.floor((done / total) * 100) : 100;
      if (onProgress && percent !== last)
        onProgress({ percent, files: results.length, current: f.name });
      last = percent;
    }
    results.push({
      name: f.name,
      path: f.path,
      size: f.size,
      hashes: Object.fromEntries(algorithms.map((a, i) => [a, hs[i].digest()])),
    });
  }
  return results;
}

module.exports = {
  findSevenZip,
  binary,
  makeToken,
  run,
  list,
  test,
  extract,
  folderFor,
  create,
  add,
  remove,
  rename,
  checksums,
  HASHES: Object.keys(HASHES),
  CREATE_FORMATS: args.CREATE_FORMATS,
};
