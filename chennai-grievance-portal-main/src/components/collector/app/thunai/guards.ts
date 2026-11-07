/**
 * Pure guards the Jarvis client applies (unit-tested here; Thunai.tsx uses them).
 */
/**
 * The guard is tested on what the click guard really builds: the button's accessible name and its text joined, so a bare "Yes" button
 * reads "Yes Yes" (RC-33): the yes list accepts the word repeated. Adding a chart to the dashboard keeps it too.
 */
export const KEEP_BUTTON = /\b(save|pin|unpin|bookmark|keep)\b|\badd\b[^.]{0,60}\bdashboard\b|^\s*(yes|ok|okay|ஆம்|ஆமாம்|சரி)(\s+(yes|ok|okay|ஆம்|ஆமாம்|சரி))*[\s.!✓✔]*$|சேமி|பின் /i;

/** Does a button keep something? Its name and its text are each tested alone as well as together, so neither can hide the other. */
export const keepsSomething = (name: string | null | undefined, text: string | null | undefined): boolean => {
  const n = String(name ?? "").trim(), t = String(text ?? "").trim();
  return [n, t, `${n} ${t}`.trim()].some((s) => !!s && KEEP_BUTTON.test(s));
};

/** GET /api/collector/workspaces gives name groups with their versions, newest first: the id to open for each name (BUG-013) */
export function workspaceIds(raw: unknown): { name: string; id: number }[] {
  const list = (Array.isArray(raw) ? raw : []) as { id?: number; name?: string; versions?: { id: number }[] }[];
  return list.map((x) => ({ name: String(x.name ?? ""), id: x.id ?? x.versions?.[0]?.id })).filter((x): x is { name: string; id: number } => !!x.name && typeof x.id === "number");
}
