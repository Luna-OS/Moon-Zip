"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const volumes = require("../engine/volumes.cjs");

const game = [1, 2, 3, 4, 5].map((i) => `GameDrive.Org.part${i}.rar`);

test("any part of name.partN.rar finds the whole set and its first part", () => {
  for (const picked of game) {
    const set = volumes.setOf(picked, [...game, "notes.txt", "Other.part1.rar"]);
    assert.equal(set.first, "GameDrive.Org.part1.rar");
    assert.deepEqual(set.parts, game);
    assert.deepEqual(set.missing, []);
  }
});

test("parts sort by number, not by name (part10 after part9), with padded numbers too", () => {
  const many = Array.from({ length: 12 }, (_, i) => `a.part${i + 1}.rar`);
  assert.deepEqual(volumes.setOf("a.part10.rar", [...many].reverse()).parts, many);
  const padded = ["b.part01.rar", "b.part02.rar", "b.part03.rar"];
  assert.equal(volumes.setOf("b.part03.rar", padded).first, "b.part01.rar");
  assert.deepEqual(volumes.setOf("b.part03.rar", ["b.part01.rar", "b.part03.rar"]).missing, [
    "b.part02.rar",
  ]);
});

test("missing parts are named: one in the middle, the first", () => {
  const withoutThird = game.filter((_, i) => i !== 2);
  assert.deepEqual(volumes.setOf(game[0], withoutThird).missing, ["GameDrive.Org.part3.rar"]);
  const withoutFirst = volumes.setOf(game[4], game.slice(3));
  assert.equal(withoutFirst.first, null);
  assert.deepEqual(withoutFirst.missing, [game[0], game[1], game[2]]);
});

test("name.7z.001 …: numbered parts", () => {
  const parts = ["x.7z.001", "x.7z.002", "x.7z.003"];
  const set = volumes.setOf("x.7z.003", parts);
  assert.equal(set.first, "x.7z.001");
  assert.deepEqual(set.parts, parts);
  assert.equal(volumes.setOf("x.7z.001", ["x.7z.001"]).first, "x.7z.001", "a set of one");
});

test("old RAR naming: name.rar, name.r00, name.r01", () => {
  const set = volumes.setOf("a.r01", ["a.r01", "a.rar", "a.r00"]);
  assert.equal(set.first, "a.rar");
  assert.deepEqual(set.parts, ["a.rar", "a.r00", "a.r01"]);
  assert.deepEqual(volumes.setOf("a.rar", ["a.rar", "a.r00", "a.r02"]).missing, ["a.r01"]);
  assert.deepEqual(volumes.setOf("a.r00", ["a.r00"]).missing, ["a.rar"]);
});

test("split ZIP: name.z01, name.z02 and name.zip, which is the one to open", () => {
  const set = volumes.setOf("a.z01", ["a.zip", "a.z02", "a.z01"]);
  assert.equal(set.first, "a.zip");
  assert.deepEqual(set.parts, ["a.z01", "a.z02", "a.zip"]);
});

test("plain archives and look-alikes are no sets", () => {
  assert.equal(volumes.setOf("a.zip", ["a.zip", "b.z01", "a.txt"]), null);
  assert.equal(volumes.setOf("a.rar", ["a.rar"]), null);
  assert.equal(volumes.setOf("report.2024", ["report.2024"]), null);
  assert.equal(volumes.setOf("data.001", ["data.001"]), null);
  assert.equal(volumes.setOf("photo.jpg", ["photo.jpg"]), null);
});

test("names match without regard to case, as on Windows", () => {
  const set = volumes.setOf("Game.PART2.RAR", ["game.part1.rar", "Game.PART2.RAR"]);
  assert.equal(set.first, "game.part1.rar");
  assert.equal(set.parts.length, 2);
});

test("a selection of parts becomes one archive per set, in the order picked", () => {
  const dir = path.join(path.sep, "dl");
  const files = [...game, "y.7z.001", "y.7z.002", "plain.zip"];
  const io = { readdir: () => files, stat: () => ({ size: 10 }) };
  const picked = ["plain.zip", game[3], game[0], "y.7z.002", game[4]].map((f) => path.join(dir, f));
  assert.deepEqual(volumes.group(picked, io), [
    path.join(dir, "plain.zip"),
    path.join(dir, game[0]),
    path.join(dir, "y.7z.001"),
  ]);
  assert.equal(volumes.inspect(path.join(dir, game[2]), io).size, 50);
});

test("the message names what is missing", () => {
  assert.match(
    volumes.missingMessage(["a.part3.rar"]),
    /A part of this archive is missing: a\.part3\.rar\./,
  );
  assert.match(
    volumes.missingMessage(["a", "b", "c", "d", "e", "f", "g"]),
    /7 parts .* a, b, c, d, e, and 2 more\./,
  );
});
