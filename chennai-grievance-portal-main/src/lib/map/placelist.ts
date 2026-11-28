/**
 * The places themselves as a list (owner, 28 Nov 2026: "if I ask to list the names of the schools or colleges, it's not listing ... return
 * the list if I ask for it"). "List the names of schools in Valasaravakkam", "colleges in Adyar zone", "hospitals near Egmore", "show all fire
 * stations": every place of the answer, each with its locality and ward, nearest first when the question names a point and by name otherwise,
 * and whether it matched an official list. The panel numbers them and the map pins them; nothing here is counted twice or left unnamed in silence.
 * District-wide answers also carry the layer's official places that have no map point (TNFRS lists more fire stations than OpenStreetMap maps):
 * named, never drawn.
 */
import { haversineM } from "./geom";
import { localityOf, type Ctx, type RunResult } from "./execute";
import type { Plan } from "./plan";
import type { LayerId, LayerOfficial, World } from "./types";

/** the most places one answer lists and pins (the largest checked layer, hospitals and clinics, is about 1,400) */
export const PLACE_CAP = 2000;

export interface PlacePoint {
  id: string; layer: LayerId; name: string | null; name_ta: string | null; lat: number; lon: number; kind: string; government: boolean;
  /** the ward it stands in (null outside the Corporation's wards) and the nearest named neighbourhood */
  ward: number | null; place: string | null; place_ta: string | null;
  /** false for a place in the 3 km band around the district the layers also hold ("nearest hospital" may be just outside) */
  in_district: boolean;
  /** metres from the place the question named ("near Egmore"); null for an area or the district */
  dist: number | null;
  /** the official list it matched (its short id), or null: kept on its name only */
  official: string | null;
}

export interface PlacesExtra {
  layer: LayerId;
  total: number;
  /** how many of them are inside the district (the rest are in the 3 km band around it) */
  inside: number;
  /** how many are in the list (all of them up to PLACE_CAP) */
  shown: number;
  order: "nearest" | "name";
  /** how many of them matched an official list, and the lists (name, link, date read) */
  matched: number;
  sources: LayerOfficial["sources"];
  /** the layer's official places with no map point, for a district-wide answer only (an area cannot hold a place with no point) */
  unmapped: string[] | null;
  note: string | null;
}

/** A plain "places" answer (schools in an area, hospitals near a place, all fire stations): its list; null for every other answer. */
export function placeList(plan: Plan, r: RunResult, w: World, ctx: Ctx): { points: PlacePoint[]; extra: PlacesExtra } | null {
  const show = r.show;
  if (show.type !== "points" || show.near) return null;
  const last = plan.steps.find((s) => s.as === plan.show);
  if (!last || (last.op !== "take" && last.op !== "inside" && last.op !== "along")) return null;
  const centre = last.op === "inside" && last.area.kind === "point" ? ctx.place(last.area.ref) : null;
  const ta = ctx.lang === "ta";
  const rows: PlacePoint[] = show.items.map((p) => {
    const loc = localityOf(w, p.lat, p.lon);
    return { id: p.id, layer: p.layer, name: p.name, name_ta: p.name_ta, lat: p.lat, lon: p.lon, kind: p.kind, government: !!p.government, ward: p.ward ?? null, in_district: p.in_district,
      place: loc?.en ?? null, place_ta: loc?.ta ?? null, dist: centre ? Math.round(haversineM({ lat: centre.lat, lon: centre.lon }, { lat: p.lat, lon: p.lon })) : null,
      official: p.official?.src ?? null };
  });
  const label = (x: PlacePoint) => ((ta ? x.name_ta ?? x.name : x.name) ?? "").toLowerCase();
  rows.sort((a, b) => (centre ? (a.dist ?? 0) - (b.dist ?? 0) : 0)
    || Number(!a.name) - Number(!b.name) || label(a).localeCompare(label(b), ta ? "ta" : "en") || a.id.localeCompare(b.id));
  const m = w.meta[show.layer];
  const off = m?.official ?? null;
  return {
    points: rows.slice(0, PLACE_CAP),
    extra: { layer: show.layer, total: rows.length, inside: rows.filter((x) => x.in_district).length, shown: Math.min(rows.length, PLACE_CAP), order: centre ? "nearest" : "name", matched: rows.filter((x) => x.official).length,
      sources: off?.sources ?? [], unmapped: last.op === "take" && off?.unmapped.length ? off.unmapped : null, note: off?.note ?? null }
  };
}
