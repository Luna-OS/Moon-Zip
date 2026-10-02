/** Why a new name doesn't work, or null when it does. */
export function nameProblem(name: string, taken: string[]): string | null {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (/[\\/]/.test(n)) return "A name can't contain / or \\.";
  if (n === "." || n === "..") return "That name isn't allowed.";
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase()))
    return "Something with that name is already here.";
  return null;
}
