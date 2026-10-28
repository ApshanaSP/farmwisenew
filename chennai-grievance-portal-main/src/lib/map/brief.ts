/**
 * The Area brief ("What is happening here?"): for a ward, zone, taluk or circle, every department's open issues there,
 * the worst three with the priority rule that fired, the departments with their past-deadline counts, this month
 * against the one before, the facilities in and around it, and how many came from citizens (counts only, never personal
 * data). Every count carries its incident ids, so it opens its list, and the list's total equals the count. Pure.
 */
import { distToLineM, fmtDistance, haversineM, pointInPolygon, type LatLon } from "./geom";
import { areaLabel, byPriority, drawnRadius, periodRange, type Ctx, type Hit } from "./execute";
import type { AreaRef } from "./plan";
import type { Inc, LayerId, World } from "./types";
import { CAT_TA, LAYER_WORD } from "./words";
import { MIN_PCT_BASE, changeWords, pctChange } from "@/lib/reference/metrics";

export interface Brief {
  area: AreaRef;
  label: { en: string; ta: string };
  open: { n: number; ids: string[] };
  byType: { cat: string; en: string; ta: string; n: number; ids: string[] }[];
  worst: { id: string; title: string; sev: string; reasons: string | null; dept: string }[];
  depts: { code: string; name: string; open: number; overdue: number; ids: string[]; overdueIds: string[] }[];
  change: { now: number; before: number; nowIds: string[]; beforeIds: string[]; pct: number | null; en: string; ta: string };
  facilities: { layer: LayerId; en: string; ta: string; n: number; items: { id: string; name: string | null; m: number; inside: boolean }[] }[];
  citizen: { n: number; ids: string[] };
  /** open issues counted by record that cannot be pinned */
  unplaced: { n: number; ids: string[] };
  /** how membership was decided, said once */
  rule_en: string;
  rule_ta: string;
}

const FAC_LAYERS: LayerId[] = ["schools", "hospitals", "police", "fire_stations", "water_bodies", "waterways"];

