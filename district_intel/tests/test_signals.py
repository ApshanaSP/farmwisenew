"""Unusual-rise checks, the linker's named-thing feature and priority learning. Run: python -m pytest -q"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel import analytics, priority  # noqa: E402
from dintel import textproc as tp  # noqa: E402
from dintel.util import IST  # noqa: E402


# ------------------------------------------------------------- unusual rises --

def test_bh_qvalues_match_the_textbook_procedure():
    p = np.array([0.01, 0.04, 0.03, 0.005, 0.5])
    q = analytics.bh_qvalues(p)
    # sorted p: .005 .01 .03 .04 .5 -> p*m/rank: .025 .025 .05 .05 .5 (then the running minimum from the top)
    assert np.allclose(q, [0.025, 0.05, 0.05, 0.025, 0.5])
    assert (q >= p).all()


def test_cusum_resets_at_zero_and_climbs_with_a_doubling():
    lam = np.full(10, 1.0)
    flat = analytics.cusum(np.ones(10), lam, 2.0)
    risen = analytics.cusum(np.r_[np.ones(5), np.full(5, 3.0)], lam, 2.0)
    assert flat.max() < 0.01 and (flat >= 0).all()
    assert risen[-1] > 3 and risen[4] < 0.01


def _incidents(counts: dict[str, list[int]], days: int, rain: set[int] = frozenset()) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp]:
    start = pd.Timestamp("2026-06-01 10:00", tz=IST)
    rows = []
    for cat, per_day in counts.items():
        for d in range(days):
            rows += [{"category_code": cat, "zone_no": 1, "first_reported_at": start + pd.Timedelta(days=d)}] * per_day[d]
    cal = pd.DataFrame({"date": [str((start + pd.Timedelta(days=d)).date()) for d in range(days)],
                        "rain_event": [int(d in rain) for d in range(days)]})
    return pd.DataFrame(rows), cal, start + pd.Timedelta(days=days - 1, hours=2)


def test_a_clear_spike_survives_and_quiet_series_raise_nothing():
    rng = np.random.default_rng(0)
    days = 70
    counts = {f"Q{i}": list(rng.poisson(1.0, days)) for i in range(40)}       # 40 quiet series: many chances for luck
    counts["SPIKE"] = [1] * (days - 1) + [12]
    inc, cal, as_of = _incidents(counts, days)
    a, info = analytics.anomalies(inc, as_of, 7, 0.05, 3, 28, cal)
    assert list(a["category_code"]) == ["SPIKE"]
    assert info["checks"] == 41 * 7 + 41


def test_rain_days_raise_the_expected_count():
    days = 70
    rain = {d for d in range(0, days, 7)}                      # one rain day a week, flood reports triple after it
    wet = {d + k for d in rain for k in range(3)}
    flood = [6 if d in wet else 2 for d in range(days)]
    inc, cal, as_of = _incidents({"FLOOD": flood}, days, rain)
    a, info = analytics.anomalies(inc, as_of, 7, 0.05, 3, 28, cal)
    assert info["rain_factors"]["FLOOD"] > 2
    assert len(a) == 0                                         # a wet week is what rain does, not an alarm


def test_a_slow_rise_is_found_where_no_single_day_stands_out():
    days = 70
    slow = [1] * 56 + [2, 2, 3, 2, 3, 3, 2, 3, 3, 4, 3, 3, 4, 3]  # tripling over two weeks, never a big day
    inc, cal, as_of = _incidents({"SLOW": slow}, days)
    a, _ = analytics.anomalies(inc, as_of, 7, 0.05, 3, 28, cal)
    assert list(a["kind"]) == ["slow_rise"]
    assert a.iloc[0]["rise_days"] >= 7


# ------------------------------------------------------------- named things --

def test_entities_find_landmarks_agencies_and_amounts():
    e = tp.entities("A MTC bus snatched near Kasi Theatre Junction; Rs 90,000 and 8-sovereign chain")
    flat = {t for s in e for t in s}
    assert {"kasi", "theatre", "junction"} <= flat and "acr:mtc" in flat and "rs:90000" in flat and "qty:8sovereigns" in flat
    assert tp.entities("விரைவு ரயிலில் கஞ்சா கடத்தல்") == []


def test_entity_overlap_matches_shorter_names():
    a = tp.entities("Patient died at Kilpauk Government Hospital")
    b = tp.entities("Fire near Kilpauk Hospital gate")
    assert tp.entity_overlap(a, b) == 1.0
    assert tp.entity_overlap(a, tp.entities("Water logging on Anna Salai")) == 0.0
    assert tp.entity_overlap([], b) == 0.0


# ---------------------------------------------------------------- priority --

FACTS = {"severity_score": 50, "severity_level": "High", "category_label": "Waterlogging", "source_count": 2,
         "citizen_complaints": 3, "is_open": 1, "sla_ratio": 2.5, "sla_basis": "resolution", "sla_hours": 24, "verified": 0,
         "growth_24h": 0, "vulnerable": "school", "outlet_count": 0, "media_only": 0, "rain_coupled": 1, "recurrence_90d": 0}


def test_priority_matches_the_hand_set_rule():
    sev, X = priority.matrix([FACTS])
    # 50 + 5*log2(2) + 3*log2(4) + 20 (over twice) + 8 (not verified, High) + 5 (school) + 5 (rain)
    assert priority.score(sev, X, priority.DEFAULT_WEIGHTS)[0] == 99.0
    r = priority.reasons(FACTS)
    assert r.startswith("High waterlogging (50); reported by 2 sources") and "resolution over twice the 24 h target" in r


def test_priority_reads_text_numbers_from_saved_decisions():
    as_text = {k: (str(v) if isinstance(v, (int, float)) else v) for k, v in FACTS.items()}
    assert priority.features(as_text) == priority.features(FACTS)


def _decisions(tmp_path, monkeypatch, n: int, reopen_if) -> pd.DataFrame:
    rng = np.random.default_rng(1)
    rows, inc = [], []
    for i in range(n):
        f = dict(FACTS, severity_score=float(rng.integers(20, 80)), rain_coupled=int(rng.random() < 0.5),
                 sla_ratio=float(rng.choice([0.5, 1.5, 3.0])))
        rows.append({"action": "decision:" + ("reopen" if reopen_if(f, rng) else "verify"), "table_name": "collector_decisions",
                     "record_id": f"INC-{i}", "before_value": json.dumps({"score": {"facts": f}})})
        inc.append({"incident_id": f"INC-{i}", **f})
    p = tmp_path / "decisions.json"
    p.write_text(json.dumps(rows), encoding="utf-8")
    monkeypatch.setenv("DI_DECISIONS_JSON", str(p))
    return pd.DataFrame(inc)


def test_priority_keeps_hand_set_weights_until_enough_decisions(tmp_path, monkeypatch):
    inc = _decisions(tmp_path, monkeypatch, 12, lambda f, r: r.random() < 0.5)
    w, info = priority.learn(inc, {"raise": ["reopen"], "lower": ["verify"], "min_decisions": 30})
    assert info["status"] == "collecting" and info["counted"] == 12 and w == priority.DEFAULT_WEIGHTS


def test_priority_learns_what_the_collector_sends_back(tmp_path, monkeypatch):
    inc = _decisions(tmp_path, monkeypatch, 300, lambda f, r: r.random() < (0.85 if f["rain_coupled"] else 0.15))
    w, info = priority.learn(inc, {"raise": ["reopen"], "lower": ["verify"], "min_decisions": 30})
    assert info["status"] == "learned" and info["auc_learned_held_out"] >= info["auc_default"]
    assert w["rain"] > priority.DEFAULT_WEIGHTS["rain"] + 3
    out, _ = priority.apply(inc, {"raise": ["reopen"], "lower": ["verify"], "min_decisions": 30})
    assert out["priority_score"].ne(inc["severity_score"]).any()
