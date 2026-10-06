/**
 * The Geo-locator: every row gets the district's geography, from whatever the file has, most exact first:
 *   latitude/longitude -> the nearest ward centre within 2 km
 *   a ward number ("178", "Ward 178", "W-178")
 *   a locality, street or address -> the console's gazetteer (English and Tamil names, the GCC area list)
 *   a zone (number or name) or a taluk
 * Derived fields: _d date, _z zone, _w ward, _t taluk, _p place name, _la/_lo point, _o open (1/0).
 */
import { placeResolver } from "@/lib/collector/nlp";
import type { DRow } from "@/lib/studio/clean";
import type { Refs } from "@/lib/studio/refs";
import type { Detective, Spec } from "@/lib/studio/types";
import { niceCase, normKey, sameValue, todayIST } from "@/lib/studio/values";

export async function placeRows(rows: DRow[], spec: Spec, refs: Refs, det: Detective, minDate = "2000-01-01"): Promise<{ placed: number; zones: number; wards: number }> {
  const col = (role: string) => spec.columns.filter((c) => c.role === role);
  const [lat, lon] = [col("lat")[0], col("lon")[0]];
  const ward = col("ward")[0], zone = col("zone")[0], taluk = col("taluk")[0];
  const places = col("place");
  const date = col("date")[0];
  const status = col("status")[0];
  // no place column at all (a news feed): the places named in the headline and summary text, quietly
  const explicit = places.length > 0 || !!ward || !!zone || !!taluk || !!(lat && lon);
  const sourceCols = places.length ? places : explicit ? [] : col("text").slice(0, 2);
  const resolve = sourceCols.length ? await placeResolver() : null;
  const zoneByName = new Map<string, number>();
  for (const z of refs.zones.values()) zoneByName.set(normKey(z.name), z.zone);
  const talukByName = new Map<string, string>();
  for (const t of refs.taluks.values()) { talukByName.set(normKey(t.name), t.code); talukByName.set(normKey(t.code), t.code); if (t.nameTa) talukByName.set(normKey(t.nameTa), t.code); }
  const wardList = [...refs.wards.values()];
  const nearest = (la: number, lo: number) => {
    let best = null as (typeof wardList)[number] | null, bd = Infinity;
    for (const w of wardList) {
      const d = Math.hypot((w.lat - la) * 111.2, (w.lon - lo) * 111.2 * Math.cos((la * Math.PI) / 180));
      if (d < bd) { bd = d; best = w; }
    }
    return bd <= 2 ? best : null;
  };
  const zoneOf = (v: unknown): number | null => {
    if (v == null) return null;
    const s = String(v);
    const n = s.match(/\b(\d{1,2})\b/)?.[1];
    if (n && Number(n) >= 1 && Number(n) <= 15) return Number(n);
    const k = normKey(s.replace(/\bzone\b|மண்டலம்/gi, ""));
    if (zoneByName.has(k)) return zoneByName.get(k)!;
    for (const [name, no] of zoneByName) if (k.length >= 5 && (k.includes(name) || sameValue(name, k))) return no;
    return null;
  };
  const cache = new Map<string, ReturnType<NonNullable<typeof resolve>>>();
  const openSet = spec.openValues;
  const isOpen = (v: unknown) => (v == null ? null : openSet.some((o) => sameValue(o, String(v))) ? 1 : 0);
  const unplaced = new Map<string, number>();
  let placed = 0;
  const zonesSeen = new Set<number>(), wardsSeen = new Set<number>();

  const today = todayIST();
  for (const r of rows) {
    // a date the Detective flagged (in the future, before 2000) stays in the row but not on any time axis
    const d = date && typeof r[date.key] === "string" ? String(r[date.key]).slice(0, 10) : null;
    r._d = d && d <= today && d >= minDate ? d : null;
    r._o = status && openSet.length ? isOpen(r[status.key]) : null;
    let z: number | null = null, w: number | null = null, t: string | null = null, p: string | null = null, la: number | null = null, lo: number | null = null;
    // coordinates
    if (lat && lon && typeof r[lat.key] === "number" && typeof r[lon.key] === "number") {
      la = r[lat.key] as number; lo = r[lon.key] as number;
      const nw = nearest(la, lo);
      if (nw) { w = nw.ward; z = nw.zone; t = nw.taluk; }
    }
    // a ward number
    if (w == null && ward && r[ward.key] != null) {
      const n = Number(String(r[ward.key]).match(/(\d{1,3})/)?.[1]);
      const wr = refs.wards.get(n);
      if (wr) { w = wr.ward; z = wr.zone; t = wr.taluk; if (la == null) { la = wr.lat; lo = wr.lon; } }
    }
    // a locality, street or address
    let missed: string | null = null;
    if (resolve && sourceCols.length) {
      const txt = sourceCols.map((c) => r[c.key]).filter((v) => v != null).join(", ");
      if (txt) {
        let hit = cache.get(txt);
        if (hit === undefined) { hit = resolve(txt); cache.set(txt, hit); }
        if (hit) {
          p = hit.place;
          if (w == null && hit.ward != null) { w = hit.ward; }
          if (z == null && hit.zone != null) z = hit.zone;
          if (t == null && hit.taluk) t = hit.taluk;
          if (la == null && hit.lat != null) { la = hit.lat; lo = hit.lon; }
        } else if (places.length) missed = String(r[places[0].key] ?? txt).slice(0, 50);
        if (p == null && places.length) p = niceCase(String(r[places[0].key] ?? "")).slice(0, 60) || null;
      }
    }
    if (z == null && zone && r[zone.key] != null) z = zoneOf(r[zone.key]);
    if (t == null && taluk && r[taluk.key] != null) t = talukByName.get(normKey(String(r[taluk.key]))) ?? null;
    if (w != null) { const wr = refs.wards.get(w); if (wr) { z ??= wr.zone; t ??= wr.taluk; } }
    if (z != null && la == null && !places.length) { const zr = refs.zones.get(z); if (zr) { la = zr.lat; lo = zr.lon; } }
    if (t == null && z != null) {
      // a zone spans taluks: take the taluk most of its wards belong to
      const counts = new Map<string, number>();
      for (const wr of wardList) if (wr.zone === z && wr.taluk) counts.set(wr.taluk, (counts.get(wr.taluk) ?? 0) + 1);
      t = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    // only a row nothing could place is "not on the map" (a locality the gazetteer lacks, with a ward number, is placed)
    if (missed && z == null && w == null) unplaced.set(missed, (unplaced.get(missed) ?? 0) + 1);
    r._z = z; r._w = w; r._t = t; r._p = p ?? (w != null ? `Ward ${w}` : z != null ? refs.zones.get(z)?.name ?? null : null); r._la = la; r._lo = lo;
    if (z != null || w != null) { placed++; if (z != null) zonesSeen.add(z); if (w != null) wardsSeen.add(w); }
  }
  det.placed = placed;
  det.unplaced = [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => ({ v, n }));
  const hasPlace = places.length || ward || zone || taluk || (lat && lon);
  if (hasPlace && rows.length) {
    const miss = rows.length - placed;
    if (miss > 0)
      det.issues.push({ kind: "unplaced", column: null, label: "Rows whose place is not in the Chennai district gazetteer (kept, but not on the map)", count: miss, action: "flagged",
        examples: det.unplaced.slice(0, 4).map((u) => `${u.v} (${u.n})`) });
    const pen = miss ? Math.min(10, 1 + (miss / rows.length) * 20) : 0;
    det.after = Math.round(Math.max(40, det.after - pen));
    det.before = Math.round(Math.max(25, Math.min(det.before - pen, det.after)));
  }
  return { placed, zones: zonesSeen.size, wards: wardsSeen.size };
}
