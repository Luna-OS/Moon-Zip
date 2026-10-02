"use strict";
// Moon Zip – Electron main process: the windows, the bridge to the 7-Zip engine and the Windows
// shell integration.
//
// Two kinds of windows load the same UI:
//   • archive windows (index.html): the start page or one open archive each;
//   • task windows (index.html#task): one right-click-menu action (Extract here, Compress to .zip, …)
//     with its progress, and its dialog first where it has one (Add to archive…, Extract to…).

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const engine = require("./engine/engine.cjs");
const shellIntegration = require("./shell-integration/index.cjs");
const { startFromArgv, Batcher } = require("./start.cjs");

const ROOT = path.join(__dirname, "..");
const BUILD = path.join(ROOT, "build");
// Matches FRAME_COLORS in src/theme/frame-colors.ts.
const FRAME = {
  dark: { color: "#0b0920", symbolColor: "#f4f1ff" },
  light: { color: "#ece7f7", symbolColor: "#1c1733" },
};
const TITLE_BAR_HEIGHT = 40;
// The task windows that show a dialog first need more room than a progress card.
const DIALOG_ACTIONS = new Set(["add", "extract", "checksums"]);

/** What each window was opened for, until its UI asks (sys:takeStart). */
const starts = new Map();
/** Running jobs by the id the UI gave them, so they can be cancelled. */
const jobs = new Map();
let tempRoot = null;

// ---------------------------------------------------------------- windows

function baseWindowOptions(theme = "dark") {
  return {
    show: false,
    backgroundColor: FRAME[theme].color,
    titleBarStyle: "hidden",
    titleBarOverlay: { ...FRAME[theme], height: TITLE_BAR_HEIGHT },
    icon: path.join(BUILD, "icon.png"),
    title: "Moon Zip",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  };
}

function load(win, hash = "") {
  if (process.env.MOON_DEV_URL) win.loadURL(`${process.env.MOON_DEV_URL}${hash ? `#${hash}` : ""}`);
  else win.loadFile(path.join(ROOT, "dist", "index.html"), hash ? { hash } : undefined);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.once("ready-to-show", () => win.show());
}

/** An archive window for `start` ({ kind: "home" } or { kind: "open", path }). */
function createArchiveWindow(start) {
  const win = new BrowserWindow({
    ...baseWindowOptions(),
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 480,
  });
  starts.set(win.webContents.id, start);
  load(win);
  if (process.env.MOON_SHOT) runScreenshotScript(win);
  return win;
}

function createTaskWindow(request) {
  const big = DIALOG_ACTIONS.has(request.action);
  const win = new BrowserWindow({
    ...baseWindowOptions(),
    width: big ? 660 : 580,
    height: big ? 700 : 380,
    minWidth: 480,
    minHeight: 300,
    maximizable: false,
  });
  starts.set(win.webContents.id, { kind: "task", ...request });
  load(win, "task");
  if (process.env.MOON_SHOT) runScreenshotScript(win);
  return win;
}

/** An archive window that still shows the start page, which can take the archive instead. */
function idleArchiveWindow() {
  return BrowserWindow.getAllWindows().find((w) => w.moonZipIdle && !w.isDestroyed()) || null;
}

/** Handles one (batched) start request: a window per archive, a task window per action. */
function handleStart({ action, paths }) {
  if (action === "home") {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else createArchiveWindow({ kind: "home" });
    return;
  }
  if (action === "open") {
    for (const p of paths) {
      app.addRecentDocument(p);
      const idle = idleArchiveWindow();
      if (idle) {
        idle.webContents.send("open-archive", p);
        idle.focus();
      } else createArchiveWindow({ kind: "open", path: p });
    }
    return;
  }
  createTaskWindow({ action, paths });
}

const batcher = new Batcher(handleStart);

// ---------------------------------------------------------------- helpers

const senderWindow = (e) => BrowserWindow.fromWebContents(e.sender);

async function sessionTemp() {
  if (!tempRoot) tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "moon-zip-"));
  return tempRoot;
}

/** Starts a job for the UI: progress goes to the window that asked, the result back as the answer. */
function job(e, id, fn) {
  const token = engine.makeToken();
  jobs.set(id, token);
  let last = 0;
  const onProgress = (p) => {
    const now = Date.now();
    if (now - last < 80 && p.percent < 100) return;
    last = now;
    if (!e.sender.isDestroyed()) e.sender.send("job:progress", { id, ...p });
  };
  return fn({ onProgress, token }).finally(() => jobs.delete(id));
}

