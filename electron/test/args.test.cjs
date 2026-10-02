"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const args = require("../engine/args.cjs");

test("reading commands always carry a password switch, so 7-Zip never waits for one", () => {
  assert.ok(args.listArgs("a.7z").includes(`-p${args.NO_PASSWORD}`));
  assert.ok(args.listArgs("a.7z", "secret").includes("-psecret"));
  assert.ok(args.extractArgs("a.7z", "out").includes(`-p${args.NO_PASSWORD}`));
  assert.ok(args.testArgs("a.7z").includes(`-p${args.NO_PASSWORD}`));
});

test("writing commands only get a password when there is one", () => {
  assert.ok(!args.deleteArgs("a.7z", ["x"]).some((a) => a.startsWith("-p")));
  assert.ok(args.deleteArgs("a.7z", ["x"], "pw").includes("-ppw"));
  assert.ok(!args.updateArgs("a.7z", ["x"]).some((a) => a.startsWith("-p")));
});

test("file names come after --, so a name starting with - is never a switch", () => {
  const a = args.extractArgs("-odd.7z", "out", { paths: ["-x"] });
  assert.deepEqual(a.slice(a.indexOf("--")), ["--", "-odd.7z", "-x"]);
});

test("extractArgs maps the overwrite choice", () => {
  assert.ok(args.extractArgs("a", "o", { overwrite: "skip" }).includes("-aos"));
  assert.ok(args.extractArgs("a", "o", { overwrite: "rename" }).includes("-aou"));
  assert.ok(args.extractArgs("a", "o").includes("-aoa"));
  assert.ok(args.extractArgs("a", "C:\\out dir").includes("-oC:\\out dir"));
});

test("formatSwitches for 7z with a password hides the names", () => {
  assert.deepEqual(
    args.formatSwitches("7z", { level: 9, method: "PPMd", password: "pw", encryptNames: true }),
    ["-t7z", "-mx9", "-m0=PPMd", "-ppw", "-mhe=on"],
  );
});

test("formatSwitches for ZIP uses AES-256 unless ZipCrypto is asked for", () => {
  assert.ok(args.formatSwitches("zip", { password: "pw" }).includes("-mem=AES256"));
  assert.ok(
    args
      .formatSwitches("zip", { password: "pw", zipEncryption: "ZipCrypto" })
      .includes("-mem=ZipCrypto"),
  );
  assert.ok(
    !args.formatSwitches("zip", { password: "pw", encryptNames: true }).includes("-mhe=on"),
  );
});

test("formatSwitches refuses what a format can't do", () => {
  assert.throws(() => args.formatSwitches("tar.gz", { password: "pw" }), /can't have a password/);
  assert.throws(() => args.formatSwitches("rar", {}), /can't create rar/);
  assert.deepEqual(args.formatSwitches("tar", { level: 9 }), ["-ttar"]);
  assert.ok(
    args.formatSwitches("7z", { level: 4 }).includes("-mx5"),
    "unknown levels fall back to Normal",
  );
  assert.ok(args.formatSwitches("7z", { volumeSize: "100m" }).includes("-v100m"));
  assert.ok(!args.formatSwitches("7z", { volumeSize: "100m; rm" }).some((a) => a.startsWith("-v")));
});

test("a .tar.gz is a tar piped into gzip", () => {
  const plan = args.addArgs("C:\\out\\x.tar.gz", ["a", "b"], "tar.gz", { level: 9 });
  assert.ok(plan.tar.includes("-ttar") && plan.tar.includes("-so"));
  assert.ok(plan.compress.includes("-tgzip") && plan.compress.includes("-six.tar"));
  assert.deepEqual(plan.tar.slice(-3), ["--", "a", "b"]);
});
