"use strict";
// Switches Moon Zip's right-click menu and "Open with" entries on and off (registry.cjs has the keys).
// Settings → "Show Moon Zip in the right-click menu" calls setEnabled; the installer runs
// `Moon Zip.exe --register-shell` from its finish page, and the uninstaller `--unregister-shell`.

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const registry = require("./registry.cjs");

const REG = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");

function reg(args) {
  return new Promise((resolve) => {
    execFile(REG, args, { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || "") }),
    );
  });
}

/** Imports a .reg file's text (reg.exe wants UTF-16 LE with a byte order mark). */
async function importReg(text) {
  const file = path.join(os.tmpdir(), `moon-zip-${process.pid}-${Date.now()}.reg`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
  try {
    const res = await reg(["import", file]);
    if (!res.ok) throw new Error(res.stderr.trim() || "reg.exe import failed.");
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const exePath = (app) => app.getPath("exe");

/** { supported, enabled, stale }: stale means it's on, but for another copy of Moon Zip. */
async function status(app) {
  if (process.platform !== "win32") return { supported: false, enabled: false, stale: false };
  const { key, expected } = registry.marker(exePath(app));
  const res = await reg(["query", key, "/ve"]);
  if (!res.ok) return { supported: true, enabled: false, stale: false };
  const enabled = res.stdout.includes(expected);
  return { supported: true, enabled, stale: !enabled };
}

async function setEnabled(app, enabled) {
  if (process.platform !== "win32")
    throw new Error("The right-click menu is only available on Windows.");
  await importReg(enabled ? registry.regFile(exePath(app)) : registry.removalRegFile());
  return status(app);
}

/**
 * --register-shell / --unregister-shell: do the work and quit without a window (the installer and
 * uninstaller wait for this). Returns true when one of the flags was given.
 */
function handleCliFlags(app) {
  const flag = process.argv.find((a) => a === "--register-shell" || a === "--unregister-shell");
  if (!flag) return false;
  app.whenReady().then(async () => {
    try {
      await setEnabled(app, flag === "--register-shell");
      app.exit(0);
    } catch (e) {
      console.error(e.message);
      app.exit(1);
    }
  });
  return true;
}

module.exports = { status, setEnabled, handleCliFlags };
