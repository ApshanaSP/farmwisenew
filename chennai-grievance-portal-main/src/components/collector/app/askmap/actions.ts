"use client";

/**
 * Ask the Map's actions in the browser: Export (CSV or GeoJSON of exactly the answer's rows, made on the server and
 * audited), Save view (the plan, kept as a workspace for the Collector, in this browser for an officer) and the
 * officer's Visit order (today's ten highest-priority open cases, nearest-neighbour then 2-opt, straight-line legs).
 */
import type { AskResponse } from "@/lib/map/ask";
import { haversineM, type LatLon } from "@/lib/map/geom";

export async function downloadAnswer(r: AskResponse, format: "csv" | "geojson", question: string | null): Promise<string> {
  const res = await fetch("/api/map/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: r.plan, question, format }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The export could not be made.");
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `ask-the-map.${format}`;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return `${name}: ${Number(res.headers.get("x-rows") ?? 0).toLocaleString("en-IN")} rows.`;
}

const OFFICER_VIEWS = "diq-map-views";
/** Saves the plan: a workspace for the Collector (it re-runs on fresh data when opened); this browser for an officer. */
export async function saveView(r: AskResponse, role: "collector" | "officer", question: string | null): Promise<string> {
  const name = `Map · ${(question ?? r.answer?.headline ?? "view").replace(/ · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/, "").slice(0, 80)}`;
  if (role === "officer") {
    try {
      const all = JSON.parse(localStorage.getItem(OFFICER_VIEWS) ?? "[]") as unknown[];
      localStorage.setItem(OFFICER_VIEWS, JSON.stringify([{ name, plan: r.plan, saved: new Date().toISOString() }, ...all].slice(0, 20)));
      return `Saved "${name}" in this browser.`;
    } catch { throw new Error("This browser cannot keep saved views."); }
  }
  const res = await fetch("/api/collector/workspaces", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, filters: { askMap: { plan: r.plan, question, as_of: r.asOf.data || r.asOf.now } }, layout: {} }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The view could not be saved.");
  return `Saved as workspace "${name}". It re-runs on fresh data when opened.`;
}

export interface Visit { id: string; title: string; lat: number; lon: number }
export interface Route { stops: Visit[]; legs: number[]; total_m: number; start: LatLon | null }

const legLength = (a: LatLon, b: LatLon) => haversineM(a, b);
function length(path: LatLon[]): number { let s = 0; for (let i = 1; i < path.length; i++) s += legLength(path[i - 1], path[i]); return s; }

/**
 * Today's visit order: the highest-priority open cases with an exact place (at most 10), ordered by nearest neighbour
 * from the start (the officer's click or location, else the top case), then improved by 2-opt. Straight-line legs.
 */
export function visitOrder(r: AskResponse, start: LatLon | null, max = 10): Route {
  const feat = new Map(r.features.map((f) => [f.id, f]));
  const cand = r.rows.filter((x) => x.open && x.pinnable).sort((a, b) => b.priority - a.priority).slice(0, max)
    .map((x) => ({ id: x.id, title: x.title, lat: feat.get(x.id)!.lat, lon: feat.get(x.id)!.lon }));
  if (!cand.length) return { stops: [], legs: [], total_m: 0, start };
  const left = [...cand];
  const order: Visit[] = [];
  let at: LatLon = start ?? left[0];
  if (!start) order.push(left.shift()!);
  while (left.length) {
    let k = 0;
    for (let i = 1; i < left.length; i++) if (legLength(at, left[i]) < legLength(at, left[k])) k = i;
    at = left[k];
    order.push(left.splice(k, 1)[0]);
  }
  // 2-opt on the open path (the start stays first)
  const path = (o: Visit[]) => (start ? [start, ...o] : o);
  let best = order, bestLen = length(path(order)), improved = true;
  while (improved) {
    improved = false;
    for (let i = start ? 0 : 1; i < best.length - 1; i++)
      for (let j = i + 1; j < best.length; j++) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const len = length(path(next));
        if (len + 0.5 < bestLen) { best = next; bestLen = len; improved = true; }
      }
  }
  const p = path(best);
  const legs = p.slice(1).map((x, i) => legLength(p[i], x));
  return { stops: best, legs, total_m: bestLen, start };
}

/** A Google Maps directions link for the route: coordinates only, at most 9 waypoints. Opened only by the officer's click. */
export function googleMapsLink(route: Route): string {
  const pts = [...(route.start ? [route.start] : []), ...route.stops];
  const ll = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const origin = pts[0], dest = pts[pts.length - 1];
  const way = pts.slice(1, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(origin)}&destination=${ll(dest)}${way.length ? `&waypoints=${way.map(ll).join("%7C")}` : ""}&travelmode=driving`;
}
