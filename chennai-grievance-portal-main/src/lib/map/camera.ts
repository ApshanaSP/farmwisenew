/**
 * The camera: every answer flies the map to the place the question is about. cameraFor turns the plan's shape and the
 * answer's geometry into shots; the map plays them. The camera follows the plan, never the AI's words. Pure, so each
 * row of the prompt's table (section 8) is a unit test.
 *
 * Rules: frame the results, not the district (the middle 90 % of them, so one far-off report does not zoom out to all
 * of Chennai); never frame under the panel (padding from the panel's real box); max zoom 16 for areas, 17 for points;
 * fly 0.6–1.6 s scaled by the distance; with reduced motion the same final view, no flight.
 */
import { bboxOf, haversineM, robustBounds, type Bbox, type LatLon, type Pair } from "./geom";

export type Shape = "area" | "district" | "point" | "along" | "compare" | "change" | "hotspot" | "farthest" | "nearest" | "empty";

/** What the answer gives the camera (built by the server from the run; plain data). */
export interface CameraInput {
  shape: Shape;
  /** the area(s) the question names: an outline's bounds, or a point's circle */
  areas: { id: string; box: Bbox; label: string; label_ta: string }[];
  /** the results that can be pinned */
  points: LatLon[];
  /** a road or waterway: its bounds and its line, for "Follow the road" */
  line: { id: string; box: Bbox; path: Pair[] } | null;
  /** one place to fly to (a nearest answer's origin, the farthest ward's far point, the nearest miss) */
  focus: { id: string; lat: number; lon: number; label: string; label_ta: string; to?: LatLon & { label: string } } | null;
  /** the top hotspots, for "Tour the top 3" */
  tour: { id: string; lat: number; lon: number; caption_en: string; caption_ta: string }[];
  district: Bbox;
}

export interface Viewport {
  width: number;
  height: number;
  /** [left, top] and [right, bottom] padding in pixels: the panel and the chips, measured from their real boxes */
  padTopLeft: [number, number];
  padBottomRight: [number, number];
  reducedMotion: boolean;
  /** the view's centre now, to scale the flight time */
  from: LatLon | null;
}

export interface Shot {
  kind: "bounds" | "point" | "path";
  id: string;
  box: Bbox | null;
  point: LatLon | null;
  path: Pair[] | null;
  zoom: number | null;
  maxZoom: number;
  duration_ms: number;
  caption_en: string;
  caption_ta: string;
  /** dim everything outside the area (a district mask with the area cut out) */
  mask: boolean;
  /** results outside the framed view ("N more outside the view · Show all") */
  outside: number;
  padTopLeft: [number, number];
  padBottomRight: [number, number];
  animate: boolean;
}

export const MAX_ZOOM_AREA = 16;
export const MAX_ZOOM_POINT = 17;
const centre = (b: Bbox): LatLon => ({ lat: (b.s + b.n) / 2, lon: (b.w + b.e) / 2 });
const union = (bs: Bbox[]): Bbox => bs.reduce((a, b) => ({ s: Math.min(a.s, b.s), w: Math.min(a.w, b.w), n: Math.max(a.n, b.n), e: Math.max(a.e, b.e) }));
/** never wider than the district */
const clampBox = (b: Bbox, d: Bbox): Bbox => ({ s: Math.max(b.s, d.s), w: Math.max(b.w, d.w), n: Math.min(b.n, d.n), e: Math.min(b.e, d.e) });
/** a tiny box (one point, or several at one spot) gets 150 m around it so the map does not zoom to the pavement */
function grow(b: Bbox, minM = 150): Bbox {
  const dLat = minM / 111_195, dLon = minM / (111_195 * Math.cos((((b.s + b.n) / 2) * Math.PI) / 180));
  return { s: Math.min(b.s, (b.s + b.n) / 2 - dLat), n: Math.max(b.n, (b.s + b.n) / 2 + dLat), w: Math.min(b.w, (b.w + b.e) / 2 - dLon), e: Math.max(b.e, (b.w + b.e) / 2 + dLon) };
}

/** 0.6 s for a short hop, up to 1.6 s across the district. */
export function flightMs(from: LatLon | null, to: LatLon): number {
  if (!from) return 1000;
  const km = haversineM(from, to) / 1000;
  return Math.round(Math.max(600, Math.min(1600, 600 + km * 60)));
}

