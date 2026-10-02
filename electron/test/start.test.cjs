"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { parseArgs, normalizeArg, Batcher } = require("../start.cjs");

const opts = { cwd: "C:\\Users\\Luna", resolve: path.win32.resolve };

test("no file means the start page", () => {
  assert.deepEqual(parseArgs([], opts), { action: "home", paths: [] });
  assert.deepEqual(parseArgs(["--allow-file-access-from-files"], opts), {
    action: "home",
    paths: [],
  });
});

test("a file alone opens it", () => {
  assert.deepEqual(parseArgs(["C:\\a.zip"], opts), { action: "open", paths: ["C:\\a.zip"] });
  assert.deepEqual(parseArgs(["b.7z"], opts), { action: "open", paths: ["C:\\Users\\Luna\\b.7z"] });
});

test("a menu action with its file, whatever Chromium adds around it", () => {
  assert.deepEqual(
    parseArgs(["--extract-here", "--original-process-start-time=1", "C:\\a.zip"], opts),
    {
      action: "extract-here",
      paths: ["C:\\a.zip"],
    },
  );
  assert.deepEqual(parseArgs(["--compress-zip", "D:\\Photos"], opts), {
    action: "compress-zip",
    paths: ["D:\\Photos"],
  });
});

test("a drive root survives the %1 quoting", () => {
  assert.equal(normalizeArg('C:"'), "C:\\");
  assert.equal(normalizeArg('"C:\\x y\\z.zip"'), "C:\\x y\\z.zip");
});

test("Batcher merges one action's files that arrive together, and opens archives one by one", () => {
  const runs = [];
  const timers = [];
  const b = new Batcher((r) => runs.push(r), {
    delay: 10,
    setTimer: (fn) => (timers.push(fn), timers.length),
    clearTimer: (id) => (timers[id - 1] = null),
  });
  b.push({ action: "compress-zip", paths: ["C:\\a"] });
  b.push({ action: "compress-zip", paths: ["C:\\b", "C:\\a"] });
  b.push({ action: "open", paths: ["C:\\x.zip"] });
  assert.deepEqual(runs, [{ action: "open", paths: ["C:\\x.zip"] }]);
  for (const t of timers) if (t) t();
  assert.deepEqual(runs[1], { action: "compress-zip", paths: ["C:\\a", "C:\\b"] });
  assert.equal(runs.length, 2);
});
