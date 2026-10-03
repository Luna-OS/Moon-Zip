import { useEffect, useMemo, useState } from "react";
import { ArchiveWindow } from "./app/ArchiveWindow";
import { BridgeContext, PrefsContext } from "./app/context";
import { loadPrefs, loadTheme, savePrefs, saveTheme, type Prefs } from "./app/storage";
import { TaskWindow } from "./app/TaskWindow";
import { defaultBridge } from "./lib/bridge";
import type { MoonZipBridge, StartRequest } from "./lib/types";
import { Sky } from "./theme/Sky";
import { useDocumentTheme, type ThemeChoice } from "./theme/useTheme";

/**
 * Moon Zip's UI. The main process tells each window what it is for (sys:takeStart): the start page,
 * an archive, or a right-click-menu task.
 */
export default function App({ bridge: given }: { bridge?: MoonZipBridge }) {
  const bridge = useMemo(() => given ?? defaultBridge(), [given]);
  const [start, setStart] = useState<StartRequest | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const resolved = useDocumentTheme(theme);
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const prefsValue = useMemo(
    () => ({
      prefs,
      setPrefs: (next: Prefs) => {
        setPrefsState(next);
        savePrefs(next);
      },
    }),
    [prefs],
  );

  useEffect(() => {
    void bridge.takeStart().then(setStart, () => setStart({ kind: "home" }));
  }, [bridge]);

  useEffect(() => {
    void bridge.setTheme(resolved).catch(() => {});
  }, [bridge, resolved]);

  // The main process shows files and dialogs itself, so it needs the Moon Explorer choice.
  useEffect(() => {
    void bridge.setPrefs({ useMoonExplorer: prefs.useMoonExplorer }).catch(() => {});
  }, [bridge, prefs.useMoonExplorer]);

  function chooseTheme(t: ThemeChoice) {
    setTheme(t);
    saveTheme(t);
  }

  return (
    <BridgeContext.Provider value={bridge}>
      <PrefsContext.Provider value={prefsValue}>
        <Sky moon={start?.kind !== "task"} />
        {start?.kind === "task" && <TaskWindow action={start.action} paths={start.paths} />}
        {start && start.kind !== "task" && (
          <ArchiveWindow
            initialPath={start.kind === "open" ? start.path : null}
            theme={theme}
            resolvedTheme={resolved}
            onTheme={chooseTheme}
          />
        )}
      </PrefsContext.Provider>
    </BridgeContext.Provider>
  );
}