let sevenZipVersion = null;
async function versionOf7Zip() {
  if (sevenZipVersion) return sevenZipVersion;
  try {
    const { stdout } = await engine.run([]);
    sevenZipVersion = (/7-Zip(?: \([a-z]\))? ([\d.]+)/.exec(stdout) || [])[1] || "";
  } catch {
    sevenZipVersion = "";
  }
  return sevenZipVersion;
}

async function statPaths(paths) {
  return Promise.all(
    paths.map(async (p) => {
      try {
        const st = await fsp.stat(p);
        return {
          path: p,
          name: path.basename(p),
          isDir: st.isDirectory(),
          size: st.isDirectory() ? 0 : st.size,
          exists: true,
        };
      } catch {
        return { path: p, name: path.basename(p), isDir: false, size: 0, exists: false };
      }
    }),
  );
}

/** A name for a new file in `dir` that doesn't exist yet: "name.zip", "name (2).zip", … */
function freeArchiveName(dir, base, ext) {
  let candidate = `${base}${ext}`;
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n++) candidate = `${base} (${n})${ext}`;
  return path.join(dir, candidate);
}

// ---------------------------------------------------------------- IPC

/** Every handler resolves to { ok, data } or { ok: false, error, code }; preload turns the latter into an Error. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      return { ok: true, data: await fn(e, ...args) };
    } catch (err) {
      return { ok: false, error: err.message, code: err.code };
    }
  });
}

function registerIpc() {
  handle("sys:takeStart", (e) => {
    const s = starts.get(e.sender.id) ?? { kind: "home" };
    starts.delete(e.sender.id);
    return s;
  });
  handle("sys:info", async () => ({
    platform: process.platform,
    version: app.getVersion(),
    sevenZip: await versionOf7Zip(),
    formats: Object.keys(engine.CREATE_FORMATS),
  }));
  handle("sys:shellIntegration", () => shellIntegration.status(app));
  handle("sys:setShellIntegration", (_e, enabled) =>
    shellIntegration.setEnabled(app, Boolean(enabled)),
  );

  handle("archive:list", (_e, archive, password) => engine.list(archive, password));
  handle("archive:openEntry", async (e, { archive, path: entryPath, password }) => {
    const dir = path.join(await sessionTemp(), crypto.randomBytes(4).toString("hex"));
    const prefix = entryPath.split("/").slice(0, -1).join("/");
    await engine.extract({
      archive,
      destDir: dir,
      paths: [entryPath],
      stripPrefix: prefix,
      password,
    });
    return path.join(dir, path.basename(entryPath));
  });
  handle("archive:folderFor", (_e, archive) => engine.folderFor(archive));
  handle("archive:suggestName", (_e, paths, ext) => {
    const dir = path.dirname(paths[0]);
    const one = path.basename(paths[0]);
    const isDir =
      paths.length === 1 && fs.existsSync(paths[0]) && fs.statSync(paths[0]).isDirectory();
    // One file: its name without the extension; one folder: its name; several: the folder they're in.
    const base =
      paths.length > 1
        ? path.basename(dir) || "Archive"
        : isDir
          ? one
          : one.replace(/\.[^.]+$/, "") || one;
    return freeArchiveName(dir, base, ext);
  });

  handle("job:extract", (e, id, opts) => job(e, id, (h) => engine.extract(opts, h)));
  handle("job:create", async (e, id, opts) => {
    // Replacing an archive the user picked in the Save dialog: the old one goes to the Recycle Bin.
    if (opts.replace && fs.existsSync(opts.archive))
      await shell.trashItem(opts.archive).catch(() => {});
    return job(e, id, (h) => engine.create(opts, h));
  });
  handle("job:add", (e, id, opts) => job(e, id, (h) => engine.add(opts, h)));
  handle("job:remove", (e, id, opts) => job(e, id, (h) => engine.remove(opts, h)));
  handle("job:rename", (e, id, opts) => job(e, id, (h) => engine.rename(opts, h)));
  handle("job:test", (e, id, opts) =>
    job(e, id, (h) => engine.test(opts.archive, { password: opts.password, ...h })),
  );
  handle("job:checksums", (e, id, opts) =>
    job(e, id, (h) => engine.checksums(opts.paths, opts.algorithms, h)),
  );
  handle("job:cancel", (_e, id) => {
    const t = jobs.get(id);
    if (t) t.cancel();
  });

  handle("fs:stat", (_e, paths) => statPaths(paths));

  handle("dialog:openArchive", async (e) => {
    const res = await dialog.showOpenDialog(senderWindow(e), {
      title: "Open an archive",
      properties: ["openFile"],
      filters: [
        {
          name: "Archives",
          extensions: require("./shell-integration/registry.cjs").ARCHIVE_EXTENSIONS,
        },
        { name: "All files", extensions: ["*"] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  handle("dialog:pickFiles", async (e, folders) => {
    const res = await dialog.showOpenDialog(senderWindow(e), {
      title: folders ? "Choose folders" : "Choose files",
      properties: [folders ? "openDirectory" : "openFile", "multiSelections"],
    });
    return res.canceled ? [] : res.filePaths;
  });
  handle("dialog:pickFolder", async (e, defaultPath) => {
    const res = await dialog.showOpenDialog(senderWindow(e), {
      title: "Choose a folder",
      defaultPath,
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  handle("dialog:saveArchive", async (e, defaultPath) => {
    const res = await dialog.showSaveDialog(senderWindow(e), {
      title: "Save the archive as",
      defaultPath,
    });
    return res.canceled ? null : res.filePath;
  });

  handle("shell:open", async (_e, p) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });
  handle("shell:reveal", (_e, p) => shell.showItemInFolder(p));
  handle("app:openArchive", (_e, p) => handleStart({ action: "open", paths: [p] }));
  handle("app:newWindow", () => createArchiveWindow({ kind: "home" }));

  handle("win:setTheme", (e, theme) => {
    const win = senderWindow(e);
    const colors = FRAME[theme] || FRAME.dark;
    if (!win) return;
    win.setBackgroundColor(colors.color);
    try {
      win.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT });
    } catch {
      /* not supported */
    }
  });
  handle("win:setIdle", (e, idle) => {
    const win = senderWindow(e);
    if (win) win.moonZipIdle = Boolean(idle);
  });
  handle("win:setTitle", (e, title) => senderWindow(e)?.setTitle(title));
  handle("win:close", (e) => senderWindow(e)?.close());
  handle("win:devtools", (e) => e.sender.toggleDevTools());
}

