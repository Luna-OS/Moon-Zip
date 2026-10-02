/** File-path helpers for Windows and POSIX paths alike (the UI never touches the file system). */

export function basename(p: string): string {
  const s = p.replace(/[\\/]+$/, "");
  return s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")) + 1) || s;
}

export function dirname(p: string): string {
  const s = p.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (i < 0) return "";
  if (i === 2 && /^[a-zA-Z]:/.test(s)) return s.slice(0, 3);
  return i === 0 ? s.slice(0, 1) : s.slice(0, i);
}

export function join(dir: string, name: string): string {
  const sep = dir.includes("\\") || /^[a-zA-Z]:/.test(dir) ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

/** "photos.tar.gz" → "photos", "notes.zip" → "notes", "disk.7z.001" → "disk". */
export function stripArchiveExtension(name: string): string {
  const stripped = name.replace(
    /\.(tar\.(gz|xz|bz2|zst)|tgz|tbz2?|txz|7z\.\d{3}|zip\.\d{3}|part\d+\.rar|[^.]+)$/i,
    "",
  );
  return stripped || name;
}
