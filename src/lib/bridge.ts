import { DemoBridge } from "./demo";
import type { CodedError, MoonZipBridge, StartRequest } from "./types";

declare global {
  interface Window {
    /** Set by electron/preload.cjs when the UI runs inside the desktop app. */
    moonZip?: MoonZipBridge;
    /** MOON_DEMO=1 in the desktop app: run on the demo, for screenshots (electron/preload.cjs). */
    moonZipDemo?: { start: StartRequest | null };
  }
}

interface Envelope {
  __envelope: true;
  ok: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

const isEnvelope = (v: unknown): v is Envelope =>
  typeof v === "object" && v !== null && (v as Envelope).__envelope === true;

/** The data of an envelope from electron/preload.cjs, or its error (with the code) thrown. */
export function unwrap(value: unknown): unknown {
  if (!isEnvelope(value)) return value;
  if (value.ok) return value.data;
  const err: CodedError = new Error(value.error);
  err.code = value.code;
  throw err;
}

/**
 * Wraps the preload bridge so that its calls resolve to their data or reject with coded errors.
 * (A plain copy, not a Proxy: the context bridge hands over a frozen object.)
 */
export function fromPreload(raw: MoonZipBridge): MoonZipBridge {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as unknown as Record<string, unknown>)) {
    out[key] =
      typeof value === "function"
        ? (...args: unknown[]) => {
            const result: unknown = (value as (...a: unknown[]) => unknown)(...args);
            return result instanceof Promise ? result.then(unwrap) : result;
          }
        : value;
  }
  return out as unknown as MoonZipBridge;
}

/** The desktop app's bridge, or the in-memory demo in a browser and in tests. */
export function defaultBridge(): MoonZipBridge {
  if (window.moonZip) return fromPreload(window.moonZip);
  return new DemoBridge(window.moonZipDemo?.start ? { start: window.moonZipDemo.start } : {});
}
