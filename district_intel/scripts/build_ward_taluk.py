"""Build the GCC ward -> revenue taluk mapping from official revenue village boundaries: reference/ward_taluk.csv.

What is official here is the TALUK SIDE: each revenue village's taluk (TNGIS, checked village by village against the
Chennai Collectorate's published list). The WARD SIDE is the console's ward polygons, a DataMeet community copy of the GCC
wards with 2011-era numbering in several zones; no official ward -> taluk table is published anywhere. Each row says so
(ward_geometry), and flags the wards whose same-numbered official (TNGIS) ward lies mainly in another taluk.

Every input is real (no generated police or PWD data):

  * GCC ward polygons: the file the pipeline itself uses (config.yaml sources.wards_geojson).
  * Revenue village polygons: TNGIS, the Tamil Nadu Geographical Information System run by TNeGA (Government of
    Tamil Nadu), public WFS https://tngis.tn.gov.in/tngismaps/wfs, layer tngis_basemap:basemap_revenue_village
    (village name, LGD village code, district and taluk on every polygon).
  * Village -> taluk: TNGIS's own taluk on each village, checked against the Chennai District Collectorate's list of
    the 17 taluks and their revenue villages (https://chennai.nic.in/revenue-administration/). TNGIS still files
    Kolathur, Peravallur and Siruvallur under Ayanavaram; the Collectorate lists them as the Kolathur taluk formed in
    2024, so those three villages (matched by LGD code) move to TLK-KLT.

Cross-checks, recorded but never used for the answer: the TNGIS taluk polygons (generic_viewer:taluk_boundary, 16
taluks, drawn before Kolathur existed), the TNGIS copy of the GCC ward polygons (generic_viewer:gcc_ward_boundary),
OpenStreetMap taluk boundaries (community data, 11 of the 17 taluks are mapped there), and the old police/PWD vote
(generated data) read from the last build's output/curated/ref_wards.csv.

Method: each ward is sampled on a regular grid (25 m by default, finer for very small wards); every sample point is
placed in a revenue village (point in polygon, holes respected); the ward's taluk is the Chennai taluk holding the
largest share of its area. Shares of other taluks and of land outside Chennai district are kept.

    python scripts/build_ward_taluk.py --fetch     download the TNGIS (and, with --osm, OSM) layers, then build
    python scripts/build_ward_taluk.py             rebuild from the downloaded copies (no network)

Outputs: reference/ward_taluk.csv (one row per ward), reference/ward_taluk_villages.csv (one row per revenue
village), reference/ward_taluk.meta.json (sources, method, cross-checks, taluk label points). The raw downloads stay
in output/cache/ward_taluk_raw/ (not committed: they are TNGIS's data, fetched again with --fetch).
The pipeline only reads the CSV; it never goes to the network for this.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import re
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from matplotlib.path import Path as MplPath

INTEL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INTEL))

from dintel.geo import WardIndex  # noqa: E402
from dintel.util import load_settings  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
REF = INTEL / "reference"
CACHE = INTEL / "output" / "cache" / "ward_taluk_raw"

TNGIS_WFS = "https://tngis.tn.gov.in/tngismaps/wfs"
COLLECTORATE_URL = "https://chennai.nic.in/revenue-administration/"
LAYERS = {
    "villages": "tngis_basemap:basemap_revenue_village",
    "taluks": "generic_viewer:taluk_boundary",
    "gcc_wards": "generic_viewer:gcc_ward_boundary",
}
BBOX = (80.05, 12.75, 80.45, 13.35)   # lon/lat box around Chennai district and its neighbours
# OpenStreetMap relations for Chennai taluks (admin_level 6), found with Overpass on 2026-11-28; a cross-check only
OSM_TALUK_RELATIONS = [10326120, 10302482, 21757515, 10302481, 21602899, 21775650, 21772138, 10326119, 21499640,
                       21785484, 21745736]
# TNGIS spellings of taluk names that differ from reference/taluks.yaml
TALUK_ALIAS = {"purasaivakkam": "purasawalkam", "velacheri": "velachery", "tondiarpet": "tondiarpet",
               "aminjikarai": "aminjikarai", "thiruvottiyur": "thiruvottiyur"}
# The Collectorate's Kolathur taluk (formed 2024): Kolathur, Peravallur, Siruvallur (LGD village codes in TNGIS)
KOLATHUR_LGD = {945671: "Kolathur", 945674: "Peravallur", 945675: "Siruvallur"}
SAMPLE_STEP_M = 25.0
MIN_SAMPLES = 400
SPLIT_SHARE = 0.10                     # another taluk holding at least this share of a ward: the ward is split
LOW_COVER = 0.5                        # less than this share inside Chennai revenue villages: flagged
NEAR_TIE = 0.05                        # the main taluk leads the next by less than this share of the ward: flagged near_tie
COLLECTORATE_CSV = REF / "collectorate_villages.csv"
MATCH_MIN = 0.75                       # a TNGIS village name matches a Collectorate village of the SAME taluk at this similarity or more
CROSS_MIN = 0.97                       # ... and one of ANOTHER taluk only when the names are nearly identical
WARD_GEOMETRY = ("DataMeet community copy of the GCC ward polygons (not GCC-official; 2011-era numbering in several zones), "
                 "the file the console's map uses")
M_PER_DEG_LAT = 110_574.0


def m_per_deg_lon(lat: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat))


# --------------------------------------------------------------------------------------------------- download --
def wfs_url(layer: str) -> str:
    q = {"service": "WFS", "version": "1.0.0", "request": "GetFeature", "typeName": layer,
         "outputFormat": "application/json", "srsName": "EPSG:4326",
         "CQL_FILTER": f"BBOX(the_geom,{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]},'EPSG:4326')"}
    return f"{TNGIS_WFS}?{urllib.parse.urlencode(q)}"


def _get(url: str, ua: str = "Mozilla/5.0 (district-intel ward-taluk build)") -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def fetch(cache: Path, osm: bool) -> dict:
    try:
        import truststore

        truststore.inject_into_ssl()   # this PC's antivirus re-signs HTTPS
    except ImportError:
        pass
    cache.mkdir(parents=True, exist_ok=True)
    (cache / ".gitignore").write_text("*\n", encoding="utf-8")
    log = {}
    for key, layer in LAYERS.items():
        url = wfs_url(layer)
        body = _get(url)
        gj = json.loads(body)
        (cache / f"tngis_{key}.geojson").write_bytes(body)
        log[key] = {"layer": layer, "url": url, "features": len(gj["features"]), "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(), "fetched_at": datetime.now(IST).isoformat(timespec="seconds")}
        print(f"fetched {layer}: {len(gj['features'])} features, {len(body) / 1e6:.1f} MB")
        time.sleep(1)
    if osm:
        ids = ",".join(f"R{i}" for i in OSM_TALUK_RELATIONS)
        url = f"https://nominatim.openstreetmap.org/lookup?osm_ids={ids}&polygon_geojson=1&format=json"
        body = _get(url, "district-intel ward-taluk cross-check")
        (cache / "osm_taluks.json").write_bytes(body)
        log["osm"] = {"url": url, "features": len(json.loads(body)), "sha256": hashlib.sha256(body).hexdigest(),
                      "fetched_at": datetime.now(IST).isoformat(timespec="seconds")}
        print(f"fetched OSM taluks: {log['osm']['features']}")
    (cache / "fetch_log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")
    return log


# ---------------------------------------------------------------------------------------------------- polygons --
class Polygons:
    """Polygons with holes, a bounding-box prefilter and point lookup (first match; overlaps are counted)."""

    def __init__(self) -> None:
        self.keys: list = []
        self.parts: list[list[tuple[MplPath, list[MplPath]]]] = []
        self.bbox: list[tuple[float, float, float, float]] = []

    def add(self, key, geometry: dict) -> None:
        if not geometry:
            return
        polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        parts, pts = [], []
        for poly in polys:
            rings = [np.asarray(r, dtype=float)[:, :2] for r in poly if len(r) >= 4]
            if not rings:
                continue
            parts.append((MplPath(rings[0]), [MplPath(h) for h in rings[1:]]))
            pts.append(rings[0])
        if not parts:
            return
        a = np.vstack(pts)
        self.keys.append(key)
        self.parts.append(parts)
        self.bbox.append((a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max()))

    def contains(self, i: int, xy: np.ndarray) -> np.ndarray:
        inside = np.zeros(len(xy), dtype=bool)
        for outer, holes in self.parts[i]:
            m = outer.contains_points(xy)
            for h in holes:
                if m.any():
                    m &= ~h.contains_points(xy)
            inside |= m
        return inside

    def locate(self, xy: np.ndarray) -> tuple[np.ndarray, int]:
        """Index of the polygon holding each lon/lat point (-1: none) and the number of points in two or more."""
        out = np.full(len(xy), -1, dtype=int)
        hits = np.zeros(len(xy), dtype=int)
        if not len(xy):
            return out, 0
        x0, y0, x1, y1 = xy[:, 0].min(), xy[:, 1].min(), xy[:, 0].max(), xy[:, 1].max()
        for i, (a, b, c, d) in enumerate(self.bbox):
            if c < x0 or a > x1 or d < y0 or b > y1:
                continue
            cand = (xy[:, 0] >= a) & (xy[:, 0] <= c) & (xy[:, 1] >= b) & (xy[:, 1] <= d)
            if not cand.any():
                continue
            idx = np.where(cand)[0]
            m = self.contains(i, xy[idx])
            hits[idx[m]] += 1
            free = idx[m & (out[idx] < 0)]
            out[free] = i
        return out, int((hits > 1).sum())

    def area_km2(self, i: int) -> float:
        tot = 0.0
        for outer, holes in self.parts[i]:
            for k, ring in enumerate([outer, *holes]):
                v = ring.vertices
                lat0 = float(v[:, 1].mean())
                x = (v[:, 0] - 80.25) * m_per_deg_lon(lat0)
                y = (v[:, 1] - lat0) * M_PER_DEG_LAT
                a = abs(0.5 * np.sum(x[:-1] * y[1:] - x[1:] * y[:-1]))
                tot += a if k == 0 else -a
        return tot / 1e6


def sample_ward(paths: list[MplPath], bbox: tuple[float, float, float, float], area_km2: float, step_m: float) -> np.ndarray:
    """Grid points (lon, lat) inside a ward; each stands for the same area."""
    step = min(step_m, math.sqrt(max(area_km2, 1e-4) * 1e6 / MIN_SAMPLES))
    x0, y0, x1, y1 = bbox
    lat0 = (y0 + y1) / 2
    dy, dx = step / M_PER_DEG_LAT, step / m_per_deg_lon(lat0)
    xs = np.arange(x0 + dx / 2, x1, dx)
    ys = np.arange(y0 + dy / 2, y1, dy)
    gx, gy = np.meshgrid(xs, ys)
    xy = np.column_stack([gx.ravel(), gy.ravel()])
    inside = np.zeros(len(xy), dtype=bool)
    for p in paths:
        inside |= p.contains_points(xy)
    return xy[inside]


# --------------------------------------------------------------------------------------------------- the build --
def load_taluks() -> tuple[dict[str, str], dict[str, str]]:
    rows = yaml.safe_load((REF / "taluks.yaml").read_text(encoding="utf-8"))
    code_by_name = {r["name"].lower(): r["code"] for r in rows if r["in_district"]}
    name_by_code = {r["code"]: r["name"] for r in rows}
    return code_by_name, name_by_code


_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4"}


def norm_village(s: str) -> str:
    """A village name for matching the two spellings (TNGIS 'Velacheri (Part 1)' = Collectorate 'Velachery (Part I)')."""
    s = s.lower().replace("&", " ")
    s = re.sub(r"[\(\)\.,]", " ", s)
    s = re.sub(r"\bpart\b", " ", s)
    s = re.sub(r"(?<=[\s-])(i{1,3}|iv)\s*$", lambda m: " " + _ROMAN[m.group(1)], s)
    # abbreviations the two lists spell out differently; initials are KEPT (S.Kolathur is not Kolathur)
    s = re.sub(r"^t\s*nagar", "thiyagaraya nagar", s.strip())
    s = s.replace("govt", "government")
    s = re.sub(r"[^a-z0-9]", "", s)
    for a, b in (("th", "t"), ("dh", "d"), ("zh", "l"), ("sh", "s"), ("aa", "a"), ("ee", "i"), ("oo", "u"), ("y", "i"), ("w", "v")):
        s = s.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", s)


def collectorate_list(code_by_name: dict[str, str]) -> pd.DataFrame:
    """The Collectorate's published village list (reference/collectorate_villages.csv) with each taluk's code."""
    with open(COLLECTORATE_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(line for line in f if not line.startswith("#")))
    names = {norm_village(k): v for k, v in code_by_name.items()}
    def code(t: str) -> str:
        n = norm_village(t)
        best = max(names, key=lambda k: difflib.SequenceMatcher(None, n, k).ratio())
        if difflib.SequenceMatcher(None, n, best).ratio() < 0.75:
            raise SystemExit(f"Collectorate taluk {t!r} has no code in reference/taluks.yaml")
        return names[best]
    df = pd.DataFrame(rows)
    df["taluk_code"] = [code(t) for t in df["taluk"]]
    df["key"] = [norm_village(v) for v in df["village"]]
    return df


def match_collectorate(vt: pd.DataFrame, col: pd.DataFrame) -> dict[int, tuple[int, float]]:
    """One-to-one name match of TNGIS Chennai villages to Collectorate villages, best pairs first: poly -> (row, score)."""
    # Two passes: first within the same taluk (TNGIS's taluk, Kolathur's three villages counted as Kolathur), then across taluks only
    # for a near-exact name (CROSS_MIN). A loose match across taluks paired Enchambakkam with Manchambakkam and moved a ward.
    tn = [(i, norm_village(str(r.village_name)), r.taluk_code) for i, r in vt.iterrows() if r.tngis_district == "Chennai"]
    used_i, used_j, out = set(), set(), {}
    for same in (True, False):
        pairs = []
        for i, k, t in tn:
            if i in used_i:
                continue
            for j, (c, ct) in enumerate(zip(col["key"], col["taluk_code"])):
                if j in used_j or (ct == t) != same:
                    continue
                sc = difflib.SequenceMatcher(None, k, c).ratio()
                if sc >= (MATCH_MIN if same else CROSS_MIN):
                    pairs.append((sc, i, j))
        for sc, i, j in sorted(pairs, key=lambda x: -x[0]):
            if i in used_i or j in used_j:
                continue
            used_i.add(i); used_j.add(j); out[i] = (j, sc)
    return out


def village_table(gj: dict, code_by_name: dict[str, str]) -> tuple[Polygons, pd.DataFrame]:
    polys = Polygons()
    rows = []
    for f in gj["features"]:
        p = f["properties"]
        dist = str(p.get("dist_name") or "")
        tname = str(p.get("taluk_name") or "")
        lgd = p.get("lgd_villag") or p.get("lgdvcode") or p.get("lgd_village_code")
        lgd = int(lgd) if lgd is not None else None
        if dist == "Chennai":
            if lgd in KOLATHUR_LGD:
                code, rule = "TLK-KLT", "Kolathur taluk (2024) per the Chennai Collectorate list; TNGIS still files it under Ayanavaram"
            else:
                key = TALUK_ALIAS.get(tname.lower(), tname.lower())
                code = code_by_name.get(key)
                if code is None:
                    raise SystemExit(f"TNGIS taluk {tname!r} has no code in reference/taluks.yaml")
                rule = "TNGIS taluk"   # checked against the Collectorate list below (apply_collectorate)
        else:
            code, rule = None, "outside Chennai district"
        idx = len(polys.keys)
        polys.add(idx, f["geometry"])
        if len(polys.keys) == idx:      # empty geometry
            continue
        rows.append({"poly": idx, "lgd_village_code": lgd, "village_name": str(p.get("vill_name") or "").strip(),
                     "tngis_district": dist, "tngis_taluk": tname, "taluk_code": code, "rule": rule,
                     "is_water": int(str(p.get("vill_name") or "").lower().endswith("river"))})
    vt = pd.DataFrame(rows).set_index("poly")
    vt["area_km2"] = [round(polys.area_km2(i), 3) for i in vt.index]
    return polys, vt


def apply_collectorate(vt: pd.DataFrame, col: pd.DataFrame, name_by_code: dict[str, str]) -> dict:
    """Checks every TNGIS Chennai village against the Collectorate's list and writes the real result into its rule.

    Same taluk: kept, "the Collectorate list agrees". Another taluk: the Collectorate's (the district's current
    administrative list) is taken and the row says so. No name match: TNGIS's taluk is kept and the row says it was not
    found in the list. Collectorate villages with no TNGIS polygon are reported (they cannot be drawn)."""
    m = match_collectorate(vt, col)
    vt["collectorate_village"] = None
    vt["collectorate_taluk"] = None
    vt["match_score"] = None
    agree, differ, unmatched = [], [], []
    for i, r in vt.iterrows():
        if r.tngis_district != "Chennai":
            continue
        if i not in m:
            if int(r.lgd_village_code or 0) not in KOLATHUR_LGD:
                vt.at[i, "rule"] = f"{r.rule}; not found by name in the Chennai Collectorate list"
            unmatched.append(str(r.village_name))
            continue
        j, sc = m[i]
        cr = col.iloc[j]
        vt.at[i, "collectorate_village"] = cr.village
        vt.at[i, "collectorate_taluk"] = cr.taluk_code
        vt.at[i, "match_score"] = round(sc, 2)
        if cr.taluk_code == r.taluk_code:
            if int(r.lgd_village_code or 0) not in KOLATHUR_LGD:
                vt.at[i, "rule"] = f"TNGIS taluk; the Chennai Collectorate list agrees ('{cr.village}', {cr.taluk})"
            agree.append(str(r.village_name))
        else:
            vt.at[i, "rule"] = (f"Chennai Collectorate list: '{cr.village}' is in {cr.taluk}; TNGIS files it under "
                                f"{name_by_code.get(r.taluk_code, r.taluk_code)}")
            vt.at[i, "taluk_code"] = cr.taluk_code
            differ.append({"village": str(r.village_name), "collectorate": cr.village, "tngis": r.taluk_code, "taken": cr.taluk_code, "score": round(sc, 2)})
    matched_j = {j for j, _ in m.values()}
    missing = [{"village": col.iloc[j].village, "taluk": col.iloc[j].taluk} for j in range(len(col)) if j not in matched_j]
    return {"url": COLLECTORATE_URL, "checked_on": "2026-11-28", "file": "reference/collectorate_villages.csv",
            "collectorate_villages": int(len(col)), "tngis_chennai_villages": int((vt["tngis_district"] == "Chennai").sum()),
            "same_taluk": len(agree), "taluk_differs_collectorate_taken": differ,
            "tngis_villages_not_in_the_list": unmatched,
            "collectorate_villages_with_no_tngis_polygon": missing,
            "match": f"names normalised (spelling, part numbers) and paired one to one at similarity {MATCH_MIN} or more"}


def simple_polys(features: list[dict], key_fn) -> Polygons:
    p = Polygons()
    for f in features:
        k = key_fn(f)
        if k is not None:
            p.add(k, f.get("geometry") or f.get("geojson"))
    return p


def shares_of(labels: list) -> list[tuple[object, float]]:
    c = Counter(labels)
    n = sum(c.values())
    return [(k, v / n) for k, v in c.most_common()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--fetch", action="store_true", help="download the TNGIS layers first (network)")
    ap.add_argument("--osm", action="store_true", help="with --fetch: also download the OSM taluk cross-check")
    ap.add_argument("--cache", type=Path, default=CACHE)
    ap.add_argument("--step", type=float, default=SAMPLE_STEP_M, help="sample grid step in metres")
    ap.add_argument("--checked-on", default=None, help="date the sources were read (default: the download date in fetch_log.json)")
    ap.add_argument("--out", type=Path, default=REF)
    a = ap.parse_args()
    if a.fetch:
        fetch(a.cache, a.osm)
    flog = json.loads((a.cache / "fetch_log.json").read_text(encoding="utf-8")) if (a.cache / "fetch_log.json").exists() else {}
    if not a.checked_on:
        # an offline rebuild stamps the day the sources were actually downloaded, never today's date
        a.checked_on = str(flog.get("villages", {}).get("fetched_at") or datetime.now(IST).isoformat())[:10]

    settings = load_settings()
    wards = WardIndex(settings.src("wards_geojson"))
    code_by_name, name_by_code = load_taluks()
    gj_v = json.loads((a.cache / "tngis_villages.geojson").read_text(encoding="utf-8"))
    vpolys, vt = village_table(gj_v, code_by_name)
    col_check = apply_collectorate(vt, collectorate_list(code_by_name), name_by_code)
    gj_t = json.loads((a.cache / "tngis_taluks.geojson").read_text(encoding="utf-8"))
    tp = simple_polys([f for f in gj_t["features"] if f["properties"].get("district_name") == "Chennai"],
                      lambda f: code_by_name[TALUK_ALIAS.get(f["properties"]["taluk_name"].lower(), f["properties"]["taluk_name"].lower())])
    lgd_taluk = {code_by_name[TALUK_ALIAS.get(f["properties"]["taluk_name"].lower(), f["properties"]["taluk_name"].lower())]:
                 int(f["properties"]["lgd_taluk_code"]) for f in gj_t["features"] if f["properties"].get("district_name") == "Chennai"}
    gj_w = json.loads((a.cache / "tngis_gcc_wards.geojson").read_text(encoding="utf-8"))
    twards = simple_polys(gj_w["features"], lambda f: int(f["properties"]["ward"]))
    osm = None
    if (a.cache / "osm_taluks.json").exists():
        o = json.loads((a.cache / "osm_taluks.json").read_text(encoding="utf-8"))
        osm = simple_polys(o, lambda x: code_by_name.get(TALUK_ALIAS.get(str(x.get("name", "")).lower(), str(x.get("name", "")).lower())))

    code_of_poly = vt["taluk_code"].to_dict()
    water = set(vt.index[vt["is_water"] == 1])
    label_of_poly = {i: (r.taluk_code or f"OUT:{r.tngis_district}/{r.tngis_taluk}") for i, r in vt.iterrows()}
    rows, overlaps_total, taluk_pts = [], 0, defaultdict(list)
    vill_area_in_ward: dict[int, Counter] = defaultdict(Counter)
    for w in wards.wards:
        xy = sample_ward(w.paths, w.bbox, w.area_km2, a.step)
        n = len(xy)
        vi, ov = vpolys.locate(xy)
        overlaps_total += ov
        labels = [label_of_poly.get(int(k), "NONE") if k >= 0 else "NONE" for k in vi]
        chennai = [lab for lab in labels if lab.startswith("TLK-")]
        sh = shares_of(labels)
        tal = [(k, s) for k, s in sh if str(k).startswith("TLK-")]
        covered = len(chennai) / n
        outside = sum(s for k, s in sh if str(k).startswith("OUT:"))
        cell_km2 = w.area_km2 / n
        for k in vi[vi >= 0]:
            vill_area_in_ward[int(k)][w.ward_no] += cell_km2
        if tal:
            main, share = tal[0]
            method = "official_village_overlay" if covered >= LOW_COVER else "official_village_overlay_low_cover"
            for (lo, la), lab in zip(xy, labels):
                if lab.startswith("TLK-"):
                    taluk_pts[lab].append((lo, la))
        else:
            # no Chennai revenue village under the ward at all: the nearest Chennai village sample decides, flagged
            main, share, method = None, 0.0, "nearest_official_village"
        # without the river polygon (TNGIS files "Adayar River" under Mylapore): does the main taluk change?
        dry = [label_of_poly.get(int(k)) for k in vi if k >= 0 and int(k) not in water and str(label_of_poly.get(int(k))).startswith("TLK-")]
        dry_main = Counter(dry).most_common(1)[0][0] if dry else None
        # villages under the ward (largest first)
        vc = Counter(int(k) for k in vi if k >= 0)
        vill = "; ".join(f"{vt.at[k, 'village_name']} {c / n:.2f}" for k, c in vc.most_common(4) if c / n >= 0.02)
        # cross-checks
        ti, _ = tp.locate(xy)
        tl = Counter(tp.keys[int(k)] for k in ti if k >= 0)
        tngis_layer = tl.most_common(1)[0][0] if tl else None
        tw_main = None
        if w.ward_no in twards.keys:
            j = twards.keys.index(w.ward_no)
            pts = sample_ward([o for o, _ in twards.parts[j]], twards.bbox[j], 1.0, a.step)
            pv, _ = vpolys.locate(pts)
            c2 = Counter(label_of_poly.get(int(k)) for k in pv if k >= 0 and str(label_of_poly.get(int(k))).startswith("TLK-"))
            tw_main = c2.most_common(1)[0][0] if c2 else None
        wi, _ = twards.locate(xy)
        same_no = float(np.mean([twards.keys[int(k)] == w.ward_no if k >= 0 else False for k in wi]))
        cw = Counter(twards.keys[int(k)] for k in wi if k >= 0)
        best_tw = cw.most_common(1)[0] if cw else (None, 0)
        osm_main = None
        if osm is not None:
            oi, _ = osm.locate(xy)
            co = Counter(osm.keys[int(k)] for k in oi if k >= 0)
            osm_main = co.most_common(1)[0][0] if co else None
        rows.append({"ward_no": w.ward_no, "zone_no": w.zone_no, "taluk_code": main, "share": round(share, 3), "method": method,
                     "_dry_main": dry_main, "_cover": covered, "_outside": outside, "_tal": tal, "_vill": vill,
                     "_tngis_layer": tngis_layer, "_tw_main": tw_main, "_same_no": same_no, "_osm": osm_main, "_n": n,
                     "_best_tw": best_tw[0], "_best_tw_share": best_tw[1] / n,
                     "_centroid": w.centroid})

    # wards with no Chennai village at all: the nearest point of any Chennai village sample (none expected)
    allpts = {k: np.asarray(v) for k, v in taluk_pts.items()}
    for r in rows:
        if r["taluk_code"] is None:
            lat, lon = r["_centroid"]
            best = min(allpts, key=lambda k: float(np.min((allpts[k][:, 0] - lon) ** 2 + (allpts[k][:, 1] - lat) ** 2)))
            r["taluk_code"] = best

    source_url = f"{TNGIS_WFS} ({LAYERS['villages']}) ; {COLLECTORATE_URL}"
    geo_file = settings.src("wards_geojson")
    geo_sha = hashlib.sha256(Path(geo_file).read_bytes()).hexdigest()
    out_rows = []
    for r in rows:
        others = [(k, s) for k, s in r["_tal"][1:] if s >= 0.01]
        out_rows.append({
            "ward_no": r["ward_no"], "zone_no": r["zone_no"], "taluk_code": r["taluk_code"], "share": r["share"],
            "method": r["method"], "source_url": source_url, "checked_on": a.checked_on,
            # the ward side is NOT official: say so on every row
            "ward_geometry": WARD_GEOMETRY,
            # the same-numbered official (TNGIS) ward lies mainly in another taluk: this ward number may not mean the GCC ward
            "official_number_differs": int(bool(r["_tw_main"]) and r["_tw_main"] != r["taluk_code"]),
            # the main taluk leads the next by under NEAR_TIE of the ward's area: a boundary difference could flip it
            "near_tie": int(bool(r["_tal"][1:]) and (r["share"] - (r["_tal"][1][1] if len(r["_tal"]) > 1 else 0)) < NEAR_TIE),
            "taluk_name": name_by_code.get(r["taluk_code"]),
            "other_taluks": "; ".join(f"{k} {s:.2f}" for k, s in others),
            "split": int(any(s >= SPLIT_SHARE for _, s in others)),
            "chennai_village_cover": round(r["_cover"], 3), "outside_district_share": round(r["_outside"], 3),
            "villages": r["_vill"],
            "check_tngis_taluk_layer": r["_tngis_layer"], "check_osm": r["_osm"],
            # TNGIS's GCC ward layer numbers wards as the 2021 wards-committee notification does; the pipeline's polygons
            # (DataMeet) do not everywhere. These columns let a later switch to the TNGIS wards be checked ward by ward.
            "tngis_same_number_share": round(r["_same_no"], 3),
            "tngis_best_ward": r["_best_tw"], "tngis_best_ward_share": round(r["_best_tw_share"], 3),
            "tngis_ward_taluk": r["_tw_main"],
        })
    df = pd.DataFrame(out_rows).sort_values("ward_no")
    a.out.mkdir(parents=True, exist_ok=True)
    df.to_csv(a.out / "ward_taluk.csv", index=False, encoding="utf-8")

    # ---------------------------------------------------------------------------------- village table --
    vt_out = vt.copy()
    vt_out["wards"] = [("; ".join(f"{wn} {km:.3f}" for wn, km in sorted(vill_area_in_ward[i].items(), key=lambda x: -x[1]) if km >= 0.005))
                       for i in vt_out.index]
    vt_out["area_in_gcc_wards_km2"] = [round(sum(vill_area_in_ward[i].values()), 3) for i in vt_out.index]
    vt_out = vt_out[(vt_out["tngis_district"] == "Chennai") | (vt_out["area_in_gcc_wards_km2"] > 0)]
    vt_out = vt_out.sort_values(["tngis_district", "taluk_code", "village_name"])
    vt_out[["lgd_village_code", "village_name", "tngis_district", "tngis_taluk", "taluk_code", "rule", "collectorate_village",
            "collectorate_taluk", "match_score", "area_km2", "area_in_gcc_wards_km2", "wards"]].to_csv(a.out / "ward_taluk_villages.csv", index=False, encoding="utf-8")

    # ---------------------------------------------------------------------------------- comparisons --
    to16 = lambda c: "TLK-AYN" if c == "TLK-KLT" else c   # the TNGIS taluk layer predates Kolathur
    cmp_layer = df["check_tngis_taluk_layer"].notna()
    agree_layer = int((df.loc[cmp_layer, "taluk_code"].map(to16) == df.loc[cmp_layer, "check_tngis_taluk_layer"]).sum())
    cmp_tw = df["tngis_ward_taluk"].notna()
    agree_tw = int((df.loc[cmp_tw, "taluk_code"] == df.loc[cmp_tw, "tngis_ward_taluk"]).sum())
    osm_codes = set(osm.keys) if osm is not None else set()
    cmp_osm = df["taluk_code"].isin(osm_codes) & df["check_osm"].notna()
    agree_osm = int((df.loc[cmp_osm, "taluk_code"] == df.loc[cmp_osm, "check_osm"]).sum())
    same_no = np.array([r["_same_no"] for r in rows])
    old = None
    old_path = INTEL / "output" / "curated" / "ref_wards.csv"
    old_cols = pd.read_csv(old_path, encoding="utf-8-sig", nrows=0).columns if old_path.exists() else []
    if "taluk_vote_share" not in old_cols and (a.out / "ward_taluk.meta.json").exists():
        # builds after the switch carry the official taluk in ref_wards: keep the comparison made before it
        old = json.loads((a.out / "ward_taluk.meta.json").read_text(encoding="utf-8")).get("old_vote_comparison")
    elif "taluk_vote_share" in old_cols:
        o = pd.read_csv(old_path, encoding="utf-8-sig")[["ward_no", "taluk_code"]].rename(columns={"taluk_code": "vote"})
        m = df.merge(o, on="ward_no", how="left")
        ch = m[m["vote"] != m["taluk_code"]]
        old = {"file": "output/curated/ref_wards.csv (last build, majority vote of generated police and PWD points)",
               "wards_compared": int(m["vote"].notna().sum()), "same_taluk": int((m["vote"] == m["taluk_code"]).sum()),
               "changed": int(len(ch)),
               "changed_wards": [{"ward": int(x.ward_no), "vote": x.vote, "official": x.taluk_code, "share": x.share} for x in ch.itertuples()]}
    dry_diff = [int(r["ward_no"]) for r in rows if r["_dry_main"] and r["_dry_main"] != r["taluk_code"]]

    # ---------------------------------------------------------------------------- taluk label points --
    taluks = {}
    main_pts: dict[str, list] = defaultdict(list)
    for r in rows:
        if r["taluk_code"]:
            main_pts[r["taluk_code"]].append(r["_centroid"])
    for code, pts in sorted(allpts.items()):
        # the label point is the sample nearest the mean of the ward centres whose MAIN taluk is this one, taken among samples
        # that lie in such a ward, so it always falls in a ward of its own taluk (the Velachery point once fell in a Guindy ward)
        own = [w for w in wards.wards if df.loc[df["ward_no"] == w.ward_no, "taluk_code"].eq(code).any()]
        cands = pts
        if own:
            inside = np.zeros(len(pts), dtype=bool)
            for w in own:
                for path in w.paths:
                    inside |= path.contains_points(pts)
            if inside.any():
                cands = pts[inside]
        mc = np.asarray([(lo, la) for la, lo in main_pts.get(code, [])]) if main_pts.get(code) else cands
        c = mc.mean(axis=0)
        k = int(np.argmin((cands[:, 0] - c[0]) ** 2 + (cands[:, 1] - c[1]) ** 2))
        pts = cands
        wl = df.loc[df["taluk_code"] == code, "ward_no"].astype(int).tolist()
        taluks[code] = {"name": name_by_code.get(code), "lgd_sub_district_code": lgd_taluk.get(code),
                        "wards": wl, "ward_count": len(wl),
                        "villages": sorted(vt.loc[vt["taluk_code"] == code, "village_name"].tolist()),
                        "label_lat": round(float(pts[k, 1]), 5), "label_lon": round(float(pts[k, 0]), 5)}
    flags = df[(df["method"] != "official_village_overlay")]
    meta = {
        "built_at": datetime.now(IST).isoformat(timespec="seconds"), "checked_on": a.checked_on,
        "what": ("GCC ward -> revenue taluk (Chennai district): official revenue village boundaries (TNGIS, checked against the "
                 "Chennai Collectorate's village list) overlaid on the console's ward polygons (DataMeet community copy, not GCC-official)"),
        "ward_geometry_sha256": geo_sha,
        "collectorate_check": col_check,
        "flags": {"official_number_differs": "the same-numbered TNGIS (official) ward lies mainly in another taluk",
                  "near_tie": f"the main taluk leads the next by under {NEAR_TIE} of the ward's area"},
        "method": (f"Each GCC ward is sampled on a {a.step:g} m grid (finer for wards under {MIN_SAMPLES} samples); each point is placed "
                   "in a TNGIS revenue village polygon; the village's taluk is TNGIS's own, except Kolathur, Peravallur and Siruvallur, "
                   "which the Chennai Collectorate lists as the Kolathur taluk formed in 2024. The ward's taluk is the taluk holding "
                   "the largest share of its area; 'share' is that taluk's share of the whole ward area."),
        "ward_geometry": str(settings.src("wards_geojson").relative_to(INTEL.parent)).replace("\\", "/"),
        "ward_geometry_note": ("The ward polygons are the pipeline's (a DataMeet community copy of the GCC wards), so every ward number "
                               "means the same area here as on the console's map. TNGIS's GCC ward layer follows the zone ranges of the "
                               "2021 wards-committee notification (Tamil Nadu Government Gazette Extraordinary No. 594, 14 Dec 2021: "
                               "zone II = wards 15-22, III = 23-33, XIII = 168-180, XIV = 181-191); the DataMeet file follows the "
                               "superseded 2011 numbering in several zones. tngis_ward_taluk gives the taluk of the TNGIS ward with the "
                               "same number, ready for the day the console switches to the official ward polygons (then re-run this script)."),
        "methods": {"official_village_overlay": "official revenue village polygons cover at least half of the ward",
                    "official_village_overlay_low_cover": "less than half of the ward lies in Chennai revenue villages (flagged)",
                    "nearest_official_village": "no Chennai revenue village under the ward; nearest official taluk (flagged)"},
        "sources": [
            {"name": "TNGIS revenue village boundaries (TNeGA, Government of Tamil Nadu)", "url": TNGIS_WFS,
             "layer": LAYERS["villages"], "used_for": "village polygons, village names, LGD village codes, TNGIS taluk of each village",
             "terms": ("TNGIS terms of use (https://tngis.tn.gov.in/apps/thematic_view, read 2026-11-28): for information only and "
                       "not for legal use; not to be shared or published in public media without prior approval from TNGIS/TNeGA; "
                       "data owned by the source departments. The raw polygons are therefore kept out of the repository."),
             **{k: v for k, v in flog.get("villages", {}).items() if k != "layer"}},
            {"name": "Chennai District Collectorate: revenue administration (17 taluks, their firkas and revenue villages)",
             "url": COLLECTORATE_URL, "checked_on": "2026-11-28",
             "used_for": "taluk of each village; Kolathur taluk = Kolathur, Peravallur, Siruvallur (formed 2024 from Ayanavaram)"},
            {"name": "TNGIS taluk boundaries", "url": TNGIS_WFS, "layer": LAYERS["taluks"],
             "used_for": "cross-check only (16 Chennai taluks, drawn before Kolathur); LGD sub-district codes",
             **{k: v for k, v in flog.get("taluks", {}).items() if k != "layer"}},
            {"name": "TNGIS GCC ward boundaries", "url": TNGIS_WFS, "layer": LAYERS["gcc_wards"],
             "used_for": "cross-check only: the same overlay on TNGIS's copy of the ward polygons",
             **{k: v for k, v in flog.get("gcc_wards", {}).items() if k != "layer"}},
            {"name": "OpenStreetMap taluk boundaries (community data, not official)", "url": "https://www.openstreetmap.org/relation/10326120",
             "used_for": "cross-check only (11 of the 17 taluks are mapped in OSM)", **flog.get("osm", {})},
        ],
        "sources_tried": [
            {"url": COLLECTORATE_URL, "has": "17 taluks in 3 revenue divisions, 49 firkas, revenue villages per taluk; no ward lists",
             "usable": "yes: village -> taluk"},
            {"url": "https://tngis.tn.gov.in/tngismaps/wfs", "has": "public OGC WFS/WMS of TNGIS: revenue villages (with LGD codes), taluks, GCC wards",
             "usable": "yes: polygons"},
            {"url": "https://www.stationeryprinting.tn.gov.in/extraordinary/2021/594_Ex_II_2.pdf",
             "has": "TN Gazette Extraordinary No. 594 (14 Dec 2021), MAWS notification II(2)/MAWS/871(e-1)/2021: the 15 GCC wards "
                    "committees (zones) and their ward ranges; no taluks",
             "usable": "cross-check of ward numbering only (TNGIS's GCC ward layer matches it; the DataMeet file does not in zones II, III, XIII, XIV)"},
            {"url": "https://tngis.tn.gov.in/downloads.html", "has": "Taluk.zip and Revenue_Villages_Boundary.zip shapefiles",
             "usable": "not used: the page asks visitors to log in or register before downloading (no account was created)"},
            {"url": "https://lgdirectory.gov.in/", "has": "LGD codes of sub-districts, villages, ULB wards; PC/AC-wise ward mapping report",
             "usable": "not used: the reports and downloads sit behind a CAPTCHA form; no ward -> taluk report exists there"},
            {"url": "https://tnsdma.tn.gov.in/img/document/DDMPPDF/chennai Gcc ddmp.pdf",
             "has": "GCC City Disaster Management Perspective Plan 2024 (806 pages)", "usable": "no: no ward -> taluk table (taluk appears only in addresses)"},
            {"url": "https://gis.chennaicorporation.gov.in/server/rest/services/", "has": "GCC's own ArcGIS server",
             "usable": "no: HTTPS fails and HTTP answers 'Could not access any server machines' (2026-11-28)"},
            {"url": "https://en.wikipedia.org/wiki/Administrative_divisions_of_Chennai", "has": "zone -> taluk(s) table, community-edited, zone level only",
             "usable": "no: not official and not ward level"},
            {"url": "https://tn.data.gov.in/resource/revenue-divisions-taluks-firkas-and-revenue-villages-chennai-district-dhb-2017-18",
             "has": "District Statistical Handbook 2017-18 list of divisions, taluks, firkas, villages (seen in search results, not downloaded)",
             "usable": "not used: a list without geometry from before Kolathur; the Collectorate page is current"},
            {"url": "https://www.elections.tn.gov.in/", "has": "assembly constituency documents",
             "usable": "not checked: with official village polygons available, an assembly-constituency crosswalk would only be an approximation"},
            {"url": "https://bhuvan.nrsc.gov.in/ ; https://onlinemaps.surveyofindia.gov.in/ ; https://censusindia.gov.in/",
             "has": "national boundary services", "usable": "not checked: the state's own TNGIS layers were found first and are the Revenue Department's"},
            {"url": "https://overpass-api.de/api/interpreter", "has": "OSM admin_level 6 taluks: 11 of 17 Chennai taluks",
             "usable": "cross-check only (community data)"},
        ],
        "counts": {"wards": int(len(df)), "taluks_with_wards": int(df["taluk_code"].nunique()),
                   "split_wards": int(df["split"].sum()), "flagged_wards": flags["ward_no"].astype(int).tolist(),
                   "sample_points_in_two_villages": overlaps_total,
                   "wards_whose_main_taluk_depends_on_the_adyar_river_polygon": dry_diff},
        "cross_checks": {
            "tngis_taluk_layer": {"compared": int(cmp_layer.sum()), "agree": agree_layer,
                                  "note": "Kolathur counted as Ayanavaram, as in the TNGIS taluk layer"},
            "tngis_ward_polygons": {"compared": int(cmp_tw.sum()), "agree": agree_tw,
                                    "note": "agree = the TNGIS ward with the same number lies mainly in the same taluk",
                                    "median_share_of_ward_in_same_numbered_tngis_ward": round(float(np.median(same_no)), 3),
                                    "wards_under_50pct_in_same_numbered_tngis_ward": [int(r["ward_no"]) for r in rows if r["_same_no"] < 0.5],
                                    "wards_whose_best_tngis_match_has_another_number": [
                                        {"ward": int(r["ward_no"]), "tngis_ward": r["_best_tw"], "share": round(r["_best_tw_share"], 2)}
                                        for r in rows if r["_best_tw"] is not None and r["_best_tw"] != r["ward_no"]]},
            "osm_taluks": {"compared": int(cmp_osm.sum()), "agree": agree_osm,
                           "differ": df.loc[cmp_osm & (df["taluk_code"] != df["check_osm"]), "ward_no"].astype(int).tolist()},
        },
        "old_vote_comparison": old,
        "taluks": taluks,
    }
    (a.out / "ward_taluk.meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False, default=str), encoding="utf-8")

    print(f"wards {len(df)}, taluks {df['taluk_code'].nunique()}, split {int(df['split'].sum())}, flagged {len(flags)}, "
          f"official number differs {int(df['official_number_differs'].sum())}, near tie {int(df['near_tie'].sum())}")
    print(f"Collectorate check: {col_check['same_taluk']} same taluk, {len(col_check['taluk_differs_collectorate_taken'])} differ "
          f"(Collectorate taken), {len(col_check['tngis_villages_not_in_the_list'])} TNGIS villages not in the list, "
          f"{len(col_check['collectorate_villages_with_no_tngis_polygon'])} listed villages with no TNGIS polygon")
    print("share: min %.2f, median %.2f; cover: min %.2f" % (df["share"].min(), df["share"].median(), df["chennai_village_cover"].min()))
    print(f"TNGIS taluk layer agrees {agree_layer}/{int(cmp_layer.sum())}; TNGIS ward polygons agree {agree_tw}/{int(cmp_tw.sum())}; "
          f"OSM agrees {agree_osm}/{int(cmp_osm.sum())}")
    if old:
        print(f"old vote: {old['same_taluk']}/{old['wards_compared']} same, {old['changed']} changed")
    print("wards per taluk:", df["taluk_code"].value_counts().sort_index().to_dict())


if __name__ == "__main__":
    main()
