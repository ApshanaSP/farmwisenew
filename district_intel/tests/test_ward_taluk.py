"""The official ward -> taluk table (reference/ward_taluk.csv) and how the pipeline uses it. Run: python -m pytest -q"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel import analytics, geolocate  # noqa: E402
from dintel.geo import WardIndex  # noqa: E402
from dintel.refdata import Reference  # noqa: E402
from dintel.util import REF_DIR, load_settings  # noqa: E402

METHODS = {"official_village_overlay", "official_village_overlay_low_cover", "nearest_official_village"}


@pytest.fixture(scope="module")
def settings():
    return load_settings()


@pytest.fixture(scope="module")
def ref(settings):
    return Reference(settings)


@pytest.fixture(scope="module")
def wards(settings):
    return WardIndex(settings.src("wards_geojson"))


@pytest.fixture(scope="module")
def table():
    return pd.read_csv(REF_DIR / "ward_taluk.csv", encoding="utf-8")


def test_every_ward_has_one_official_row(table, wards):
    assert table["ward_no"].is_unique
    assert set(table["ward_no"]) == {w.ward_no for w in wards.wards}
    zone = {w.ward_no: w.zone_no for w in wards.wards}
    assert (table["zone_no"] == table["ward_no"].map(zone)).all()


def test_rows_carry_provenance(table):
    for col in ("ward_no", "zone_no", "taluk_code", "share", "method", "source_url", "checked_on"):
        assert col in table.columns and table[col].notna().all(), col
    assert set(table["method"]) <= METHODS
    assert table["source_url"].str.contains("tngis.tn.gov.in").all() and table["source_url"].str.contains("chennai.nic.in").all()
    assert table["checked_on"].map(lambda d: bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(d)))).all()
    assert table["share"].between(0, 1).all()
    # nothing here comes from the generated police or PWD datasets
    assert not table["method"].str.contains("police|pwd|vote", case=False).any()


def test_taluks_are_the_17_official_ones(table, ref):
    official = set(ref.taluks.loc[ref.taluks["in_district"] == 1, "taluk_code"])
    assert len(official) == 17
    assert set(table["taluk_code"]) <= official
    # every taluk holds at least one ward, Kolathur (formed 2024) included
    assert set(table["taluk_code"]) == official


def test_overlay_is_mostly_clean(table):
    clean = table["method"] == "official_village_overlay"
    assert clean.mean() >= 0.95
    # flagged wards are the ones with little area in Chennai revenue villages
    assert (table.loc[~clean, "chennai_village_cover"] < 0.5).all()
    assert table.loc[clean, "share"].median() >= 0.9


def test_kolathur_villages_move_out_of_ayanavaram():
    v = pd.read_csv(REF_DIR / "ward_taluk_villages.csv", encoding="utf-8")
    klt = v[v["taluk_code"] == "TLK-KLT"]
    assert set(klt["lgd_village_code"]) == {945671, 945674, 945675}
    assert (klt["tngis_taluk"] == "Ayanavaram").all()
    chennai = v[v["tngis_district"] == "Chennai"]
    assert chennai["taluk_code"].notna().all()


def test_meta_lists_sources_and_label_points(ref):
    m = json.loads((REF_DIR / "ward_taluk.meta.json").read_text(encoding="utf-8"))
    urls = " ".join(s["url"] for s in m["sources"])
    assert "tngis.tn.gov.in" in urls and "chennai.nic.in" in urls
    assert len(m["taluks"]) == 17
    t = ref.taluks.set_index("taluk_code")
    for code, x in m["taluks"].items():
        assert (t.at[code, "lat"], t.at[code, "lon"]) == (x["label_lat"], x["label_lon"])
        assert 12.8 < x["label_lat"] < 13.3 and 80.1 < x["label_lon"] < 80.35


def test_reference_loads_the_table(ref, table):
    assert len(ref.ward_taluk) == len(table)
    assert (ref.ward_taluk.set_index("ward_no")["taluk_code"] == table.set_index("ward_no")["taluk_code"]).all()


def test_official_map_and_missing_wards(ref, wards):
    wt = geolocate.official_ward_taluk(ref.ward_taluk, wards)
    assert len(wt) == len(wards.wards)
    code, share = wt[wards.wards[0].ward_no]
    assert code.startswith("TLK-") and 0 < share <= 1
    # a ward the table lacks gets no taluk: never the generated vote
    partial = geolocate.official_ward_taluk(ref.ward_taluk[ref.ward_taluk["ward_no"] != 1], wards)
    assert 1 not in partial and len(partial) == len(wards.wards) - 1


def test_events_with_a_ward_take_the_official_taluk(ref, wards):
    wt = geolocate.official_ward_taluk(ref.ward_taluk, wards)
    sample = wards.wards[::10]
    n = len(sample)
    ev = pd.DataFrame({
        "source": ["police"] * n, "lat": [w.centroid[0] for w in sample], "lon": [w.centroid[1] for w in sample],
        "geo_level": ["point"] * n, "ward_no": [np.nan] * n, "geo_method": ["source_point"] * n, "geo_conf": [1.0] * n,
        "taluk_code": ["TLK-XXX"] * n,     # the source's own (generated) label is overridden by the ward's official taluk
    })
    out = geolocate.resolve(ev, wards, wt, 150.0, {})
    got = out.set_index("ward_no")["taluk_code"]
    for w in got.index.dropna():
        assert got[w] == wt[int(w)][0]


def test_agreement_report():
    off = {1: ("TLK-TVT", 1.0), 2: ("TLK-TVT", 0.9), 3: ("TLK-MDV", 0.8)}
    vote = {1: ("TLK-TVT", 1.0), 2: ("TLK-TDP", 0.6), 3: ("TLK-MDV", 0.7), 4: ("TLK-PRB", 1.0)}
    a = geolocate.taluk_agreement(off, vote)
    assert a["wards_compared"] == 3 and a["vote_agrees"] == 2 and a["agreement"] == round(2 / 3, 3)
    assert a["vote_differs"] == [{"ward": 2, "official": "TLK-TVT", "vote": "TLK-TDP"}]


def test_ward_stats_carry_share_and_method(ref, wards):
    wt = geolocate.official_ward_taluk(ref.ward_taluk, wards)
    t0 = pd.Timestamp("2026-11-28 12:00", tz="Asia/Kolkata")
    ev = pd.DataFrame({"category_family": pd.Series(dtype=str), "ward_no": pd.Series(dtype=float)})
    inc = pd.DataFrame({"first_reported_at": pd.Series(dtype="datetime64[ns, Asia/Kolkata]"), "ward_no": pd.Series(dtype=float),
                        "is_open": pd.Series(dtype=int), "sla_breached": pd.Series(dtype=int)})
    ws = analytics.ward_stats(wards, ev, inc, wt, wards.adjacency(), t0, ref.ward_taluk).set_index("ward_no")
    tab = ref.ward_taluk.set_index("ward_no")
    assert (ws["taluk_code"] == tab["taluk_code"]).all()
    assert (ws["taluk_share"] == tab["share"]).all()
    assert (ws["taluk_method"] == tab["method"]).all()
    assert "taluk_vote_share" not in ws.columns


def test_every_taluk_label_point_lies_in_a_ward_of_its_own_taluk(table, wards):
    meta = json.loads((REF_DIR / "ward_taluk.meta.json").read_text(encoding="utf-8"))
    main = dict(zip(table["ward_no"], table["taluk_code"]))
    for code, t in meta["taluks"].items():
        w = int(wards.locate(np.array([t["label_lat"]]), np.array([t["label_lon"]]))[0])
        assert w > 0 and main[w] == code, (code, w, main.get(w))


def test_the_collectorate_village_list_was_really_checked(table):
    meta = json.loads((REF_DIR / "ward_taluk.meta.json").read_text(encoding="utf-8"))
    c = meta["collectorate_check"]
    assert c["collectorate_villages"] == 144 and c["same_taluk"] >= 130
    # every row says where its ward shapes come from, and the two honesty flags exist
    assert table["ward_geometry"].str.contains("not GCC-official").all()
    assert {"official_number_differs", "near_tie"} <= set(table.columns)
    vill = pd.read_csv(REF_DIR / "ward_taluk_villages.csv", encoding="utf-8")
    chn = vill[vill["tngis_district"] == "Chennai"]
    assert not chn["rule"].str.contains("same as the Chennai Collectorate list").any()
