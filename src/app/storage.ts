import type { ThemeChoice } from "../theme/useTheme";

/*
 * Small per-user preferences in localStorage. Every access is guarded: storage can be missing or
 * full, and the app must work the same without it.
 */

const KEYS = { theme: "moon-zip:theme", recent: "moon-zip:recent", prefs: "moon-zip:prefs" };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not available */
  }
}

export interface Prefs {
  /** Show files in Moon Explorer and use its Open/Save dialog when it is installed. */
  useMoonExplorer: boolean;
  /** Show the extracted files when extracting is done (the right-click menu's actions too). */
  showAfterExtract: boolean;
}

export const DEFAULT_PREFS: Prefs = { useMoonExplorer: true, showAfterExtract: true };

export function loadPrefs(): Prefs {
  const v = read<Partial<Prefs>>(KEYS.prefs, {});
  return {
    useMoonExplorer: v.useMoonExplorer !== false,
    showAfterExtract: v.showAfterExtract !== false,
  };
}

export const savePrefs = (prefs: Prefs) => write(KEYS.prefs, prefs);

export function loadTheme(): ThemeChoice {
  const v = read<string>(KEYS.theme, "dark");
  return v === "light" || v === "system" ? v : "dark";
}

export const saveTheme = (choice: ThemeChoice) => write(KEYS.theme, choice);

const MAX_RECENT = 8;

export function loadRecent(): string[] {
  const v = read<unknown>(KEYS.recent, []);
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
    : [];
}

export function rememberRecent(path: string): string[] {
  const next = [path, ...loadRecent().filter((p) => p.toLowerCase() !== path.toLowerCase())].slice(
    0,
    MAX_RECENT,
  );
  write(KEYS.recent, next);
  return next;
}

export function forgetRecent(path: string): string[] {
  const next = loadRecent().filter((p) => p !== path);
  write(KEYS.recent, next);
  return next;
}
