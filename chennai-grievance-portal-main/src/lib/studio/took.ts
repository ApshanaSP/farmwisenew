/**
 * What the Studio actually took from a file or a link, in a few plain facts: where it came from (and which table on a
 * page), how many rows were read and kept, which columns were used and as what, which were left out or kept private,
 * the period covered and how much of it was placed on the map. Read from the saved dataset only (no rows, no model),
 * so the page and the dashboard say the same thing.
 */
import type { DatasetMeta, Role } from "@/lib/studio/types";
import { fmtDay } from "@/lib/studio/values";

export interface TookColumn { header: string; label: string; as: string; role: Role }
export interface Took {
  kind: "file" | "link" | "sample";
  /** the file's name, or the link's site and path */
  source: string;
  url: string | null;
  /** the sheet, or the table chosen on a page ("Table 2 of 5: Lake levels") */
  part: string | null;
  rowsRead: number;
  rowsKept: number;
  cols: number;
  used: TookColumn[];
  /** personal details: kept out of every chart and view */
  hidden: string[];
  /** columns read but not used for the charts (free text, record numbers, marked "not used") */
  unused: string[];
  period: string | null;
  /** share of kept rows placed on the district map, 0..100 (null when the data has no places) */
  placedPct: number | null;
  /** the link with district incidents, in words, or null */
  linked: string | null;
}

/** What a column is used as, in one word a Collector reads at a glance. */
const AS: Partial<Record<Role, string>> = {
  date: "Date", place: "Place", ward: "Ward", zone: "Zone", taluk: "Taluk", lat: "Map point", lon: "Map point",
  category: "Type", status: "Status", measure: "Number"
};

export function tookOf(meta: Pick<DatasetMeta, "source" | "detective" | "cols" | "spec" | "window" | "link">): Took {
  const s = meta.source, d = meta.detective, cx = s.connect ?? null;
  let source = s.file;
  if (s.url) {
    try { const u = new URL(s.url); source = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`; } catch { /* keep the file name */ }
  }
  let part: string | null = null;
  if (cx?.candidates?.length) {
    const i = cx.candidates.findIndex((c) => c.id === cx.choice);
    const c = i >= 0 ? cx.candidates[i] : null;
    if (c) part = cx.candidates.length > 1 ? `${c.label} (${i + 1} of ${cx.candidates.length} found on the page)` : c.label;
  } else if (s.sheet) part = s.sheets.length > 1 ? `Sheet "${s.sheet}" (${s.sheets.length} sheets in the file)` : `Sheet "${s.sheet}"`;
  if (!part && s.caption) part = s.caption;
  const used: TookColumn[] = [];
  const hidden: string[] = [], unused: string[] = [];
  const seenPoint = { v: false };
  for (const c of meta.spec.columns) {
    if (c.role === "person") { hidden.push(c.header); continue; }
    const as = AS[c.role];
    if (!as) { unused.push(c.header); continue; }
    // latitude and longitude are one map point
    if (c.role === "lat" || c.role === "lon") { if (seenPoint.v) continue; seenPoint.v = true; }
    used.push({ header: c.header, label: c.label, as, role: c.role });
  }
  const placed = d.rowsOut && d.placed ? Math.round((d.placed / d.rowsOut) * 100) : null;
  const w = meta.window;
  const period = w.from && w.to ? (w.from === w.to ? fmtDay(w.from) : `${fmtDay(w.from)} – ${fmtDay(w.to)}`) : null;
  const l = meta.link;
  const linked = l && l.strength && l.strength !== "none"
    ? `${l.strength.charAt(0).toUpperCase()}${l.strength.slice(1)} link with district incidents`
    : null;
  return { kind: s.kind, source, url: s.url, part, rowsRead: d.rowsIn, rowsKept: d.rowsOut, cols: meta.cols, used, hidden, unused, period,
    placedPct: placed != null && placed > 0 ? placed : null, linked };
}
