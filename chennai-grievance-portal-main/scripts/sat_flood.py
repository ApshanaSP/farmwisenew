#!/usr/bin/env python3
"""Flood water seen from space for each past heavy rain: Sentinel-1 radar and Sentinel-2 / Landsat optical pictures, each
compared with dry scenes, laid on Chennai's roads.

28 Nov 2026 (v2): one radar track passes over Chennai only every 12 days, so most rains had no radar picture. Each rain now
takes every look that came from its first day to MAX_DAYS after its last: the first Sentinel-1 radar pass, and up to two
optical scenes (Sentinel-2 L2A at 10-20 m every 2-5 days; Landsat 8/9 Collection 2 Level-2 at 30 m every 8 days) where
clouds leave part of the city clear. Optical water: the modified normalised difference water index (MNDWI, green against
short-wave infrared) is high where there is open water; a pixel is new water when it is clear of cloud and cloud shadow,
its MNDWI is above OPT_WATER now, well above the median of dry clear scenes (OPT_RISE), and it is not permanent water. The
looks of one rain are combined (a pixel is water if any look saw it) and every street records which looks saw it.

For every rain in the Rain view's record (the same rule as src/lib/rehearsal/memory.ts rainEvents) this job:
  1. finds the Sentinel-1 passes over Chennai in the Microsoft Planetary Computer's public STAC catalogue (collection
     sentinel-1-rtc: Copernicus Sentinel-1 GRD, radiometrically terrain corrected, 10 m, no key needed);
  2. takes the first pass from the rain's first day to two days after its last ("no pass within 2 days" otherwise) and,
     as the dry picture, the median of the three passes before the rain that had no rain in the three days before them;
  3. reads both over the district through the Planetary Computer's data API (a 10 m grid in degrees, VV backscatter in dB);
  4. marks open flood water: dark now (VV below a threshold from the scene's own histogram, kept between -20 and -14 dB),
     at least 3 dB darker than the dry picture, not dark in the dry picture, and not permanent water (JRC Global Surface
     Water occurrence 50 % or more); patches under 10 pixels (~1,200 m2) are dropped as speckle;
  5. lays the water on the road network (data/roads/graph.bin, OpenStreetMap) and the 200 ward polygons: road pieces with
     30 m or more (or half their length) under water, grouped into streets, with the water area per ward.
Output: data/aws-cache/sat-flood.json (src/lib/rehearsal/satflood.ts reads it for the Rain view).

What radar cannot see (written into the file): water between buildings in dense streets (walls bounce the radar back,
so flooded built-up streets often look bright, not dark), water under trees and flyovers, and water that drained before
the pass. Sentinel-1 passes over Chennai once every 12 days on this track (06:01 IST); optical pictures need a clear sky, which
monsoon rains rarely leave. Absence of satellite water is therefore never read as "not flooded"; complaints stay the main record.

Usage (from chennai-grievance-portal-main):
  python scripts/sat_flood.py [--rain 2026-11-08] [--max-days 2] [--out data/aws-cache/sat-flood.json] [--cache DIR]
Needs numpy, scipy, Pillow, requests (and truststore on this PC, for the Avast certificate).
"""
from __future__ import annotations

import argparse
import glob
import gzip
import hashlib
import io
import json
import math
import os
import struct
import sys
import tempfile
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:  # this PC's TLS goes through Avast; elsewhere the system store is fine as it is
    import truststore
    truststore.inject_into_ssl()
except ImportError:  # pragma: no cover
    pass
import numpy as np
import requests
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
IST = timezone(timedelta(hours=5, minutes=30))
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
DATA_API = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox"
COLL = "sentinel-1-rtc"
RES = 0.0001  # degrees per pixel (~10.8 m north-south, ~10.6 m east-west at 13 N)
TILE_W, TILE_H = 1000, 1300
DB_LO, DB_HI = -30.0, 10.0  # the PNG's 0..255 range
MIN_DROP_DB = 3.0
T_MIN, T_MAX, T_DEFAULT = -20.0, -14.0, -16.5
MIN_PATCH_PX = 10
PERMANENT_PCT = 50
ROAD_MIN_M, ROAD_MIN_SHARE = 30.0, 0.5
BESIDE_PX = 4  # "beside": within ~45 m of the water
# optical looks (v2)
MAX_DAYS = 5.0             # a look counts up to this many days after the rain's last day (water that stands that long is the
                           # waterlogging that matters; how many days after is shown with every look)
OPT_SCENE_CLOUD = 85       # scenes cloudier than this over their whole tile are not read at all
OPT_MIN_CLEAR = 0.15       # a look is kept only when at least this share of the wards is clear of cloud in it
OPT_WATER, OPT_RISE = 0.15, 0.3   # MNDWI now, and its rise over the dry median; the dry median itself under 0
OPT_HIGH, OPT_HIGH_RISE = 0.3, 0.45
OPT_MIN_PATCH_PX = 20      # ~2,300 m2: optical water index is noisier than radar on a 10 m grid (SWIR is 20 or 30 m)
CLOUD_GROW_PX = 10         # cloud, shadow and haze masks are grown by ~100 m (scattered monsoon cumulus has hazy edges the
                           # scene classification misses: on 10 Nov those edges alone gave 17 km2 of false "water")
# Besides MNDWI, water must also pass McFeeters' NDWI (green against near-infrared, above 0: clouds and haze fail it) and be dark
# in blue light (under 18 % reflectance: cloud and haze are brighter; built-up ground is mostly 8-15 %). `blue` is the value on the 0-255 scale of
# `blue_rescale` at that reflectance (Sentinel-2 L2A: DN = 10000 x reflectance + 1000; Landsat C2 L2: reflectance = 2.75e-5 x DN - 0.2).
OPT = {
    "sentinel-2-l2a": {"name": "Sentinel-2", "mndwi": "(B03-B11)/(B03+B11)", "ndwi": "(B03-B08)/(B03+B08)", "blue": "B02",
                       "blue_rescale": "0,5000", "blue_max": round(2800 / 5000 * 255),
                       "cloud": {"assets": "SCL"}, "bad": {0, 1, 3, 8, 9, 10},
                       "catalogue": "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a"},
    "landsat-c2-l2": {"name": "Landsat", "mndwi": "(green-swir16)/(green+swir16)", "ndwi": "(green-nir08)/(green+nir08)", "blue": "blue",
                      "blue_rescale": "7273,25455", "blue_max": round((13818 - 7273) / (25455 - 7273) * 255),
                      # QA_PIXEL bits 1 dilated cloud, 3 cloud, 4 cloud shadow (the data API allows no bit operators: x/2^k % 2)
                      "cloud": {"expression": "((qa_pixel/2)%2>=1)+((qa_pixel/8)%2>=1)+((qa_pixel/16)%2>=1)", "rescale": "0,3"},
                      "catalogue": "https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2"},
}
UA = {"User-Agent": "DistrictIQ/1.0 (Chennai Collector dashboard; Sentinel-1 flood mapping)"}


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ inputs --

