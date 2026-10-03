# Moon Explorer instead of Windows Explorer

When [Moon Explorer](https://github.com/Luna-OS/Moon-Explorer) is installed, Moon Zip uses it
wherever it would otherwise use Windows Explorer:

| Where | With Moon Explorer | Without it |
| --- | --- | --- |
| After extracting (archive window, **Extract to…**, **Extract here**, **Extract to new folder**) | The folder opens in a new Moon Explorer tab | Windows Explorer |
| **Show in …** after a right-click action | Moon Explorer (a new archive is selected in its folder) | Windows Explorer |
| **Open archive…** | Moon Explorer's Open dialog (filtered to archives) | The Windows dialog |
| **Browse…** for where to extract, **Add → A folder…** | Moon Explorer's folder dialog | The Windows dialog |
| **Browse…** for where to save a new archive | Moon Explorer's Save dialog (asks before replacing) | The Windows dialog |
| **Add → Files…** | The Windows dialog (it picks several files at once; Moon Explorer's dialog picks one) | The Windows dialog |

The dialogs need Moon Explorer 0.3.0 or later (its Open/Save dialog, Moon-Explorer's
`docs/picker.md`); with an older one, Moon Zip still shows files in it and keeps the Windows
dialogs.

**Settings** has two switches:

- **Use Moon Explorer instead of Windows Explorer** (on by default; greyed out while Moon Explorer
  isn't installed). Off means Windows Explorer and the Windows dialogs, even with Moon Explorer.
- **Show the files after extracting** (on by default): the folder with the extracted files opens
  when extracting is done, after the right-click menu's **Extract here** and **Extract to new
  folder** too. The Extract dialog's own checkbox starts from this setting.

## How Moon Zip finds it

`electron/moon-explorer.cjs` looks, in this order, at:

1. the folder Moon Explorer's installer recorded: `InstallLocation` under
   `HKCU\Software\74cedd07-97eb-5d75-a049-4f2e38bde0fe` (a per-user install) or the same key in
   HKLM (for all users). The GUID is electron-builder's UUID v5 of Moon Explorer's appId
   `os.luna.moon-explorer`, so it stays the same across versions and install folders;
2. `%LOCALAPPDATA%\Programs\Moon Explorer\Moon Explorer.exe`, the default per-user folder;
3. `%ProgramFiles%\Moon Explorer\Moon Explorer.exe`.

The version comes from Moon Explorer's own `package.json` inside its `resources\app.asar`. It is
looked up each time, so installing or removing Moon Explorer takes effect without restarting
Moon Zip. A portable Moon Explorer (from the ZIP) isn't found.

Moon Zip starts Moon Explorer with the folder (`"Moon Explorer.exe" "C:\…\Photos"`, a new tab) or a
file (its folder, with the file selected), and for the dialogs with `--open-dialog`,
`--save-dialog` or `--pick-folder` and `--result <temp file>`, then reads the chosen path back.
