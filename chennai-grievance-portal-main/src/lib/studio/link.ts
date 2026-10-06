/**
 * The Linker: does the added data move with what the district already records? The dataset's measure per zone (open
 * works, cases, shortages) is compared with incidents per zone over the same weeks, for the categories the AI said the
 * data is about and for every incident family; the strongest agreement is kept (Spearman rank correlation over the 15
 * zones). With dates, week-by-week series are compared too, allowing the data to trail incidents by up to two weeks
 * (fever after flooding). The result is an association, said as such; the incidents behind it open in the console.
 */
import type { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import type { DRow } from "@/lib/studio/clean";
import type { Refs } from "@/lib/studio/refs";
import type { LinkIncident, LinkResult, Spec } from "@/lib/studio/types";
import { addDays, daysBetween, spearman, weekStart } from "@/lib/studio/values";

interface Inc { z: number | null; w: number | null; c: string; f: string; o: boolean; news: boolean; late: boolean; d: string }

declare global {
  // eslint-disable-next-line no-var
  var __studioInc: { at: number; list: Inc[]; from: string; to: string } | undefined;
}

/** Every incident, slim (zone, ward, category, open, in the news, past deadline, day), cached for ten minutes. */
async function incidents(): Promise<{ list: Inc[]; from: string; to: string }> {
  const c = global.__studioInc;
  if (c && Date.now() - c.at < 10 * 60_000) return c;
  const [rows] = await intelPool.query<RowDataPacket[]>(
    `SELECT zone_no, ward_no, category_code, family, is_open, outlet_count, sla_breached, first_reported_at FROM incidents WHERE first_reported_at IS NOT NULL`
  );
  const list: Inc[] = rows.map((r) => ({
    z: r.zone_no == null ? null : Number(r.zone_no), w: r.ward_no == null ? null : Number(r.ward_no), c: String(r.category_code), f: String(r.family),
    o: Number(r.is_open) === 1, news: Number(r.outlet_count) > 0, late: Number(r.sla_breached) === 1, d: String(r.first_reported_at).slice(0, 10)
  }));
  const days = list.map((x) => x.d).sort();
  const out = { at: Date.now(), list, from: days[0] ?? "2026-01-01", to: days[days.length - 1] ?? "2026-01-01" };
  global.__studioInc = out;
  return out;
}

const strength = (rho: number): LinkResult["strength"] => (rho >= 0.6 ? "strong" : rho >= 0.4 ? "moderate" : rho >= 0.25 ? "weak" : "none");

export async function crossLink(rows: DRow[], spec: Spec, window: { from: string | null; to: string | null }, refs: Refs): Promise<LinkResult | null> {
  if (!rows.length) return null;
  const store = await incidents();
  if (!store.list.length) return null;
  const placed = rows.filter((r) => typeof r._z === "number");
  const dated = rows.filter((r) => typeof r._d === "string");
  const usePlace = placed.length >= Math.max(10, rows.length * 0.2);
  const useTime = dated.length >= 20;
  if (!usePlace && !useTime) return null;

  // the weeks compared: the data's own when they overlap the store by two weeks, else the store's latest 90 days
  let from = addDays(store.to, -89), to = store.to, basis: "dataset" | "latest" = "latest";
  if (window.from && window.to) {
    const f = window.from > store.from ? window.from : store.from, t = window.to < store.to ? window.to : store.to;
    if (f <= t && daysBetween(f, t) >= 14) { from = f; to = t; basis = "dataset"; }
  }
  const inWin = store.list.filter((x) => x.d >= from && x.d <= to);
  const hasOpen = spec.openValues.length > 0 && rows.some((r) => r._o === 1);
  const dsRows = hasOpen ? rows.filter((r) => r._o === 1) : rows;
  // how much each row counts: 1, or its cases for a periodic return (spec.weight)
  const wcol = spec.weight ?? null;
  const wOf = (r: DRow) => (wcol ? (typeof r[wcol] === "number" ? (r[wcol] as number) : 0) : 1);
  const noun = wcol ? spec.columns.find((c) => c.key === wcol)?.label.toLowerCase() ?? spec.entityPlural : spec.entityPlural;
  const dsLabel = hasOpen ? `${noun} ${spec.openWord || "still open"}` : noun;

  // candidate groups of incident categories: the AI's (or rules') choice first, then each family
  // "Flooding & drainage" for Flooding & waterlogging + Drainage & sewage: the lead word of each category
  const label = (codes: string[]) => {
    const names = codes.map((c) => refs.categories.find((x) => x.code === c)?.label ?? c);
    if (names.length === 1) return names[0];
    const heads = [...new Set(names.map((l) => l.split(/ & |, /)[0].trim()))];
    return heads.map((h, i) => (i ? h.toLowerCase() : h)).join(heads.length > 2 ? ", " : " & ");
  };
  // Only what the data is about is tested (its categories and their families): searching every family for some
  // agreement would, over 15 zones, find a chance one sooner or later. Without categories, a family must agree strongly.
  const cands: { codes: string[]; label: string; by: "ai" | "rules"; prefer: boolean }[] = [];
  const own = spec.linkCategories;
  if (own.length) cands.push({ codes: own, label: label(own), by: spec.by, prefer: true });
  const fams = own.length ? new Set(refs.categories.filter((c) => own.includes(c.code)).map((c) => c.family)) : new Set(refs.families.keys());
  for (const [fam, name] of refs.families) {
    if (!fams.has(fam)) continue;
    const codes = refs.categories.filter((c) => c.family === fam).map((c) => c.code);
    if (codes.length && codes.join() !== own.join()) cands.push({ codes, label: name, by: own.length ? spec.by : "rules", prefer: false });
  }
  const bar = own.length ? 0.4 : 0.6;

  const zones = [...refs.zones.keys()].sort((a, b) => a - b);
  const dsByZone = new Map<number, number>();
  for (const r of dsRows) if (typeof r._z === "number") dsByZone.set(r._z, (dsByZone.get(r._z) ?? 0) + wOf(r));
  const dsVec = zones.map((z) => dsByZone.get(z) ?? 0);

  // ---- place: zone by zone
  type Scored = { cand: (typeof cands)[number]; rho: number; total: number; byZone: Map<number, number> };
  let best: Scored | null = null;
  if (usePlace) {
    const scored: Scored[] = cands.map((cand) => {
      const set = new Set(cand.codes);
      const byZone = new Map<number, number>();
      let total = 0;
      for (const x of inWin) if (x.z != null && set.has(x.c)) { byZone.set(x.z, (byZone.get(x.z) ?? 0) + 1); total++; }
      return { cand, total, byZone, rho: spearman(dsVec, zones.map((z) => byZone.get(z) ?? 0)) };
    }).filter((s) => s.total >= 10);
    const pref = scored.find((s) => s.cand.prefer);
    const top = [...scored].filter((s) => !s.cand.prefer && s.total >= 30).sort((a, b) => b.rho - a.rho)[0];
    // the data's own categories, unless their family as a whole agrees clearly better
    best = top && top.rho >= bar && (!pref || top.rho >= pref.rho + 0.15) ? top : pref ?? null;
  }

  // ---- time: week by week, the data allowed to trail incidents by up to two weeks
  let time: LinkResult["time"] = null;
  if (useTime) {
    const dsW = new Map<string, number>();
    // new rows per week (when they were reported), against new incidents per week
    for (const r of dated) dsW.set(weekStart(String(r._d)), (dsW.get(weekStart(String(r._d))) ?? 0) + wOf(r));
    const weeks: string[] = [];
    for (let k = weekStart(from); k <= weekStart(to); k = addDays(k, 7)) weeks.push(k);
    if (weeks.length >= 6) {
      const pool = best ? [best.cand] : cands;
      let top: { rho: number; lag: number; cand: (typeof cands)[number]; inc: Map<string, number> } | null = null;
      for (const cand of pool) {
        const set = new Set(cand.codes);
        const incW = new Map<string, number>();
        for (const x of store.list) if (set.has(x.c)) incW.set(weekStart(x.d), (incW.get(weekStart(x.d)) ?? 0) + 1);
        for (const lag of [0, 1, 2]) {
          const a = weeks.map((w) => dsW.get(w) ?? 0), b = weeks.map((w) => incW.get(addDays(w, -7 * lag)) ?? 0);
          if (b.reduce((s, x) => s + x, 0) < 10 || a.reduce((s, x) => s + x, 0) < 10) continue;
          // a week-by-week comparison needs the data spread over weeks: a feed of the last two days has one week, not a trend
          if (a.filter((x) => x > 0).length < 6) continue;
          const rho = spearman(a, b);
          // a lag must earn its place: it wins only when clearly stronger than the same weeks
          if (!top || rho > top.rho + (lag > 0 ? 0.05 : 0)) top = { rho, lag, cand, inc: incW };
        }
      }
      if (top && top.rho >= (own.length ? 0.3 : 0.6)) {
        time = {
          rho: Math.round(top.rho * 100) / 100, weeks: weeks.length, lag: top.lag, label: top.cand.label,
          series: weeks.map((w) => ({ week: w, ds: dsW.get(w) ?? 0, inc: top!.inc.get(addDays(w, -7 * top!.lag)) ?? 0 }))
        };
        if (!best && !usePlace) best = { cand: top.cand, rho: top.rho, total: 0, byZone: new Map() };
      }
    }
  }
  if (!best) return null;

  const set = new Set(best.cand.codes);
  const chosen = inWin.filter((x) => set.has(x.c));
  const pairs = usePlace ? zones.map((z) => ({ key: z, name: refs.zones.get(z)?.name ?? `Zone ${z}`, ds: dsByZone.get(z) ?? 0, inc: best!.byZone.get(z) ?? 0 })) : [];
  const topDs = [...pairs].sort((a, b) => b.ds - a.ds).slice(0, 5).filter((p) => p.ds > 0);
  const topInc = new Set([...pairs].sort((a, b) => b.inc - a.inc).slice(0, 5).filter((p) => p.inc > 0).map((p) => p.key));
  const overlap = topDs.filter((p) => topInc.has(p.key));

  // ward level: do the rows sit in low-lying wards?
  let lowlying: LinkResult["lowlying"] = null;
  const wardRows = dsRows.filter((r) => typeof r._w === "number");
  if (wardRows.length >= Math.max(20, dsRows.length * 0.5)) {
    const byWard = new Map<number, number>();
    for (const r of wardRows) byWard.set(r._w as number, (byWard.get(r._w as number) ?? 0) + wOf(r));
    const ws = [...refs.wards.values()].filter((w) => w.lowlying != null);
    const rho = spearman(ws.map((w) => byWard.get(w.ward) ?? 0), ws.map((w) => w.lowlying as number));
    if (rho >= 0.2) lowlying = { rho: Math.round(rho * 100) / 100, n: ws.length };
  }

  const sampleZones = (overlap.length ? overlap : topDs).map((p) => p.key);
  let sample: LinkIncident[] = [];
  try {
    const [rs] = await intelPool.query<RowDataPacket[]>(
      `SELECT incident_id, title, zone_name, severity_level, is_open, first_reported_at, outlet_count FROM incidents
       WHERE category_code IN (?) ${sampleZones.length ? "AND zone_no IN (?)" : ""} AND first_reported_at >= ? AND first_reported_at <= ?
       ORDER BY is_open DESC, priority_score DESC LIMIT 6`,
      sampleZones.length ? [best.cand.codes, sampleZones, from, `${to} 23:59:59`] : [best.cand.codes, from, `${to} 23:59:59`]
    );
    sample = rs.map((r) => ({ id: String(r.incident_id), title: String(r.title ?? "Incident"), zone: r.zone_name ?? null, severity: String(r.severity_level ?? ""),
      open: Number(r.is_open) === 1, when: String(r.first_reported_at), news: Number(r.outlet_count) > 0 }));
  } catch (e) {
    console.warn("[studio] link sample failed", (e as Error).message);
  }

  const rho = usePlace ? best.rho : time?.rho ?? 0;
  return {
    mode: usePlace ? "place" : "time", level: "zone", dsLabel,
    incLabel: best.cand.label.toLowerCase().includes("incident") ? best.cand.label : `${best.cand.label} incidents`,
    category: { codes: best.cand.codes, label: best.cand.label, by: best.cand.by },
    window: { from, to, basis },
    rho: Math.round(rho * 100) / 100, strength: strength(rho), n: usePlace ? zones.length : time?.weeks ?? 0,
    pairs, overlap,
    incidents: chosen.length, open: chosen.filter((x) => x.o).length, news: chosen.filter((x) => x.news).length, overdue: chosen.filter((x) => x.o && x.late).length,
    sample, time, lowlying
  };
}

/**
 * District incidents in some zones (and categories) over the latest 90 days of the store, open and high-priority
 * first: what the drill-down shows beside the rows of a zone.
 */
export async function incidentsFor(zones: number[], codes: string[], limit = 8): Promise<LinkIncident[]> {
  if (!zones.length) return [];
  const store = await incidents();
  const from = addDays(store.to, -89);
  try {
    const [rs] = await intelPool.query<RowDataPacket[]>(
      `SELECT incident_id, title, zone_name, severity_level, is_open, first_reported_at, outlet_count FROM incidents
       WHERE zone_no IN (?) ${codes.length ? "AND category_code IN (?)" : ""} AND first_reported_at >= ?
       ORDER BY is_open DESC, priority_score DESC LIMIT ?`,
      codes.length ? [zones, codes, from, limit] : [zones, from, limit]
    );
    return rs.map((r) => ({ id: String(r.incident_id), title: String(r.title ?? "Incident"), zone: r.zone_name ?? null, severity: String(r.severity_level ?? ""),
      open: Number(r.is_open) === 1, when: String(r.first_reported_at), news: Number(r.outlet_count) > 0 }));
  } catch (e) {
    console.warn("[studio] incidents for drill failed", (e as Error).message);
    return [];
  }
}
