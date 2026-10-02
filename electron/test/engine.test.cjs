"use strict";
// Runs the engine against the real 7-Zip from npm run fetch-7zip. Without it (a fresh checkout),
// these tests are skipped; CI fetches it first.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const engine = require("../engine/engine.cjs");

const bin = engine.findSevenZip();
const available = path.isAbsolute(bin) && fs.existsSync(bin);
const opts = { skip: available ? false : "7-Zip isn't fetched (npm run fetch-7zip)" };

function tree(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(p).isDirectory()) {
        out.push(`${r}/`);
        walk(p, r);
      } else out.push(r);
    }
  };
  walk(dir, "");
  return out;
}

let tmp;
test.before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "moon-zip-test-"));
  const src = path.join(tmp, "src");
  fs.mkdirSync(path.join(src, "docs", "inner"), { recursive: true });
  fs.writeFileSync(path.join(src, "a.txt"), "hello moon\n");
  fs.writeFileSync(path.join(src, "docs", "notes.md"), "# Notes\n".repeat(200));
  fs.writeFileSync(path.join(src, "docs", "inner", "ü-star.txt"), "✦\n");
});
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const src = (...p) => path.join(tmp, "src", ...p);

test("creates a 7z, lists it, and extracts a subfolder without its parent", opts, async () => {
  const archive = path.join(tmp, "one.7z");
  const progress = [];
  await engine.create(
    { archive, sources: [src("a.txt"), src("docs")], format: "7z", options: { level: 9 } },
    { onProgress: (p) => progress.push(p) },
  );
  const { archive: info, entries } = await engine.list(archive);
  assert.equal(info.type, "7z");
  assert.deepEqual(entries.map((e) => e.path).sort(), [
    "a.txt",
    "docs",
    "docs/inner",
    "docs/inner/ü-star.txt",
    "docs/notes.md",
  ]);

  const out = path.join(tmp, "out1");
  await engine.extract({
    archive,
    destDir: out,
    paths: ["docs/inner", "docs/notes.md"],
    stripPrefix: "docs",
  });
  assert.deepEqual(tree(out), ["inner/", "inner/ü-star.txt", "notes.md"]);
});

test("never overwrites an existing file unless asked to", opts, async () => {
  const archive = path.join(tmp, "taken.zip");
  fs.writeFileSync(archive, "keep me");
  await assert.rejects(engine.create({ archive, sources: [src("a.txt")], format: "zip" }), {
    code: "EEXIST",
  });
  assert.equal(fs.readFileSync(archive, "utf8"), "keep me");
  await engine.create({ archive, sources: [src("a.txt")], format: "zip", replace: true });
  assert.equal((await engine.list(archive)).entries[0].path, "a.txt");
});

test("passwords: needed, wrong, right", opts, async () => {
  const archive = path.join(tmp, "secret.7z");
  await engine.create({
    archive,
    sources: [src("a.txt")],
    format: "7z",
    options: { password: "moon", encryptNames: true },
  });
  await assert.rejects(engine.list(archive), { code: "ENEEDPASS" });
  await assert.rejects(engine.list(archive, "sun"), { code: "EBADPASS" });
  const { entries } = await engine.list(archive, "moon");
  assert.equal(entries[0].encrypted, true);
  await engine.test(archive, { password: "moon" });
});

test("ZIP with AES: the names are readable, extracting needs the password", opts, async () => {
  const archive = path.join(tmp, "secret.zip");
  await engine.create({
    archive,
    sources: [src("a.txt")],
    format: "zip",
    options: { password: "moon" },
  });
  const { entries } = await engine.list(archive);
  assert.equal(entries[0].path, "a.txt");
  await assert.rejects(engine.extract({ archive, destDir: path.join(tmp, "z1") }), {
    code: "ENEEDPASS",
  });
  await engine.extract({ archive, destDir: path.join(tmp, "z2"), password: "moon" });
  assert.equal(fs.readFileSync(path.join(tmp, "z2", "a.txt"), "utf8"), "hello moon\n");
});

test("adds into a folder, renames and deletes inside an archive", opts, async () => {
  const archive = path.join(tmp, "edit.zip");
  await engine.create({ archive, sources: [src("docs")], format: "zip" });
  await engine.add({ archive, sources: [src("a.txt")], intoDir: "docs/inner" });
  await engine.rename({ archive, from: "docs/notes.md", to: "docs/readme.md" });
  await engine.remove({ archive, paths: ["docs/inner/ü-star.txt"] });
  const names = (await engine.list(archive)).entries.map((e) => e.path).sort();
  assert.deepEqual(names, ["docs", "docs/inner", "docs/inner/a.txt", "docs/readme.md"]);
});

test("tar.gz goes through the pipe", opts, async () => {
  const archive = path.join(tmp, "box.tar.gz");
  await engine.create({ archive, sources: [src("docs")], format: "tar.gz", options: { level: 5 } });
  const { archive: info, entries } = await engine.list(archive);
  assert.equal(info.type, "gzip");
  assert.equal(entries[0].path, "box.tar");
});

test("a file that isn't an archive says so", opts, async () => {
  await assert.rejects(engine.list(src("a.txt")), { code: "ENOTARCHIVE" });
});

test("folderFor names the folder after the archive and keeps it free", opts, async () => {
  fs.writeFileSync(path.join(tmp, "photos.tar.gz"), "");
  assert.equal(await engine.folderFor(path.join(tmp, "photos.tar.gz")), path.join(tmp, "photos"));
  fs.mkdirSync(path.join(tmp, "photos"));
  assert.equal(
    await engine.folderFor(path.join(tmp, "photos.tar.gz")),
    path.join(tmp, "photos (2)"),
  );
});

test("checksums match Node's own hashes", async () => {
  const [r] = await engine.checksums([src("a.txt")], ["crc32", "sha256", "md5"]);
  assert.equal(
    r.hashes.sha256,
    require("crypto").createHash("sha256").update("hello moon\n").digest("hex"),
  );
  assert.equal(
    r.hashes.crc32,
    (require("zlib").crc32("hello moon\n") >>> 0).toString(16).toUpperCase().padStart(8, "0"),
  );
  assert.equal(r.name, "a.txt");
});
