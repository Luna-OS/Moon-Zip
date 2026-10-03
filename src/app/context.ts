import { createContext, useContext } from "react";
import type { MoonZipBridge } from "../lib/types";
import { DEFAULT_PREFS, type Prefs } from "./storage";

export const BridgeContext = createContext<MoonZipBridge | null>(null);

export function useBridge(): MoonZipBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("useBridge needs a BridgeContext provider");
  return bridge;
}

export interface PrefsValue {
  prefs: Prefs;
  setPrefs: (next: Prefs) => void;
}

/** The preferences from Settings (Moon Explorer, showing extracted files); App owns them. */
export const PrefsContext = createContext<PrefsValue>({ prefs: DEFAULT_PREFS, setPrefs: () => {} });

export const usePrefs = () => useContext(PrefsContext);
