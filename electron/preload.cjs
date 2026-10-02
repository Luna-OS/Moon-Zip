"use strict";
// The bridge between the UI and the main process. Its shape is the MoonZipBridge type in src/lib/types.ts.
//
// An Error thrown across the context bridge arrives with its message only, and the UI needs the code
// (ENEEDPASS, …). So every call resolves to an envelope { __envelope, ok, data | error, code }, and
// src/lib/bridge.ts turns a failed one back into an Error with its code.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  return { __envelope: true, ...res };
}

const EVENTS = new Set(["job:progress", "open-archive"]);

if (process.env.MOON_SHOT) {
  contextBridge.exposeInMainWorld("moonDev", {
    shot: (name) => ipcRenderer.invoke("dev:shot", name),
  });
}

// MOON_DEMO=1 (screenshots): the UI runs on the in-memory demo (src/lib/demo.ts) instead of the
// real bridge; MOON_DEMO_START may hold the window's start request as JSON.
if (process.env.MOON_DEMO) {
  contextBridge.exposeInMainWorld("moonZipDemo", {
    start: process.env.MOON_DEMO_START ? JSON.parse(process.env.MOON_DEMO_START) : null,
  });
}

const bridge = {
  kind: "electron",
  takeStart: () => call("sys:takeStart"),
  info: () => call("sys:info"),
  shellIntegration: () => call("sys:shellIntegration"),
  setShellIntegration: (enabled) => call("sys:setShellIntegration", enabled),

  list: (archive, password) => call("archive:list", archive, password),
  openEntry: (opts) => call("archive:openEntry", opts),
  folderFor: (archive) => call("archive:folderFor", archive),
  suggestName: (paths, ext) => call("archive:suggestName", paths, ext),

  extract: (id, opts) => call("job:extract", id, opts),
  create: (id, opts) => call("job:create", id, opts),
  add: (id, opts) => call("job:add", id, opts),
  remove: (id, opts) => call("job:remove", id, opts),
  rename: (id, opts) => call("job:rename", id, opts),
  test: (id, opts) => call("job:test", id, opts),
  checksums: (id, opts) => call("job:checksums", id, opts),
  cancel: (id) => call("job:cancel", id),

  stat: (paths) => call("fs:stat", paths),
  pathForFile: (file) => webUtils.getPathForFile(file),

  pickArchive: () => call("dialog:openArchive"),
  pickFiles: (folders) => call("dialog:pickFiles", folders),
  pickFolder: (defaultPath) => call("dialog:pickFolder", defaultPath),
  pickSaveArchive: (defaultPath) => call("dialog:saveArchive", defaultPath),

  open: (p) => call("shell:open", p),
  reveal: (p) => call("shell:reveal", p),
  openArchiveWindow: (p) => call("app:openArchive", p),
  newWindow: () => call("app:newWindow"),

  setTheme: (theme) => call("win:setTheme", theme),
  setIdle: (idle) => call("win:setIdle", idle),
  setTitle: (title) => call("win:setTitle", title),
  close: () => call("win:close"),
  devtools: () => call("win:devtools"),

  on(channel, fn) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event ${channel}`);
    const listener = (_e, data) => fn(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

if (!process.env.MOON_DEMO) contextBridge.exposeInMainWorld("moonZip", bridge);
