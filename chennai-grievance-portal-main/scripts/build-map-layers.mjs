/**
 * Builds Ask the Map's facility, road and water layers from OpenStreetMap, once (npm run layers:build). The store has
 * police stations, 9 hospitals and lakes as points, but no schools, fire stations or roads, and canals and rivers only
 * as single points: the map needs real points, lines and polygons to answer "within 300 m of schools" or "along Anna
 * Salai". One polite run against the public Overpass API, one query per layer with a pause between them.
 *
 *   data/layers/<id>.geojson   one file per layer; coordinates rounded to ~1 m
 *   data/layers/meta.json      as-of time, query, counts and licence (ODbL) per layer
 *
 * The box is the district's ward boundaries plus 3 km, so "nearest hospital" can find one just outside the district;
 * every feature carries in_district (inside a ward polygon, or for a line, any point inside one).
 * Re-run only on request. Run from the portal folder: node scripts/build-map-layers.mjs [--only roads,schools]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "layers");
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const UA = "DistrictIQ-layer-build/1.0 (Team Initiators, hackathon prototype)";
const MARGIN_M = 3000;
const PAUSE_MS = 8000;

// ------------------------------------------------------------------ wards --

const wards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "boundaries", "gcc-wards.geojson"), "utf8")).features.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const xs = polys.flatMap((p) => p[0].map((c) => c[0])), ys = polys.flatMap((p) => p[0].map((c) => c[1]));
  return { ward: f.properties.ward_no, polys, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});
const box = wards.reduce((b, w) => [Math.min(b[0], w.b[0]), Math.min(b[1], w.b[1]), Math.max(b[2], w.b[2]), Math.max(b[3], w.b[3])], [180, 90, -180, -90]);
const dLat = MARGIN_M / 111320, dLon = MARGIN_M / (111320 * Math.cos((((box[1] + box[3]) / 2) * Math.PI) / 180));
const BBOX = [box[1] - dLat, box[0] - dLon, box[3] + dLat, box[2] + dLon].map((v) => v.toFixed(5)).join(","); // S,W,N,E

function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function wardAt(lon, lat) {
  for (const w of wards) {
    if (lon < w.b[0] || lon > w.b[2] || lat < w.b[1] || lat > w.b[3]) continue;
    for (const p of w.polys) if (inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h))) return w.ward;
  }
  return null;
}

// --------------------------------------------------------------- overpass --

async function overpass(body) {
  const q = `[out:json][timeout:180];\n${body}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
    if (r.ok) return { q, json: await r.json() };
    // 429/502/504: the public server is busy; back off (30 s, 1, 2, 4, 8 min) and try again, six times in all
    if (attempt >= 6 || ![429, 502, 503, 504].includes(r.status)) throw new Error(`Overpass HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    console.log(`  busy (HTTP ${r.status}), trying again in ${30 * 2 ** (attempt - 1)} s`);
    await sleep(30000 * 2 ** (attempt - 1));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sel = (filters) => filters.flatMap((f) => ["node", "way", "relation"].map((t) => `  ${t}${f}(${BBOX});`)).join("\n");

// ---------------------------------------------------------------- helpers --

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const haversine = (a, b) => {
  const R = 6371008.8, rad = Math.PI / 180;
  const dp = (b[1] - a[1]) * rad, dl = (b[0] - a[0]) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** Lower case, no dots or brackets, single spaces, common abbreviations spelt out: "Mount Rd." = "mount road". */
