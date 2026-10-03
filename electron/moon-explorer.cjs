"use strict";
// Moon Zip uses Moon Explorer instead of Windows Explorer when it is installed (Settings →
// "Use Moon Explorer"): extracted files and new archives are shown in it, and its own Open/Save
// dialog picks archives, folders and where to save. Without it, Windows Explorer and the Windows
// dialogs are used as before. See docs/moon-explorer.md.
//
// Moon Explorer takes a folder on its command line (opens it in a new tab) or a file (opens its
// folder with the file selected), and since 0.3.0 runs as a dialog with
// --open-dialog / --save-dialog / --pick-folder … --result <file> (Moon-Explorer's docs/picker.md).

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXE = "Moon Explorer.exe";
/**
 * Moon Explorer's installer (electron-builder) records its folder as InstallLocation under
 * Software\<guid>, in HKCU for a per-user install and in HKLM for one for all users. The guid is
 * UUID v5 of its appId "os.luna.moon-explorer" in electron-builder's namespace.
 */
const INSTALL_KEY = "Software\\74cedd07-97eb-5d75-a049-4f2e38bde0fe";
/** The first Moon Explorer with the Open/Save dialog. */
const PICKER_VERSION = "0.3.0";

/** reg.exe query <hive>\<key> /v InstallLocation → the folder, or null. */
function readInstallLocation(hive) {
  const reg = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");
  return new Promise((resolve) => {
    execFile(
      reg,
      ["query", `${hive}\\${INSTALL_KEY}`, "/v", "InstallLocation"],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = /InstallLocation\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(String(stdout));
        resolve(m ? m[1].trim() : null);
      },
    );
  });
}

/**
 * The version of the Moon Explorer next to `exe`, from its package.json inside resources\app.asar
 * (Electron's fs reads into asar archives), or null.
 */
function readVersion(exe) {
  try {
    const pkg = path.join(path.dirname(exe), "resources", "app.asar", "package.json");
    return String(JSON.parse(fs.readFileSync(pkg, "utf8")).version || "") || null;
  } catch {
    return null;
  }
}

/** "0.3.1" ≥ "0.3.0"? Missing parts count as 0; an unknown version is too old. */
function atLeast(version, wanted) {
  if (!version) return false;
  const a = String(version)
    .split(/[.-]/)
    .map((n) => parseInt(n, 10) || 0);
  const b = wanted.split(".").map(Number);
  for (let i = 0; i < b.length; i++) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
}

/**
 * The installed Moon Explorer: { exe, version, picker } or null. Looks at the install folders its
 * installer recorded, then at the default per-user and per-machine folders.
 */
async function find({
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync,
  installLocation = readInstallLocation,
  version = readVersion,
} = {}) {
  if (platform !== "win32") return null;
  const recorded = await Promise.all([installLocation("HKCU"), installLocation("HKLM")]);
  const candidates = [
    ...recorded.filter(Boolean).map((dir) => path.win32.join(dir, EXE)),
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Programs", "Moon Explorer", EXE),
    env.ProgramFiles && path.win32.join(env.ProgramFiles, "Moon Explorer", EXE),
  ].filter(Boolean);
  const exe = candidates.find((c) => exists(c));
  if (!exe) return null;
  const v = version(exe);
  return { exe, version: v, picker: atLeast(v, PICKER_VERSION) };
}

/** Starts Moon Explorer on its own (it outlives Moon Zip); false when it couldn't be started. */
function launch(exe, args) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/** Opens a folder in a new Moon Explorer tab, or a file's folder with the file selected. */
function show(exe, target) {
  return launch(exe, [target]);
}

/**
 * The command line for Moon Explorer's dialog. mode: "open" | "save" | "folder";
 * filters: [{ label, extensions }] ("*" is every file).
 */
function pickerArgs({ mode, title, name, startDir, filters = [] }, resultFile) {
  const flag = { open: "--open-dialog", save: "--save-dialog", folder: "--pick-folder" }[mode];
  if (!flag) throw new Error(`Unknown dialog ${mode}`);
  const args = [flag];
  if (title) args.push("--picker-title", title);
  if (name) args.push("--name", name);
  if (startDir) args.push("--start-dir", startDir);
  for (const f of filters) args.push("--filter", `${f.label}:${f.extensions.join(",")}`);
  args.push("--result", resultFile);
  return args;
}

/**
 * Shows Moon Explorer's Open/Save/Folder dialog and waits for it: the chosen path, or null when
 * the user cancelled. Rejects when Moon Explorer couldn't be started.
 */
function pick(exe, options) {
  const resultFile = path.join(os.tmpdir(), `moon-zip-pick-${process.pid}-${Date.now()}.txt`);
  return new Promise((resolve, reject) => {
    const child = spawn(exe, pickerArgs(options, resultFile), { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", () => {
      let chosen = "";
      try {
        chosen = fs.readFileSync(resultFile, "utf8").trim();
      } catch {
        /* cancelled before anything was written */
      }
      fs.rmSync(resultFile, { force: true });
      resolve(chosen || null);
    });
  });
}

module.exports = { find, show, pick, pickerArgs, atLeast, INSTALL_KEY, EXE, PICKER_VERSION };