// ---------------------------------------------------------------- screenshots (development)

/**
 * MOON_SHOT=<folder> and optionally MOON_SCRIPT=<js file>: the script runs in the UI, may call
 * `await shot('name')`, and its return value goes to result.txt (as in Moon Explorer).
 */
function runScreenshotScript(win) {
  const outDir = process.env.MOON_SHOT;
  if (!ipcMain.listenerCount("dev:shot"))
    ipcMain.handle("dev:shot", async (e, name) => {
      const img = await e.sender.capturePage();
      await fsp.writeFile(path.join(outDir, `${name}.png`), img.toPNG());
    });
  win.webContents.once("did-finish-load", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const script = process.env.MOON_SCRIPT ? fs.readFileSync(process.env.MOON_SCRIPT, "utf8") : "";
    const result = await win.webContents
      .executeJavaScript(
        `(async () => {
      const shot = (n) => window.moonDev.shot(n);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let out;
      try { out = await (async () => { ${script}\n })(); } catch (e) { out = 'ERROR ' + (e && e.stack || e); }
      return String(out ?? '');
    })()`,
      )
      .catch((err) => `ERROR ${err.message}`);
    await fsp.writeFile(path.join(outDir, "result.txt"), result);
    if (!process.env.MOON_SHOT_KEEP) app.quit();
  });
}

// ---------------------------------------------------------------- start

if (process.env.MOON_SHOT) app.setPath("userData", path.join(process.env.MOON_SHOT, "userdata"));

if (shellIntegration.handleCliFlags(app)) {
  // --register-shell / --unregister-shell: nothing else to start.
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv, cwd) => batcher.push(startFromArgv(app, argv, cwd)));
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    batcher.push(startFromArgv(app, process.argv, process.cwd()));
    // After an update to another folder, point the right-click menu at this copy.
    if (app.isPackaged && process.platform === "win32") {
      shellIntegration
        .status(app)
        .then((s) => (s.stale ? shellIntegration.setEnabled(app, true) : null))
        .catch(() => {});
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    for (const t of jobs.values()) t.cancel();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  });
}
