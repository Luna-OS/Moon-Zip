"use strict";
// Archives in several parts ("volumes"): name.part1.rar … name.part5.rar, name.7z.001 … .005,
// name.rar + name.r00 …, name.zip + name.z01 …. 7-Zip reads the whole set when it is given the
// first part, so Moon Zip always works on the first part, whichever one the user picked, treats
// the parts as one archive, and says which parts are missing before 7-Zip fails on them.
// Pure functions (volumes.test.cjs); engine.cjs and main.cjs use them. See docs/multi-part.md.

const fs = require("fs");
const path = require("path");

/**
 * What a file name says about being a part of a set, or null:
 * { scheme, base, index, width, first } – `base` is the same for every part of one set, `index`
 * counts from 1 in reading order where the name tells (0 when it doesn't), `first` is whether
 * this is the file to open.
 */
function parse(name) {
  let m;
  // name.part1.rar, name.part01.rar, name.part001.rar
  if ((m = /^(.*)\.part(\d+)\.rar$/i.exec(name)))
    return { scheme: "part-rar", base: m[1], index: +m[2], width: m[2].length, first: +m[2] === 1 };
  // name.7z.001, name.zip.001, name.tar.001 – any name.NNN
  if ((m = /^(.*)\.(\d{3})$/.exec(name)))
    return { scheme: "numbered", base: m[1], index: +m[2], width: m[2].length, first: +m[2] === 1 };
  // Old RAR naming: name.rar is the first part, then name.r00, name.r01, …
  if ((m = /^(.*)\.r(\d{2,})$/i.exec(name)))
    return { scheme: "old-rar", base: m[1], index: +m[2] + 2, width: m[2].length, first: false };
  // Split ZIP: name.z01, name.z02, … and name.zip as the last part, which is the one to open
  if ((m = /^(.*)\.z(\d{2,})$/i.exec(name)))
    return { scheme: "split-zip", base: m[1], index: +m[2], width: m[2].length, first: false };
  return null;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** name.NNN only counts as a part when the name before it is an archive's, or there are more of them. */
const ARCHIVE_BASE = /\.(7z|zip|rar|tar|gz|tgz|xz|bz2|zst|iso|wim)$/i;

/**
 * The set a file belongs to, from the names in its folder:
 * { scheme, first, parts: [names in reading order], missing: [names that should be there] } – or
 * null when the file is no part of a set (a plain archive). `first` is the file to give to 7-Zip,
 * null when that very file is missing.
 */
function setOf(name, siblings) {
  const names = siblings.some((s) => sameName(s, name)) ? siblings : [...siblings, name];
  const parsed = names.map((s) => ({ name: s, p: parse(s) })).filter((x) => x.p);
  const members = (scheme, base) =>
    parsed.filter((x) => x.p.scheme === scheme && sameName(x.p.base, base));
  const own = parse(name);

  if (own && (own.scheme === "part-rar" || own.scheme === "numbered")) {
    const set = members(own.scheme, own.base);
    if (own.scheme === "numbered" && set.length < 2 && !ARCHIVE_BASE.test(own.base)) return null;
    return collectNumbered(own, set);
  }
  if (own) {
    // name.r00 / name.z01: the head is name.rar / name.zip.
    const headName = `${own.base}.${own.scheme === "old-rar" ? "rar" : "zip"}`;
    const head = names.find((s) => sameName(s, headName)) ?? null;
    return collectWithHead(own.scheme, own.base, head, headName, members(own.scheme, own.base));
  }
  // name.rar / name.zip is the head of a set when name.r00 / name.z01 lie next to it.
  const m = /^(.*)\.(rar|zip)$/i.exec(name);
  if (!m) return null;
  const scheme = m[2].toLowerCase() === "rar" ? "old-rar" : "split-zip";
  const others = members(scheme, m[1]);
  return others.length ? collectWithHead(scheme, m[1], name, name, others) : null;
}

const partName = (p, index) =>
  p.scheme === "part-rar"
    ? `${p.base}.part${String(index).padStart(p.width, "0")}.rar`
    : `${p.base}.${String(index).padStart(p.width, "0")}`;

/** name.part1.rar… and name.001…: the parts are numbered from 1 without gaps. */
function collectNumbered(own, members) {
  const byIndex = new Map(members.map((m) => [m.p.index, m.name]));
  const last = Math.max(...byIndex.keys());
  const parts = [];
  const missing = [];
  for (let i = 1; i <= last; i++) {
    if (byIndex.has(i)) parts.push(byIndex.get(i));
    else missing.push(partName(own, i));
  }
  return { scheme: own.scheme, first: byIndex.get(1) ?? null, parts, missing };
}

/** Old RAR (.rar, .r00, .r01, …) and split ZIP (.z01, .z02, …, .zip): the head plus numbered parts. */
function collectWithHead(scheme, base, head, headName, others) {
  const rar = scheme === "old-rar";
  const width = others[0].p.width;
  // parse() gives .r00 the index 2 (the second part); the number in the name is two less.
  const byNumber = new Map(others.map((o) => [rar ? o.p.index - 2 : o.p.index, o.name]));
  const last = Math.max(...byNumber.keys());
  const numbered = [];
  const missing = head ? [] : [headName];
  for (let i = rar ? 0 : 1; i <= last; i++) {
    if (byNumber.has(i)) numbered.push(byNumber.get(i));
    else missing.push(`${base}.${rar ? "r" : "z"}${String(i).padStart(width, "0")}`);
  }
  // Reading order: RAR starts with .rar; a split ZIP ends with .zip.
  const heads = head ? [head] : [];
  return {
    scheme,
    first: head,
    parts: rar ? [...heads, ...numbered] : [...numbered, ...heads],
    missing,
  };
}

/**
 * The same for a path on disk: { first, parts, missing, size } with full paths (missing stays
 * names) and the size of all parts together, or null for a plain archive or an unreadable folder.
 */
function inspect(file, { readdir = fs.readdirSync, stat = fs.statSync } = {}) {
  const dir = path.dirname(file);
  let siblings;
  try {
    siblings = readdir(dir);
  } catch {
    return null;
  }
  const set = setOf(path.basename(file), siblings);
  if (!set) return null;
  let size = 0;
  for (const p of set.parts) {
    try {
      size += stat(path.join(dir, p)).size;
    } catch {
      /* vanished */
    }
  }
  return {
    scheme: set.scheme,
    first: set.first ? path.join(dir, set.first) : null,
    parts: set.parts.map((p) => path.join(dir, p)),
    missing: set.missing,
    size,
  };
}

/** "Part 3 is missing: name.part3.rar. …" – what to tell the user about an incomplete set. */
function missingMessage(missing) {
  const list =
    missing.slice(0, 5).join(", ") + (missing.length > 5 ? `, and ${missing.length - 5} more` : "");
  return missing.length === 1
    ? `A part of this archive is missing: ${list}. Put all parts in the same folder and try again.`
    : `${missing.length} parts of this archive are missing: ${list}. Put all parts in the same folder and try again.`;
}

/**
 * For a selection in Windows Explorer: every set once, as its first part, in the order given.
 * Parts whose first part is missing stay as they are (opening them reports what is missing).
 */
function group(paths, io) {
  const out = [];
  const seen = new Set();
  for (const p of paths) {
    const set = inspect(p, io);
    const target = set && set.first ? set.first : p;
    const key = set ? set.parts.join("|").toLowerCase() : target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

module.exports = { parse, setOf, inspect, group, missingMessage };