export function areaBrief(area: AreaRef, w: World, ctx: Ctx, lockDept: string | null = null): Brief {
  const byRecord = area.kind === "ward" || area.kind === "zone" || area.kind === "taluk";
  let centre: LatLon | null = null, radius = 0;
  if (area.kind === "point" || area.kind === "drawn") {
    const p = ctx.place(area.kind === "point" ? area.ref : `drawn:${area.id}`);
    radius = area.kind === "point" ? area.radius_m : drawnRadius(area.id) ?? 0;
    if (!p || !radius) throw new Error("The place could not be found on the map.");
    centre = p;
  }
  const inside = (i: Inc) => area.kind === "ward" ? i.ward === area.id : area.kind === "zone" ? i.zone === area.id : area.kind === "taluk" ? i.taluk === area.code
    : i.pinnable && haversineM(i, centre!) <= radius;
  const mine = w.incidents.filter((i) => inside(i) && (!lockDept || i.dept === lockDept));
  const open = mine.filter((i) => i.open).map((inc) => ({ inc, near: null }) as Hit).sort(byPriority);

  const types = new Map<string, string[]>();
  for (const h of open) (types.get(h.inc.cat) ?? types.set(h.inc.cat, []).get(h.inc.cat)!).push(h.inc.id);
  const byType = [...types.entries()].map(([cat, ids]) => ({ cat, en: w.cats.get(cat)?.label ?? cat, ta: CAT_TA[cat] ?? cat, n: ids.length, ids }))
    .sort((a, b) => b.n - a.n || a.cat.localeCompare(b.cat));

  const depts = new Map<string, { open: string[]; over: string[] }>();
  for (const h of open) {
    const d = depts.get(h.inc.dept) ?? depts.set(h.inc.dept, { open: [], over: [] }).get(h.inc.dept)!;
    d.open.push(h.inc.id);
    if (h.inc.breached) d.over.push(h.inc.id);
  }

  // reported in the last 30 days against the 30 before (any status)
  const win = (offset: number) => {
    const r = periodRange({ kind: "last_days", days: 30, offset }, w.now);
    return mine.filter((i) => i.first > r.from && i.first <= r.to).map((i) => i.id);
  };
  const nowIds = win(0), beforeIds = win(1);
  const pct = pctChange(nowIds.length, beforeIds.length);

  // facilities inside the area or within 1 km of it
  const near = (p: LatLon): { m: number; inside: boolean } | null => {
    if (centre) { const m = haversineM(p, centre); return m <= radius + 1000 ? { m: Math.max(0, m - radius), inside: m <= radius } : null; }
    const wards = w.wards.filter((wd) => area.kind === "ward" ? wd.ward === area.id : area.kind === "zone" ? wd.zone === area.id : wd.taluk === (area as { code: string }).code);
    let best = Infinity;
    for (const wd of wards) {
      if (p.lat < wd.bbox.s - 0.01 || p.lat > wd.bbox.n + 0.01 || p.lon < wd.bbox.w - 0.01 || p.lon > wd.bbox.e + 0.01) continue;
      if (pointInPolygon(p, wd.rings)) return { m: 0, inside: true };
      for (const r of wd.rings) best = Math.min(best, distToLineM(p, r).m);
    }
    return best <= 1000 ? { m: best, inside: false } : null;
  };
  const facilities: Brief["facilities"] = [];
  for (const layer of FAC_LAYERS) {
    const items: Brief["facilities"][number]["items"] = [];
    if (layer === "water_bodies") for (const f of w.water) { const r = near(f); if (r) items.push({ id: f.id, name: f.name, ...r }); }
    else if (layer === "waterways") for (const l of w.lines.waterways) {
      const pts = l.lines.flat().filter((_, i) => i % 4 === 0).map(([lat, lon]) => ({ lat, lon }));
      const r = pts.map(near).filter((x): x is { m: number; inside: boolean } => !!x).sort((a, b) => a.m - b.m)[0];
      if (r) items.push({ id: l.id, name: l.name, ...r });
    } else for (const p of (w.points as Record<string, { id: string; name: string | null; lat: number; lon: number; kind: string }[]>)[layer] ?? []) {
      if (layer === "hospitals" && p.kind === "clinic") continue;
      const r = near(p);
      if (r) items.push({ id: p.id, name: p.name, ...r });
    }
    items.sort((a, b) => a.m - b.m || a.id.localeCompare(b.id));
    facilities.push({ layer, en: LAYER_WORD[layer].en, ta: LAYER_WORD[layer].ta, n: items.length, items: items.slice(0, 12) });
  }
  const citizen = open.filter((h) => h.inc.citizen > 0).map((h) => h.inc.id);
  const unplaced = open.filter((h) => !h.inc.pinnable).map((h) => h.inc.id);
  const ch = changeWords(nowIds.length, beforeIds.length);
  return {
    area, label: areaLabel(area, w, ctx), open: { n: open.length, ids: open.map((h) => h.inc.id) }, byType,
    worst: open.slice(0, 3).map((h) => ({ id: h.inc.id, title: h.inc.title, sev: h.inc.sev, reasons: h.inc.reasons, dept: w.depts.get(h.inc.dept)?.name ?? h.inc.dept })),
    depts: [...depts.entries()].map(([code, d]) => ({ code, name: w.depts.get(code)?.name ?? code, open: d.open.length, overdue: d.over.length, ids: d.open, overdueIds: d.over }))
      .sort((a, b) => b.open - a.open || a.code.localeCompare(b.code)),
    change: {
      now: nowIds.length, before: beforeIds.length, nowIds, beforeIds, pct,
      en: pct != null ? `${nowIds.length} reported in the last 30 days, ${pct >= 0 ? "up" : "down"} ${Math.abs(Math.round(pct))} % on the 30 days before (${beforeIds.length})` : `${nowIds.length} reported in the last 30 days; ${ch}`,
      ta: `கடந்த 30 நாட்களில் ${nowIds.length}, அதற்கு முந்தைய 30 நாட்களில் ${beforeIds.length}${pct != null ? ` (${pct >= 0 ? "+" : "−"}${Math.abs(Math.round(pct))}%)` : ""}`
    },
    facilities, citizen: { n: citizen.length, ids: citizen }, unplaced: { n: unplaced.length, ids: unplaced },
    rule_en: byRecord ? `Counted by each report's recorded ${area.kind}, as the Overview counts.` : `Counted by map point within ${fmtDistance(radius)}; ${MIN_PCT_BASE}+ reports are needed for a percentage.`,
    rule_ta: byRecord ? "பதிவான பகுதியின்படி எண்ணப்பட்டது." : `வரைபடப் புள்ளியின்படி ${fmtDistance(radius, "ta")} க்குள் எண்ணப்பட்டது.`
  };
}
