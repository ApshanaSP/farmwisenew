/**
 * v5 G3 (a), the browser's half: the news and complaint text the open Stage shows (headlines, complaint titles, a case's what, why and
 * timeline, brief points), sent with a remember op so the store can refuse a note copied off the screen. Used for that check only and
 * never kept (store.ts). Pure; at most 60 strings of 300 characters, the route's limits.
 */
import type { StageDocT } from "./stage";

export function stageShownText(doc: StageDocT | null | undefined): string[] {
  if (!doc) return [];
  const out: string[] = [];
  for (const b of doc.blocks) {
    if (b.kind === "CaseList") out.push(...b.rows.map((r) => r.title));
    else if (b.kind === "CaseDetail") out.push(b.incident.title, ...b.incident.what, ...(b.incident.why ? [b.incident.why] : []), ...b.timeline.map((t) => t.text));
    else if (b.kind === "NewsReader") out.push(...b.items.map((i) => i.title));
    else if (b.kind === "Brief") out.push(...b.points.map((p) => p.text));
  }
  return out.filter((x) => typeof x === "string" && x.trim()).map((x) => x.slice(0, 300)).slice(0, 60);
}
