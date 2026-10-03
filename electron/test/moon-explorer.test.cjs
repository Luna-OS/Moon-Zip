"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const moonExplorer = require("../moon-explorer.cjs");

const env = { LOCALAPPDATA: "C:\\Users\\Luna\\AppData\\Local", ProgramFiles: "C:\\Program Files" };
const exe = (dir) => `${dir}\\Moon Explorer.exe`;

test("finds Moon Explorer where its installer recorded it", async () => {
  const found = await moonExplorer.find({
    platform: "win32",
    env,
    installLocation: async (hive) => (hive === "HKCU" ? "D:\\Apps\\Moon Explorer" : null),
    exists: (p) => p === exe("D:\\Apps\\Moon Explorer"),
    version: () => "0.3.1",
  });
  assert.deepEqual(found, { exe: exe("D:\\Apps\\Moon Explorer"), version: "0.3.1", picker: true });
});

test("falls back to the default install folders", async () => {
  const perUser = exe("C:\\Users\\Luna\\AppData\\Local\\Programs\\Moon Explorer");
  const found = await moonExplorer.find({
    platform: "win32",
    env,
    installLocation: async () => null,
    exists: (p) => p === perUser,
    version: () => "0.2.1",
  });
  assert.equal(found.exe, perUser);
  assert.equal(found.picker, false, "0.2.x has no Open/Save dialog yet");
});

test("no Moon Explorer, or not on Windows: null", async () => {
  const none = {
    env,
    installLocation: async () => "C:\\Gone",
    exists: () => false,
    version: () => null,
  };
  assert.equal(await moonExplorer.find({ platform: "win32", ...none }), null);
  assert.equal(await moonExplorer.find({ platform: "linux", ...none, exists: () => true }), null);
});

test("version check for the dialog", () => {
  assert.equal(moonExplorer.atLeast("0.3.0", "0.3.0"), true);
  assert.equal(moonExplorer.atLeast("0.3.1", "0.3.0"), true);
  assert.equal(moonExplorer.atLeast("1.0.0", "0.3.0"), true);
  assert.equal(moonExplorer.atLeast("0.2.9", "0.3.0"), false);
  assert.equal(moonExplorer.atLeast(null, "0.3.0"), false);
});

test("the dialog command lines follow Moon Explorer's docs/picker.md", () => {
  assert.deepEqual(
    moonExplorer.pickerArgs(
      {
        mode: "save",
        title: "Save the archive as",
        name: "Moon trip.7z",
        startDir: "C:\\Users\\Luna",
        filters: [
          { label: "Archive", extensions: ["7z"] },
          { label: "All files", extensions: ["*"] },
        ],
      },
      "C:\\Temp\\r.txt",
    ),
    [
      "--save-dialog",
      "--picker-title",
      "Save the archive as",
      "--name",
      "Moon trip.7z",
      "--start-dir",
      "C:\\Users\\Luna",
      "--filter",
      "Archive:7z",
      "--filter",
      "All files:*",
      "--result",
      "C:\\Temp\\r.txt",
    ],
  );
  assert.deepEqual(moonExplorer.pickerArgs({ mode: "folder" }, "r.txt"), [
    "--pick-folder",
    "--result",
    "r.txt",
  ]);
  assert.throws(() => moonExplorer.pickerArgs({ mode: "print" }, "r.txt"), /Unknown dialog/);
});
