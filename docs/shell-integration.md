# The right-click menu

Moon Zip adds two entries to the classic right-click menu of Windows Explorer (on Windows 11
under "Show more options"), and itself to "Open with" for archives:

| On | Entry | Items |
| --- | --- | --- |
| Archives (7z, zip, rar, tar, gz, xz, iso, … – `ARCHIVE_EXTENSIONS` in `electron/shell-integration/registry.cjs`) | **Extract with Moon Zip** | Open in Moon Zip, Extract here, Extract to new folder, Extract to…, Test archive |
| Every file and folder | **Compress with Moon Zip** | Add to archive…, Compress to .7z, Compress to .zip, Checksums… |

Everything is written for the signed-in user only, under `HKCU\Software\Classes`, so no
administrator rights are needed and other users aren't touched. Moon Zip never makes itself the
default app for a file type: it only adds itself to the type's `OpenWithProgids`, so it shows up in
"Open with" and the user decides.

## Switching it on and off

- The installer's last page: **Add Moon Zip to the right-click menu** (ticked by default). It runs
  `Moon Zip.exe --register-shell`.
- In the app: **Settings → Show Moon Zip in the right-click menu**.
- Uninstalling runs `Moon Zip.exe --unregister-shell` first, so no menu item is left pointing at a
  missing program.
- After an update to another folder, Moon Zip notices on its next start that the menu points at the
  old copy and points it at itself.

Switching it off removes Moon Zip's own keys (`MoonZip.ExtractMenu`, `MoonZip.CompressMenu`,
`MoonZip.Archive`, `Applications\Moon Zip.exe` and the two verbs) and only its own value from each
extension's `OpenWithProgids`; the extensions' keys themselves stay.

## How the menu works

Both entries are cascading menus that share their items through `ExtendedSubCommandsKey`:

```
HKCU\Software\Classes
  MoonZip.ExtractMenu\shell\02here          MUIVerb = Extract here, MultiSelectModel = Player
    \command                                "…\Moon Zip.exe" --extract-here "%1"
  SystemFileAssociations\.zip\shell\MoonZip.Extract
                                            MUIVerb = Extract with Moon Zip,
                                            ExtendedSubCommandsKey = MoonZip.ExtractMenu
  *\shell\MoonZip.Compress                  MUIVerb = Compress with Moon Zip,
  Directory\shell\MoonZip.Compress          ExtendedSubCommandsKey = MoonZip.CompressMenu
```

`MultiSelectModel = Player` keeps the items visible however many files are selected. Explorer then
starts Moon Zip once per selected file. The first process holds the single-instance lock, and the
others hand their file over (`second-instance`); requests for the same action that arrive within
0.7 s of each other are merged into one (`Batcher` in `electron/start.cjs`). So selecting three
files and choosing **Compress to .zip** makes one archive with all three, named after their folder,
and **Extract here** on three archives extracts all three in one window.

The keys are written in one go with `reg.exe import` of a generated `.reg` file (UTF-16 LE).
