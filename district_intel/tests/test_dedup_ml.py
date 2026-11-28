"""The learned within-source dedup (dintel/dedupml.py, called by dintel/dedup.run): clustering that does not chain,
sign-constrained scorer, determinism, explanations, and the fallbacks (saved model, then the old rule).
Synthetic frames only: nothing here reads the store or the live data."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel import dedup, dedupml  # noqa: E402
from dintel.dedup import bcubed  # noqa: E402
from dintel.util import Settings  # noqa: E402

T0 = pd.Timestamp("2026-10-01 08:00", tz="Asia/Kolkata")
LAT0, LON0 = 13.05, 80.22
M_LAT, M_LON = 1 / 110_540, 1 / 108_400   # degrees per metre near Chennai


# ------------------------------------------------------------------------------------------------ clustering --

def _labels(lab):
    """Partition as a set of frozensets (label names do not matter)."""
    out = {}
    for i, l in enumerate(lab):
        out.setdefault(int(l), set()).add(i)
    return {frozenset(v) for v in out.values()}


def test_average_linkage_does_not_chain():
    # A-B and B-C look alike, A and C were never compared (far apart): union-find would make one group of three
    lab = dedupml.cluster(3, np.array([0, 1]), np.array([1, 2]), np.array([0.9, 0.9]), 0.5)
    assert _labels(lab) == {frozenset({0, 1}), frozenset({2})}
    # with A-C also alike, the three are one group
    lab = dedupml.cluster(3, np.array([0, 1, 0]), np.array([1, 2, 2]), np.array([0.9, 0.9, 0.8]), 0.5)
    assert _labels(lab) == {frozenset({0, 1, 2})}


def test_must_link_and_cannot_link():
    # an officer's "Duplicate of" decision joins two reports with no edge at all
    lab = dedupml.cluster(4, np.array([2]), np.array([3]), np.array([0.9]), 0.5, must=[(0, 1)])
    assert _labels(lab) == {frozenset({0, 1}), frozenset({2, 3})}
    # two police reports from the same channel never share a group, however alike
    lab = dedupml.cluster(3, np.array([0, 0]), np.array([1, 2]), np.array([0.95, 0.9]), 0.5,
                          tag=np.array(["112", "112", "fir"], dtype=object))
    assert _labels(lab) == {frozenset({0, 2}), frozenset({1})}


def test_cluster_is_order_independent_and_names_by_smallest():
    rng = np.random.default_rng(3)
    n = 60
    a = rng.integers(0, n, 150)
    b = rng.integers(0, n, 150)
    keep = a != b
    a, b = np.minimum(a, b)[keep], np.maximum(a, b)[keep]
    key = np.unique(a * n + b)
    a, b = key // n, key % n
    w = rng.random(len(a)).round(3)
    base = dedupml.cluster(n, a, b, w, 0.4)
    perm = rng.permutation(len(a))
    assert (dedupml.cluster(n, b[perm], a[perm], w[perm], 0.4) == base).all()
    for i, l in enumerate(base):
        assert l <= i and base[l] == l


def test_vectorised_bcubed_matches_reference():
    rng = np.random.default_rng(0)
    lab = rng.integers(0, 30, 200)
    tcode = rng.integers(0, 40, 200)
    tcode[:20] = -1  # unlabelled rows are left out
    mask = np.ones(200, dtype=bool)
    ref = bcubed({i: int(lab[i]) for i in range(20, 200)}, {i: int(tcode[i]) for i in range(20, 200)})
    assert abs(dedupml._b3_f1(lab, tcode, mask) - ref["f1"]) < 1e-4


# ---------------------------------------------------------------------------------------------------- scorer --

def test_fit_respects_signs_and_is_deterministic():
    rng = np.random.default_rng(1)
    n = 400
    y = rng.integers(0, 2, n)
    dist = rng.random(n) * 3 - 1.5 * y            # matches are nearer: a negative weight is learnt
    dt = rng.random(n) + 0.8 * y                  # matches are LATER here (the generator artefact): weight held at 0
    street = (rng.random(n) < 0.2 + 0.6 * y).astype(float)
    X = np.column_stack([dist, dt, street])
    feats = ["dist_100m", "dt_day", "same_street"]
    m1 = dedupml.fit(X, y, feats)
    m2 = dedupml.fit(X, y, feats)
    assert m1 == m2
    coef = dict(zip(feats, m1["coef"]))
    assert coef["dist_100m"] < 0 and coef["same_street"] > 0
    assert coef["dt_day"] == pytest.approx(0.0, abs=1e-9)
    p = dedupml.predict(m1, X)
    assert ((p > 0) & (p < 1)).all()
    assert p[y == 1].mean() > p[y == 0].mean()
    json.dumps(m1)  # JSON-safe, nothing but numbers and names


def test_explain_names_the_evidence():
    feats = dedupml.FEATURES["grievance"]
    model = {"features": feats, "mean": [1.5, 1.0, 0.5, 0.5, 0.5, 0.2, 0.3], "scale": [1.0] * 7,
             "coef": [-1.7, 0.0, 2.9, 0.6, 0.0, 1.0, 0.7], "intercept": 0.0}
    row = {"dist_m": 40.0, "dt_h": 0.4, "dist_100m": 0.4, "dt_day": 0.4 / 24, "same_street": 1, "same_locality": 0,
           "same_area": 1, "same_landmark": 0, "text_sim": 0.82}
    X = np.array([[row[f] for f in feats]])
    why = dedupml.explain(model, row, dedupml.contributions(model, X)[0])
    # strongest evidence first; the time gap is always named; a 0 flag ("same locality") tells nothing
    assert why == "40 m apart, same street, wording 0.82 similar, 24 min apart"


# --------------------------------------------------------------------------------------------- synthetic data --

def _grievances(seed: int = 7) -> tuple[pd.DataFrame, dict]:
    """Originals, re-reports of some of them (close, same street, reworded) and hotspot bursts (one kind of problem in
    one ward over two days, separate complaints). Returns the events and the truth (event_id -> group)."""
    rng = np.random.default_rng(seed)
    rows, truth = [], {}
    subs = ["Garbage not cleared", "Street light not working", "Water stagnation"]
    words = {"Garbage not cleared": "garbage heap not cleared for days near the bin",
             "Street light not working": "street light not working the road is dark at night",
             "Water stagnation": "rain water stagnating on the road mosquitoes breeding"}

    def add(eid, sub, lat, lon, t, street, text, ward=10):
        rows.append({"event_id": eid, "source": "grievance", "category_src": "Civic", "subcategory_src": sub, "dept_src": "GCC",
                     "geo_method": "pin", "lat": lat, "lon": lon, "reported_at": t, "occurred_at": t, "ward_no": ward,
                     "_street": street, "_locality": "ANNA NAGAR", "_area": "", "_landmark": "", "text": text, "title": sub,
                     "is_overlay": 0, "_officer_dup_of": None, "channel": "citizen_app", "dup_group_id": eid})

    k = 0
    for i in range(160):
        sub = subs[i % 3]
        lat, lon = LAT0 + rng.uniform(-0.05, 0.05), LON0 + rng.uniform(-0.05, 0.05)
        t = T0 + pd.Timedelta(hours=float(rng.uniform(0, 24 * 40)))
        eid = f"GRV-O{i:04d}"
        street = f"STREET {i}"
        add(eid, sub, lat, lon, t, street, f"{words[sub]} at {street.lower()}")
        truth[eid] = eid
        if rng.random() < 0.35:
            for j in range(int(rng.integers(1, 3))):
                d = rng.uniform(5, 120)
                th = rng.uniform(0, 2 * np.pi)
                rid = f"GRV-R{k:04d}"
                k += 1
                add(rid, sub, lat + d * np.sin(th) * M_LAT, lon + d * np.cos(th) * M_LON, t + pd.Timedelta(hours=float(rng.uniform(0.3, 70))),
                    street, f"please help {words[sub]} {street.lower()} again")
                truth[rid] = eid
    for bnum in range(6):
        sub = subs[bnum % 3]
        lat, lon = LAT0 + rng.uniform(-0.04, 0.04), LON0 + rng.uniform(-0.04, 0.04)
        t = T0 + pd.Timedelta(days=5 * bnum + 1)
        for j in range(8):
            d = rng.uniform(0, 250)
            th = rng.uniform(0, 2 * np.pi)
            eid = f"GRV-H{bnum}{j}"
            street = "BURST STREET" if j % 2 == 0 else f"LANE {bnum}{j}"
            add(eid, sub, lat + d * np.sin(th) * M_LAT, lon + d * np.cos(th) * M_LON, t + pd.Timedelta(hours=float(rng.uniform(0, 48))),
                street, f"{words[sub]} in our lane {j}")
            truth[eid] = eid
    return pd.DataFrame(rows), truth


def _police(seed: int = 5) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(seed)
    rows, truth = [], {}
    channels = ["control_room_112", "patrol", "fir_walk_in", "media"]
    k = 0
    for i in range(150):
        lat, lon = LAT0 + rng.uniform(-0.05, 0.05), LON0 + rng.uniform(-0.05, 0.05)
        t = T0 + pd.Timedelta(hours=float(rng.uniform(0, 24 * 40)))
        cat = ["THEFT", "ROAD_ACCIDENT"][i % 2]
        inj = int(rng.integers(0, 3))
        n = int(rng.choice([1, 2, 3], p=[0.6, 0.3, 0.1]))
        chans = rng.permutation(channels)[:n]
        tag = f"EVT{i}"
        for j, ch in enumerate(chans):
            d = 0 if j == 0 else rng.uniform(50, 350)
            th = rng.uniform(0, 2 * np.pi)
            eid = f"POL-{k:05d}"
            k += 1
            rows.append({"event_id": eid, "source": "police", "category_src": cat, "lat": lat + d * np.sin(th) * M_LAT,
                         "lon": lon + d * np.cos(th) * M_LON, "occurred_at": t + pd.Timedelta(minutes=float(rng.uniform(-60, 60)) if j else 0),
                         "reported_at": t + pd.Timedelta(minutes=30), "place_text": "Velachery", "title": f"{cat.lower()} reported",
                         "text": f"{cat.lower().replace('_', ' ')} near the market, {inj} injured", "persons_affected": 1, "injured": inj,
                         "dead": 0, "hazard_flag": 0, "channel": ch, "is_overlay": 0, "dup_group_id": eid})
            truth[eid] = tag
        if rng.random() < 0.2:  # a look-alike: same kind, same place, a few hours later, another event
            eid = f"POL-{k:05d}"
            k += 1
            rows.append({"event_id": eid, "source": "police", "category_src": cat, "lat": lat + 150 * M_LAT, "lon": lon,
                         "occurred_at": t + pd.Timedelta(hours=2.5), "reported_at": t + pd.Timedelta(hours=3), "place_text": "Velachery",
                         "title": f"{cat.lower()} reported", "text": f"another {cat.lower().replace('_', ' ')} at the junction, {(inj + 2) % 4} injured",
                         "persons_affected": 2, "injured": (inj + 2) % 4, "dead": 0, "hazard_flag": 1, "channel": channels[0],
                         "is_overlay": 0, "dup_group_id": eid})
            truth[eid] = f"NEAR{i}"
    return pd.DataFrame(rows), truth


# ------------------------------------------------------------------------------------------------ one source --

def test_grievance_model_beats_rule_on_held_out_and_is_deterministic():
    g, truth = _grievances()
    rule, _ = dedup.grievances(g.copy())
    r1 = dedupml.run_source(g.copy(), "grievance", {}, truth, [], rule, None)
    r2 = dedupml.run_source(g.copy(), "grievance", {}, truth, [], rule, None)
    assert r1["info"]["method"] == "model" and r1["info"]["learn"] == "trained"
    assert r1["groups"] == r2["groups"] and r1["model"] == r2["model"]
    held = r1["info"]["held_out"]
    assert held["model"]["pairwise"]["precision"] > held["rule"]["pairwise"]["precision"]
    assert held["model"]["bcubed_all"]["f1"] >= held["rule"]["bcubed_all"]["f1"]
    c = dict(zip(r1["model"]["features"], r1["model"]["coef"]))
    assert c["dist_100m"] <= 0 and c["dt_day"] <= 0 and c["same_street"] >= 0
    rows = r1["pairs"]
    assert list(rows.columns) == dedupml.PAIR_COLUMNS and (rows["decision"] == "duplicate").all()
    why = json.loads(rows["features"].iloc[0])
    assert "m apart" in why["why"] and why["method"] == "model" and "top" in why


def test_police_model_keeps_channels_apart():
    p, truth = _police()
    rule = dedup.police(p.copy())
    r = dedupml.run_source(p.copy(), "police", {}, truth, [], rule, None)
    assert r["info"]["method"] == "model"
    ch = dict(zip(p["event_id"], p["channel"]))
    members = {}
    for e, grp in r["groups"].items():
        members.setdefault(grp, []).append(ch[e])
    assert all(len(v) == len(set(v)) for v in members.values())
    assert r["info"]["held_out"]["model"]["bcubed_all"]["f1"] >= 0.9


def test_fallbacks_saved_model_then_rule():
    g, truth = _grievances()
    rule, _ = dedup.grievances(g.copy())
    trained = dedupml.run_source(g.copy(), "grievance", {}, truth, [], rule, None)
    # no truth this build, a saved model: the saved model, same groups
    saved = {"grievance": trained["model"]}
    again = dedupml.run_source(g.copy(), "grievance", {}, None, [], rule, saved)
    assert again["info"]["model_from"] == "saved" and again["groups"] == trained["groups"]
    # a saved model for other features (an older version) is not used
    stale = dedupml.run_source(g.copy(), "grievance", {}, None, [], rule, {"grievance": {**trained["model"], "features": ["x"]}})
    assert stale["info"]["method"] == "rule"
    # neither: exactly the old rule, still explained
    bare = dedupml.run_source(g.copy(), "grievance", {}, None, [], rule, None)
    assert bare["info"]["method"] == "rule"
    assert bare["groups"] == {e: rule.get(e, e) for e in g["event_id"]}
    assert len(bare["pairs"]) and bare["pairs"]["prob"].isna().all()


def test_too_few_labels_falls_back_to_rule():
    g, truth = _grievances()
    g = g.head(12)
    rule, _ = dedup.grievances(g.copy())
    r = dedupml.run_source(g.copy(), "grievance", {}, {e: truth[e] for e in g["event_id"]}, [], rule, None)
    assert r["info"]["method"] == "rule"


# ------------------------------------------------------------------------------------------- the build's call --

def _settings(tmp_path: Path, with_truth: bool, method: str = "model") -> Settings:
    g, gt = _grievances()
    p, pt = _police()
    if with_truth:
        groups = {}
        for e, t in gt.items():
            groups.setdefault(t, []).append(e)
        rows = [(e.replace("GRV-", ""), "DUP-" + t.replace("GRV-", "")) for t, ms in groups.items() if len(ms) > 1 for e in ms]
        pd.DataFrame(rows, columns=["Complaint No", "Truth Group"]).to_csv(tmp_path / "dup.csv", index=False)
        pd.DataFrame({"report_id": list(pt), "true_event_id": list(pt.values())}).to_csv(tmp_path / "pol.csv", index=False)
    raw = {"sources": {"grievances": {"duplicate_truth": str(tmp_path / "dup.csv")}, "police": {"ground_truth": str(tmp_path / "pol.csv")}},
           "dedup": {"method": method}}
    return Settings(raw)


def _events() -> pd.DataFrame:
    g, _ = _grievances()
    p, _ = _police()
    w = pd.DataFrame([{"event_id": f"PWD-{i}", "source": "pwd", "category_src": "DRAIN", "lat": LAT0 + i * 1e-4, "lon": LON0,
                       "reported_at": T0 + pd.Timedelta(hours=i), "is_overlay": 0, "dup_group_id": f"PWD-{i}"} for i in range(3)])
    return pd.concat([g, p, w], ignore_index=True)


def test_run_trains_saves_and_explains(tmp_path, monkeypatch):
    monkeypatch.setattr(dedupml, "MODEL_PATH", tmp_path / "models" / "dedup_model.json")
    ev = _events()
    D = dedup.run(ev, _settings(tmp_path, with_truth=True))
    m = D["metrics"]
    assert m["grievance_method"] == "model" and m["police_method"] == "model" and m["pwd_method"] == "rule"
    assert m["grievance_dedup"]["held_out"] is True and "grievance_dedup_rule" in m
    assert set(ev["_dup_method"]) == {"within_source_model", "within_source_rule"}
    assert ev["dup_group_id"].notna().all()
    assert set(D["pairs"]["src_a"]) >= {"grievance", "police", "pwd"}
    saved = json.loads((tmp_path / "models" / "dedup_model.json").read_text(encoding="utf-8"))
    assert saved["version"] == dedupml.MODEL_VERSION and {"grievance", "police"} <= set(saved)
    first = dict(zip(ev["event_id"], ev["dup_group_id"]))
    # the next build has no truth files: the saved model gives the same groups
    ev2 = _events()
    (tmp_path / "none").mkdir()
    D2 = dedup.run(ev2, _settings(tmp_path / "none", with_truth=False))
    assert D2["metrics"]["grievance_method"] == "model" and D2["metrics"]["grievance_info"]["model_from"] == "saved"
    assert dict(zip(ev2["event_id"], ev2["dup_group_id"])) == first


def test_run_rule_mode_is_the_old_rule(tmp_path, monkeypatch):
    monkeypatch.setattr(dedupml, "MODEL_PATH", tmp_path / "absent.json")
    ev = _events()
    D = dedup.run(ev, _settings(tmp_path, with_truth=True, method="rule"))
    old = _events()
    gg, _ = dedup.grievances(old)
    pg = dedup.police(old)
    wg = dedup.pwd(old)
    grp = {**gg, **pg, **wg}
    assert dict(zip(ev["event_id"], ev["dup_group_id"])) == {e: grp.get(e, e) for e in old["event_id"]}
    assert D["metrics"]["grievance_method"] == "rule" and not (tmp_path / "absent.json").exists()
