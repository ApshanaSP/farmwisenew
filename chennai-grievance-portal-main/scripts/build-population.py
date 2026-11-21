"""
Population per ward and per 400 m hexagon, from Kontur Population (CC BY 4.0, 400 m H3 cells, 1 Nov 2023 release,
https://data.humdata.org/dataset/kontur-population-india).

Each hexagon's people are shared between the wards it overlaps by area (shapely), so a hexagon on a ward boundary
is not counted twice. Writes data/layers/population.json:
  meta:  source, licence, release, totals
  wards: {ward_no: {pop, area_km2, density_km2}}
  hexes: [[h3, pop, ward_no_of_largest_share], ...] for the district (for the density view)

Run:  python scripts/build-population.py [path/to/kontur_population_IN_*.gpkg]
Needs: pip install shapely h3   (the .gpkg is SQLite: read with the standard library)
"""
import json, os, sqlite3, sys
from datetime import datetime, timezone

import h3
from shapely.geometry import Polygon, shape
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "sources", "kontur", "kontur_IN_20231101.gpkg")
WARDS = os.path.join(ROOT, "data", "boundaries", "gcc-wards.geojson")
OUT = os.path.join(ROOT, "data", "layers", "population.json")

wards = json.load(open(WARDS, encoding="utf-8"))["features"]
polys = [shape(f["geometry"]).buffer(0) for f in wards]
nos = [int(f["properties"]["ward_no"]) for f in wards]
tree = STRtree(polys)
minx = min(p.bounds[0] for p in polys) - 0.01; miny = min(p.bounds[1] for p in polys) - 0.01
maxx = max(p.bounds[2] for p in polys) + 0.01; maxy = max(p.bounds[3] for p in polys) + 0.01

db = sqlite3.connect(SRC)
ward_pop = {n: 0.0 for n in nos}
hexes = []
seen = 0
for cell, pop in db.execute("SELECT h3, population FROM population"):
    lat, lon = h3.cell_to_latlng(cell)
    if not (miny - 0.01 <= lat <= maxy + 0.01 and minx - 0.01 <= lon <= maxx + 0.01):
        continue
    seen += 1
    hexp = Polygon([(x, y) for y, x in h3.cell_to_boundary(cell)])
    area = hexp.area
    best, best_share = None, 0.0
    inside = 0.0
    for i in tree.query(hexp):
        share = hexp.intersection(polys[i]).area / area
        if share <= 0:
            continue
        ward_pop[nos[i]] += pop * share
        inside += share
        if share > best_share:
            best, best_share = nos[i], share
    if best is not None:
        hexes.append([cell, round(pop), best, round(inside, 3)])

# ward areas in km2 (a local equal-area approximation at Chennai's latitude is fine for density)
import math
def km2(p):
    lat0 = math.radians((p.bounds[1] + p.bounds[3]) / 2)
    return p.area * (111.32 ** 2) * math.cos(lat0)

out_wards = {}
for n, p in zip(nos, polys):
    a = km2(p)
    out_wards[str(n)] = {"pop": round(ward_pop[n]), "area_km2": round(a, 3), "density_km2": round(ward_pop[n] / a) if a else 0}

total = sum(ward_pop.values())
meta = {
    "source": "Kontur Population, 400 m H3 hexagons (India, release 2023-11-01)",
    "url": "https://data.humdata.org/dataset/kontur-population-india",
    "licence": "CC BY 4.0",
    "attribution": "Population: Kontur Population (CC BY 4.0), built from GHSL, Facebook HRSL, Microsoft Buildings and OpenStreetMap",
    "method": "each 400 m hexagon's people shared between wards by overlap area; wards are the DataMeet 200-ward outlines",
    "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "hexes_near_district": seen,
    "district_population": round(total),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"meta": meta, "wards": out_wards, "hexes": hexes}, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
pops = sorted((v["pop"], k) for k, v in out_wards.items())
print(f"district {round(total):,} people in {len(out_wards)} wards, {len(hexes)} hexagons")
print("smallest", pops[:3], "largest", pops[-3:])
