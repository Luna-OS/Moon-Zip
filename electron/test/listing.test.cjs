"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseListing,
  parseProgress,
  parseTime,
  classifyFailure,
  errorText,
} = require("../engine/listing.cjs");

const SEVEN_Z = `
7-Zip (z) 26.03 (x64) : Copyright (c) 1999-2026 Igor Pavlov : 2026-09-03

Scanning the drive for archives:
1 file, 300253 bytes (294 KiB)

Listing archive: plain.7z

--
Path = plain.7z
Type = 7z
Physical Size = 300253
Headers Size = 223
Method = LZMA2:384k
Solid = +
Blocks = 1

----------
Path = docs
Size = 0
Packed Size = 0
Modified = 2026-10-02 20:37:41.1708971
Attributes = D drwxr-xr-x
CRC = 
Encrypted = -
Method = 
Block = 

Path = docs\\inner\\ü.txt
Size = 2
Packed Size = 
Modified = 2026-10-02 20:37:41.1717212
Attributes = A -rw-r--r--
CRC = 46EA081F
Encrypted = +
Method = LZMA2:384k 7zAES:19
Block = 0
`;

test("parses the archive block and the items of a 7z listing", () => {
  const { archive, entries } = parseListing(SEVEN_Z);
  assert.equal(archive.type, "7z");
  assert.equal(archive.physicalSize, 300253);
  assert.equal(archive.solid, true);
  assert.equal(archive.blocks, 1);
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((e) => [e.path, e.isDir, e.size, e.packed, e.encrypted]),
    [
      ["docs", true, 0, 0, false],
      // Windows backslashes become slashes; an empty packed size stays unknown.
      ["docs/inner/ü.txt", false, 2, null, true],
    ],
  );
  assert.equal(entries[1].crc, "46EA081F");
  assert.equal(entries[1].mtime, new Date(2026, 9, 2, 20, 37, 41, 171).getTime());
});

test("ZIP folders come from Folder = +", () => {
  const { entries } = parseListing(
    `--\nPath = a.zip\nType = zip\n\n----------\nPath = dir/\nFolder = +\nSize = 0\n\nPath = dir/f.txt\nFolder = -\nSize = 5\nPacked Size = 3\n`,
  );
  assert.deepEqual(
    entries.map((e) => [e.path, e.isDir]),
    [
      ["dir", true],
      ["dir/f.txt", false],
    ],
  );
});

test("a .tar.gz reports both layers", () => {
  const { archive } = parseListing(
    `--\nPath = t.tar.gz\nType = gzip\n\nPath = t.tar\nType = tar\nPhysical Size = 10240\n\n----------\nPath = a\nSize = 1\n`,
  );
  assert.equal(archive.type, "gzip");
  assert.equal(archive.innerType, "tar");
});

test("parseTime reads 7-Zip's local time stamps", () => {
  assert.equal(parseTime("2026-01-02 03:04:05"), new Date(2026, 0, 2, 3, 4, 5).getTime());
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("yesterday"), null);
});

test("parseProgress takes the newest report from a redrawn line", () => {
  assert.deepEqual(
    parseProgress("  0%\b\b\b\b    \b\b\b\b 19% + big.bin\b\b\b 42% 3 - docs\\big.bin"),
    {
      percent: 42,
      files: 3,
      current: "docs/big.bin",
    },
  );
  assert.deepEqual(parseProgress("100%"), { percent: 100, files: null, current: "" });
  assert.equal(parseProgress("Scanning the drive"), null);
});

test("classifyFailure tells a missing password from a wrong one", () => {
  const prompt = "Listing archive: enc.7z\n\nEnter password:\n\nBreak signaled";
  const wrong = "ERROR: enc.7z : Cannot open encrypted archive. Wrong password?";
  assert.equal(classifyFailure(prompt, { passwordGiven: false }), "ENEEDPASS");
  assert.equal(classifyFailure(wrong, { passwordGiven: false }), "ENEEDPASS");
  assert.equal(classifyFailure(wrong, { passwordGiven: true }), "EBADPASS");
  assert.equal(
    classifyFailure("ERROR: Wrong password : a.txt", { passwordGiven: true }),
    "EBADPASS",
  );
  assert.equal(
    classifyFailure("ERROR: x.txt\nCan not open the file as archive", { passwordGiven: false }),
    "ENOTARCHIVE",
  );
  assert.equal(classifyFailure("ERROR: disk full", { passwordGiven: false }), null);
});

test("errorText keeps 7-Zip's error lines only", () => {
  assert.equal(
    errorText(
      "Scanning\nERROR: Wrong password : a.txt\nERROR: Wrong password : a.txt\nEverything else",
    ),
    "Wrong password : a.txt",
  );
});