export function normName(s) {
  if (!s) return "";
  return String(s).toLowerCase().normalize("NFC").replace(/[.,'’()\-_/]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\brd\b/g, "road").replace(/\bst\b/g, "street").replace(/\bhr\b/g, "high road").replace(/\bave\b/g, "avenue");
}
/** Douglas-Peucker on [lon, lat] points (tolerance in degrees; 0.000045 is about 5 m). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, best = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const lineLen = (l) => l.reduce((s, p, i) => (i ? s + haversine(l[i - 1], p) : 0), 0);
const GOVT = /\b(government|govt|g\.?h\.?|phc|uphc|esi|corporation|municipal|gcc)\b/i;

function pointOf(e) {
  if (e.type === "node") return [e.lon, e.lat];
  if (e.center) return [e.center.lon, e.center.lat];
  return null;
}
function names(t) {
  return {
    name: t.name || t["name:en"] || null,
    name_ta: t["name:ta"] || null,
    alt: [t.alt_name, t.old_name, t.official_name, t.short_name, t["alt_name:en"], t["name:en"]].filter(Boolean).flatMap((s) => s.split(";").map((x) => x.trim())).filter(Boolean)
  };
}

/** Point layer: nodes and area centres; a node and a way with the same name within 100 m are one place. */
function points(json, kindOf, extra = () => ({})) {
  const feats = [];
  const seen = [];
  // ways and relations first: their centre stands for the whole campus, and a node inside it is usually the same place
  const els = [...json.elements].sort((a, b) => (a.type === "node") - (b.type === "node"));
  let merged = 0;
  for (const e of els) {
    const p = pointOf(e);
    if (!p) continue;
    const t = e.tags || {};
    const n = names(t);
    const key = normName(n.name);
    const dup = key && seen.find((s) => s.key === key && haversine(s.p, p) <= 100);
    if (dup) {
      merged++;
      if (!dup.f.properties.name_ta && n.name_ta) dup.f.properties.name_ta = n.name_ta;
      continue;
    }
    const ward = wardAt(p[0], p[1]);
    const f = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [r5(p[0]), r5(p[1])] },
      properties: { id: `osm:${e.type[0]}${e.id}`, name: n.name, name_ta: n.name_ta, alt: n.alt.length ? n.alt : undefined, kind: kindOf(t), ward, in_district: ward != null, ...extra(t, n) }
    };
    feats.push(f);
    if (key) seen.push({ key, p, f });
  }
  return { feats, merged };
}

/** Line layer: ways grouped by normalised name, and within a name, by touching (any end within `joinM` of another way). */
function lines(json, joinM, props) {
  const byName = new Map();
  let unnamed = 0;
  for (const e of json.elements) {
    if (e.type !== "way" || !e.geometry?.length) continue;
    const t = e.tags || {};
    const n = names(t);
    const key = normName(n.name) || normName(t.ref);
    if (!key) { unnamed++; continue; }
    const coords = simplify(e.geometry.map((g) => [g.lon, g.lat]), 0.000045).map(([x, y]) => [r5(x), r5(y)]);
    if (coords.length < 2) continue;
    (byName.get(key) ?? byName.set(key, []).get(key)).push({ e, t, n, coords });
  }
  const feats = [];
  for (const [key, ways] of byName) {
    // union-find: two ways of one name are one road when an end of one is within joinM of any point of the other
    const parent = ways.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < ways.length; i++)
      for (let j = i + 1; j < ways.length; j++) {
        if (find(i) === find(j)) continue;
        const a = ways[i].coords, b = ways[j].coords;
        const near = [a[0], a[a.length - 1]].some((p) => b.some((q) => haversine(p, q) <= joinM)) || [b[0], b[b.length - 1]].some((p) => a.some((q) => haversine(p, q) <= joinM));
        if (near) parent[find(i)] = find(j);
      }
    const groups = new Map();
    ways.forEach((w, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))).push(w));
    let part = 0;
    for (const g of groups.values()) {
      part++;
      const ml = g.map((w) => w.coords);
      const inWards = new Set();
      for (const l of ml) for (const [x, y] of l) { const w = wardAt(x, y); if (w != null) inWards.add(w); }
      const first = g.find((w) => w.n.name) ?? g[0];
      const alt = [...new Set(g.flatMap((w) => [...w.n.alt, ...(w.t.ref ? w.t.ref.split(";").map((s) => s.trim()) : [])]))].filter((a) => normName(a) !== key);
      feats.push({
        type: "Feature",
        geometry: { type: "MultiLineString", coordinates: ml },
        properties: {
          id: `osm:${key.replace(/[^a-z0-9஀-௿]+/g, "-")}${groups.size > 1 ? `~${part}` : ""}`,
          name: first.n.name || first.t.ref, name_ta: g.map((w) => w.n.name_ta).find(Boolean) || null, alt: alt.length ? alt : undefined,
          ways: g.length, length_m: Math.round(ml.reduce((s, l) => s + lineLen(l), 0)), wards: [...inWards].sort((a, b) => a - b),
          in_district: inWards.size > 0, ...props(g)
        }
      });
    }
  }
  return { feats, unnamed };
}

