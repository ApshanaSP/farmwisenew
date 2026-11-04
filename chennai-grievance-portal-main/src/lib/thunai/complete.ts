/**
 * "Complete this data": fills a cell only from deterministic code or a tool result, and shows where each filled value came
 * from. Never guesses, never imputes a count. What cannot be filled stays blank and is named, with why. Pure: the lookups are
 * passed in (ward polygons and gazetteer on the server, a small table in tests).
 */
export interface Lookups {
  /** zone of a ward (data/boundaries/gcc-wards.geojson) */
  wardZone?: (ward: number) => { zone: number; name: string } | null;
  /** ward at a point, by polygon (src/lib/wards.ts): never the nearest ward */
  pointWard?: (lat: number, lon: number) => { ward: number; zone: number | null; zoneName: string | null } | null;
  /** zone of a place name, from the gazetteer (only when it is unambiguous) */
  placeZone?: (place: string) => { zone: number; name: string } | null;
  /** the department that leads a category (intel-reference.json) */
  catLead?: (cat: string) => { code: string; name: string } | null;
}
export const SOURCES = {
  ward: "ward→zone, GCC ward boundaries",
  polygon: "point in ward polygon, GCC ward boundaries",
  gazetteer: "place gazetteer, district reference",
  lead: "lead department of the category, district reference",
  derived: "worked out from the row"
};

export interface Cell { v: string | number | null; src: string | null; filled: boolean }
export interface InRow { id: string; title?: string | null; zone?: number | null; zoneName?: string | null; ward?: number | null; place?: string | null; dept?: string | null; deptName?: string | null; cat?: string | null; lat?: number | null; lon?: number | null; t?: string | null; hours?: number | null }
export interface OutRow { id: string; title: string; cells: Record<"ward" | "zone" | "place" | "dept" | "age", Cell> }
/** `filled` counts gaps filled; `derived` counts the cells worked out from what the row already holds (its age), which fill no gap. */
export interface Completed { rows: OutRow[]; filled: number; derived: number; left: number; cannot: { col: string; n: number; why: string; ta: string }[]; unresolved: string[] }

const have = (v: unknown) => v != null && v !== "" && v !== 0;
const given = (v: string | number | null | undefined): Cell => ({ v: v ?? null, src: null, filled: false });

/** One row of a Studio dataset, columns matched by their names. A zone column that holds a name is that zone's name, not a gap. */
export function studioRow(r: Record<string, unknown>, i: number): InRow {
  const pick = (re: RegExp) => { const k = Object.keys(r).find((x) => re.test(x)); return k ? r[k] : null; };
  const text = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const ward = Number(String(pick(/^ward/i) ?? "").match(/\d+/)?.[0] ?? 0), zoneCol = pick(/^zone(_?no|_?num.*)?$/i), zone = Number(zoneCol);
  const lat = Number(pick(/^lat/i)), lon = Number(pick(/^(lon|lng)/i));
  return { id: String(pick(/^(id|incident_id|ref)/i) ?? `row ${i + 1}`).slice(0, 80), title: String(pick(/^(title|name|subject|description)/i) ?? `Row ${i + 1}`), ward: ward || null, zone: zone || null,
    zoneName: text(pick(/^zone_?name$/i)) ?? (Number.isNaN(zone) ? text(zoneCol) : null), place: text(pick(/^(place|area|locality|location)/i)), dept: text(pick(/^(dept|department)/i)),
    cat: text(pick(/^(cat|category|type)/i)), lat: lat || null, lon: lon || null };
}

export function completeRows(rows: InRow[], k: Lookups): Completed {
  let filled = 0, derived = 0, left = 0;
  const miss = { zone: 0, place: 0, dept: 0, ward: 0 };
  const unresolved = new Set<string>();
  const fill = (v: string | number, src: string): Cell => { filled++; return { v, src, filled: true }; };
  const out = rows.map((r): OutRow => {
    // the ward: given, else the polygon the point is inside
    let ward: Cell = given(r.ward);
    let zoneHint: { zone: number; name: string } | null = null;
    if (!have(r.ward) && r.lat != null && r.lon != null) {
      const w = k.pointWard?.(r.lat, r.lon);
      if (w) { ward = fill(w.ward, SOURCES.polygon); if (w.zone != null) zoneHint = { zone: w.zone, name: w.zoneName ?? `Zone ${w.zone}` }; }
    }
    // the zone: given, else from the ward, else from the place in the gazetteer
    let zone: Cell = given(r.zoneName ?? r.zone);
    if (!have(r.zone) && !have(r.zoneName)) {
      const fromWard = have(r.ward) ? k.wardZone?.(Number(r.ward)) : zoneHint;
      const fromPlace = !fromWard && r.place ? k.placeZone?.(r.place) : null;
      if (fromWard) zone = fill(fromWard.name, have(r.ward) ? SOURCES.ward : SOURCES.polygon);
      else if (fromPlace) zone = fill(fromPlace.name, SOURCES.gazetteer);
      else { miss.zone++; left++; unresolved.add(r.id); }
    }
    // the place: only ever what the record says; a place is not worked out from a zone
    const place: Cell = given(r.place);
    if (!have(r.place)) { miss.place++; left++; unresolved.add(r.id); }
    // the department: given, else the category's lead department
    let dept: Cell = given(r.deptName ?? r.dept);
    if (!have(r.dept) && !have(r.deptName)) {
      const lead = r.cat ? k.catLead?.(r.cat) : null;
      if (lead) dept = fill(lead.name, SOURCES.lead);
      else { miss.dept++; left++; unresolved.add(r.id); }
    }
    if (!have(r.ward) && !ward.filled) { miss.ward++; left++; }
    if (r.hours != null) derived++;
    const age: Cell = r.hours != null ? { v: Math.round(r.hours), src: SOURCES.derived, filled: false } : given(null);
    return { id: r.id, title: r.title ?? r.id, cells: { ward, zone, place, dept, age } };
  });
  const cannot: Completed["cannot"] = [];
  if (miss.zone) cannot.push({ col: "zone", n: miss.zone, why: "no ward, no point and no place the gazetteer knows", ta: "வார்டு, இடம், இருப்பிடக் குறிப்பு எதுவும் இல்லை" });
  if (miss.place) cannot.push({ col: "place", n: miss.place, why: "the record names no place, and a place is never guessed", ta: "பதிவில் இடம் இல்லை; இடத்தை ஊகிப்பதில்லை" });
  if (miss.dept) cannot.push({ col: "department", n: miss.dept, why: "no category with a lead department", ta: "முன்னணித் துறை உள்ள வகை இல்லை" });
  if (miss.ward) cannot.push({ col: "ward", n: miss.ward, why: "no point on the map to place it in a ward", ta: "வார்டில் வைக்க வரைபடப் புள்ளி இல்லை" });
  return { rows: out, filled, derived, left, cannot, unresolved: [...unresolved] };
}
