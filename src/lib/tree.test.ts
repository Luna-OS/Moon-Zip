import { describe, expect, it } from "vitest";
import { buildTree, cleanPath, filesUnder, sortNodes, totals } from "./tree";
import type { ArchiveEntry } from "./types";

const entry = (
  path: string,
  size = 0,
  isDir = false,
  packed: number | null = null,
): ArchiveEntry => ({
  path,
  isDir,
  size,
  packed,
  mtime: null,
  crc: "",
  method: "",
  encrypted: false,
  attributes: "",
  comment: "",
});

describe("buildTree", () => {
  it("adds the folders a ZIP leaves out and sums them up", () => {
    const tree = buildTree([
      entry("a/b/c.txt", 10, false, 4),
      entry("a/d.txt", 5, false, 5),
      entry("e.txt", 1, false, 1),
    ]);
    expect(
      tree
        .get("")!
        .map((n) => n.name)
        .sort(),
    ).toEqual(["a", "e.txt"]);
    const a = tree.get("")!.find((n) => n.name === "a")!;
    expect(a).toMatchObject({ isDir: true, size: 15, packed: 9, files: 2 });
    expect(tree.get("a/b")!.map((n) => n.name)).toEqual(["c.txt"]);
    expect(totals(tree)).toEqual({ size: 16, packed: 10, files: 3, folders: 2 });
  });

  it("keeps empty folders and cleans odd paths", () => {
    const tree = buildTree([entry("./x//", 0, true), entry("/y/z.txt", 3)]);
    expect(tree.get("x")).toEqual([]);
    expect(tree.get("y")!.map((n) => n.path)).toEqual(["y/z.txt"]);
    expect(cleanPath("./a//b/")).toBe("a/b");
  });

  it("leaves packed sizes out of solid archives", () => {
    const tree = buildTree([entry("a.txt", 10, false, 999), entry("b.txt", 10, false, null)], {
      solid: true,
    });
    expect(tree.get("")!.every((n) => n.packed === null)).toBe(true);
  });

  it("filesUnder walks into folders", () => {
    const tree = buildTree([entry("a/1", 1), entry("a/b/2", 1), entry("c", 1)]);
    expect(
      filesUnder(tree, ["a"])
        .map((n) => n.path)
        .sort(),
    ).toEqual(["a/1", "a/b/2"]);
  });
});

describe("sortNodes", () => {
  const tree = buildTree([
    entry("file10.txt", 1),
    entry("file2.txt", 3),
    entry("Zeta", 0, true),
    entry("alpha", 0, true),
  ]);
  const nodes = tree.get("")!;

  it("puts folders first and compares names like Explorer", () => {
    expect(sortNodes(nodes, "name", false).map((n) => n.name)).toEqual([
      "alpha",
      "Zeta",
      "file2.txt",
      "file10.txt",
    ]);
  });

  it("sorts by size, descending, folders still first", () => {
    expect(sortNodes(nodes, "size", true).map((n) => n.name)).toEqual([
      "Zeta",
      "alpha",
      "file2.txt",
      "file10.txt",
    ]);
  });
});