/** Polygons for water bodies: closed ways, and multipolygon relations' outer rings joined end to end. */
function polygons(json, minHa) {
  const feats = [];
  let small = 0;
  const ringArea = (r) => { // m², local projection: enough to drop puddles and swimming pools
    const lat0 = r[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
    return Math.abs(a / 2);
  };
  const join = (segs) => {
    const rings = [];
    const left = segs.map((s) => [...s]);
    while (left.length) {
      const ring = left.shift();
      for (let grew = true; grew && haversine(ring[0], ring[ring.length - 1]) > 1;) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const s = left[i], tip = ring[ring.length - 1];
          if (haversine(s[0], tip) <= 1) { ring.push(...s.slice(1)); left.splice(i, 1); grew = true; break; }
          if (haversine(s[s.length - 1], tip) <= 1) { ring.push(...[...s].reverse().slice(1)); left.splice(i, 1); grew = true; break; }
        }
      }
      if (ring.length >= 4) rings.push(ring);
    }
    return rings;
  };
  for (const e of json.elements) {
    const t = e.tags || {};
    let rings = [];
    if (e.type === "way" && e.geometry?.length >= 4) rings = [e.geometry.map((g) => [g.lon, g.lat])];
    else if (e.type === "relation") rings = join((e.members || []).filter((m) => m.type === "way" && m.role !== "inner" && m.geometry?.length).map((m) => m.geometry.map((g) => [g.lon, g.lat])));
    if (!rings.length) continue;
    const area = rings.reduce((s, r) => s + ringArea(r), 0);
    const n = names(t);
    if (area < minHa * 10000 && !n.name) { small++; continue; }
    const simple = rings.map((r) => simplify(r, 0.000045).map(([x, y]) => [r5(x), r5(y)])).filter((r) => r.length >= 4);
    if (!simple.length) continue;
    const c = simple[0].reduce((s, p) => [s[0] + p[0] / simple[0].length, s[1] + p[1] / simple[0].length], [0, 0]);
    const ward = simple.flat().map(([x, y]) => wardAt(x, y)).find((w) => w != null) ?? null;
    feats.push({
      type: "Feature",
      geometry: { type: "MultiPolygon", coordinates: simple.map((r) => [r]) },
      properties: { id: `osm:${e.type[0]}${e.id}`, name: n.name, name_ta: n.name_ta, alt: n.alt.length ? n.alt : undefined, kind: t.water || "water", area_ha: Math.round(area / 1000) / 10, center: [r5(c[0]), r5(c[1])], ward, in_district: ward != null }
    });
  }
  return { feats, small };
}

// ----------------------------------------------------------------- layers --

