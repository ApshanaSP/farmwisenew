/**
 * Pure guards the Jarvis client applies (unit-tested here; Thunai.tsx uses them).
 */
/** buttons that keep something or answer a question: level B, the Collector's own tap, never a spoken click (BUG-014) */
export const KEEP_BUTTON = /\b(save|pin|unpin|bookmark|keep)\b|^\s*(yes|ok|okay)\s*$|சேமி|பின் /i;

/** GET /api/collector/workspaces gives name groups with their versions, newest first: the id to open for each name (BUG-013) */
export function workspaceIds(raw: unknown): { name: string; id: number }[] {
  const list = (Array.isArray(raw) ? raw : []) as { id?: number; name?: string; versions?: { id: number }[] }[];
  return list.map((x) => ({ name: String(x.name ?? ""), id: x.id ?? x.versions?.[0]?.id })).filter((x): x is { name: string; id: number } => !!x.name && typeof x.id === "number");
}
