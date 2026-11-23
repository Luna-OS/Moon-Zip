# Archives in several parts

Big downloads often come as one archive cut into parts: `Game.part1.rar` … `Game.part5.rar`.
Moon Zip treats such a set as **one archive**.

| Naming | Parts | Opened through |
| --- | --- | --- |
| `name.part1.rar`, `name.part2.rar`, … (also `part01`, `part001`) | RAR | `name.part1.rar` |
| `name.7z.001`, `name.7z.002`, … (also `.zip.001`, `.tar.001`, …) | any archive cut by 7-Zip or Moon Zip | `name.7z.001` |
| `name.rar`, `name.r00`, `name.r01`, … | RAR, old naming | `name.rar` |
| `name.z01`, `name.z02`, …, `name.zip` | split ZIP | `name.zip` |

What that means:

- **Any part opens the whole archive.** Double-click `part3`, drop `part5` on the window, or pick
  it in the Open dialog: Moon Zip opens the set through its first part. The title bar shows
  **5 parts**, and the size in the status bar and in Archive info is that of all parts together.
- **Select all the parts and extract once.** With all five parts selected, **Extract here**,
  **Extract to new folder**, **Extract to…** and **Test archive** in the right-click menu run once
  for the set, not once per part. Selecting just one part does the same. The new folder is named
  after the archive (`Game`), without `.part1`.
- **Dropping all the parts on the start page** opens the archive (instead of offering to pack them).
- **Missing parts are named.** If `Game.part3.rar` isn't in the folder, Moon Zip says so before it
  starts, and creates nothing. When the last parts are missing (nothing in the names says how many
  there should be), it says that the archive ends too early and how many parts it found.
- All parts must be **in the same folder**. Archives in parts open read-only.

Creating one: in **Add to archive…**, choose a size under **Split into** (7z, ZIP and tar).

## How it works

`electron/engine/volumes.cjs` reads the names in the archive's folder and works out the set: its
first part, its parts in reading order (`part10` after `part9`), and the names that are missing.
`engine.cjs` sends every reading command (list, extract, test) to the first part, and `main.cjs`
merges the parts in a right-click selection into one archive before a window opens. 7-Zip itself
then reads from one part into the next.
