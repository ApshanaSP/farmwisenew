/**
 * Ask the Map final: independent counts for the test log (docs/ask-the-map/TEST_LOG_FINAL.md), from the raw layer files only: plain loops,
 * haversine for every pair, membership by each point's own ward and the ward file's zone. No code shared with the map's executor.
 * Run from the portal folder: node scripts/askmap-oracle.mjs   (prints one JSON line per check)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const layer = (id, kinds) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "layers", `${id}.geojson`), "utf8")).features
  .filter((f) => !kinds || kinds.includes(f.properties.kind))
  .map((f) => ({ id: f.properties.id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ward: f.properties.ward ?? null, name: f.properties.name ?? null, in: !!f.properties.in_district }));
const zoneOf = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "boundaries", "gcc-wards.geojson"), "utf8")).features.map((f) => [f.properties.ward_no, f.properties.zone_number]));
const R = 6371008.8, rad = Math.PI / 180;
const hav = (a, b) => { const dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad; const h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const near = (xs, ys, m) => xs.filter((x) => ys.some((y) => y.id !== x.id && hav(x, y) <= m)).length;
const inZone = (xs, z) => xs.filter((p) => p.ward != null && zoneOf.get(p.ward) === z).length;
const farPlaces = (from, m) => { const pl = layer("osm_places").filter((p) => p.in && p.name); return { n: pl.filter((p) => Math.min(...from.map((f) => hav(p, f))) > m).length, of: pl.length }; };
const out = {
  "banks": layer("banks").length,
  "ATMs in Zone 13": inZone(layer("atms"), 13),
  "courts": layer("gov_offices", ["court"]).length,
  "playgrounds in Zone 11": inZone(layer("parks", ["playground"]), 11),
  "ration shops in Tondiarpet (Zone 4)": inZone(layer("ration_shops"), 4),
  "wine shops within 100 m of schools": near(layer("liquor", ["wine_shop"]), layer("schools"), 100),
  "wine shops (all)": layer("liquor", ["wine_shop"]).length,
  "tasmac shops near temples (100 m)": near(layer("liquor", ["wine_shop"]), layer("worship", ["hindu"]), 100),
  "wine shops within 100 m of schools or places of worship": near(layer("liquor", ["wine_shop"]), [...layer("schools"), ...layer("worship")], 100),
  "liquor and bars within 200 m of schools or temples": near(layer("liquor"), [...layer("schools"), ...layer("worship", ["hindu"])], 200),
  "liquor (all)": layer("liquor").length,
  "bars near colleges (100 m)": near(layer("liquor", ["bar", "pub"]), layer("colleges"), 100),
  "bars and pubs (all)": layer("liquor", ["bar", "pub"]).length,
  "schools near hospitals (500 m)": near(layer("schools"), layer("hospitals", ["hospital", "health_centre"]), 500),
  "places more than 2 km from a ration shop": farPlaces(layer("ration_shops"), 2000),
  "neighbourhoods more than 3 km from a bank": farPlaces(layer("banks"), 3000),
  "neighbourhoods more than 2 km from a bank": farPlaces(layer("banks"), 2000),
  "crematoriums": layer("cemeteries", ["crematorium"]).length,
  "burial grounds in Zone 3": inZone(layer("cemeteries"), 3),
  "petrol bunks": layer("fuel").length,
  "parks (all)": layer("parks").length,
  "mosques": layer("worship", ["muslim"]).length,
  "ration shops (all)": layer("ration_shops").length,
  "banks in the district": layer("banks").filter((p) => p.in).length,
  "ATMs in the district": layer("atms").filter((p) => p.in).length
};
for (const [k, v] of Object.entries(out)) console.log(JSON.stringify({ check: k, count: v }));
