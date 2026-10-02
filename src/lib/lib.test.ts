import { describe, expect, it } from "vitest";
import { formatBytes, formatPercent, plural, savedFraction } from "./format";
import { isArchiveName, withFormatExtension } from "./formats";
import { basename, dirname, join, stripArchiveExtension } from "./paths";

describe("format", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(null)).toBe("—");
  });

  it("works out how much an archive saves", () => {
    expect(savedFraction(100, 25)).toBe(0.75);
    expect(savedFraction(100, 120)).toBe(0);
    expect(savedFraction(0, 0)).toBeNull();
    expect(formatPercent(0.754)).toBe("75%");
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(3, "match", "matches")).toBe("3 matches");
  });
});

describe("paths", () => {
  it("handles Windows and POSIX paths", () => {
    expect(basename("C:\\Users\\Luna\\a.zip")).toBe("a.zip");
    expect(dirname("C:\\Users\\Luna\\a.zip")).toBe("C:\\Users\\Luna");
    expect(dirname("C:\\a.zip")).toBe("C:\\");
    expect(dirname("/home/luna/a.zip")).toBe("/home/luna");
    expect(join("C:\\Users", "x")).toBe("C:\\Users\\x");
    expect(join("/tmp", "x")).toBe("/tmp/x");
  });

  it("strips archive extensions, double ones included", () => {
    expect(stripArchiveExtension("photos.tar.gz")).toBe("photos");
    expect(stripArchiveExtension("disk.7z.001")).toBe("disk");
    expect(stripArchiveExtension("notes.zip")).toBe("notes");
    expect(stripArchiveExtension(".zip")).toBe(".zip");
  });
});

describe("formats", () => {
  it("knows archive names", () => {
    expect(isArchiveName("x.RAR")).toBe(true);
    expect(isArchiveName("x.tar.gz")).toBe(true);
    expect(isArchiveName("x.txt")).toBe(false);
  });

  it("swaps the extension when the format changes", () => {
    expect(withFormatExtension("C:\\a\\Moon.7z", "zip")).toBe("C:\\a\\Moon.zip");
    expect(withFormatExtension("C:\\a\\Moon.tar.gz", "tar.xz")).toBe("C:\\a\\Moon.tar.xz");
    expect(withFormatExtension("C:\\a\\Moon", "7z")).toBe("C:\\a\\Moon.7z");
  });
});
