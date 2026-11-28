#!/usr/bin/env node
/**
 * Reads the rain of every active CFM-DSS rain gauge in and near Chennai into data/aws-cache/cfm-rain.json (the Rain
 * view's gauge record; src/lib/rehearsal/gauges.ts explains the source and the method). Plain WFS requests to the Chennai
 * Flood Monitor's public GeoServer, 10 rain days a request, a second apart; days already read are kept unless --again.
 *
 *   npx vite-node scripts/fetch-cfm-rain.mjs [--from 2026-07-01] [--to 2026-11-28] [--again]
 *
 * Node needs the Avast certificate on this PC: NODE_EXTRA_CA_CERTS="C:/ProgramData/Avast Software/Avast/wscert.pem".
 */
import { currentRainDay, dayRange, emptyCache, kmBetween, mergeDays, readCache, readDays, readGauges, writeCache, CACHE_FILE, EDGE_KM } from "../src/lib/rehearsal/gauges";
import { loadWardDataset } from "../src/lib/wards";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = arg("--from", "2026-07-01"), TO = arg("--to", currentRainDay()), AGAIN = process.argv.includes("--again");
const CHUNK = 10;

const ds = loadWardDataset();
if (!ds.available) throw new Error(`ward polygons not available: ${ds.problem}`);
const inRing = (x, y, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inWards = (lat, lon) => ds.features.some((f) => lon >= f.bbox[0] && lon <= f.bbox[2] && lat >= f.bbox[1] && lat <= f.bbox[3] && inRing(lon, lat, f.rings[0]) && !f.rings.slice(1).some((h) => inRing(lon, lat, h)));
const verts = ds.features.flatMap((f) => f.rings[0].filter((_, i) => i % 3 === 0));
const nearWards = (lat, lon) => verts.reduce((m, [x, y]) => Math.min(m, kmBetween(lat, lon, y, x)), Infinity);

const t0 = Date.now();
const gauges = await readGauges(inWards, nearWards);
console.log(`gauges: ${gauges.length} active within ${EDGE_KM} km of the wards, ${gauges.filter((g) => g.inChennai).length} inside the 200 wards`);
let cache = readCache() ?? emptyCache(gauges);
cache = { ...cache, gauges };
// the last two days are read again (today's rain day is still running)
const yesterday = new Date(Date.parse(TO + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
const want = dayRange(FROM, TO).filter((d) => AGAIN || !cache.days.includes(d) || d >= yesterday);
for (let i = 0; i < want.length; i += CHUNK) {
  const part = want.slice(i, i + CHUNK);
  const r = await readDays(gauges, part[0], part[part.length - 1]);
  // only the days asked for (a chunk is contiguous in `want` only when no day in it was skipped)
  cache = mergeDays(cache, part, r.presence, r.rain, r.dropped);
  cache.fetchedAt = new Date().toISOString();
  writeCache(cache);
  const wet = part.reduce((s, d) => s + Object.values(cache.rain[d] ?? {}).filter((x) => x.h).length, 0);
  console.log(`${part[0]} .. ${part.at(-1)}: ${wet} gauge-days with rain, ${r.dropped} faults dropped`);
  await new Promise((res) => setTimeout(res, 1000));
}
console.log(`wrote ${CACHE_FILE()} (${cache.days.length} rain days, ${cache.gauges.length} gauges) in ${Math.round((Date.now() - t0) / 1000)} s`);
