import { useEffect, useState } from "react";
import type { MoonExplorerInfo } from "../lib/types";
import { useBridge, usePrefs } from "./context";

/**
 * The installed Moon Explorer and whether Moon Zip uses it (Settings → "Use Moon Explorer"):
 * `active` is true when files are shown in it instead of Windows Explorer.
 */
export function useMoonExplorer(): { info: MoonExplorerInfo | null; active: boolean } {
  const bridge = useBridge();
  const { prefs } = usePrefs();
  const [info, setInfo] = useState<MoonExplorerInfo | null>(null);
  useEffect(() => {
    let live = true;
    bridge
      .info()
      .then((i) => live && setInfo(i.moonExplorer ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bridge]);
  return { info, active: !!info && prefs.useMoonExplorer };
}

/** "Moon Explorer" or "Windows Explorer", for labels like "Show in …". */
export const explorerName = (active: boolean) => (active ? "Moon Explorer" : "Windows Explorer");
