import { useEffect, useState, type ReactNode } from "react";
import type { AppInfo, ShellIntegrationStatus } from "../../lib/types";
import type { ThemeChoice } from "../../theme/useTheme";
import { messageOf } from "../errors";
import { useBridge, usePrefs } from "../context";
import { Dialog, OptionGroup } from "./Dialog";

export function SettingsDialog({
  theme,
  onTheme,
  onClose,
}: {
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  onClose: () => void;
}) {
  const bridge = useBridge();
  const { prefs, setPrefs } = usePrefs();
  const [shell, setShell] = useState<ShellIntegrationStatus | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void bridge
      .shellIntegration()
      .then(setShell)
      .catch(() => setShell(null));
    void bridge
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [bridge]);

  async function toggleShell(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      setShell(await bridge.setShellIntegration(enabled));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog eyebrow="Settings" title="Moon Zip settings" onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-5">
        <OptionGroup
          label="Theme"
          value={theme}
          onChange={onTheme}
          options={[
            { value: "dark", title: "Night", hint: "The Moon look" },
            { value: "light", title: "Day", hint: "Bright and calm" },
            { value: "system", title: "System", hint: "Follows Windows" },
          ]}
        />

        <div className="mz-inset flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="mz-shell" className="text-[0.8125rem] font-semibold">
              Show Moon Zip in the right-click menu
            </label>
            <p className="mt-0.5 text-xs text-(--mz-text-muted)">
              Adds “Extract with Moon Zip” to archives and “Compress with Moon Zip” to files and
              folders in Windows Explorer, and Moon Zip to “Open with”. Only for you, no
              administrator rights needed.
            </p>
            {shell && !shell.supported && (
              <p className="mt-1 text-xs text-(--mz-warning)">Only available on Windows.</p>
            )}
            {error && (
              <p role="alert" className="mt-1 text-xs text-(--mz-danger)">
                {error}
              </p>
            )}
          </div>
          <input
            id="mz-shell"
            type="checkbox"
            role="switch"
            className="mz-switch mt-0.5"
            checked={!!shell?.enabled}
            disabled={busy || !shell?.supported}
            onChange={(e) => void toggleShell(e.target.checked)}
          />
        </div>

        <SwitchRow
          id="mz-moon-explorer"
          label="Use Moon Explorer instead of Windows Explorer"
          checked={prefs.useMoonExplorer && !!info?.moonExplorer}
          disabled={!info?.moonExplorer}
          onChange={(on) => setPrefs({ ...prefs, useMoonExplorer: on })}
        >
          {info?.moonExplorer ? (
            <>
              Moon Explorer {info.moonExplorer.version ?? ""} is installed. Moon Zip shows extracted
              files and new archives in it
              {info.moonExplorer.picker
                ? ", and uses its Open, Save and folder dialogs."
                : ". Update it to 0.3.0 or later to use its Open and Save dialogs too."}
            </>
          ) : (
            <>
              Moon Explorer isn’t installed{info ? "" : " (checking…)"}, so Windows Explorer is
              used. Install Moon Explorer and Moon Zip uses it on its own.
            </>
          )}
        </SwitchRow>

        <SwitchRow
          id="mz-show-after"
          label="Show the files after extracting"
          checked={prefs.showAfterExtract}
          onChange={(on) => setPrefs({ ...prefs, showAfterExtract: on })}
        >
          Opens the folder with the extracted files, also after “Extract here” and “Extract to new
          folder” in the right-click menu.
        </SwitchRow>

        <div className="text-xs leading-relaxed text-(--mz-text-muted)">
          <p>
            Moon Zip {info?.version ?? ""} · part of the Luna-OS Moon family (MoonDisk, MoonTask,
            Moon Browser, Moon Explorer).
          </p>
          <p>
            Archives are read and written by 7-Zip {info?.sevenZip || ""}, © Igor Pavlov, under the
            GNU LGPL (with the unRAR restriction). Its license comes with the app, in{" "}
            {"resources\\7zip\\License.txt"}.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/** A setting with a switch on the right: the label, a short explanation and the switch. */
function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="mz-inset flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-[0.8125rem] font-semibold">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-(--mz-text-muted)">{children}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="mz-switch mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
