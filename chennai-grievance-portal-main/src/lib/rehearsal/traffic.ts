/**
 * Live traffic for Rain → Traffic, from TomTom (developer.tomtom.com; a free key gives 50,000 map tiles and 2,500 other
 * calls a day). Set TOMTOM_API_KEY in the portal's .env and the tab shows:
 *   flow       the roads coloured by how slow they are against their free-flow speed, as map tiles; fetched here and
 *              cached for two minutes, so the key never reaches the browser and a busy map stays inside the free tier
 *   incidents  jams, closed roads, flooding and works over the district, read every ten minutes (144 calls a day)
 * Only tiles over the district are served (this is not an open proxy). Without a key, the tab says so and shows the
 * district's own record of traffic in rains.
 */
const DISTRICT = { s: 12.82, n: 13.27, w: 80.10, e: 80.36 };
const TILE_TTL_MS = 2 * 60_000;
const INC_TTL_MS = 10 * 60_000;
const DAILY_TILE_CAP = 45_000;

export const trafficKey = () => (process.env.TOMTOM_API_KEY || "").trim() || null;

declare global {
  // eslint-disable-next-line no-var
  var __diqTraffic: { tiles: Map<string, { at: number; buf: ArrayBuffer }>; day: string; count: number; inc: { at: number; v: LiveIncident[] } | null } | undefined;
}
const state = () => (global.__diqTraffic ??= { tiles: new Map(), day: "", count: 0, inc: null });

/** the tile's bounds: z/x/y in the web-mercator grid */
function tileBox(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return { w: lon(x), e: lon(x + 1), n: lat(y), s: lat(y + 1) };
}
export function tileInDistrict(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 9 || z > 18 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return false;
  const b = tileBox(z, x, y);
  return b.e >= DISTRICT.w && b.w <= DISTRICT.e && b.n >= DISTRICT.s && b.s <= DISTRICT.n;
}

/** one flow tile (PNG), or null when there is no key, the tile is outside the district, or the day's allowance is used */
export async function flowTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const key = trafficKey();
  if (!key || !tileInDistrict(z, x, y)) return null;
  const s = state();
  const k = `${z}/${x}/${y}`;
  const hit = s.tiles.get(k);
  if (hit && Date.now() - hit.at < TILE_TTL_MS) return hit.buf;
  const today = new Date().toISOString().slice(0, 10);
  if (s.day !== today) { s.day = today; s.count = 0; }
  if (s.count >= DAILY_TILE_CAP) return hit?.buf ?? null;
  s.count++;
  const r = await fetch(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}&tileSize=256`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return hit?.buf ?? null;
  const buf = await r.arrayBuffer();
  s.tiles.set(k, { at: Date.now(), buf });
  if (s.tiles.size > 3000) for (const [kk, v] of s.tiles) if (Date.now() - v.at > TILE_TTL_MS) s.tiles.delete(kk);
  return buf;
}

export interface LiveIncident { id: string; kind: string; label: string; delayMin: number | null; from: string | null; to: string | null; road: string | null; path: [number, number][]; lat: number; lon: number; flooding: boolean }

/** TomTom's icon categories, in plain words */
const KIND: Record<number, string> = { 0: "Unknown", 1: "Accident", 2: "Fog", 3: "Dangerous conditions", 4: "Rain", 5: "Ice", 6: "Jam", 7: "Lane closed", 8: "Road closed", 9: "Road works", 10: "Wind", 11: "Flooding", 14: "Broken-down vehicle" };

/** the district's live traffic incidents, read at most every ten minutes */
export async function liveIncidents(): Promise<{ enabled: boolean; at: string | null; incidents: LiveIncident[]; why: string | null }> {
  const key = trafficKey();
  if (!key) return { enabled: false, at: null, incidents: [], why: "Live traffic needs a free TomTom key: set TOMTOM_API_KEY in the portal's .env and restart." };
  const s = state();
  if (s.inc && Date.now() - s.inc.at < INC_TTL_MS) return { enabled: true, at: new Date(s.inc.at).toISOString(), incidents: s.inc.v, why: null };
  const fields = "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,roadNumbers}}}";
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}&bbox=${DISTRICT.w},${DISTRICT.s},${DISTRICT.e},${DISTRICT.n}&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`TomTom HTTP ${r.status}`);
    const j = await r.json() as { incidents?: { geometry?: { type: string; coordinates: unknown }; properties?: Record<string, any> }[] };
    const v: LiveIncident[] = (j.incidents ?? []).slice(0, 400).map((x, k) => {
      const p = x.properties ?? {};
      const coords = x.geometry?.type === "LineString" ? (x.geometry.coordinates as [number, number][]) : x.geometry?.type === "Point" ? [x.geometry.coordinates as [number, number]] : [];
      const path = coords.map(([lon, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5] as [number, number]);
      const mid = path[Math.floor(path.length / 2)] ?? [0, 0];
      const kind = KIND[Number(p.iconCategory)] ?? "Traffic";
      return { id: String(p.id ?? k), kind, label: p.events?.[0]?.description ?? kind, delayMin: p.delay != null ? Math.round(Number(p.delay) / 60) : null, from: p.from ?? null, to: p.to ?? null,
        road: Array.isArray(p.roadNumbers) && p.roadNumbers.length ? p.roadNumbers.join(", ") : null, path, lat: mid[0], lon: mid[1], flooding: Number(p.iconCategory) === 11 };
    }).filter((x) => x.path.length);
    s.inc = { at: Date.now(), v };
    return { enabled: true, at: new Date().toISOString(), incidents: v, why: null };
  } catch (e) {
    return { enabled: true, at: s.inc ? new Date(s.inc.at).toISOString() : null, incidents: s.inc?.v ?? [], why: `Live traffic could not be read just now (${(e as Error).message}).` };
  }
}
