import type { CodedError } from "../lib/types";

export const isCancelled = (e: unknown) => (e as CodedError)?.code === "ECANCELLED";
export const needsPassword = (e: unknown) => (e as CodedError)?.code === "ENEEDPASS";
export const badPassword = (e: unknown) => (e as CodedError)?.code === "EBADPASS";

export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
