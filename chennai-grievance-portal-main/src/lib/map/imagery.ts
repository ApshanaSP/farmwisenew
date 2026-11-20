/**
 * Then and now: dated satellite imagery of Chennai from Esri's World Imagery Wayback archive (every published version of the
 * World Imagery map since 2014, free to view with attribution). One version per year, the last of that year: what the map
 * looked like then. A version is only as new as the photo behind it, so the date the photo was taken (and by which satellite)
 * is read from that version's own metadata for the point being looked at, and that is the date the console shows.
 *
 * Pure tables and helpers here; imageryDates() (server) asks Esri's metadata service, cached a day per place and version.
 */
export interface Release { year: number; release: number; published: string; meta: string }

/** the last World Imagery version of each year (waybackconfig.json, read 19 Nov 2026) */
export const RELEASES: Release[] = [
  { year: 2014, release: 5844, published: "2014-12-30", meta: "World_Imagery_Metadata_2014_r21" },
  { year: 2015, release: 28163, published: "2015-12-16", meta: "World_Imagery_Metadata_2015_r23" },
  { year: 2016, release: 18966, published: "2016-12-20", meta: "World_Imagery_Metadata_2016_r22" },
  { year: 2017, release: 25521, published: "2017-11-16", meta: "World_Imagery_Metadata_2017_r19" },
  { year: 2018, release: 23448, published: "2018-12-14", meta: "World_Imagery_Metadata_2018_r17" },
  { year: 2019, release: 4756, published: "2019-12-12", meta: "World_Imagery_Metadata_2019_r16" },
  { year: 2020, release: 29260, published: "2020-12-16", meta: "World_Imagery_Metadata_2020_r16" },
  { year: 2021, release: 26120, published: "2021-12-21", meta: "World_Imagery_Metadata_2021_r17" },
  { year: 2022, release: 45134, published: "2022-12-14", meta: "World_Imagery_Metadata_2022_r15" },
  { year: 2023, release: 56102, published: "2023-12-07", meta: "World_Imagery_Metadata_2023_r11" },
  { year: 2024, release: 16453, published: "2024-12-12", meta: "World_Imagery_Metadata_2024_r13" },
  { year: 2025, release: 13192, published: "2025-12-18", meta: "World_Imagery_Metadata_2025_r12" },
  { year: 2026, release: 3692, published: "2026-11-18", meta: "World_Imagery_Metadata_2026_r11" }
];
export const LATEST = RELEASES[RELEASES.length - 1];

/** the tile address of one version (the browser fetches these from Esri directly, as it does today's imagery) */
export const waybackTiles = (release: number) =>
  `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${release}/{z}/{y}/{x}`;

export const releaseOf = (year: number): Release | null => RELEASES.find((r) => r.year === year) ?? null;

export interface Shot { year: number; date: string | null; sensor: string | null; resM: number | null; provider: string | null }

interface IdentifyResult { attributes?: Record<string, string | number | null> }

/** "20130301" -> "2013-03-01"; anything else null */
export function srcDate(v: unknown): string | null {
  const s = String(v ?? "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

/**
 * The photo behind a version at a point, from the metadata layers Esri returns for it: the sharpest one drawn at a street zoom
 * (MinMapLevel <= 16 <= MaxMapLevel), else the sharpest of all. Pure.
 */
export function pickShot(year: number, results: IdentifyResult[]): Shot {
  const rows = results.map((r) => r.attributes ?? {}).filter((a) => srcDate(a.SRC_DATE));
  const atStreet = rows.filter((a) => Number(a.MinMapLevel) <= 16 && Number(a.MaxMapLevel) >= 16);
  const best = (atStreet.length ? atStreet : rows).sort((a, b) => Number(a.SRC_RES) - Number(b.SRC_RES))[0];
  if (!best) return { year, date: null, sensor: null, resM: null, provider: null };
  const res = Number(best.SRC_RES);
  return { year, date: srcDate(best.SRC_DATE), sensor: best.SRC_DESC ? String(best.SRC_DESC) : null, resM: Number.isFinite(res) ? res : null, provider: best.NICE_DESC ? String(best.NICE_DESC) : null };
}

declare global {
  // eslint-disable-next-line no-var
  var __diqShots: Map<string, { at: number; v: Shot }> | undefined;
}

/** When each version's photo at this point was taken (server only; cached a day per ~1 km cell and version). */
export async function imageryDates(lat: number, lon: number, years: number[]): Promise<Shot[]> {
  const cache = (global.__diqShots ??= new Map());
  const cell = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  return Promise.all(years.map(async (year) => {
    const r = releaseOf(year);
    if (!r) return { year, date: null, sensor: null, resM: null, provider: null };
    const k = `${r.release}|${cell}`;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < 864e5) return hit.v;
    const d = 0.01;
    const url = `https://metadata.maptiles.arcgis.com/arcgis/rest/services/${r.meta}/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1`
      + `&mapExtent=${lon - d},${lat - d},${lon + d},${lat + d}&imageDisplay=600,600,96&returnGeometry=false&f=json`;
    try {
      // Esri's metadata service takes 3 to 12 s an answer: the answer is cached a day, so it is slow once per place
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { results?: IdentifyResult[] };
      const v = pickShot(year, j.results ?? []);
      cache.set(k, { at: Date.now(), v });
      if (cache.size > 4000) cache.clear();
      return v;
    } catch {
      return { year, date: null, sensor: null, resM: null, provider: null };
    }
  }));
}
