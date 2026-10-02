"use strict";
// npm run fetch-7zip – downloads the official 7-Zip build that Moon Zip runs on and puts it in vendor/7zip/.
//
//   vendor/7zip/win-x64/    7z.exe, 7z.dll, License.txt  (packed into the installer as resources/7zip)
//   vendor/7zip/linux-x64/  7zz, License.txt             (only on Linux: for npm run app and the tests)
//
// Every download is checked against the SHA-256 below, so a build always ships exactly this 7-Zip.
// To move to a newer 7-Zip, change VERSION and the hashes (sha256sum of the files from 7-zip.org).
// curl does the downloads: it ships with Windows 10 and later and honours proxy settings.

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VERSION = "26.03";
const TAG = VERSION.replace(".", "");
const BASE = "https://www.7-zip.org/a/";
const FILES = {
  windowsSetup: {
    name: `7z${TAG}-x64.exe`,
    sha256: "0859c524b8a63551848f0c246abddcb1d0b7b656b0fbfe879f8d85e61a9e6edd",
  },
  windowsReducer: {
    name: "7zr.exe",
    sha256: "ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d",
  },
  linux: {
    name: `7z${TAG}-linux-x64.tar.xz`,
    sha256: "dc99eff5008f1ab79bd7084c68513701547a808a89502bf4133683535ab3c695",
  },
};

const root = path.join(__dirname, "..");
const vendor = path.join(root, "vendor", "7zip");
const marker = (dir) => path.join(dir, "VERSION");
const upToDate = (dir, files) =>
  files.every((f) => fs.existsSync(path.join(dir, f))) &&
  fs.existsSync(marker(dir)) &&
  fs.readFileSync(marker(dir), "utf8").trim() === VERSION;

function download({ name, sha256 }, dir) {
  const file = path.join(dir, name);
  console.log(`Downloading ${BASE}${name}`);
  execFileSync("curl", ["-fsSL", "--retry", "3", "-o", file, `${BASE}${name}`], {
    stdio: "inherit",
  });
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (actual !== sha256) throw new Error(`${name}: SHA-256 is ${actual}, expected ${sha256}`);
  return file;
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "moon-zip-7zip-"));
  try {
    // On Linux the Linux 7zz is needed anyway (to run the app), and it also unpacks the Windows setup.
    let unpacker = null;
    const linuxDir = path.join(vendor, "linux-x64");
    if (process.platform === "linux") {
      if (!upToDate(linuxDir, ["7zz"])) {
        const tarball = download(FILES.linux, tmp);
        fs.mkdirSync(linuxDir, { recursive: true });
        execFileSync("tar", ["-xJf", tarball, "-C", linuxDir, "7zz", "License.txt"]);
        fs.writeFileSync(marker(linuxDir), VERSION);
      }
      unpacker = path.join(linuxDir, "7zz");
    }

    const winDir = path.join(vendor, "win-x64");
    const winFiles = ["7z.exe", "7z.dll", "License.txt"];
    if (!upToDate(winDir, winFiles)) {
      const setup = download(FILES.windowsSetup, tmp);
      // The setup is a 7z self-extracting archive; take only the console tool, its codecs and the license.
      const unpack = (tool) =>
        execFileSync(tool, ["e", setup, `-o${winDir}`, "-y", "-bso0", "-bsp0", ...winFiles], {
          stdio: "inherit",
        });
      fs.mkdirSync(winDir, { recursive: true });
      if (unpacker) unpack(unpacker);
      else if (process.platform === "win32") {
        // 7zr.exe (the 7z-only console tool) unpacks the setup; a 7-Zip that is installed already
        // (GitHub's Windows runners have one) is the fallback.
        const installed = path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "7-Zip",
          "7z.exe",
        );
        try {
          unpack(download(FILES.windowsReducer, tmp));
        } catch (e) {
          if (!fs.existsSync(installed)) throw e;
          console.log(`7zr.exe failed (${e.message}); using ${installed}`);
          unpack(installed);
        }
      } else throw new Error("Unpacking the Windows 7-Zip needs Windows or Linux.");
      for (const f of winFiles)
        if (!fs.existsSync(path.join(winDir, f)))
          throw new Error(`${f} is missing after unpacking`);
      fs.writeFileSync(marker(winDir), VERSION);
    }
    console.log(`7-Zip ${VERSION} is ready in ${vendor}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (e) {
  console.error(`fetch-7zip: ${e.message}`);
  process.exit(1);
}
