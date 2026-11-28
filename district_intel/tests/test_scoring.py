"""Explainable scoring: severity points, deadlines and their sources, priority terms. Run: python -m pytest -q tests/test_scoring.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel import priority, scorewhy, severity as sev  # noqa: E402
from dintel.refdata import Reference, SEVERITIES, severity_level  # noqa: E402
from dintel.util import REF_DIR, load_settings  # noqa: E402

R = sev.rules()
LC = {k: v["points"] for k, v in R["legal_classes"].items()}


@pytest.fixture(scope="module")
def ref():
    return Reference(load_settings())


def pol(**kw):
    row = {"category_src": "OTHER", "title": "", "text": "", "dead": 0, "injured": 0, "_vulnerable_victim": 0, "_weapon": 0,
           "access_blocked": 0, "blockage_minutes": None, "crowd_estimate": None}
    row.update(kw)
    return row


def items(reasons: str) -> dict[str, int]:
    return {w: p for w, p, _ in sev.points(reasons) if p is not None}


# ------------------------------------------------------------------ levels --

def test_levels_are_the_dashboard_cut_offs():
    assert [severity_level(s) for s in (100, 70, 69, 50, 49, 30, 29, 0)] == ["Severe", "Severe", "High", "High", "Medium", "Medium", "Low", "Low"]
    lv = sev._levels(np.array([70, 69.9, 50, 49, 30, 29.5]))
    assert list(lv) == ["Severe", "High", "High", "Medium", "Medium", "Low"]


# ------------------------------------------------------------ police rules --

@pytest.mark.parametrize("cat,cls", [("MURDER", "A"), ("CRIMES_AGAINST_WOMEN", "B"), ("ASSAULT", "C"), ("CHAIN_SNATCHING", "B"),
                                     ("THEFT_BURGLARY", "B"), ("CYBER_FRAUD", "B"), ("ROAD_ACCIDENT", "C"), ("PROTEST_LAW_AND_ORDER", "C"),
                                     ("TRAFFIC_OBSTRUCTION", "C"), ("PUBLIC_NUISANCE", "C")])
def test_police_kind_is_the_legal_class_of_the_offence(cat, cls):
    s, lvl, why = sev.police(pol(category_src=cat))
    kind = sev.points(why, "police", cat)[0]
    assert kind[1] == LC[cls]
    e = R["police"][cat]
    assert e["law"].startswith("BNS ") and e["law"] in kind[2] and f"band {cls}" in kind[2]


def test_police_classes_land_on_the_levels():
    # fine-only offence Low, 3-7 years Medium, death or life High; any death Severe
    assert sev.police(pol(category_src="PUBLIC_NUISANCE"))[1] == "Low"
    assert sev.police(pol(category_src="THEFT_BURGLARY"))[1] == "Medium"
    assert sev.police(pol(category_src="MURDER"))[1] == "High"
    assert sev.police(pol(category_src="MURDER", dead=1))[1] == "Severe"


def test_non_offences_keep_district_iq_defaults():
    for cat in ("MISSING_PERSON", "WEATHER_EMERGENCY", "DRUGS_ILLICIT_LIQUOR", "OTHER"):
        s, _, why = sev.police(pol(category_src=cat))
        assert s == R["police"][cat]["points"]
        assert "District IQ default" in sev.points(why, "police", cat)[0][2]
    # an unknown category is scored as OTHER but keeps its own name
    s, _, why = sev.police(pol(category_src="SOMETHING_NEW"))
    assert s == R["police"]["OTHER"]["points"] and why.startswith("Something New (+")


def test_crimes_against_women_add_the_chapter_v_rule_and_upgrade_on_rape():
    s, lvl, why = sev.police(pol(category_src="CRIMES_AGAINST_WOMEN"))
    assert (s, lvl) == (LC["B"] + R["rules"]["chapter_v"]["points"], "High") == (55, "High")
    assert items(why)["Offence against a woman or child"] == 20
    s2, lvl2, why2 = sev.police(pol(category_src="CRIMES_AGAINST_WOMEN", text="Woman sexually assaulted near the station"))
    assert (s2, lvl2) == (LC["A"] + 20, "Severe")  # band A + Chapter V lands on Severe by itself
    assert "BNS 64(1)" in sev.points(why2, "police", "CRIMES_AGAINST_WOMEN")[0][2]
    # the victim's being a woman or child is the Chapter V rule; the vulnerable-victim flag does not count it twice
    s3, _, why3 = sev.police(pol(category_src="CRIMES_AGAINST_WOMEN", _vulnerable_victim=1))
    assert s3 == s and "Vulnerable victim" not in why3
    assert sev.police(pol(category_src="CHAIN_SNATCHING", _vulnerable_victim=1))[0] == LC["B"] + 10


def test_injuries_are_ten_points_each_up_to_thirty():
    for n, pts in ((1, 10), (2, 20), (3, 30), (7, 30)):
        s, _, why = sev.police(pol(category_src="ROAD_ACCIDENT", injured=n))
        assert s == LC["C"] + pts and items(why)[f"{n} injured"] == pts


def test_any_death_makes_it_severe_and_the_points_say_how_much():
    s, lvl, why = sev.police(pol(category_src="PUBLIC_NUISANCE", dead=1))
    assert (s, lvl) == (70.0, "Severe")
    assert items(why)["1 fatality"] == 50  # 20 for the offence + 50 = the 70 floor
    s, lvl, why = sev.police(pol(category_src="MURDER", dead=2, injured=1))
    assert s == 50 + 10 + 30 and items(why)["2 fatalities"] == 30
    assert why.split("; ")[1].startswith("2 fatalities")  # deaths read first after the kind


def test_weapon_raises_simple_hurt_to_bns_118():
    s, _, why = sev.police(pol(category_src="ASSAULT", injured=1, _weapon=1))
    assert s == LC["B"] + 10 and items(why)["Weapon used, hurt by a dangerous weapon"] == LC["B"] - LC["C"]
    assert "BNS 118(1)" in [b for w, _, b in sev.points(why) if w.startswith("Weapon used")][0]
    # on a theft the weapon is not the BNS 118(1) offence: its points are a District IQ default
    s, _, why = sev.police(pol(category_src="THEFT_BURGLARY", _weapon=1))
    assert items(why)["Weapon involved"] == R["rules"]["weapon"]["points"]
    assert "District IQ default" in [b for w, _, b in sev.points(why) if w == "Weapon involved"][0]


def test_vulnerable_victim_road_blocked_and_crowd():
    _, _, why = sev.police(pol(category_src="CHAIN_SNATCHING", _vulnerable_victim=1, access_blocked=1, blockage_minutes=90, crowd_estimate=1500))
    it = items(why)
    assert it["Vulnerable victim"] == 10 and it["Road blocked 90 min"] == 10 and it["Crowd of about 1500"] == 10
    _, _, why = sev.police(pol(category_src="CHAIN_SNATCHING", access_blocked=1, blockage_minutes=60, crowd_estimate=1000))
    assert "Road blocked" not in why and "Crowd" not in why  # more than an hour, more than 1,000


def test_score_is_capped_at_100():
    s, lvl, _ = sev.police(pol(category_src="MURDER", dead=3, injured=5, _vulnerable_victim=1, _weapon=1, access_blocked=1,
                               blockage_minutes=120, crowd_estimate=5000))
    assert (s, lvl) == (100.0, "Severe")


# -------------------------------------------------------------- PWD rules --

def test_pwd_points():
    row = {"category_src": "canal_overflow", "dead": 0, "injured": 0, "service_disruption": "full", "access_blocked": 1,
           "persons_affected": 600, "text": "near the school and the bus stop"}
    s, _, why = sev.pwd(row)
    it = items(why)
    assert it["canal overflow"] == 45 and it["Full service disruption"] == 15 and it["Access blocked"] == 10
    assert it["About 600 people affected"] == 15 and it["Affects school, bus_stop"] == 16
    assert s == 100.0  # 101, capped
    assert sev.pwd({**row, "service_disruption": "partial", "persons_affected": 150, "access_blocked": 0, "text": ""})[0] == 45 + 5 + 10
    assert sev.pwd({"category_src": "never_seen"})[0] == R["pwd"]["_other"]
    # PWD has only a casualty flag (death or injury not stated): its own rule, Severe floor, never "1 injured"
    s, lvl, why = sev.pwd({"category_src": "building_crack", "injured": 1})
    assert s == 70 and lvl == "Severe" and "Casualty reported, death or injury not stated" in why and "injured (+" not in why
    assert sev.pwd({"category_src": "building_crack", "dead": 1})[1] == "Severe"


# ------------------------------------------------------- news / categories --

def test_category_points_and_the_unconfirmed_cap(ref):
    s, lvl, why = sev.from_category({"category_code": "CRIME_PROPERTY"}, ref, cap_unconfirmed=True)
    assert s == LC["B"] and "BNS 303(2)" in sev.points(why, "news", "", "CRIME_PROPERTY")[0][2]
    s, lvl, why = sev.from_category({"category_code": "FIRE_EXPLOSION", "dead": 2}, ref, cap_unconfirmed=True)
    assert (s, lvl) == (69.0, "High") and why.endswith("Capped at High until a department or officer confirms it")
    assert sev.from_category({"category_code": "FIRE_EXPLOSION", "dead": 2}, ref, cap_unconfirmed=False)[1] == "Severe"
    s, _, why = sev.from_category({"category_code": "SOLID_WASTE", "hazard_flag": 1, "vulnerable_flags": "school|children|elderly"}, ref, False)
    assert s == 20 + 10 + 16 and "District IQ default" in sev.points(why, "news", "", "SOLID_WASTE")[0][2]
    s, lvl, why = sev.from_category({"category_code": "CRIMES_AGAINST_WOMEN", "title": "Dowry death in Avadi"}, ref, True)
    assert (s, lvl) == (69.0, "High")  # 50 + 20, capped at High until a department or officer confirms it
    assert sev.from_category({"category_code": "CRIMES_AGAINST_WOMEN", "title": "Dowry death in Avadi"}, ref, False)[0] == LC["A"] + 20


def test_crime_categories_base_severity_is_their_legal_points(ref):
    for code, e in R["categories"].items():
        want = LC[e["class"]] + (R["rules"]["chapter_v"]["points"] if e.get("chapter_v") else 0)
        assert ref.cat[code]["base_severity"] == want, code


def test_every_legal_entry_is_complete():
    for table in ("police", "categories"):
        for k, e in R[table].items():
            if "class" in e:
                assert e["class"] in LC and e["law"].startswith("BNS") and e["offence"] and e["punishment"], k
            else:
                assert isinstance(e["points"], int) and e["why"], k


# --------------------------------------------------- grievances (Manu copy) --

def test_grievance_rules_are_unchanged():
    # the website's Manu desk copy (src/lib/manu/grade.ts) expects exactly these
    assert sev.grievance({"category_src": "Public Health", "subcategory_src": "Street Dogs", "title": "Dogs", "text": "Dogs biting people near the UPHC"})[0] == 33
    assert sev.grievance({"category_src": "Garbage", "subcategory_src": "Removal of Garbage", "title": "Garbage", "text": "not cleared"})[1] == "Low"
    s, lvl, why = sev.grievance({"category_src": "Flood", "subcategory_src": "EB wire cut/Spark seen", "title": "Spark", "text": "live wire hanging"})
    assert (s, lvl) == (50.0, "High") and why == "High-risk issue: EB wire cut/Spark seen (+35); Describes an immediate hazard (+15)"


# ------------------------------------------------- whole frames = row rules --

TEXTS = ["Live wire hanging near the school", "மின் கம்பி அறுந்து கிடக்கிறது பள்ளி அருகே", "already complained twice, no action taken",
         "Street near kovil, senior citizen fell", "", None, "ſchool closed", "İçinde hospital", "KIDS near anganwadi",
         "open manhole, children play", "Bus Stop flooded; pregnant woman stuck", "நடவடிக்கை இல்லை, ஏற்கனவே புகார் கொடுத்தோம்"]


def _frame(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    pick = lambda xs: [xs[i] for i in rng.integers(0, len(xs), n)]  # noqa: E731
    return pd.DataFrame({
        "category_src": pick(list(R["police"]) + ["SOMETHING_NEW", "", "Flood", "Garbage", "Tax and Licence"] + list(R["pwd"])),
        "subcategory_src": pick(["Street Dogs", "Removal of Garbage", "Electric shock due to street light", "Online Payment Issue", "Other / not listed above", ""]),
        "title": pick(TEXTS), "text": pick(TEXTS), "_landmark": pick(TEXTS),
        "dead": rng.choice([0, 0, 0, 1, 2], n), "injured": rng.choice([0, 0, 1, 2, 5], n),
        "_vulnerable_victim": rng.choice([0, 1], n), "_weapon": rng.choice([0, 1], n), "access_blocked": rng.choice([0, 1], n),
        "blockage_minutes": rng.choice([np.nan, 30, 61, 200], n), "crowd_estimate": rng.choice([np.nan, 500, 1001, 3000], n),
        "service_disruption": pick(["none", "partial", "full", None]), "persons_affected": rng.choice([np.nan, 50, 100, 499, 500, 2000], n),
    })


@pytest.mark.parametrize("fn", [sev.grievance, sev.police, sev.pwd])
def test_the_frame_version_gives_the_row_rules_exactly(fn):
    df = _frame(400, 7)
    rows = [fn(r) for r in df.to_dict("records")]
    out = sev.apply(df.copy(), fn)
    assert out["severity_score"].tolist() == [r[0] for r in rows]
    assert out["severity_level"].tolist() == [r[1] for r in rows]
    assert out["severity_reasons"].tolist() == [r[2] for r in rows]


def test_the_fast_text_match_is_the_case_insensitive_one():
    from dintel import textproc as tp
    s = pd.Series([t or "" for t in TEXTS] * 3)
    for rx, got in zip([tp.TEXT_HAZARD, tp.REPEAT] + [r for _, r in tp.VULNERABLE], sev._found(s, [tp.TEXT_HAZARD, tp.REPEAT] + [r for _, r in tp.VULNERABLE])):
        assert got.tolist() == [bool(rx.search(x)) for x in s], rx.pattern


# ---------------------------------------------------------- reasons -> points --

def test_points_parse_new_and_old_reasons():
    p = sev.points("Assault (+20); 1 injured (+10); Weapon involved (+15)", "police", "ASSAULT")
    assert [x[1] for x in p] == [20, 10, 15] and "BNS 115(2)" in p[0][2]
    old = sev.points("Murder (+70); 1 fatality (Severe); Weapon involved (+10)", "police", "MURDER")
    assert old[1][:2] == ["1 fatality", None] and "any death" in old[1][2]
    assert sev.points("AQI 210", "cpcb")[0] == ["AQI 210", None, "CPCB air quality index band"]
    assert sev.points(None) == [] and sev.points(float("nan")) == []


# ------------------------------------------------------------- deadlines --

def test_sla_register_matches_categories_yaml(ref):
    reg = scorewhy.register()
    assert set(reg["categories"]) == set(ref.cat)
    for code, c in ref.cat.items():
        e = reg["categories"][code]
        assert e["h"] == c["sla_h"], code
        assert e.get("basis", "resolution") == c.get("sla_basis", "resolution"), code
        assert max(e["h"]) <= reg["ceiling_h"], code
        assert e["h"] == sorted(e["h"]), code  # a more severe level never gets more time


def test_every_official_deadline_has_a_source_read_on_a_date():
    reg = scorewhy.register()
    n = 0
    for code, c in reg["categories"].items():
        for lvl, o in (c.get("official") or {}).items():
            assert lvl in SEVERITIES
            s = reg["sources"][o["source"]]
            assert s["official"] is True and s["url"].startswith("https://") and str(s["checked"]) == "2026-11-28"
            assert o["clause"] and o["rule"]
            # the rules are set per kind of fault, the deadlines per level: each says how far the rule fits
            # (or names the fault it covers with `match`, so it is official only for those cases)
            assert o.get("match") or (o.get("fit", "").startswith(("Set for", "The charter")) and lvl in o["fit"]), (code, lvl)
            n += 1
        for x in c.get("related") or []:
            assert x["source"] in reg["sources"] and x["rule"] and x["clause"]
            assert x.get("url", "https://").startswith("https://")
    assert n >= 2  # only the CMWSSB charter clauses (street lights are District IQ defaults since 28 Nov)
    assert reg["sources"]["district_iq_default"]["official"] is False
    assert reg["sources"]["tn_petitions_2025"]["official"] is False  # a news report of a GO is not called official


def test_every_department_names_its_deadline_source():
    reg = scorewhy.register()
    deps = yaml.safe_load((REF_DIR / "departments.yaml").read_text(encoding="utf-8"))
    for d in deps:
        if d.get("action_owner"):
            assert d.get("sla_source") in reg["sources"], d["code"]
            for x in d.get("sla_related") or []:
                assert x in reg["sources"], d["code"]
    by = {d["code"]: d.get("sla_source") for d in deps}
    assert by["CMWSSB"] == "cmwssb_charter_2021" and by["TANGEDCO"] == "tnerc_sop_2004" and by["POL-GCP"] == "district_iq_default"


def test_sla_entry_and_label():
    # street lights are GCC's: TNERC binds TANGEDCO's supply, so it is only a related note, and the deadline a default
    e = scorewhy.sla_entry("STREETLIGHT_ELECTRICAL", "Severe")
    assert e["h"] == 4 and not e["official"] and e["source"] == "District IQ default"
    assert any("TANGEDCO" in x["rule"] for x in e["related"])
    # the water charter is official only for the kind of fault its clause covers
    assert scorewhy.sla_label("WATER_SUPPLY", "Low").startswith("CMWSSB Citizen's Charter 2021, section 5C(4)")
    assert scorewhy.fault_fits("WATER_SUPPLY", "Low", "No water supply for 3 days, Ward 12")
    assert not scorewhy.fault_fits("WATER_SUPPLY", "Low", "Contaminated water, smell")
    assert not scorewhy.sla_entry("WATER_SUPPLY", "Low", False)["official"]
    assert scorewhy.fault_fits("WATER_SUPPLY", "Medium", "Pipeline leak near the bus stop")
    assert scorewhy.sla_label("FLOOD_WATERLOGGING", "High") == "District IQ default"
    assert scorewhy.sla_entry("NOT_A_CATEGORY", "Whatever")["h"] == scorewhy.register()["categories"]["OTHER"]["h"][3]
    assert any("BNSS" in x["source"] or "Suraksha" in x["source"] for x in scorewhy.sla_entry("CRIMES_AGAINST_WOMEN", "High")["related"])
    assert "fit" not in scorewhy.sla_entry("WATER_SUPPLY", "High")  # a District IQ default has no published rule to fit
    # an item that links its own section (BNSS 173 is on another page than BNSS 193)
    s173 = [x for x in scorewhy.sla_entry("CRIME_PROPERTY", "Low")["related"] if x["clause"] == "section 173(3)"][0]
    assert s173["url"].endswith("/173.php") and "14 days" in s173["rule"]
    assert "21 days" in scorewhy.sla_entry("OTHER", "Low")["related"][0]["rule"]


# --------------------------------------------------------------- priority --

FACTS = {"severity_score": 50, "severity_level": "High", "category_label": "Waterlogging", "source_count": 2,
         "citizen_complaints": 3, "is_open": 1, "sla_ratio": 2.5, "sla_basis": "resolution", "sla_hours": 24, "verified": 0,
         "growth_24h": 0, "vulnerable": "school", "outlet_count": 0, "media_only": 0, "rain_coupled": 1, "recurrence_90d": 0}


def _incidents(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        "severity_score": rng.integers(5, 100, n).astype(float), "severity_level": rng.choice(SEVERITIES + [None], n),
        "category_label": rng.choice(["Waterlogging", "Road accident", None], n), "source_count": rng.choice([1, 2, 3, np.nan], n),
        "citizen_complaints": rng.choice([0, 1, 2, 7], n), "is_open": rng.choice([0, 1], n), "sla_ratio": rng.choice([0.1, 0.75, 0.9, 1.0, 1.5, 2.0, 3.1], n),
        "sla_basis": rng.choice(["resolution", "response"], n), "sla_hours": rng.choice([2, 24, 72], n), "verified": rng.choice([0, 1], n),
        "growth_24h": rng.choice([0, 3, 5], n), "vulnerable": rng.choice(["", "school|children", None], n), "outlet_count": rng.choice([0, 1, 2, 4], n),
        "media_only": rng.choice([0, 1], n), "rain_coupled": rng.choice([0, 1], n), "recurrence_90d": rng.choice([0, 2, 3, 9], n)})


def test_frame_signals_and_reasons_are_the_row_rules():
    df = _incidents(500, 3)
    s, X = priority.frame_signals(df)
    rows = df.to_dict("records")
    assert np.allclose(X, [[priority.features(r)[k] for k in priority.SIGNALS] for r in rows])
    assert priority.frame_reasons(df) == [priority.reasons(r) for r in rows]
    # decisions saved by the website carry numbers as text
    as_text = [{k: (str(v) if isinstance(v, (int, float)) and v == v else v) for k, v in r.items()} for r in rows[:50]]
    assert np.allclose(priority.matrix(as_text)[1], X[:50])


def test_close_to_the_deadline():
    near = dict(FACTS, sla_ratio=0.8)
    assert priority.features(near)["sla_near"] == 1 and "resolution close to the 24 h target" in priority.reasons(near)
    assert priority.features(dict(near, sla_ratio=0.7))["sla_near"] == 0
    assert priority.features(dict(near, is_open=0))["sla_near"] == 0
    # a response deadline is done once the first response came
    assert priority.features(dict(near, sla_basis="response", verified=1))["sla_near"] == 0
    assert priority.features(dict(near, sla_basis="response", verified=0))["sla_near"] == 1
    # the hand-set example of test_signals still scores 99 (past twice the deadline, not near)
    s, X = priority.matrix([FACTS])
    assert priority.score(s, X, priority.DEFAULT_WEIGHTS)[0] == 99.0


def test_terms_add_up_to_the_priority_and_name_every_signal():
    df = _incidents(300, 5)
    s, X = priority.frame_signals(df)
    p = priority.score(s, X, priority.DEFAULT_WEIGHTS)
    t = priority.terms(df)
    assert np.allclose([sum(x[2] for x in r) for r in t], p, atol=0.11)
    assert all(r[0][0] == "severity" for r in t)
    one = priority.terms(pd.DataFrame([FACTS]))[0]
    words = {k: w for k, w, _ in one}
    assert words["sla_over_2x"] == "Open more than twice past its 24 h deadline" and words["complaints"] == "3 citizen complaints"
    assert words["multi_source"] == "Reported by 2 sources" and words["vulnerable"] == "Affects school"


def test_learned_adjustment_is_bounded_and_explained():
    df = pd.DataFrame([dict(FACTS, sla_ratio=0.2, recurrence_90d=5, outlet_count=3)] * 3)
    wild = {k: 1000.0 for k in priority.SIGNALS}  # whatever the fit says
    s, X = priority.frame_signals(df)
    adj, per = priority.learned_adjustment(X, wild)
    w0 = np.array([priority.DEFAULT_WEIGHTS[k] for k in priority.SIGNALS])
    assert (np.abs(per) <= X * w0 + 1e-9).all() and (np.abs(adj) <= priority.LEARN_CAP).all() and adj[0] == priority.LEARN_CAP
    t = priority.terms(df, wild)[0]
    assert t[-1][0] == "learned" and t[-1][2] == priority.LEARN_CAP and t[-1][1].startswith("Your past decisions on similar cases: +10")
    down = {k: 0.0 for k in priority.SIGNALS}
    assert priority.learned_adjustment(X, down)[0][0] < 0
    assert priority.learned_adjustment(X, None)[0].tolist() == [0, 0, 0]


def test_apply_with_learned_weights_writes_the_adjustment(tmp_path, monkeypatch):
    rng = np.random.default_rng(1)
    rows, inc = [], []
    for i in range(300):
        f = dict(FACTS, severity_score=float(rng.integers(20, 80)), rain_coupled=int(rng.random() < 0.5), sla_ratio=float(rng.choice([0.5, 1.5, 3.0])))
        rows.append({"action": "decision:" + ("reopen" if rng.random() < (0.85 if f["rain_coupled"] else 0.15) else "verify"),
                     "table_name": "collector_decisions", "record_id": f"INC-{i}", "before_value": json.dumps({"score": {"facts": f}})})
        inc.append({"incident_id": f"INC-{i}", **f, "score_why": json.dumps({"v": 1, "sev": [], "pri": [], "sla": {}})})
    p = tmp_path / "decisions.json"
    p.write_text(json.dumps(rows), encoding="utf-8")
    monkeypatch.setenv("DI_DECISIONS_JSON", str(p))
    df = pd.DataFrame(inc)
    out, info = priority.apply(df, {"raise": ["reopen"], "lower": ["verify"], "min_decisions": 30})
    assert info["status"] == "learned" and info["adjustment"]["cap_points"] == priority.LEARN_CAP
    s, X = priority.frame_signals(df)
    base = priority.score(s, X, priority.DEFAULT_WEIGHTS)
    assert (np.abs(out["priority_score"] - base) <= priority.LEARN_CAP + 0.05).all()
    rainy = out[df["rain_coupled"] == 1].iloc[0]
    terms = json.loads(rainy["score_why"])["pri"]
    assert terms[-1][0] == "learned" and terms[-1][1].startswith("Your past decisions on similar cases: ")
    assert abs(sum(t[2] for t in terms) - rainy["priority_score"]) < 0.11


# --------------------------------------------------------------- score_why --

def test_score_why_shape():
    inc = pd.DataFrame([dict(FACTS, category_code="STREETLIGHT_ELECTRICAL", severity_level="Severe", severity_score=70.0),
                        dict(FACTS, category_code="ROAD_DAMAGE", severity_level="Low", severity_score=25.0, is_open=0)])
    lead = pd.DataFrame({"source": ["police", "grievance"], "category_src": ["PUBLIC_NUISANCE", "Road"], "category_code": ["STREETLIGHT_ELECTRICAL", "ROAD_DAMAGE"],
                         "severity_reasons": ["Public Nuisance (+20); 1 fatality (+50)", "Civic issue: Pot hole (+25)"]})
    labels, why = scorewhy.build(inc, lead)
    assert labels == ["District IQ default", "District IQ default"]
    d = json.loads(why[0])
    assert d["v"] == 1 and [x[1] for x in d["sev"]] == [20, 50] and d["sla"]["h"] == 4 and d["sla"]["official"] is False
    assert d["sla"]["related"][0]["url"].startswith("https://") and d["pri"][0] == ["severity", "Severity (Severe)", 70.0]
    # a water-supply case: official only when its text names the clause's fault
    w = pd.DataFrame([dict(FACTS, category_code="WATER_SUPPLY", severity_level="Low", severity_score=20.0)] * 2)
    wl = pd.DataFrame({"source": ["grievance"] * 2, "category_src": ["Water"] * 2, "category_code": ["WATER_SUPPLY"] * 2,
                       "severity_reasons": ["Civic issue (+5)"] * 2, "subcategory_src": ["No Water Supply", "Contaminated Water"]})
    wlab, _ = scorewhy.build(w, wl)
    assert wlab[0].startswith("CMWSSB Citizen's Charter 2021, section 5C(4)") and wlab[1] == "District IQ default"
    assert json.loads(why[1])["sla"] == {"h": 336, "basis": "resolution", "official": False, "source": "District IQ default"}
    # the joined text is exactly what json.dumps writes (keys v, sev, pri, sla; compact; Tamil and symbols as they are)
    assert all(w == json.dumps(json.loads(w), ensure_ascii=False, separators=(",", ":")) for w in why)
    assert list(json.loads(why[0])) == ["v", "sev", "pri", "sla"]
