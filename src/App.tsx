import { useEffect, useMemo, useState } from "react";
import { ArchiveWindow } from "./app/ArchiveWindow";
import { BridgeContext } from "./app/context";
import { loadTheme, saveTheme } from "./app/storage";
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

  useEffect(() => {
    void bridge.takeStart().then(setStart, () => setStart({ kind: "home" }));
  }, [bridge]);

  useEffect(() => {
    void bridge.setTheme(resolved).catch(() => {});
  }, [bridge, resolved]);

  function chooseTheme(t: ThemeChoice) {
    setTheme(t);
    saveTheme(t);
  }

  return (
    <BridgeContext.Provider value={bridge}>
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
    </BridgeContext.Provider>
  );
}
