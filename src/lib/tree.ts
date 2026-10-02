import type { ArchiveEntry } from "./types";

/** A file or folder as the list shows it; folders carry the totals of everything below them. */
export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  /** Sum of the known compressed sizes; null when the archive reports none. */
  packed: number | null;
  mtime: number | null;
  crc: string;
  method: string;
  encrypted: boolean;
  /** Files below a folder (all levels). */
  files: number;
}

/** Folder path ("" is the root) → its direct children. */
export type Tree = Map<string, TreeNode[]>;

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** Strips "./", leading slashes and empty segments, so "./a//b/" and "a/b" are the same item. */
export function cleanPath(p: string): string {
  return p
    .split("/")
    .filter((s) => s && s !== ".")
    .join("/");
}

/**
 * Builds the folder tree from 7-Zip's flat item list. Folders that only exist as part of a path
 * (ZIP files often leave them out) are added, and every folder gets the totals of its contents.
 * In a solid archive 7-Zip reports the packed size of a whole block on its first file only, so
 * `solid` leaves the packed sizes out rather than show numbers that mislead.
 */
export function buildTree(
  entries: ArchiveEntry[],
  { solid = false }: { solid?: boolean } = {},
): Tree {
  const nodes = new Map<string, TreeNode>();
  const folder = (path: string): TreeNode => {
    let n = nodes.get(path);
    if (!n) {
      n = {
        name: nameOf(path),
        path,
        isDir: true,
        size: 0,
        packed: null,
        mtime: null,
        crc: "",
        method: "",
        encrypted: false,
        files: 0,
      };
      nodes.set(path, n);
      const parent = parentOf(path);
      if (path) folder(parent);
    }
    return n;
  };
  folder("");
  for (const e of entries) {
    const path = cleanPath(e.path);
    if (!path) continue;
    if (e.isDir) {
      const n = folder(path);
      n.mtime = e.mtime;
      continue;
    }
    folder(parentOf(path));
    nodes.set(path, {
      name: nameOf(path),
      path,
      isDir: false,
      size: e.size,
      packed: solid ? null : e.packed,
      mtime: e.mtime,
      crc: e.crc,
      method: e.method,
      encrypted: e.encrypted,
      files: 1,
    });
  }

  const tree: Tree = new Map([["", []]]);
  for (const n of nodes.values()) {
    if (!n.path) continue;
    const parent = parentOf(n.path);
    if (!tree.has(parent)) tree.set(parent, []);
    tree.get(parent)!.push(n);
    if (n.isDir && !tree.has(n.path)) tree.set(n.path, []);
  }
  // Totals, deepest folders first so each parent adds finished children.
  const folders = [...nodes.values()]
    .filter((n) => n.isDir)
    .sort((a, b) => depth(b.path) - depth(a.path));
  for (const f of folders) {
    for (const child of tree.get(f.path) ?? []) {
      if (!child.isDir) {
        f.size += child.size;
        f.files += 1;
      } else {
        f.size += child.size;
        f.files += child.files;
      }
      if (child.packed !== null) f.packed = (f.packed ?? 0) + child.packed;
      if (child.encrypted) f.encrypted = true;
    }
  }
  return tree;
}

const depth = (p: string) => (p ? p.split("/").length : 0);

/** The root node with the totals of the whole archive. */
export function totals(tree: Tree): {
  size: number;
  packed: number | null;
  files: number;
  folders: number;
} {
  let size = 0;
  let packed: number | null = null;
  let files = 0;
  let folders = 0;
  for (const children of tree.values())
    for (const n of children) {
      if (n.isDir) {
        folders++;
        continue;
      }
      files++;
      size += n.size;
      if (n.packed !== null) packed = (packed ?? 0) + n.packed;
    }
  return { size, packed, files, folders };
}

/** Every archive path at or below `paths` (for counting what a delete or extract covers). */
export function filesUnder(tree: Tree, paths: string[]): TreeNode[] {
  const out: TreeNode[] = [];
  const all = new Map<string, TreeNode>();
  for (const children of tree.values()) for (const n of children) all.set(n.path, n);
  const visit = (n: TreeNode) => {
    if (!n.isDir) out.push(n);
    else for (const c of tree.get(n.path) ?? []) visit(c);
  };
  for (const p of paths) {
    const n = all.get(p);
    if (n) visit(n);
  }
  return out;
}

export type SortKey = "name" | "size" | "packed" | "mtime" | "method";

/** Folders first, then by the column; names compare like Windows Explorer ("file2" before "file10"). */
export function sortNodes(nodes: TreeNode[], key: SortKey, desc: boolean): TreeNode[] {
  const byName = (a: TreeNode, b: TreeNode) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const value = (a: TreeNode, b: TreeNode): number => {
    switch (key) {
      case "size":
        return a.size - b.size;
      case "packed":
        return (a.packed ?? -1) - (b.packed ?? -1);
      case "mtime":
        return (a.mtime ?? 0) - (b.mtime ?? 0);
      case "method":
        return a.method.localeCompare(b.method);
      default:
        return 0;
    }
  };
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const v = value(a, b) || byName(a, b);
    return desc ? -v : v;
  });
}

export { parentOf, nameOf };
