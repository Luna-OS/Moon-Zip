import { kindOf } from "../lib/kinds";
import { ArchiveIcon, CodeIcon, FileIcon, FolderIcon, ImageIcon, MediaIcon } from "../theme/icons";

/** The line icon for an item, tinted with its kind's colour (--mz-kind-*). */
export function EntryIcon({
  name,
  isDir,
  size = 16,
}: {
  name: string;
  isDir: boolean;
  size?: number;
}) {
  const kind = kindOf(name, isDir);
  const Icon = {
    folder: FolderIcon,
    image: ImageIcon,
    media: MediaIcon,
    code: CodeIcon,
    archive: ArchiveIcon,
    file: FileIcon,
  }[kind];
  return (
    <span className="inline-flex shrink-0" style={{ color: `var(--mz-kind-${kind})` }}>
      <Icon size={size} />
    </span>
  );
}