def ward_polygons():
    g = json.loads((ROOT / "data/boundaries/gcc-wards.geojson").read_text(encoding="utf-8"))
    out = []
    for f in g["features"]:
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        out.append((int(f["properties"]["ward_no"]), polys))
    return out


def rain_events():
    """The Rain view's rains: the pipeline's heavy-rain days and IMD days of 30 mm or more, joined when 2 days apart or less."""
    days: dict[str, set] = {}
    try:
        txt = (REPO / "district_intel/output/state/grievance_rain_days.txt").read_text()
        for d in txt.replace(",", " ").split():
            days.setdefault(d, set()).add("pipeline")
    except OSError:
        pass
    mm: dict[str, float] = {}
    for f in glob.glob(str(ROOT / "data/aws-cache/observations-*.json.gz")):
        j = json.loads(gzip.decompress(Path(f).read_bytes()).decode("utf-8"))
        cols = [c[0] for c in j["columns"]]
        im, iv, it = cols.index("metric"), cols.index("value"), cols.index("observed_at")
        for r in j["rows"]:
            if r[im] == "rainfall_24h_mm" and r[iv] is not None:
                d = str(r[it])[:10]
                mm[d] = max(mm.get(d, 0.0), float(r[iv]))
    for d, v in mm.items():
        if v >= 30:
            days.setdefault(d, set()).add("imd")
    ev: list[dict] = []
    for d in sorted(days):
        if ev and (date.fromisoformat(d) - date.fromisoformat(ev[-1]["end"])).days <= 2:
            ev[-1]["end"] = d
        else:
            ev.append({"id": f"rain-{d}", "start": d, "end": d})
    return ev


