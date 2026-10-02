"use strict";
// What Moon Zip was started for. The Windows right-click menu (shell-integration) starts it with an
// action and one file, e.g. `"Moon Zip.exe" --extract-here "C:\x.zip"`; a double-click on an
// archive starts it with just the file. Explorer starts one process per selected file, so the
// first instance collects requests that arrive close together (see Batcher) and runs them as one.

const path = require("path");

/** Command-line actions and whether they open a window with a dialog first. */
const ACTIONS = {
  "--open": "open",
  "--extract-here": "extract-here",
  "--extract-to-folder": "extract-to-folder",
  "--extract": "extract",
  "--test": "test",
  "--add": "add",
  "--compress-7z": "compress-7z",
  "--compress-zip": "compress-zip",
  "--checksums": "checksums",
};

/** Flags that change nothing about what to open (Electron's and Chromium's own, the installer's). */
const isSwitch = (a) => a.startsWith("-");

/** A drive root registered as "%1" arrives as `C:"`, because in `"C:\"` the backslash escapes the quote. */
function normalizeArg(raw) {
  let s = String(raw).trim();
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  if (/^[a-zA-Z]:$/.test(s)) s = `${s.toUpperCase()}\\`;
  return s;
}

/**
 * @returns {{ action: string, paths: string[] }} – action "home" (no file), "open" (a double-clicked
 *   archive) or one of ACTIONS.
 */
function parseArgs(args, { cwd = process.cwd(), resolve = path.win32.resolve } = {}) {
  let action = null;
  const paths = [];
  for (const raw of args || []) {
    if (ACTIONS[raw]) {
      action ??= ACTIONS[raw];
      continue;
    }
    const arg = normalizeArg(raw);
    if (!arg || isSwitch(arg)) continue;
    paths.push(resolve(cwd, arg));
  }
  if (!paths.length) return { action: "home", paths: [] };
  return { action: action ?? "open", paths };
}

function startFromArgv(app, argv, cwd) {
  const resolve = process.platform === "win32" ? path.win32.resolve : path.resolve;
  // A development run is `electron . <file>`: the app folder itself is no file to open.
  const appPath = app.isPackaged ? null : resolve(app.getAppPath());
  const args = argv
    .slice(1)
    .filter((a) => !appPath || resolve(cwd || process.cwd(), normalizeArg(a)) !== appPath);
  return parseArgs(args, { cwd, resolve });
}

/**
 * Collects requests of the same action that arrive within `delay` ms of each other and hands them on
 * as one (`run({ action, paths })`). "open" and "home" are never merged: each archive gets its window.
 */
class Batcher {
  constructor(run, { delay = 700, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.run = run;
    this.delay = delay;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pending = new Map();
  }

  push(request) {
    if (request.action === "home" || request.action === "open") {
      this.run(request);
      return;
    }
    const slot = this.pending.get(request.action) ?? { paths: [], timer: null };
    for (const p of request.paths) if (!slot.paths.includes(p)) slot.paths.push(p);
    if (slot.timer) this.clearTimer(slot.timer);
    slot.timer = this.setTimer(() => {
      this.pending.delete(request.action);
      this.run({ action: request.action, paths: slot.paths });
    }, this.delay);
    this.pending.set(request.action, slot);
  }
}

module.exports = { parseArgs, startFromArgv, normalizeArg, Batcher, ACTIONS };
