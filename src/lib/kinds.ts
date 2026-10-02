import { isArchiveName } from "./formats";

const IMAGE = new Set(
  "jpg jpeg png gif webp bmp svg ico heic avif tif tiff raw cr2 cr3 nef arw dng psd".split(" "),
);
const MEDIA = new Set("mp3 wav flac ogg m4a aac opus mp4 mkv mov avi webm wmv m4v".split(" "));
const CODE = new Set(
  "js mjs cjs ts tsx jsx json html htm css scss py rb php java kt c h cpp hpp cs go rs swift lua sh ps1 bat cmd sql xml yml yaml toml md csv".split(
    " ",
  ),
);

export type Kind = "folder" | "image" | "media" | "code" | "archive" | "file";

export function kindOf(name: string, isDir: boolean): Kind {
  if (isDir) return "folder";
  if (isArchiveName(name)) return "archive";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (IMAGE.has(ext)) return "image";
  if (MEDIA.has(ext)) return "media";
  if (CODE.has(ext)) return "code";
  return "file";
}