def gauge_rain(start: str, end: str):
    """The CFM-DSS gauges' rain over a rain (data/aws-cache/cfm-rain.json, see gauges.ts): gauges reporting, median and most (mm)."""
    try:
        c = json.loads((ROOT / "data/aws-cache/cfm-rain.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    d0 = date.fromisoformat(start) - timedelta(days=1)
    days = [(d0 + timedelta(days=k)).isoformat() for k in range((date.fromisoformat(end) - d0).days + 1)]
    read = [d for d in days if d in c["days"]]
    if not read:
        return None
    tot = []
    for g in c["gauges"]:
        # as gauges.ts: a Chengalpattu / Kancheepuram / Tiruvallur gauge mapped inside the wards is a mislocated point,
        # and a gauge counts only when it reported on every day of the window
        if g.get("inChennai") and g["id"][:3].upper() in ("CGL", "KPM", "TLR", "RNP", "VLR"):
            continue
        xs = [c["rain"].get(d, {}).get(g["id"]) for d in read]
        on = [x for x in xs if x and x["p"] >= 3]
        if len(on) == len(read):
            tot.append(sum(sum((x.get("h") or {}).values()) for x in on))
    if not tot:
        return None
    tot.sort()
    return {"gauges": len(tot), "medianMm": round(tot[len(tot) // 2], 1), "maxMm": round(tot[-1], 1)}


def load_graph():
    b = (ROOT / "data/roads/graph.bin").read_bytes()
    if b[:8] != b"DIQROAD1":
        raise SystemExit("data/roads/graph.bin is not a road graph file")
    hlen = struct.unpack("<I", b[8:12])[0]
    head = json.loads(b[12:12 + hlen].decode("utf-8"))
    base = math.ceil((12 + hlen) / 8) * 8
    T = {"f32": np.float32, "u32": np.uint32, "i32": np.int32, "u16": np.uint16, "u8": np.uint8, "i8": np.int8}
    a = {x["name"]: np.frombuffer(b, dtype=T[x["type"]], count=x["length"], offset=base + x["offset"]) for x in head["arrays"]}
    # the same identity as graph.ts (sha1 of the from and len arrays)
    a["hash"] = hashlib.sha1(a["from"].tobytes() + a["len"].tobytes()).hexdigest()[:12]
    a["names"], a["names_ta"] = head["names"], head.get("names_ta") or [None] * len(head["names"])
    return a


# ------------------------------------------------------------------ the grid --

class Grid:
    def __init__(self, w, s, e, n):
        self.w, self.n = w, n
        self.W = int(math.ceil((e - w) / RES))
        self.H = int(math.ceil((n - s) / RES))
        self.e, self.s = w + self.W * RES, n - self.H * RES

    def tiles(self):
        for y0 in range(0, self.H, TILE_H):
            for x0 in range(0, self.W, TILE_W):
                y1, x1 = min(self.H, y0 + TILE_H), min(self.W, x0 + TILE_W)
                yield (x0, y0, x1, y1), (self.w + x0 * RES, self.n - y1 * RES, self.w + x1 * RES, self.n - y0 * RES)

    def px(self, lat, lon):
        return ((self.n - lat) / RES, (lon - self.w) / RES)  # fractional row, col


def http_get(url, params, tries=4):
    for k in range(tries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=180)
            if r.status_code == 200:
                return r
            if r.status_code in (404, 400):
                return r
            log(f"  HTTP {r.status_code}, retrying")
        except requests.RequestException as e:
            log(f"  {type(e).__name__}, retrying")
        time.sleep(3 * 2 ** k)
    raise RuntimeError(f"could not read {url}")


def read_tile(cache: Path, item: str, coll: str, bbox, size, expression=None, rescale=None, assets=None):
    """One crop of one item as a uint8 array with its alpha (0 = no data), kept on disk."""
    key = hashlib.sha1(json.dumps([item, coll, bbox, size, expression, rescale, assets]).encode()).hexdigest()[:20]
    f = cache / f"{key}.png"
    if not f.exists():
        params = {"collection": coll, "item": item}
        if expression:
            params["expression"] = expression
            params["asset_as_band"] = "True"
        if assets:
            params["assets"] = assets
        if rescale:
            params["rescale"] = rescale
        bb = ",".join(f"{v:.6f}" for v in bbox)
        r = http_get(f"{DATA_API}/{bb}/{size[0]}x{size[1]}.png", params)
        if r.status_code != 200:
            return None
        f.write_bytes(r.content)
        time.sleep(0.5)
    a = np.array(Image.open(f))
    if a.ndim == 2:
        return a, np.full(a.shape, 255, np.uint8)
    return a[..., 0], a[..., -1]


def scene_db(grid: Grid, cache: Path, items: list[dict]):
    """VV backscatter (dB) of one pass over the grid; NaN where no frame of the pass covers a pixel."""
    out = np.full((grid.H, grid.W), np.nan, np.float32)
    for (x0, y0, x1, y1), bb in grid.tiles():
        for it in items:
            ib = it["bbox"]
            if ib[0] > bb[2] or ib[2] < bb[0] or ib[1] > bb[3] or ib[3] < bb[1]:
                continue
            t = read_tile(cache, it["id"], COLL, bb, (x1 - x0, y1 - y0), expression="10*log10(vv)", rescale=f"{DB_LO:g},{DB_HI:g}")
            if t is None:
                continue
            v, alpha = t
            if v.shape != (y1 - y0, x1 - x0):
                log(f"  tile shape {v.shape} != {(y1 - y0, x1 - x0)}; resized")
                v = np.array(Image.fromarray(v).resize((x1 - x0, y1 - y0), Image.NEAREST))
                alpha = np.array(Image.fromarray(alpha).resize((x1 - x0, y1 - y0), Image.NEAREST))
            db = (DB_LO + v.astype(np.float32) / 255.0 * (DB_HI - DB_LO))
            sub = out[y0:y1, x0:x1]
            take = (alpha > 0) & np.isnan(sub)
            sub[take] = db[take]
    return out


def speckle(db: np.ndarray, size=5) -> np.ndarray:
    """A 5 x 5 mean in linear power (no-data pixels left out), back in dB."""
    ok = ~np.isnan(db)
    lin = np.where(ok, 10 ** (np.nan_to_num(db) / 10), 0).astype(np.float32)
    s = ndimage.uniform_filter(lin, size)
    n = ndimage.uniform_filter(ok.astype(np.float32), size)
    with np.errstate(divide="ignore", invalid="ignore"):
        m = np.where(n > 0.4, s / n, np.nan)
        return (10 * np.log10(m)).astype(np.float32)


def otsu(v: np.ndarray) -> float:
    v = v[~np.isnan(v)]
    if v.size < 1000:
        return T_DEFAULT
    h, edges = np.histogram(v, bins=200, range=(-30, 5))
    c = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(h)
    w1 = w0[-1] - w0
    m0 = np.cumsum(h * c) / np.maximum(w0, 1)
    m1 = (np.sum(h * c) - np.cumsum(h * c)) / np.maximum(w1, 1)
    k = int(np.argmax(w0 * w1 * (m0 - m1) ** 2))
    return float(min(T_MAX, max(T_MIN, c[k])))


def ward_raster(grid: Grid, wards):
    im = Image.new("I", (grid.W, grid.H), 0)
    d = ImageDraw.Draw(im)
    for no, polys in wards:
        for rings in polys:
            pts = [((x - grid.w) / RES, (grid.n - y) / RES) for x, y in rings[0]]
            d.polygon(pts, fill=no)
            for hole in rings[1:]:
                d.polygon([((x - grid.w) / RES, (grid.n - y) / RES) for x, y in hole], fill=0)
    return np.array(im, dtype=np.int32)


# ------------------------------------------------------------------ the catalogue --

def stac_passes(grid: Grid, t0: str, t1: str):
    body = {"collections": [COLL], "bbox": [grid.w, grid.s, grid.e, grid.n], "datetime": f"{t0}/{t1}", "limit": 250}
    r = requests.post(STAC, json=body, headers=UA, timeout=120)
    r.raise_for_status()
    feats = r.json()["features"]
    by: dict[str, dict] = {}
    for f in feats:
        p = f["properties"]
        t = datetime.fromisoformat(p["datetime"].replace("Z", "+00:00"))
        k = f"{p.get('platform')}|{p.get('sat:absolute_orbit')}|{t:%Y%m%d}"
        a = by.setdefault(k, {"at": t, "platform": p.get("platform"), "orbit": p.get("sat:orbit_state"), "relorbit": p.get("sat:relative_orbit"), "items": []})
        a["at"] = min(a["at"], t)
        a["items"].append({"id": f["id"], "bbox": f["bbox"]})
    return sorted(by.values(), key=lambda a: a["at"])


def jrc_occurrence(grid: Grid, cache: Path):
    r = requests.post(STAC, json={"collections": ["jrc-gsw"], "bbox": [grid.w, grid.s, grid.e, grid.n], "limit": 5}, headers=UA, timeout=120)
    r.raise_for_status()
    feats = r.json()["features"]
    out = np.zeros((grid.H, grid.W), np.uint8)
    if not feats:
        return None, None
    for (x0, y0, x1, y1), bb in grid.tiles():
        for f in feats:
            t = read_tile(cache, f["id"], "jrc-gsw", bb, (x1 - x0, y1 - y0), assets="occurrence")
            if t is None:
                continue
            v, alpha = t
            if v.shape != (y1 - y0, x1 - x0):
                v = np.array(Image.fromarray(v).resize((x1 - x0, y1 - y0), Image.NEAREST))
                alpha = np.array(Image.fromarray(alpha).resize((x1 - x0, y1 - y0), Image.NEAREST))
            sub = out[y0:y1, x0:x1]
            ok = (alpha > 0) & (v <= 100)
            sub[ok] = np.maximum(sub[ok], v[ok])
    return out, feats[0]["id"]


# ------------------------------------------------------------------ optical looks --

def stac_all(body):
    out, url = [], STAC
    while True:
        r = requests.post(url, json=body, headers=UA, timeout=120)
        r.raise_for_status()
        j = r.json()
        out += j["features"]
        nxt = [l for l in j.get("links", []) if l.get("rel") == "next"]
        if not nxt:
            return out
        url, body = nxt[0]["href"], nxt[0].get("body", body)


def optical_scenes(grid: Grid, coll: str, t0: str, t1: str):
    """One scene per satellite and IST day: its items (tiles) and mean cloud cover."""
    feats = stac_all({"collections": [coll], "bbox": [grid.w, grid.s, grid.e, grid.n], "datetime": f"{t0}/{t1}", "limit": 250,
                      "query": {"eo:cloud_cover": {"lte": OPT_SCENE_CLOUD}}})
    by: dict[str, dict] = {}
    for f in feats:
        p = f["properties"]
        if coll == "landsat-c2-l2" and p.get("platform") not in ("landsat-8", "landsat-9"):
            continue
        t = datetime.fromisoformat(p["datetime"].replace("Z", "+00:00"))
        k = f"{p.get('platform')}|{t.astimezone(IST):%Y%m%d}"
        a = by.setdefault(k, {"at": t, "platform": p.get("platform"), "coll": coll, "items": [], "cloud": []})
        a["at"] = min(a["at"], t)
        a["items"].append({"id": f["id"], "bbox": f["bbox"]})
        a["cloud"].append(float(p.get("eo:cloud_cover") or 0))
    for a in by.values():
        a["cloudPct"] = round(sum(a["cloud"]) / len(a["cloud"]), 1)
    return sorted(by.values(), key=lambda a: a["at"])


def scene_optical(grid: Grid, cache: Path, sc: dict):
    """(MNDWI, NDWI) of one optical scene over the grid: NaN where no tile covers a pixel, or it is cloud, shadow or bright
    in blue light (haze, cloud edges), grown by CLOUD_GROW_PX."""
    o = OPT[sc["coll"]]
    mnd = np.full((grid.H, grid.W), np.nan, np.float32)
    ndw = np.full((grid.H, grid.W), np.nan, np.float32)
    seen = np.zeros((grid.H, grid.W), bool)
    bad = np.zeros((grid.H, grid.W), bool)
    for (x0, y0, x1, y1), bb in grid.tiles():
        size = (x1 - x0, y1 - y0)
        for it in sc["items"]:
            ib = it["bbox"]
            if ib[0] > bb[2] or ib[2] < bb[0] or ib[1] > bb[3] or ib[3] < bb[1]:
                continue
            t = read_tile(cache, it["id"], sc["coll"], bb, size, expression=o["mndwi"], rescale="-1,1")
            c = read_tile(cache, it["id"], sc["coll"], bb, size, expression=o["cloud"].get("expression"),
                          rescale=o["cloud"].get("rescale"), assets=o["cloud"].get("assets"))
            n2 = read_tile(cache, it["id"], sc["coll"], bb, size, expression=o["ndwi"], rescale="-1,1")
            bl = read_tile(cache, it["id"], sc["coll"], bb, size, expression=o["blue"], rescale=o["blue_rescale"])
            if t is None or c is None or n2 is None or bl is None:
                continue
            (v, alpha), (cv, calpha) = t, c
            nv, bv = n2[0], bl[0]
            if nv.shape != (y1 - y0, x1 - x0):
                nv = np.array(Image.fromarray(nv).resize(size, Image.NEAREST))
            if bv.shape != (y1 - y0, x1 - x0):
                bv = np.array(Image.fromarray(bv).resize(size, Image.NEAREST))
            if v.shape != (y1 - y0, x1 - x0):
                v = np.array(Image.fromarray(v).resize(size, Image.NEAREST)); alpha = np.array(Image.fromarray(alpha).resize(size, Image.NEAREST))
            if cv.shape != (y1 - y0, x1 - x0):
                cv = np.array(Image.fromarray(cv).resize(size, Image.NEAREST)); calpha = np.array(Image.fromarray(calpha).resize(size, Image.NEAREST))
            cloudy = (np.isin(cv, list(o["bad"])) if "bad" in o else (cv > 0)) | (bv > o["blue_max"])
            ok = (alpha > 0) & (calpha > 0) & ~seen[y0:y1, x0:x1]
            sub = mnd[y0:y1, x0:x1]
            sub[ok] = v[ok].astype(np.float32) / 255.0 * 2.0 - 1.0
            nsub = ndw[y0:y1, x0:x1]
            nsub[ok] = nv[ok].astype(np.float32) / 255.0 * 2.0 - 1.0
            bad[y0:y1, x0:x1] |= ok & cloudy
            seen[y0:y1, x0:x1] |= ok
    bad = ndimage.binary_dilation(bad, iterations=CLOUD_GROW_PX)
    mnd[bad] = np.nan
    ndw[bad] = np.nan
    return mnd, ndw


def classify_optical(now, ndwi, ref, occ):
    with np.errstate(invalid="ignore"):
        rise = now - ref
        water = (now > OPT_WATER) & (ndwi > 0) & (rise > OPT_RISE) & (ref < 0)
        if occ is not None:
            water &= occ < PERMANENT_PCT
    water &= ~np.isnan(now) & ~np.isnan(ref)
    lab, n = ndimage.label(water, structure=np.ones((3, 3)))
    conf = np.zeros(water.shape, np.uint8)
    if n:
        sizes = ndimage.sum(water, lab, index=np.arange(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= OPT_MIN_PATCH_PX
        water = keep[lab]
        lab = np.where(water, lab, 0)
        if water.any():
            ids = np.unique(lab[lab > 0])
            mN = ndimage.mean(np.nan_to_num(now), lab, ids)
            mR = ndimage.mean(np.nan_to_num(rise), lab, ids)
            hi = np.zeros(int(lab.max()) + 1, np.uint8)
            hi[ids] = np.where((np.array(mN) >= OPT_HIGH) & (np.array(mR) >= OPT_HIGH_RISE), 2, 1)
            conf = hi[lab] * water
    return water, conf


# ------------------------------------------------------------------ water on the roads --

def roads_under_water(g, grid: Grid, water: np.ndarray, conf: np.ndarray):
    """Road pieces inside the district with enough of their length under water ("on"), or else within ~45 m of it
    ("beside"): [(edge, metres, conf, on)]."""
    near = ndimage.binary_dilation(water, iterations=1)  # a road through a flooded patch is often one pixel off the patch
    beside = ndimage.binary_dilation(water, iterations=BESIDE_PX)
    conf_b = ndimage.grey_dilation(conf, size=2 * BESIDE_PX + 1)
    ss, sh = g["shapeStart"], g["shape"]
    ward, length = g["ward"], g["len"]
    # only pieces whose bounding box holds some "beside" pixel are looked at closely (a summed-area table)
    sat = np.zeros((grid.H + 1, grid.W + 1), np.int32)
    sat[1:, 1:] = beside.cumsum(0).cumsum(1)
    allr = np.clip(((grid.n - sh[0::2]) / RES).astype(np.int64), 0, grid.H - 1)
    allc = np.clip(((sh[1::2] - grid.w) / RES).astype(np.int64), 0, grid.W - 1)
    idx = ss[:-1].astype(np.int64)
    r0, r1 = np.minimum.reduceat(allr, idx), np.maximum.reduceat(allr, idx) + 1
    c0, c1 = np.minimum.reduceat(allc, idx), np.maximum.reduceat(allc, idx) + 1
    cnt = sat[r1, c1] - sat[r0, c1] - sat[r1, c0] + sat[r0, c0]
    out = []
    for e in np.nonzero((cnt > 0) & (ward > 0))[0]:
        e = int(e)
        a, b = int(ss[e]), int(ss[e + 1])
        pts = sh[2 * a:2 * b].reshape(-1, 2)
        if len(pts) < 2:
            continue
        r, c = (grid.n - pts[:, 0]) / RES, (pts[:, 1] - grid.w) / RES
        # samples every ~5 m along the piece
        seg = np.hypot(np.diff(r), np.diff(c))
        n = np.maximum(1, np.ceil(seg / 0.5).astype(int))
        rr = np.concatenate([np.linspace(r[i], r[i + 1], n[i], endpoint=False) for i in range(len(seg))])
        cc = np.concatenate([np.linspace(c[i], c[i + 1], n[i], endpoint=False) for i in range(len(seg))])
        ri, ci = rr.astype(int), cc.astype(int)
        ok = (ri >= 0) & (ri < grid.H) & (ci >= 0) & (ci < grid.W)
        if not ok.any():
            continue
        ri, ci = ri[ok], ci[ok]
        for mask, cmask, on in ((near, conf, True), (beside, conf_b, False)):
            hit = mask[ri, ci]
            share = float(hit.mean())
            m = share * float(length[e])
            if m >= ROAD_MIN_M or (share >= ROAD_MIN_SHARE and m >= 15):
                out.append((e, m, max(1, int(cmask[ri[hit], ci[hit]].max())), on))
                break
    return out


def streets_of(g, hits):
    """Flooded road pieces -> streets: named pieces in one ward are one street; touching unnamed pieces are one lane."""
    by_e = {e: (m, cf, on) for e, m, cf, on in hits}
    name, ward, frm, to = g["name"], g["ward"], g["from"], g["to"]
    groups: dict[str, list[int]] = {}
    lanes: list[list[int]] = []
    node_edges: dict[int, list[int]] = {}
    for e in by_e:
        if name[e] >= 0:
            groups.setdefault(f"n{int(name[e])}|w{int(ward[e])}", []).append(e)
        else:
            for u in (int(frm[e]), int(to[e])):
                node_edges.setdefault(u, []).append(e)
    seen = set()
    for e in by_e:
        if name[e] >= 0 or e in seen:
            continue
        stack, lane = [e], []
        seen.add(e)
        while stack:
            x = stack.pop()
            lane.append(x)
            for u in (int(frm[x]), int(to[x])):
                for y in node_edges.get(u, []):
                    if y not in seen:
                        seen.add(y)
                        stack.append(y)
        lanes.append(lane)
    for lane in lanes:
        groups[f"e{min(lane)}"] = lane
    # the named street a lane leads off: named pieces at its junctions (from the whole network)
    adj: dict[int, list[int]] = {}
    lane_nodes = {int(u) for k, es in groups.items() if k.startswith("e") for x in es for u in (frm[x], to[x])}
    for e in range(len(frm)):
        if name[e] >= 0 and (int(frm[e]) in lane_nodes or int(to[e]) in lane_nodes):
            for u in (int(frm[e]), int(to[e])):
                adj.setdefault(u, []).append(e)
    ss, sh = g["shapeStart"], g["shape"]
    out = []
    for key, es in groups.items():
        es = sorted(es)
        best = max(es, key=lambda x: by_e[x][0])
        a, b = int(ss[best]), int(ss[best + 1])
        mid = (a + b - 1) // 2
        near = None
        if name[es[0]] < 0:
            cnt: dict[int, float] = {}
            own = set(es)
            for x in es:
                for u in (int(frm[x]), int(to[x])):
                    for y in adj.get(u, []):
                        if y not in own:
                            cnt[int(name[y])] = cnt.get(int(name[y]), 0) + float(g["len"][y])
            if cnt:
                near = g["names"][max(cnt.items(), key=lambda kv: (kv[1], -kv[0]))[0]]
        lines = []
        for x in es:
            p, q = int(ss[x]), int(ss[x + 1])
            lines.append([[round(float(sh[2 * k]), 5), round(float(sh[2 * k + 1]), 5)] for k in range(p, q)])
        nm = int(name[es[0]])
        out.append({
            "key": key, "name": g["names"][nm] if nm >= 0 else None, "name_ta": g["names_ta"][nm] if nm >= 0 else None, "near": near,
            "ward": int(ward[best]), "edges": [int(x) for x in es], "how": "on" if any(by_e[x][2] for x in es) else "beside",
            "floodedM": round(sum(by_e[x][0] for x in es if by_e[x][2] or not any(by_e[y][2] for y in es))),
            "lengthM": round(float(sum(g["len"][x] for x in es))), "conf": "high" if max(by_e[x][1] for x in es) >= 2 else "medium",
            "lat": round(float(sh[2 * mid]), 5), "lon": round(float(sh[2 * mid + 1]), 5), "lines": lines,
        })
    return sorted(out, key=lambda s: (s["how"] != "on", -s["floodedM"], s["key"]))


def extent_rings(grid: Grid, water: np.ndarray, conf: np.ndarray, block=3):
    """The water as small rectangles for the map: 3 x 3 pixel blocks (~32 m) with 4 or more water pixels, joined along rows."""
    H, W = (grid.H // block) * block, (grid.W // block) * block
    w = water[:H, :W].reshape(H // block, block, W // block, block).sum(axis=(1, 3)) >= 4
    c = conf[:H, :W].reshape(H // block, block, W // block, block).max(axis=(1, 3))
    rings = []
    step = RES * block
    for y in range(w.shape[0]):
        row = w[y]
        if not row.any():
            continue
        x = 0
        while x < w.shape[1]:
            if not row[x]:
                x += 1
                continue
            x0 = x
            while x < w.shape[1] and row[x]:
                x += 1
            n, s = grid.n - y * step, grid.n - (y + 1) * step
            lw, le = grid.w + x0 * step, grid.w + x * step
            hi = int(c[y, x0:x].max()) >= 2
            rings.append({"c": "high" if hi else "medium", "r": [[round(n, 5), round(lw, 5)], [round(n, 5), round(le, 5)], [round(s, 5), round(le, 5)], [round(s, 5), round(lw, 5)]]})
    return rings


# ------------------------------------------------------------------ one rain --

def classify(ev_db, ref_db, occ):
    E, R = speckle(ev_db), ref_db  # ref is already a median of filtered scenes
    T = otsu(E)
    with np.errstate(invalid="ignore"):
        drop = E - R
        water = (E < T) & (drop <= -MIN_DROP_DB) & (R >= T + 1.0)
        if occ is not None:
            water &= occ < PERMANENT_PCT
    water &= ~np.isnan(E) & ~np.isnan(R)
    lab, n = ndimage.label(water, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(water, lab, index=np.arange(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= MIN_PATCH_PX
        water = keep[lab]
        lab = np.where(water, lab, 0)
    # confidence per patch: high when the patch is clearly dark (2 dB under the threshold) and clearly darker than before (6 dB)
    conf = np.zeros(water.shape, np.uint8)
    if water.any():
        ids = np.unique(lab[lab > 0])
        mE = ndimage.mean(E, lab, ids)
        mD = ndimage.mean(drop, lab, ids)
        hi = np.zeros(int(lab.max()) + 1, np.uint8)
        hi[ids] = np.where((np.array(mE) <= T - 2) & (np.array(mD) <= -6), 2, 1)
        conf = hi[lab] * water
    return water, conf, T


def ist(t: datetime) -> str:
    return t.astimezone(IST).strftime("%Y-%m-%d %H:%M")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--rain", action="append", help="only this rain (its first day); repeatable")
    ap.add_argument("--max-days", type=float, default=MAX_DAYS, help="a look counts up to this many days after the rain's last day")
    ap.add_argument("--out", default=str(ROOT / "data/aws-cache/sat-flood.json"))
    ap.add_argument("--cache", default=str(Path(tempfile.gettempdir()) / "diq-sat-cache"))
    ap.add_argument("--preview", help="folder for a PNG picture of each rain's water (checking only)")
    a = ap.parse_args(argv)
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    t_start = time.time()

    wards = ward_polygons()
    xs = [x for _, ps in wards for p in ps for x, _ in p[0]]
    ys = [y for _, ps in wards for p in ps for _, y in p[0]]
    grid = Grid(min(xs) - 0.002, min(ys) - 0.002, max(xs) + 0.002, max(ys) + 0.002)
    log(f"grid {grid.W} x {grid.H} px at {RES} deg, bbox {grid.w:.4f},{grid.s:.4f},{grid.e:.4f},{grid.n:.4f}")
    events = rain_events()
    if a.rain:
        events = [e for e in events if e["start"] in a.rain]
    old = {}
    try:
        prev = json.loads(Path(a.out).read_text(encoding="utf-8"))
        old = {r["id"]: r for r in prev.get("rains", [])}
    except (OSError, ValueError):
        pass

    t0 = (date.fromisoformat(min(e["start"] for e in rain_events())) - timedelta(days=60)).isoformat() + "T00:00:00Z"
    t1 = (date.today() + timedelta(days=1)).isoformat() + "T00:00:00Z"
    passes = stac_passes(grid, t0, t1)
    log(f"{len(passes)} Sentinel-1 passes over the district from {t0[:10]}: " + ", ".join(ist(p["at"])[:10] for p in passes))
    all_events = rain_events()

    def rained_before(t: datetime, days=3):
        d1 = t.astimezone(IST).date()
        d0 = d1 - timedelta(days=days)
        return any(date.fromisoformat(e["start"]) <= d1 and date.fromisoformat(e["end"]) >= d0 for e in all_events)

    occ = jrc_id = None
    g = None
    ward_r = None
    out_rains = []
    ref_cache: dict[str, np.ndarray] = {}
    opt = {c: optical_scenes(grid, c, t0, t1) for c in OPT}
    for c, xs in opt.items():
        log(f"{len(xs)} {OPT[c]['name']} scenes under {OPT_SCENE_CLOUD} % cloud: " + ", ".join(f"{ist(x['at'])[:10]} ({x['cloudPct']:.0f} %)" for x in xs))
    px_km2 = (RES * 110.574) * (RES * 111.32 * math.cos(math.radians(13.05)))

    def prepare():
        nonlocal occ, jrc_id, g, ward_r
        if occ is None:
            occ, jrc_id = jrc_occurrence(grid, cache)
            log(f"  permanent water mask: JRC Global Surface Water {jrc_id}")
        if g is None:
            g = load_graph()
            ward_r = ward_raster(grid, wards)

    def optical_ref(coll: str, ev_start: datetime):
        """median MNDWI of up to three dry, fairly clear scenes nearest before the rain (after it when there are too few)"""
        dry = [x for x in opt[coll] if x["cloudPct"] <= 40 and not rained_before(x["at"])]
        before = [x for x in dry if x["at"] < ev_start][-3:]
        pick = before if len(before) >= 2 else (before + [x for x in dry if x["at"] > ev_start + timedelta(days=10)][: 3 - len(before)])
        if not pick:
            return None, []
        key = coll + "|" + "|".join(i["id"] for x in pick for i in x["items"])
        if key not in ref_cache:
            st = np.stack([scene_optical(grid, cache, x)[0] for x in pick])
            with np.errstate(all="ignore"):
                ref_cache.clear()
                ref_cache[key] = np.nanmedian(st, axis=0).astype(np.float32)
        return ref_cache[key], pick

    for ev in events:
        s0 = datetime.fromisoformat(ev["start"] + "T00:00:00+05:30")
        s_end = datetime.fromisoformat(ev["end"] + "T23:59:59+05:30")
        s1 = s_end + timedelta(days=a.max_days)
        after = [p for p in passes if s0 <= p["at"] <= s1]
        before = [p for p in passes if p["at"] < s0]
        later = [p for p in passes if p["at"] > s1]
        opt_after = sorted([x for c in OPT for x in opt[c] if s0 <= x["at"] <= s1], key=lambda x: (x["cloudPct"], x["at"]))[:3]
        opt_after.sort(key=lambda x: x["at"])
        rec = {"id": ev["id"], "start": ev["start"], "end": ev["end"],
               "nearest": {"before": ist(before[-1]["at"]) if before else None, "after": ist(later[0]["at"]) if later else None}}
        gr = gauge_rain(ev["start"], ev["end"])
        rec["gaugeRain"] = gr
        if not after and not opt_after:
            rec["status"] = "no-pass"
            rec["note"] = f"No satellite picture of Chennai from the rain's first day to {a.max_days:g} days after its last (radar or a clear-enough optical scene)."
            log(f"{ev['id']}: no look (radar before {rec['nearest']['before']}, after {rec['nearest']['after']})")
            out_rains.append(rec)
            continue
        # "little rain" is only believed when enough gauges reported (20 of about 75): in September only 5-6 reported, which says nothing
        if gr and gr["gauges"] >= 20 and gr["maxMm"] < 30:
            first = min([p["at"] for p in after] + [x["at"] for x in opt_after])
            rec["status"] = "light-rain"
            rec["note"] = f"The CFM-DSS gauges measured little rain ({gr['maxMm']:g} mm at the wettest of {gr['gauges']}), so the satellite pictures from {ist(first)[:10]} were not compared."
            log(f"{ev['id']}: light rain at the gauges ({gr}), not compared")
            out_rains.append(rec)
            continue
        prepare()
        inside = ward_r > 0
        n_in = max(1, int(inside.sum()))
        union = np.zeros(inside.shape, bool)
        uconf = np.zeros(inside.shape, np.uint8)
        looks, masks = [], []
        T = None
        if after:
            p = after[0]
            refs = [q for q in before if not rained_before(q["at"])][-3:]
            if refs:
                log(f"{ev['id']}: radar {ist(p['at'])} ({p['platform']}), dry picture from {', '.join(ist(q['at'])[:10] for q in refs)}")
                ev_db = scene_db(grid, cache, p["items"])
                ref_stack = np.stack([speckle(scene_db(grid, cache, q["items"])) for q in refs])
                with np.errstate(all="ignore"):
                    ref_db = np.nanmedian(ref_stack, axis=0).astype(np.float32)
                del ref_stack
                water, conf, T = classify(ev_db, ref_db, occ)
                w_in = water & inside
                looks.append({"kind": "radar", "satellite": f"Sentinel-1{(p['platform'] or '')[-1:].upper()}", "at": ist(p["at"]),
                              "orbit": p["orbit"], "relativeOrbit": p["relorbit"], "scenes": [i["id"] for i in p["items"]],
                              "reference": {"dates": [ist(q["at"]) for q in refs], "scenes": [i["id"] for q in refs for i in q["items"]]},
                              "hoursAfterStart": round((p["at"] - s0).total_seconds() / 3600, 1),
                              "daysAfterEnd": round((p["at"] - s_end).total_seconds() / 86400, 1),
                              "thresholdDb": round(T, 2), "clearShare": round(float(((~np.isnan(ev_db)) & inside).sum() / n_in), 3),
                              "waterKm2": round(float(w_in.sum() * px_km2), 3), "highKm2": round(float(((conf >= 2) & w_in).sum() * px_km2), 3)})
                masks.append((w_in, conf))
                del ev_db, ref_db
        for x in opt_after:
            ref, pick = optical_ref(x["coll"], s0)
            if ref is None:
                continue
            now, ndwi = scene_optical(grid, cache, x)
            clear = (~np.isnan(now)) & inside
            share = float(clear.sum() / n_in)
            name = OPT[x["coll"]]["name"]
            if share < OPT_MIN_CLEAR:
                log(f"{ev['id']}: {name} {ist(x['at'])[:10]} only {share:.0%} of the wards clear of cloud; not used")
                continue
            water, conf = classify_optical(now, ndwi, ref, occ)
            w_in = water & inside
            log(f"{ev['id']}: {name} {ist(x['at'])} ({x['cloudPct']:.0f} % cloud, {share:.0%} of the wards clear), dry picture from "
                f"{', '.join(ist(q['at'])[:10] for q in pick)}: {w_in.sum() * px_km2:.3f} km2 of new water")
            looks.append({"kind": "optical", "satellite": f"{name} {(x['platform'] or '').replace('landsat-', '').upper().replace('SENTINEL-', '')}".strip(),
                          "at": ist(x["at"]), "scenes": [i["id"] for i in x["items"]], "cloudPct": x["cloudPct"],
                          "reference": {"dates": [ist(q["at"]) for q in pick], "scenes": [i["id"] for q in pick for i in q["items"]]},
                          "hoursAfterStart": round((x["at"] - s0).total_seconds() / 3600, 1),
                          "daysAfterEnd": round((x["at"] - s_end).total_seconds() / 86400, 1), "clearShare": round(share, 3),
                          "waterKm2": round(float(w_in.sum() * px_km2), 3), "highKm2": round(float(((conf >= 2) & w_in).sum() * px_km2), 3)})
            masks.append((w_in, conf))
            del now, ndwi
        if not looks:
            if not after:
                # no radar, and every optical picture was too cloudy over the city to read
                rec["status"] = "no-pass"
                rec["note"] = (f"No radar pass within {a.max_days:g} days of this rain, and the optical pictures of "
                               f"{', '.join(ist(x['at'])[:10] for x in opt_after)} were under cloud over the city.")
            else:
                rec["status"] = "no-reference"
                rec["note"] = "The radar picture after this rain had no dry picture before it to compare with."
            out_rains.append(rec)
            continue
        for w_in, conf in masks:
            union |= w_in
            uconf = np.maximum(uconf, conf * w_in)
        # which looks saw each road piece "on" the water
        seen_by: dict[int, list[int]] = {}
        for k, (w_in, conf) in enumerate(masks):
            for e, _m, _c, on in roads_under_water(g, grid, w_in, conf):
                if on:
                    seen_by.setdefault(e, []).append(k)
            looks[k]["roadKm"] = round(sum(m for _, m, _, on in roads_under_water(g, grid, w_in, conf) if on) / 1000, 2)
        hits = roads_under_water(g, grid, union, uconf)
        streets = streets_of(g, hits)
        for st in streets:
            st["seenBy"] = sorted({k for e in st["edges"] for k in seen_by.get(e, [])})
        per_ward = np.bincount(ward_r[union].ravel(), minlength=201)
        rings = extent_rings(grid, union, uconf)
        first = looks[0]
        radar = next((l for l in looks if l["kind"] == "radar"), None)
        rec.update({
            "status": "pass",
            # the first look, as before v2 (readers that know one pass read this one)
            "pass": {"at": first["at"], "satellite": first["satellite"], "orbit": first.get("orbit"), "relativeOrbit": first.get("relativeOrbit"),
                     "scenes": first["scenes"], "hoursAfterStart": first["hoursAfterStart"], "daysAfterEnd": first["daysAfterEnd"]},
            "reference": first["reference"],
            "looks": looks,
            "thresholdDb": radar["thresholdDb"] if radar else None,
            "coveredShare": round(max(l["clearShare"] for l in looks), 3),
            "waterKm2": round(float(union.sum() * px_km2), 3),
            "highKm2": round(float(((uconf >= 2) & union).sum() * px_km2), 3),
            "roadKm": round(sum(m for _, m, _, on in hits if on) / 1000, 2),
            "besideKm": round(sum(m for _, m, _, on in hits if not on) / 1000, 2),
            "wards": [{"ward": int(w), "km2": round(float(n * px_km2), 4)} for w, n in enumerate(per_ward) if w > 0 and n > 0],
            "streets": streets, "extent": rings,
        })
        log(f"  {len(looks)} look(s): water {rec['waterKm2']} km2 ({rec['highKm2']} high confidence), {len(streets)} streets "
            f"({sum(1 for x in streets if x['how'] == 'on')} under water), {rec['roadKm']} km of road under water, {rec['besideKm']} km beside it")
        if a.preview:
            Path(a.preview).mkdir(parents=True, exist_ok=True)
            pv = np.full((grid.H, grid.W, 3), 40, np.uint8)
            pv[inside] = [90, 90, 90]
            pv[union] = [0, 200, 255]
            pv[inside & ~ndimage.binary_erosion(inside)] = [255, 200, 0]
            Image.fromarray(pv).resize((grid.W // 3, grid.H // 3)).save(Path(a.preview) / f"{ev['id']}.png")
        out_rains.append(rec)

    # rains not asked for this time keep their earlier result
    ids = {r["id"] for r in out_rains}
    out_rains += [r for k, r in old.items() if k not in ids]
    out_rains.sort(key=lambda r: r["start"])
    res = {
        "version": 1,
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version2": True,
        "source": {"name": "Copernicus Sentinel-1 radar (GRD, terrain corrected), Copernicus Sentinel-2 L2A and USGS Landsat 8/9 Collection 2 Level-2, via the Microsoft Planetary Computer",
                   "catalogue": "https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc ; https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a ; https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2",
                   "licence": "Contains modified Copernicus Sentinel data (free and open; RTC processing by Catalyst/PCI on the Planetary Computer); Landsat data courtesy of the U.S. Geological Survey",
                   "permanentWater": "JRC Global Surface Water occurrence (EC JRC / Google), via the Planetary Computer" + (f" ({jrc_id})" if jrc_id else ""),
                   "roads": "OpenStreetMap (data/roads/graph.bin)"},
        "graphHash": g["hash"] if g is not None else (old and next(iter(old.values()), {}).get("graphHash")),
        "method": {"pixelDeg": RES, "thresholdDb": [T_MIN, T_MAX], "minDropDb": MIN_DROP_DB, "minPatchPx": MIN_PATCH_PX, "permanentWaterPct": PERMANENT_PCT,
                   "roadMinM": ROAD_MIN_M, "roadMinShare": ROAD_MIN_SHARE, "maxDaysAfter": a.max_days,
                   "optical": {"waterIndex": "MNDWI (green - SWIR) / (green + SWIR)", "now": OPT_WATER, "rise": OPT_RISE, "minPatchPx": OPT_MIN_PATCH_PX,
                               "minClearShare": OPT_MIN_CLEAR, "cloudGrowPx": CLOUD_GROW_PX},
                   "text": "Radar: open water is radar-dark: VV backscatter under the scene's own threshold, at least 3 dB darker than the median of three dry passes, "
                           "not dark in them and not permanent water; patches under 10 pixels are dropped. Optical (Sentinel-2, Landsat): where the sky is clear of "
                           "cloud and shadow, the water index (MNDWI) is above 0 and at least 0.3 higher than in the dry scenes, not permanent water; patches under 20 "
                           "pixels are dropped. The looks of one rain are combined. A road piece is under water with 30 m (or half its length) in the water, and "
                           "beside it with as much within about 45 m of it."},
        "caveats": ["Radar does not see water in dense built-up streets (walls bounce it back), under trees or flyovers, or water that drained before the pass.",
                    "Optical pictures see nothing under cloud, and monsoon rain days are mostly cloudy; their water index can also mistake wet dark ground for water, which the dry-scene comparison reduces but does not remove.",
                    "Sentinel-1 passes over Chennai about once every 12 days at 06:01 IST; a look up to 5 days after a rain shows water that stood that long, not the peak.",
                    "No satellite water on a street is not evidence that it stayed dry; complaints stay the main record."],
        "rains": out_rains,
    }
    if res["graphHash"] is None:
        res["graphHash"] = load_graph()["hash"]
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(a.out + ".tmp")
    tmp.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, a.out)
    log(f"wrote {a.out} ({os.path.getsize(a.out) // 1024} KB) in {time.time() - t_start:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
