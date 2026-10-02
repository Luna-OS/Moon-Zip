import { createContext, useContext } from "react";
import type { MoonZipBridge } from "../lib/types";

export const BridgeContext = createContext<MoonZipBridge | null>(null);

export function useBridge(): MoonZipBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("useBridge needs a BridgeContext provider");
  return bridge;
}
