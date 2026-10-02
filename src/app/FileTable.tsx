import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { formatBytes, formatDate, plural } from "../lib/format";
import type { SortKey, TreeNode } from "../lib/tree";
import { LockIcon } from "../theme/icons";
import { EntryIcon } from "./EntryIcon";

export interface Sort {
  key: SortKey;
  desc: boolean;
}

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "name", label: "Name", className: "" },
  { key: "size", label: "Size", className: "w-28 text-right" },
  { key: "packed", label: "Packed", className: "w-28 text-right" },
  { key: "mtime", label: "Modified", className: "w-48" },
  { key: "method", label: "Method", className: "w-36" },
];

/**
 * The items of one archive folder (or the search results) as a dense table – MoonTask's table look.
 * Click, Ctrl+click and Shift+click select; arrows move; Enter opens; Backspace goes up;
 * Delete and F2 are handed to the view.
 */
export function FileTable({
  nodes,
  selected,
  focused,
  sort,
  showFolderOf,
  showPacked = true,
  onSort,
  onSelect,
  onFocus,
  onOpen,
  onUp,
  onDelete,
  onRename,
  onContextMenu,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  focused: string | null;
  sort: Sort;
  /** Search results show where each item is. */
  showFolderOf?: boolean;
  /** Off for solid archives, which don't report packed sizes per file. */
  showPacked?: boolean;
  onSort: (s: Sort) => void;
  onSelect: (paths: Set<string>) => void;
  onFocus: (path: string | null) => void;
  onOpen: (node: TreeNode) => void;
  onUp: () => void;
  onDelete: () => void;
  onRename: () => void;
  onContextMenu: (e: MouseEvent<HTMLElement>, node: TreeNode | null) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const anchor = useRef<string | null>(null);
  const index = focused ? nodes.findIndex((n) => n.path === focused) : -1;

  useEffect(() => {
    if (!focused) return;
    const row = body.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(focused)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  function click(e: MouseEvent, node: TreeNode) {
    if (e.shiftKey && anchor.current) {
      const a = nodes.findIndex((n) => n.path === anchor.current);
      const b = nodes.findIndex((n) => n.path === node.path);
      const [from, to] = a < b ? [a, b] : [b, a];
      onSelect(new Set(nodes.slice(from, to + 1).map((n) => n.path)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      onSelect(next);
      anchor.current = node.path;
    } else {
      onSelect(new Set([node.path]));
      anchor.current = node.path;
    }
    onFocus(node.path);
  }

  function moveTo(i: number, extend: boolean) {
    const node = nodes[Math.max(0, Math.min(nodes.length - 1, i))];
    if (!node) return;
    if (extend && anchor.current) {
      const a = nodes.findIndex((n) => n.path === anchor.current);
      const b = nodes.indexOf(node);
      const [from, to] = a < b ? [a, b] : [b, a];
      onSelect(new Set(nodes.slice(from, to + 1).map((n) => n.path)));
    } else {
      onSelect(new Set([node.path]));
      anchor.current = node.path;
    }
    onFocus(node.path);
  }

  function keyDown(e: KeyboardEvent) {
    const page = Math.max(
      1,
      Math.floor((body.current?.parentElement?.parentElement?.clientHeight ?? 300) / 30) - 2,
    );
    switch (e.key) {
      case "ArrowDown":
        moveTo(index + 1, e.shiftKey);
        break;
      case "ArrowUp":
        moveTo(index < 0 ? 0 : index - 1, e.shiftKey);
        break;
      case "PageDown":
        moveTo(index + page, e.shiftKey);
        break;
      case "PageUp":
        moveTo(index - page, e.shiftKey);
        break;
      case "Home":
        moveTo(0, e.shiftKey);
        break;
      case "End":
        moveTo(nodes.length - 1, e.shiftKey);
        break;
      case "Enter":
        if (index >= 0) onOpen(nodes[index]);
        break;
      case "Backspace":
        onUp();
        break;
      case "Delete":
        if (selected.size) onDelete();
        break;
      case "F2":
        if (selected.size === 1) onRename();
        break;
      case "a":
        if (!(e.ctrlKey || e.metaKey)) return;
        onSelect(new Set(nodes.map((n) => n.path)));
        break;
      case "Escape":
        onSelect(new Set());
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined;

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      onContextMenu={(e) => e.target === e.currentTarget && onContextMenu(e, null)}
    >
      <table
        className="mz-table"
        role="grid"
        aria-label="Archive contents"
        aria-multiselectable="true"
        tabIndex={0}
        aria-activedescendant={focused ? `row-${encodeURIComponent(focused)}` : undefined}
        onKeyDown={keyDown}
        onFocus={() => {
          if (!focused && nodes[0]) onFocus(nodes[0].path);
        }}
      >
        <thead>
          <tr>
            {COLUMNS.filter((c) => showPacked || c.key !== "packed").map((c) => (
              <th key={c.key} className={c.className} aria-sort={ariaSort(c.key)}>
                <button
                  type="button"
                  tabIndex={-1}
                  className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] text-inherit uppercase"
                  onClick={() =>
                    onSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : false })
                  }
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {nodes.map((n) => {
            const isSelected = selected.has(n.path);
            const folder = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "";
            return (
              <tr
                key={n.path}
                id={`row-${encodeURIComponent(n.path)}`}
                data-path={n.path}
                aria-selected={isSelected}
                data-focused={focused === n.path || undefined}
                className="cursor-default select-none data-focused:outline data-focused:outline-1 data-focused:-outline-offset-1 data-focused:outline-(--mz-border-strong)"
                onClick={(e) => click(e, n)}
                onDoubleClick={() => onOpen(n)}
                onContextMenu={(e) => {
                  if (!selected.has(n.path)) {
                    onSelect(new Set([n.path]));
                    anchor.current = n.path;
                  }
                  onFocus(n.path);
                  onContextMenu(e, n);
                }}
              >
                <td>
                  <span className="flex min-w-0 items-center gap-2">
                    <EntryIcon name={n.name} isDir={n.isDir} />
                    <span className="truncate" title={n.path}>
                      {n.name}
                    </span>
                    {n.encrypted && (
                      <span className="text-(--mz-warning)" title="Encrypted">
                        <LockIcon size={12} />
                        <span className="sr-only">(encrypted)</span>
                      </span>
                    )}
                    {showFolderOf && folder && (
                      <span className="truncate text-xs text-(--mz-text-faint)">{folder}</span>
                    )}
                  </span>
                </td>
                <td className="text-right text-(--mz-text-muted)">{formatBytes(n.size)}</td>
                {showPacked && (
                  <td className="text-right text-(--mz-text-muted)">
                    {n.packed === null ? "" : formatBytes(n.packed)}
                  </td>
                )}
                <td className="text-(--mz-text-muted)">{formatDate(n.mtime)}</td>
                <td className="text-(--mz-text-faint)">
                  {n.isDir ? plural(n.files, "file") : n.method}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nodes.length === 0 && (
        <p className="p-8 text-center text-[0.8125rem] text-(--mz-text-muted)">Nothing here.</p>
      )}
    </div>
  );
}