const HOSPITAL_KIND = (t) => (t.amenity === "hospital" || t.healthcare === "hospital" ? "hospital" : t.healthcare === "centre" ? "health_centre" : "clinic");
const LAYERS = [
  {
    id: "schools", name_en: "Schools", name_ta: "பள்ளிகள்", kind: "point",
    query: () => `(\n${sel(['["amenity"="school"]'])}\n);\nout center tags;`,
    build: (j) => points(j, () => "school", (t, n) => ({ government: GOVT.test(n.name || "") || /government|public/i.test(t["operator:type"] || "") || undefined }))
  },
  {
    id: "colleges", name_en: "Colleges and universities", name_ta: "கல்லூரிகள்", kind: "point",
    query: () => `(\n${sel(['["amenity"="college"]', '["amenity"="university"]'])}\n);\nout center tags;`,
    build: (j) => points(j, (t) => t.amenity)
  },
  {
    id: "hospitals", name_en: "Hospitals and health centres", name_ta: "மருத்துவமனைகள்", kind: "point",
    query: () => `(\n${sel(['["amenity"="hospital"]', '["amenity"="clinic"]', '["healthcare"~"^(hospital|clinic|centre)$"]'])}\n);\nout center tags;`,
    build: (j) => points(j, HOSPITAL_KIND, (t, n) => ({ government: t["operator:type"] === "government" || GOVT.test(n.name || "") || GOVT.test(t.operator || "") }))
  },
  {
    id: "fire_stations", name_en: "Fire stations", name_ta: "தீயணைப்பு நிலையங்கள்", kind: "point",
    query: () => `(\n${sel(['["amenity"="fire_station"]'])}\n);\nout center tags;`,
    build: (j) => points(j, () => "fire_station")
  },
  {
    id: "police_osm", name_en: "Police (OpenStreetMap, cross-check only)", name_ta: "காவல் நிலையங்கள் (OSM)", kind: "point",
    query: () => `(\n${sel(['["amenity"="police"]'])}\n);\nout center tags;`,
    build: (j) => points(j, () => "police")
  },
  {
    id: "osm_places", name_en: "Neighbourhoods", name_ta: "பகுதிகள்", kind: "point",
    query: () => `(\n${sel(['["place"~"^(suburb|neighbourhood|quarter)$"]'])}\n);\nout center tags;`,
    build: (j) => points(j, (t) => t.place)
  },
  {
    id: "rail_metro", name_en: "Rail and metro stations", name_ta: "ரயில் / மெட்ரோ நிலையங்கள்", kind: "point",
    query: () => `(\n${sel(['["railway"="station"]', '["station"="subway"]', '["public_transport"="station"]'])}\n);\nout center tags;`,
    build: (j) => points(j, (t) => (t.station === "subway" || /metro/i.test(t.network || "") ? "metro" : t.railway === "station" ? "rail" : t.amenity === "bus_station" || t.bus === "yes" ? "bus" : "station"))
  },
  {
    id: "roads", name_en: "Roads", name_ta: "சாலைகள்", kind: "line",
    query: () => `(\n  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${BBOX});\n  way["highway"~"^(residential|unclassified|living_street)$"]["name"](${BBOX});\n);\nout geom tags;`,
    build: (j) => {
      const RANK = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"];
      return lines(j, 60, (g) => ({ class: g.map((w) => w.t.highway).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0], ref: [...new Set(g.map((w) => w.t.ref).filter(Boolean))].join(";") || null }));
    }
  },
  {
    id: "waterways", name_en: "Rivers, canals and drains", name_ta: "ஆறுகள், கால்வாய்கள்", kind: "line",
    query: () => `(\n  way["waterway"~"^(river|canal|drain|stream)$"](${BBOX});\n);\nout geom tags;`,
    build: (j) => lines(j, 300, (g) => ({ kind: g.map((w) => w.t.waterway).sort((a, b) => ["river", "canal", "stream", "drain"].indexOf(a) - ["river", "canal", "stream", "drain"].indexOf(b))[0] }))
  },
  {
    id: "water_bodies", name_en: "Lakes and ponds", name_ta: "ஏரிகள், குளங்கள்", kind: "polygon",
    query: () => `(\n  way["natural"="water"]["water"~"^(lake|reservoir|pond)$"](${BBOX});\n  relation["natural"="water"]["water"~"^(lake|reservoir|pond)$"](${BBOX});\n  way["natural"="water"][!"water"]["name"](${BBOX});\n  relation["natural"="water"][!"water"]["name"](${BBOX});\n);\nout geom tags;`,
    build: (j) => polygons(j, 0.5)
  }
];

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
  fs.mkdirSync(OUT, { recursive: true });
  const metaFile = path.join(OUT, "meta.json");
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : { layers: {} };
  meta.source = "OpenStreetMap via the Overpass API";
  meta.licence = "ODbL 1.0: © OpenStreetMap contributors";
  meta.bbox = BBOX;
  let first = true;
  for (const L of LAYERS) {
    if (only && !only.includes(L.id)) continue;
    if (!first) await sleep(PAUSE_MS);
    first = false;
    const t0 = Date.now();
    const { q, json } = await overpass(L.query());
    const built = L.build(json);
    const feats = built.feats.sort((a, b) => String(a.properties.id).localeCompare(String(b.properties.id)));
    fs.writeFileSync(path.join(OUT, `${L.id}.geojson`), JSON.stringify({ type: "FeatureCollection", features: feats }));
    const inside = feats.filter((f) => f.properties.in_district).length;
    meta.layers[L.id] = {
      id: L.id, name_en: L.name_en, name_ta: L.name_ta, kind: L.kind, source: "OpenStreetMap", licence: "ODbL 1.0",
      attribution: "© OpenStreetMap contributors", as_of: new Date().toISOString(), osm_base: json.osm3s?.timestamp_osm_base ?? null,
      count: feats.length, in_district: inside, elements: json.elements.length,
      merged_duplicates: built.merged ?? 0, dropped_unnamed: built.unnamed ?? 0, dropped_small: built.small ?? 0, query: q
    };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    console.log(`${L.id}: ${feats.length} features (${inside} in the district) from ${json.elements.length} elements, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
