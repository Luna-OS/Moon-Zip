"use strict";
// Parses the technical listing of `7z l -slt` (one "Key = Value" block per item) and the progress
// lines 7-Zip writes with -bsp1. Pure functions, so they're tested without 7-Zip (listing.test.cjs).

/** "2026-10-02 20:37:41.1708971" (local time, as 7-Zip prints it) → milliseconds, or null. */
function parseTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(value || "");
  if (!m) return null;
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms).getTime();
}

const num = (v) => (v === undefined || v === "" ? null : Number(v));

/** Splits a block of "Key = Value" lines into an object (later keys win). */
function parseBlock(lines) {
  const out = {};
  for (const line of lines) {
    const i = line.indexOf(" = ");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 3);
    else if (line.endsWith(" =")) out[line.slice(0, -2)] = "";
  }
  return out;
}

function toEntry(b) {
  const attributes = b.Attributes || "";
  const isDir = b.Folder === "+" || /^D/.test(attributes.trim());
  return {
    // Windows prints backslashes; the UI always works with forward slashes.
    path: String(b.Path).replace(/\\/g, "/").replace(/\/+$/, ""),
    isDir,
    size: isDir ? 0 : (num(b.Size) ?? 0),
    packed: num(b["Packed Size"]),
    mtime: parseTime(b.Modified),
    crc: b.CRC || "",
    method: b.Method || "",
    encrypted: b.Encrypted === "+",
    attributes,
    comment: b.Comment || "",
  };
}

/**
 * The output of `7z l -slt <archive>`: the archive's properties (the block after the "--" line;
 * nested archives such as .tar.gz give one block per layer, the outermost first) and its items
 * (the blocks after the "----------" line).
 */
function parseListing(stdout) {
  const lines = String(stdout).replace(/\r/g, "").split("\n");
  const layers = [];
  const entries = [];
  let section = "head";
  let block = [];
  const flush = () => {
    if (block.length) {
      const b = parseBlock(block);
      if (section === "archive") layers.push(b);
      else if (section === "items" && b.Path !== undefined) entries.push(toEntry(b));
    }
    block = [];
  };
  for (const line of lines) {
    if (line === "--" && section !== "items") {
      flush();
      section = "archive";
      continue;
    }
    if (line === "----------") {
      flush();
      section = "items";
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (section !== "head") block.push(line);
  }
  flush();

  const top = layers[0] || {};
  const inner = layers[layers.length - 1] || {};
  const archive = {
    type: top.Type || "",
    // For .tar.gz this is "gzip → tar", the way 7-Zip opens it.
    innerType: layers.length > 1 ? inner.Type || "" : "",
    physicalSize: num(top["Physical Size"]),
    headersSize: num(top["Headers Size"]),
    method: top.Method || inner.Method || "",
    solid: top.Solid === "+" ? true : top.Solid === "-" ? false : null,
    blocks: num(top.Blocks),
    volumes: num(top.Volumes),
    comment: top.Comment || "",
    warnings: layers.flatMap((l) => (l.Warnings ? [l.Warnings] : l.Warning ? [l.Warning] : [])),
  };
  return { archive, entries };
}

/**
 * The newest progress report in a chunk of -bsp1 output. 7-Zip redraws one line with backspaces:
 * "  42% 3 + docs\big.bin" (adding) or " 42% 3 - docs\big.bin" (extracting). Returns
 * { percent, files, current } or null when the chunk holds no report.
 */
function parseProgress(chunk) {
  const parts = String(chunk)
    .split(/[\b\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = /^(\d{1,3})%(?:\s+(\d+))?(?:\s+[+\-U=.]\s+(.*))?$/.exec(parts[i]);
    if (m) {
      return {
        percent: Math.min(100, Number(m[1])),
        files: m[2] ? Number(m[2]) : null,
        current: m[3] ? m[3].replace(/\\/g, "/") : "",
      };
    }
  }
  return null;
}

/** 7-Zip's error lines ("ERROR: …", "Can not open the file as archive", …) in readable form. */
function errorText(output) {
  const lines = String(output)
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const errors = lines
    .filter((l) => /^(ERROR|Error|WARNING|System ERROR):?/.test(l) || /^Can ?not /i.test(l))
    .map((l) => l.replace(/^(ERROR|Error|System ERROR):\s*/, ""));
  return [...new Set(errors)].join("\n");
}

/**
 * What went wrong, as a code the UI understands:
 * ENEEDPASS (a password is needed), EBADPASS (the given one is wrong), ENOTARCHIVE, or null.
 */
function classifyFailure(output, { passwordGiven }) {
  const s = String(output);
  if (/Enter password|Cannot open encrypted archive|Can not open encrypted archive/i.test(s))
    return passwordGiven ? "EBADPASS" : "ENEEDPASS";
  if (/Wrong password/i.test(s)) return passwordGiven ? "EBADPASS" : "ENEEDPASS";
  if (/Data Error in encrypted file|CRC Failed in encrypted file/i.test(s))
    return passwordGiven ? "EBADPASS" : "ENEEDPASS";
  if (/Can ?not open (the )?file as (an )?archive|is not archive|Unsupported archive/i.test(s))
    return "ENOTARCHIVE";
  return null;
}

module.exports = { parseListing, parseProgress, parseTime, errorText, classifyFailure };