export function cameraFor(c: CameraInput, v: Viewport): Shot[] {
  const base = { padTopLeft: v.padTopLeft, padBottomRight: v.padBottomRight, animate: !v.reducedMotion, mask: false, outside: 0, path: null, zoom: null };
  const bounds = (id: string, box: Bbox, extra: Partial<Shot> = {}): Shot => {
    const b = clampBox(grow(box), c.district);
    return { ...base, kind: "bounds", id, box: b, point: null, maxZoom: MAX_ZOOM_AREA, duration_ms: v.reducedMotion ? 0 : flightMs(v.from, centre(b)), caption_en: "", caption_ta: "", ...extra };
  };
  const point = (id: string, p: LatLon, extra: Partial<Shot> = {}): Shot => ({
    ...base, kind: "point", id, box: null, point: { lat: p.lat, lon: p.lon }, zoom: MAX_ZOOM_POINT - 1, maxZoom: MAX_ZOOM_POINT,
    duration_ms: v.reducedMotion ? 0 : flightMs(v.from, p), caption_en: "", caption_ta: "", ...extra
  });

  switch (c.shape) {
    case "area": {
      const a = c.areas[0];
      if (!a) break;
      return [bounds(a.id, a.box, { mask: true, caption_en: a.label, caption_ta: a.label_ta })];
    }
    case "compare": {
      if (c.areas.length < 2) break;
      return [bounds(c.areas.map((a) => a.id).join("+"), union(c.areas.map((a) => a.box)), { caption_en: c.areas.map((a) => a.label).join(" vs "), caption_ta: c.areas.map((a) => a.label_ta).join(" / ") })];
    }
    case "change": {
      const a = c.areas[0];
      if (a) return [bounds(a.id, a.box, { mask: true, caption_en: a.label, caption_ta: a.label_ta })];
      break;
    }
    case "along": {
      if (!c.line) break;
      const first = bounds(c.line.id, c.line.box, { caption_en: "", caption_ta: "" });
      // "Follow the road": a second shot the map plays only when asked (6 s, end to end)
      const follow: Shot = { ...first, kind: "path", path: c.line.path, duration_ms: v.reducedMotion ? 0 : 6000, id: `${c.line.id}:follow` };
      return [first, follow];
    }
    case "point": case "nearest": {
      if (c.focus) {
        if (c.shape === "nearest" && c.points.length) {
          return [bounds(c.focus.id, bboxOf([c.focus, ...c.points])!, { caption_en: c.focus.label, caption_ta: c.focus.label_ta })];
        }
        return [point(c.focus.id, c.focus, { caption_en: c.focus.label, caption_ta: c.focus.label_ta })];
      }
      break;
    }
    case "farthest": {
      if (!c.focus) break;
      const pts: LatLon[] = [c.focus, ...(c.focus.to ? [c.focus.to] : [])];
      const a = c.areas[0];
      return [bounds(c.focus.id, a ? union([a.box, bboxOf(pts)!]) : bboxOf(pts)!, { caption_en: c.focus.label, caption_ta: c.focus.label_ta, mask: !!a })];
    }
    case "hotspot": {
      if (!c.tour.length) break;
      const all = bounds("hotspots", bboxOf(c.tour.slice(0, 5))!, {});
      const tour = c.tour.slice(0, 3).map((t, i) => point(t.id, t, { zoom: 15.5, maxZoom: 16, caption_en: t.caption_en, caption_ta: t.caption_ta, duration_ms: v.reducedMotion ? 0 : i === 0 ? 1200 : 3000 }));
      return [all, ...tour];
    }
    case "empty": {
      if (c.focus) return [point(c.focus.id, c.focus, { zoom: 15.5, caption_en: c.focus.label, caption_ta: c.focus.label_ta })];
      break;
    }
    case "district": break;
  }
  // district-wide: frame the results, not the district
  if (c.points.length === 1) return [point(`p:${c.points[0].lat},${c.points[0].lon}`, c.points[0])];
  if (c.points.length) {
    const r = robustBounds(c.points, 0.9);
    return [bounds("results", r.box!, { outside: r.outside })];
  }
  if (c.areas[0]) return [bounds(c.areas[0].id, c.areas[0].box, { mask: true })];
  return [bounds("district", c.district)];
}

/**
 * How much a follow-up should move the camera: a radius, severity, period or status edit keeps the view (the rings grow
 * or the dropped pins fade); a comparison pulls back to frame both; anything else is a new shot.
 */
export function followUpMoves(edited: string | null): boolean {
  return !(edited === "distance" || edited === "severity" || edited === "period" || edited === "status" || edited === "facility" || edited === "group");
}
