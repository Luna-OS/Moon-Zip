"use strict";
// Moon Zip in the Windows right-click menu and in "Open with", for the signed-in user only
// (HKCU\Software\Classes, no administrator rights). Pure functions that describe the keys; the
// index.cjs next to this file writes them with reg.exe. See docs/shell-integration.md.
//
//   Right-click an archive        → "Extract with Moon Zip" ▸ Open in Moon Zip, Extract here,
//                                    Extract to new folder, Extract to…, Test archive
//   Right-click any file / folder → "Compress with Moon Zip" ▸ Add to archive…, Compress to .7z,
//                                    Compress to .zip, Checksums…
//
// Both menus share their items through ExtendedSubCommandsKey, so each item exists once.

const CLASSES = "HKEY_CURRENT_USER\\Software\\Classes";
const PROG_ID = "MoonZip.Archive";
const EXTRACT_MENU = "MoonZip.ExtractMenu";
const COMPRESS_MENU = "MoonZip.CompressMenu";
const EXTRACT_VERB = "MoonZip.Extract";
const COMPRESS_VERB = "MoonZip.Compress";

/** Archive types that get the extract menu and an "Open with Moon Zip" entry. */
const ARCHIVE_EXTENSIONS = [
  "7z",
  "zip",
  "rar",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "tbz",
  "tbz2",
  "xz",
  "txz",
  "lzma",
  "z",
  "taz",
  "zst",
  "tzst",
  "cab",
  "iso",
  "img",
  "wim",
  "swm",
  "esd",
  "arj",
  "lzh",
  "lha",
  "cpio",
  "rpm",
  "deb",
  "dmg",
  "xar",
  "squashfs",
  "001",
];

const EXTRACT_ITEMS = [
  ["01open", "Open in Moon Zip", "--open"],
  ["02here", "Extract here", "--extract-here"],
  ["03folder", "Extract to new folder", "--extract-to-folder"],
  ["04to", "Extract to…", "--extract"],
  ["05test", "Test archive", "--test"],
];
const COMPRESS_ITEMS = [
  ["01add", "Add to archive…", "--add"],
  ["02seven", "Compress to .7z", "--compress-7z"],
  ["03zip", "Compress to .zip", "--compress-zip"],
  ["04hash", "Checksums…", "--checksums"],
];

/** A .reg string value: backslashes and quotes escaped. */
const regString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The command a menu item runs: the app with the action and the clicked file. */
const command = (exe, flag) => `"${exe}" ${flag} "%1"`;

/**
 * Every key Moon Zip writes, as [key path, { valueName: data }] ("" is the default value).
 * `exe` is the full path of Moon Zip.exe.
 */
function keys(exe) {
  const icon = `"${exe}",0`;
  const out = [];
  const add = (key, values = {}) => out.push([`${CLASSES}\\${key}`, values]);

  // The two shared submenus.
  for (const [menu, items] of [
    [EXTRACT_MENU, EXTRACT_ITEMS],
    [COMPRESS_MENU, COMPRESS_ITEMS],
  ]) {
    add(menu);
    add(`${menu}\\shell`);
    for (const [id, label, flag] of items) {
      // "Player" keeps the item visible however many files are selected.
      add(`${menu}\\shell\\${id}`, { MUIVerb: label, Icon: icon, MultiSelectModel: "Player" });
      add(`${menu}\\shell\\${id}\\command`, { "": command(exe, flag) });
    }
  }

  const cascade = (label, menu) => ({ MUIVerb: label, Icon: icon, ExtendedSubCommandsKey: menu });
  add(`*\\shell\\${COMPRESS_VERB}`, cascade("Compress with Moon Zip", COMPRESS_MENU));
  add(`Directory\\shell\\${COMPRESS_VERB}`, cascade("Compress with Moon Zip", COMPRESS_MENU));

  // "Open with" and the archive menu, without taking over the user's default app.
  add(PROG_ID, { "": "Archive", FriendlyTypeName: "Archive" });
  add(`${PROG_ID}\\DefaultIcon`, { "": icon });
  add(`${PROG_ID}\\shell\\open\\command`, { "": `"${exe}" "%1"` });
  add(`Applications\\Moon Zip.exe`, { FriendlyAppName: "Moon Zip" });
  add(`Applications\\Moon Zip.exe\\shell\\open\\command`, { "": `"${exe}" "%1"` });
  add(
    `Applications\\Moon Zip.exe\\SupportedTypes`,
    Object.fromEntries(ARCHIVE_EXTENSIONS.map((e) => [`.${e}`, ""])),
  );
  for (const ext of ARCHIVE_EXTENSIONS) {
    add(`.${ext}\\OpenWithProgids`, { [PROG_ID]: "" });
    add(
      `SystemFileAssociations\\.${ext}\\shell\\${EXTRACT_VERB}`,
      cascade("Extract with Moon Zip", EXTRACT_MENU),
    );
  }
  return out;
}

/** The keys as a .reg file (reg.exe import reads UTF-16 LE with a BOM; index.cjs encodes it). */
function regFile(exe) {
  const lines = ["Windows Registry Editor Version 5.00", ""];
  for (const [key, values] of keys(exe)) {
    lines.push(`[${key}]`);
    for (const [name, data] of Object.entries(values))
      lines.push(`${name === "" ? "@" : regString(name)}=${regString(data)}`);
    lines.push("");
  }
  return lines.join("\r\n");
}

/**
 * What to delete when the integration is switched off: whole keys Moon Zip owns, and single values
 * in keys it shares with other apps (the extensions' OpenWithProgids).
 */
function removals() {
  const ownKeys = [
    EXTRACT_MENU,
    COMPRESS_MENU,
    PROG_ID,
    "Applications\\Moon Zip.exe",
    `*\\shell\\${COMPRESS_VERB}`,
    `Directory\\shell\\${COMPRESS_VERB}`,
    ...ARCHIVE_EXTENSIONS.map((e) => `SystemFileAssociations\\.${e}\\shell\\${EXTRACT_VERB}`),
  ].map((k) => `${CLASSES}\\${k}`);
  const values = ARCHIVE_EXTENSIONS.map((e) => [`${CLASSES}\\.${e}\\OpenWithProgids`, PROG_ID]);
  return { keys: ownKeys, values };
}

/** The removals as a .reg file: [-key] deletes a key, "name"=- a single value. */
function removalRegFile() {
  const { keys: ownKeys, values } = removals();
  const lines = ["Windows Registry Editor Version 5.00", ""];
  for (const key of ownKeys) lines.push(`[-${key}]`, "");
  for (const [key, name] of values) lines.push(`[${key}]`, `${regString(name)}=-`, "");
  return lines.join("\r\n");
}

/** The key whose presence means "switched on", and the command it must hold for this exe. */
function marker(exe) {
  return {
    key: `${CLASSES}\\${COMPRESS_MENU}\\shell\\01add\\command`,
    expected: command(exe, "--add"),
  };
}

module.exports = {
  ARCHIVE_EXTENSIONS,
  EXTRACT_ITEMS,
  COMPRESS_ITEMS,
  PROG_ID,
  keys,
  regFile,
  removals,
  removalRegFile,
  marker,
  command,
};
