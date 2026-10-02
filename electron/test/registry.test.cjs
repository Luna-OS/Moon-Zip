"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../shell-integration/registry.cjs");

const EXE = "C:\\Users\\Luna\\AppData\\Local\\Programs\\Moon Zip\\Moon Zip.exe";
const CLASSES = "HKEY_CURRENT_USER\\Software\\Classes";

test("everything lives under HKCU\\Software\\Classes (no admin rights)", () => {
  for (const [key] of registry.keys(EXE)) assert.ok(key.startsWith(`${CLASSES}\\`), key);
});

test("archives get the extract menu, everything gets the compress menu", () => {
  const keys = new Map(registry.keys(EXE));
  const zip = keys.get(`${CLASSES}\\SystemFileAssociations\\.zip\\shell\\MoonZip.Extract`);
  assert.equal(zip.MUIVerb, "Extract with Moon Zip");
  assert.equal(zip.ExtendedSubCommandsKey, "MoonZip.ExtractMenu");
  assert.equal(
    keys.get(`${CLASSES}\\*\\shell\\MoonZip.Compress`).ExtendedSubCommandsKey,
    "MoonZip.CompressMenu",
  );
  assert.equal(
    keys.get(`${CLASSES}\\Directory\\shell\\MoonZip.Compress`).MUIVerb,
    "Compress with Moon Zip",
  );
  assert.equal(
    keys.get(`${CLASSES}\\MoonZip.ExtractMenu\\shell\\02here\\command`)[""],
    `"${EXE}" --extract-here "%1"`,
  );
  assert.equal(
    keys.get(`${CLASSES}\\MoonZip.CompressMenu\\shell\\01add`).MultiSelectModel,
    "Player",
  );
});

test("Open with: a ProgID listed by each extension, never the default", () => {
  const keys = new Map(registry.keys(EXE));
  assert.deepEqual(keys.get(`${CLASSES}\\.7z\\OpenWithProgids`), { "MoonZip.Archive": "" });
  assert.equal(
    keys.get(`${CLASSES}\\.7z`),
    undefined,
    "the extension's default value stays untouched",
  );
  assert.equal(keys.get(`${CLASSES}\\MoonZip.Archive\\shell\\open\\command`)[""], `"${EXE}" "%1"`);
});

test("the .reg file escapes backslashes and quotes", () => {
  const reg = registry.regFile(EXE);
  assert.ok(reg.startsWith("Windows Registry Editor Version 5.00\r\n"));
  assert.ok(
    reg.includes(
      `@="\\"C:\\\\Users\\\\Luna\\\\AppData\\\\Local\\\\Programs\\\\Moon Zip\\\\Moon Zip.exe\\" --add \\"%1\\""`,
    ),
  );
});

test("switching off removes Moon Zip's own keys and only its value in shared keys", () => {
  const reg = registry.removalRegFile();
  assert.ok(reg.includes(`[-${CLASSES}\\MoonZip.ExtractMenu]`));
  assert.ok(reg.includes(`[-${CLASSES}\\*\\shell\\MoonZip.Compress]`));
  assert.ok(reg.includes(`[${CLASSES}\\.zip\\OpenWithProgids]\r\n"MoonZip.Archive"=-`));
  assert.ok(!reg.includes(`[-${CLASSES}\\.zip`), "never deletes an extension's key");
});

test("the marker command matches what keys() writes", () => {
  const { key, expected } = registry.marker(EXE);
  assert.equal(new Map(registry.keys(EXE)).get(key)[""], expected);
});
