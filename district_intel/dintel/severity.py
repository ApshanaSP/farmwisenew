"""Event severity: how serious the event itself is, from static facts only.

Age, deadlines, corroboration and growth are NOT here; they belong to incident
priority, which is computed when read so it never goes stale.

Every score is a sum of named points, written into severity_reasons as "<what> (+<points>)" items, capped at 100
and mapped to the dashboard levels (refdata.severity_level: Severe 70+, High 50-69, Medium 30-49, Low under 30):

  kind of event   police and the crime categories: the legal class of the offence (BNS section, BNSS First Schedule
                  class A/B/C); PWD types and the other categories: District IQ default points
                  (reference/severity_rules.yaml); grievances: the sub-category tier below
  harm to people  any death makes it Severe; 10 points for each person hurt, up to 30
  vulnerable      a woman/child/elderly victim, or (not both) an offence against a woman or child (BNS Chapter V);
                  vulnerable places
  aggravation     weapon (BNS 118(1)), an immediate hazard, road blocked, a large crowd
  essential       service cut off (full/partial), access blocked, people affected (100+, 500+)

`points()` turns the stored reasons back into [what, points, basis] for the Collector (incidents.score_why).
`apply()` scores a whole frame at once for the grievance, police and PWD loaders (the rules are the row functions'
rules; tests/test_scoring.py checks both give the same results).
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from . import textproc as tp
from .refdata import Reference, severity_level
from .util import load_ref


def _finish(score: float, reasons: list[str], cap: float = 100) -> tuple[float, str, str]:
    score = float(min(score, cap))
    return score, severity_level(score), "; ".join(reasons)


# The Manu desk grades paper petitions with a copy of grievance() (src/lib/manu/grade.ts); a test reads this function's
# numbers, so its points are written out here, not in severity_rules.yaml. They are District IQ defaults.
def grievance(row: dict[str, Any]) -> tuple[float, str, str]:
    sub = row.get("subcategory_src") or ""
    cat = row.get("category_src") or ""
    text = f"{row.get('title') or ''} {row.get('text') or ''}"
    place = f"{text} {row.get('_landmark') or ''}"
    reasons: list[str] = []
    if cat == "Flood" or tp.HIGH_RISK_SUB.search(sub):
        score = 35; reasons.append(f"High-risk issue: {sub} (+35)")
    elif cat in ("Tax and Licence", "Voter ID") or tp.LOW_SUB.search(sub):
        score = 5; reasons.append(f"Administrative issue: {sub} (+5)")
    elif tp.ELEVATED_SUB.search(sub):
        score = 25; reasons.append(f"Public-safety or sanitation issue: {sub} (+25)")
    else:
        score = 15; reasons.append(f"Civic issue: {sub or cat} (+15)")
    if tp.hazard(text):
        score += 15; reasons.append("Describes an immediate hazard (+15)")
    vul = tp.vulnerable_flags(place)
    if vul:
        pts = min(8 * len(vul), 24); score += pts; reasons.append(f"Affects {', '.join(vul)} (+{pts})")
    if tp.repeat_claim(text):
        score += 10; reasons.append("Citizen reports complaining before (+10)")
    return _finish(score, reasons)


# --------------------------------------------------------------- the rules --

@lru_cache(maxsize=1)
def rules() -> dict:
    """reference/severity_rules.yaml, read once."""
    r = load_ref("severity_rules.yaml")
    for table in ("police", "categories"):
        for e in r[table].values():
            if isinstance(e.get("upgrade"), dict):
                e["upgrade"]["_rx"] = re.compile(e["upgrade"]["pattern"], re.I)
    return r


def _num(v: Any) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if np.isnan(f) else f


def _yes(v: Any) -> bool:
    """A flag column: 1/True/'1' is yes; 0, blank, None and NaN are no."""
    if isinstance(v, str):
        return v.strip().lower() not in ("", "0", "false", "no", "none", "nan")
    return _num(v) != 0


def _kind(entry: dict, text: str) -> tuple[int, str | None]:
    """(points, legal class or None) of a police or category entry; the upgrade applies when the text names it."""
    R = rules()
    up = entry.get("upgrade")
    if up and up["_rx"].search(text or ""):
        return R["legal_classes"][up["class"]]["points"], up["class"]
    if "class" in entry:
        return R["legal_classes"][entry["class"]]["points"], entry["class"]
    return int(entry["points"]), None


def _death_points(score: float) -> int:
    d = rules()["rules"]["death"]
    return int(max(d["points"], d["floor"] - score))


def _deaths(n: int, pts: int) -> str:
    return f"{n} fatalit{'y' if n == 1 else 'ies'} (+{pts})"


def police(row: dict[str, Any]) -> tuple[float, str, str]:
    R = rules()
    rr = R["rules"]
    cat = row.get("category_src") or "OTHER"
    entry = R["police"].get(cat, R["police"]["OTHER"])
    score, klass = _kind(entry, f"{row.get('title') or ''} {row.get('text') or ''}")
    reasons = [f"{cat.replace('_', ' ').title()} (+{score})"]
    if entry.get("chapter_v"):
        pts = rr["chapter_v"]["points"]; score += pts; reasons.append(f"Offence against a woman or child (+{pts})")
    inj = int(_num(row.get("injured")))
    if inj > 0:
        pts = min(rr["injured"]["each"] * inj, rr["injured"]["cap"]); score += pts; reasons.append(f"{inj} injured (+{pts})")
    if _yes(row.get("_vulnerable_victim")) and not entry.get("chapter_v"):  # Chapter V points already count the victim
        pts = rr["vulnerable_victim"]["points"]; score += pts; reasons.append(f"Vulnerable victim (+{pts})")
    if _yes(row.get("_weapon")):
        lift = entry.get("weapon_class")
        lifted = bool(lift and klass and lift < klass)
        pts = (R["legal_classes"][lift]["points"] - R["legal_classes"][klass]["points"]) if lifted else rr["weapon"]["points"]
        # BNS 118(1) only where it is the offence (hurt raised by a dangerous weapon); elsewhere a District IQ default
        score += pts; reasons.append(f"Weapon used, hurt by a dangerous weapon (+{pts})" if lifted else f"Weapon involved (+{pts})")
    if _yes(row.get("access_blocked")) and _num(row.get("blockage_minutes")) > rr["road_blocked"]["minutes"]:
        pts = rr["road_blocked"]["points"]; score += pts; reasons.append(f"Road blocked {int(_num(row['blockage_minutes']))} min (+{pts})")
    if _num(row.get("crowd_estimate")) > rr["crowd"]["people"]:
        pts = rr["crowd"]["points"]; score += pts; reasons.append(f"Crowd of about {int(_num(row['crowd_estimate']))} (+{pts})")
    dead = int(_num(row.get("dead")))
    if dead > 0:
        pts = _death_points(score); score += pts; reasons.insert(1, _deaths(dead, pts))
    return _finish(score, reasons)


def pwd(row: dict[str, Any]) -> tuple[float, str, str]:
    R = rules()
    rr = R["rules"]
    t = row.get("category_src") or ""
    score = int(R["pwd"].get(t, R["pwd"]["_other"]))
    reasons = [f"{t.replace('_', ' ')} (+{score})"]
    # The PWD record has only a casualty FLAG (loaders/pwd.py puts casualty_reported in `injured`, 0 or 1): it does not say
    # whether anyone died or how many were hurt, so it is its own rule, never a count of injured people. A possible death
    # keeps the event Severe (the floor), as before the explainable rules (severity_rules.yaml pwd_casualty).
    casualty = int(_num(row.get("injured"))) > 0
    sd = row.get("service_disruption")
    if sd == "full":
        pts = rr["service_full"]["points"]; score += pts; reasons.append(f"Full service disruption (+{pts})")
    elif sd == "partial":
        pts = rr["service_partial"]["points"]; score += pts; reasons.append(f"Partial service disruption (+{pts})")
    if _yes(row.get("access_blocked")):
        pts = rr["access_blocked"]["points"]; score += pts; reasons.append(f"Access blocked (+{pts})")
    pa = _num(row.get("persons_affected"))
    for k in ("people_500", "people_100"):
        if pa >= rr[k]["people"]:
            pts = rr[k]["points"]; score += pts; reasons.append(f"About {int(pa)} people affected (+{pts})")
            break
    vul = tp.vulnerable_flags(row.get("text") or "")
    if vul:
        v = rr["vulnerable_place"]
        pts = min(v["each"] * len(vul), v["cap"]); score += pts; reasons.append(f"Affects {', '.join(vul)} (+{pts})")
    dead = int(_num(row.get("dead")))
    if dead > 0:
        pts = _death_points(score); score += pts; reasons.insert(1, _deaths(dead, pts))
    elif casualty:
        c = rr["pwd_casualty"]
        pts = int(max(c["points"], c["floor"] - score)); score += pts; reasons.insert(1, f"Casualty reported, death or injury not stated (+{pts})")
    return _finish(score, reasons)


def from_category(row: dict[str, Any], ref: Reference, cap_unconfirmed: bool) -> tuple[float, str, str]:
    R = rules()
    rr = R["rules"]
    code = row.get("category_code") or "OTHER"
    c = ref.cat.get(code, ref.cat["OTHER"])
    entry = R["categories"].get(code)
    if entry:
        score, _ = _kind(entry, f"{row.get('title') or ''} {row.get('text') or ''}")
    else:
        score = int(c["base_severity"])
    reasons = [f"{c['label']} (+{score})"]
    if entry and entry.get("chapter_v"):
        pts = rr["chapter_v"]["points"]; score += pts; reasons.append(f"Offence against a woman or child (+{pts})")
    inj = int(_num(row.get("injured")))
    if inj > 0:
        pts = min(rr["injured"]["each"] * inj, rr["injured"]["cap"]); score += pts; reasons.append(f"{inj} injured (+{pts})")
    if _yes(row.get("hazard_flag")):
        pts = rr["hazard_news"]["points"]; score += pts; reasons.append(f"Hazard described (+{pts})")
    vul = row.get("vulnerable_flags") or []
    if isinstance(vul, str):
        vul = [v for v in vul.split("|") if v]
    if vul:
        v = rr["vulnerable_place"]
        pts = min(v["each"] * len(vul), v["cap"]); score += pts; reasons.append(f"Affects {', '.join(vul)} (+{pts})")
    dead = int(_num(row.get("dead")))
    if dead > 0:
        pts = _death_points(score); score += pts; reasons.insert(1, _deaths(dead, pts))
    cap = rr["unconfirmed_cap"]["cap"] if cap_unconfirmed else 100
    if cap_unconfirmed and score > cap:
        reasons.append("Capped at High until a department or officer confirms it")
    return _finish(score, reasons, cap)


# ------------------------------------------------------- whole frames at once --

def _levels(score: np.ndarray) -> np.ndarray:
    return np.select([score >= 70, score >= 50, score >= 30], ["Severe", "High", "Medium"], "Low")


def _col(df: pd.DataFrame, c: str) -> pd.Series:
    return df[c] if c in df.columns else pd.Series(None, index=df.index, dtype=object)


def _text(df: pd.DataFrame, c: str) -> pd.Series:
    return _col(df, c).fillna("").astype(str)


def _nums(df: pd.DataFrame, c: str) -> np.ndarray:
    return pd.to_numeric(_col(df, c), errors="coerce").fillna(0).to_numpy(float)


def _flags(df: pd.DataFrame, c: str) -> np.ndarray:
    s = _col(df, c)
    if s.dtype == object:
        return s.map(_yes).to_numpy(bool)
    return pd.to_numeric(s, errors="coerce").fillna(0).to_numpy(float) != 0


# The text cues are case-insensitive patterns. Matching the lower-cased text with the same pattern compiled without
# IGNORECASE gives the same answer for ASCII and Tamil text and is 4-7 times faster on the grievance file; a text with
# any other letter (where Unicode case folding has its exceptions) is matched with the original pattern.
_EXOTIC = re.compile("[^\\x00-\\x7f\\u0b80-\\u0bff\\u200c\\u200d]")
_UPPER = re.compile("(?<!\\\\)[A-Z]")


@lru_cache(maxsize=None)
def _plain(rx: re.Pattern) -> re.Pattern | None:
    return None if _UPPER.search(rx.pattern) else re.compile(rx.pattern)


def _found(text: pd.Series, rxs: list[re.Pattern]) -> list[np.ndarray]:
    """For each pattern, whether it is found in each text (exactly as rx.search would)."""
    orig = text.tolist()
    low = text.str.lower().tolist()
    exotic = [bool(_EXOTIC.search(x)) for x in orig]
    out = []
    for rx in rxs:
        p = _plain(rx)
        if p is None:
            out.append(np.fromiter((bool(rx.search(o)) for o in orig), bool, len(orig)))
        else:
            out.append(np.fromiter((bool(rx.search(o) if ex else p.search(lo)) for o, lo, ex in zip(orig, low, exotic)), bool, len(orig)))
    return out


def _vul_names(place: pd.Series) -> list[list[str]]:
    hits = list(zip([n for n, _ in tp.VULNERABLE], _found(place, [rx for _, rx in tp.VULNERABLE])))
    return [[n for n, h in hits if h[i]] for i in range(len(place))]


def _join(parts: list[list[str]]) -> list[str]:
    return ["; ".join(p) for p in parts]


def _grievance_frame(df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    sub, cat = _text(df, "subcategory_src"), _text(df, "category_src")
    text = _text(df, "title") + " " + _text(df, "text")
    place = text + " " + _text(df, "_landmark")
    tier: dict[tuple[str, str], tuple[int, str]] = {}
    for c, s in set(zip(cat, sub)):
        if c == "Flood" or tp.HIGH_RISK_SUB.search(s):
            tier[(c, s)] = (35, f"High-risk issue: {s} (+35)")
        elif c in ("Tax and Licence", "Voter ID") or tp.LOW_SUB.search(s):
            tier[(c, s)] = (5, f"Administrative issue: {s} (+5)")
        elif tp.ELEVATED_SUB.search(s):
            tier[(c, s)] = (25, f"Public-safety or sanitation issue: {s} (+25)")
        else:
            tier[(c, s)] = (15, f"Civic issue: {s or c} (+15)")
    base = [tier[k] for k in zip(cat, sub)]
    haz, rep = _found(text, [tp.TEXT_HAZARD, tp.REPEAT])
    vul = _vul_names(place)
    score = np.array([b[0] for b in base], float) + 15 * haz + np.minimum(8 * np.array([len(v) for v in vul]), 24) + 10 * rep
    parts = []
    for (_, lbl), h, v, r in zip(base, haz, vul, rep):
        p = [lbl]
        if h:
            p.append("Describes an immediate hazard (+15)")
        if v:
            p.append(f"Affects {', '.join(v)} (+{min(8 * len(v), 24)})")
        if r:
            p.append("Citizen reports complaining before (+10)")
        parts.append(p)
    return np.minimum(score, 100), _join(parts)


def _police_frame(df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    R = rules()
    rr, lc = R["rules"], R["legal_classes"]
    cat = _text(df, "category_src").replace("", "OTHER")
    text = _text(df, "title") + " " + _text(df, "text")
    n = len(df)
    kind = np.zeros(n)
    klass = np.full(n, "", dtype=object)
    for c in cat.unique():
        e = R["police"].get(c, R["police"]["OTHER"])
        m = (cat == c).to_numpy()
        pts, k = _kind(e, "")
        kind[m], klass[m] = pts, k or ""
        up = e.get("upgrade")
        if up:
            hit = m & text.str.contains(up["_rx"]).to_numpy(bool)
            kind[hit], klass[hit] = lc[up["class"]]["points"], up["class"]
    is_chap = cat.map(lambda c: bool(R["police"].get(c, R["police"]["OTHER"]).get("chapter_v"))).to_numpy(bool)
    chap = is_chap * rr["chapter_v"]["points"]
    inj = _nums(df, "injured").astype(int)
    inj_p = np.where(inj > 0, np.minimum(rr["injured"]["each"] * inj, rr["injured"]["cap"]), 0)
    vul_p = (_flags(df, "_vulnerable_victim") & ~is_chap) * rr["vulnerable_victim"]["points"]
    lift = cat.map(lambda c: R["police"].get(c, R["police"]["OTHER"]).get("weapon_class") or "").to_numpy(object)
    lifted = np.array([bool(l and k and l < k) for l, k in zip(lift, klass)])
    lift_pts = np.array([lc[l]["points"] - lc[k]["points"] if f else 0 for l, k, f in zip(lift, klass, lifted)], float)
    weapon = _flags(df, "_weapon")
    wpn_p = np.where(weapon, np.where(lifted, lift_pts, rr["weapon"]["points"]), 0)
    blk = _nums(df, "blockage_minutes")
    road = _flags(df, "access_blocked") & (blk > rr["road_blocked"]["minutes"])
    road_p = road * rr["road_blocked"]["points"]
    crowd = _nums(df, "crowd_estimate")
    crowd_p = (crowd > rr["crowd"]["people"]) * rr["crowd"]["points"]
    score = kind + chap + inj_p + vul_p + wpn_p + road_p + crowd_p
    dead = _nums(df, "dead").astype(int)
    death_p = np.where(dead > 0, np.maximum(rr["death"]["points"], rr["death"]["floor"] - score), 0)
    score = score + death_p
    parts = []
    for i, c in enumerate(cat):
        p = [f"{c.replace('_', ' ').title()} (+{int(kind[i])})"]
        if dead[i] > 0:
            p.append(_deaths(int(dead[i]), int(death_p[i])))
        if chap[i]:
            p.append(f"Offence against a woman or child (+{int(chap[i])})")
        if inj[i] > 0:
            p.append(f"{inj[i]} injured (+{int(inj_p[i])})")
        if vul_p[i]:
            p.append(f"Vulnerable victim (+{int(vul_p[i])})")
        if weapon[i]:
            p.append(f"Weapon used, hurt by a dangerous weapon (+{int(wpn_p[i])})" if lifted[i] else f"Weapon involved (+{int(wpn_p[i])})")
        if road[i]:
            p.append(f"Road blocked {int(blk[i])} min (+{int(road_p[i])})")
        if crowd_p[i]:
            p.append(f"Crowd of about {int(crowd[i])} (+{int(crowd_p[i])})")
        parts.append(p)
    return np.minimum(score, 100), _join(parts)


def _pwd_frame(df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    R = rules()
    rr = R["rules"]
    t = _text(df, "category_src")
    kind = t.map(lambda x: int(R["pwd"].get(x, R["pwd"]["_other"]))).to_numpy(float)
    # `injured` is the PWD casualty FLAG (loaders/pwd.py), not a count: its own rule below, as in pwd()
    cas = _nums(df, "injured").astype(int) > 0
    sd = _col(df, "service_disruption")
    sd_p = np.select([sd.eq("full").to_numpy(), sd.eq("partial").to_numpy()], [rr["service_full"]["points"], rr["service_partial"]["points"]], 0)
    acc = _flags(df, "access_blocked")
    acc_p = acc * rr["access_blocked"]["points"]
    pa = _nums(df, "persons_affected")
    pa_p = np.select([pa >= rr["people_500"]["people"], pa >= rr["people_100"]["people"]], [rr["people_500"]["points"], rr["people_100"]["points"]], 0)
    vul = _vul_names(_text(df, "text"))
    v = rr["vulnerable_place"]
    vul_p = np.minimum(v["each"] * np.array([len(x) for x in vul]), v["cap"])
    score = kind + sd_p + acc_p + pa_p + vul_p
    dead = _nums(df, "dead").astype(int)
    death_p = np.where(dead > 0, np.maximum(rr["death"]["points"], rr["death"]["floor"] - score), 0)
    c = rr["pwd_casualty"]
    cas_p = np.where((dead <= 0) & cas, np.maximum(c["points"], c["floor"] - score), 0)
    score = score + death_p + cas_p
    parts = []
    sdv = sd.to_numpy(object)
    for i, x in enumerate(t):
        p = [f"{x.replace('_', ' ')} (+{int(kind[i])})"]
        if dead[i] > 0:
            p.append(_deaths(int(dead[i]), int(death_p[i])))
        elif cas[i]:
            p.append(f"Casualty reported, death or injury not stated (+{int(cas_p[i])})")
        if sdv[i] == "full":
            p.append(f"Full service disruption (+{int(sd_p[i])})")
        elif sdv[i] == "partial":
            p.append(f"Partial service disruption (+{int(sd_p[i])})")
        if acc[i]:
            p.append(f"Access blocked (+{int(acc_p[i])})")
        if pa_p[i]:
            p.append(f"About {int(pa[i])} people affected (+{int(pa_p[i])})")
        if vul[i]:
            p.append(f"Affects {', '.join(vul[i])} (+{int(vul_p[i])})")
        parts.append(p)
    return np.minimum(score, 100), _join(parts)


_FRAMES = {grievance: _grievance_frame, police: _police_frame, pwd: _pwd_frame}


def apply(df: pd.DataFrame, fn, *args) -> pd.DataFrame:
    frame = _FRAMES.get(fn)
    if frame is not None and not args and len(df):
        score, reasons = frame(df)
        df["severity_score"] = score.astype(float)
        df["severity_level"] = _levels(score)
        df["severity_reasons"] = reasons
        return df
    res = [fn(r, *args) for r in df.to_dict("records")]
    df["severity_score"] = [r[0] for r in res]
    df["severity_level"] = [r[1] for r in res]
    df["severity_reasons"] = [r[2] for r in res]
    return df


# ------------------------------------------------------ reasons -> points --

_ITEM = re.compile(r"^(?P<what>.*?)\s*\((?P<sign>[+-])(?P<n>\d+(?:\.\d+)?)\)\s*$")
_LEGACY = re.compile(r"^(?P<what>.*?)\s*\((?P<note>[^()]*)\)\s*$")


def _legal_basis(e: dict) -> str:
    """'BNS 74: assault ..., 1 to 5 years; cognizable, non-bailable (band B: punishable with 3 to 7 years)'."""
    lc = rules()["legal_classes"]
    if "class" not in e:
        return f"{e.get('why', 'Not an offence by itself')}: District IQ default"
    cls = f"; {e['bnss']}" if e.get("bnss") else ""
    return (f"{e['law']}: {e['offence'].lower()}, {e['punishment']}{cls} (punishment band {e['class']}, the BNSS First Schedule "
            f"Part II scale applied by District IQ: {lc[e['class']]['words']})")


def _kind_basis(source: str, category_src: str, category_code: str, pts: float | None) -> str:
    R = rules()
    if source == "police":
        e = R["police"].get(category_src or "OTHER", R["police"]["OTHER"])
    elif source == "grievance":
        return "Kind of complaint (sub-category tier 35/25/15/5): District IQ default"
    elif source == "pwd":
        return "PWD incident type: District IQ default"
    elif source == "imd":
        return "IMD district warning colour (yellow, orange, red)"
    elif source == "cpcb":
        return "CPCB air quality index band"
    elif source == "hospital":
        return "Hospital alert level from the hospital feed"
    else:
        e = R["categories"].get(category_code or "")
        if e is None:
            return "Base points of the category: District IQ default"
    up = e.get("upgrade")
    if up and pts is not None and pts == R["legal_classes"][up["class"]]["points"] and "class" in e and pts != R["legal_classes"][e["class"]]["points"]:
        return _legal_basis({**up, "offence": up["offence"]})
    return _legal_basis(e)


def _factor_basis(what: str, source: str) -> str:
    rr = rules()["rules"]
    w = what.lower()
    if re.match(r"^\d+ fatalit|reported dead|casualty reported", w):
        return f"Loss of life: {rr['death']['words']} (District IQ rule)"
    if re.match(r"^\d+ (reported )?injured", w):
        return f"Harm to people: {rr['injured']['words']} (District IQ default)"
    if w.startswith("offence against a woman or child"):
        return f"{rr['chapter_v']['law']}: {rr['chapter_v']['words']}"
    if w.startswith("vulnerable victim"):
        return f"Vulnerable people: {rr['vulnerable_victim']['words']} (District IQ default)"
    if w.startswith("weapon used"):
        return f"{rr['weapon']['law']}: {rr['weapon']['words']}"
    if w.startswith("weapon involved"):
        return "A weapon was used (District IQ default)"
    if w.startswith("road blocked"):
        return f"Essential access: {rr['road_blocked']['words']} (District IQ default)"
    if w.startswith("crowd of about"):
        return f"People affected: {rr['crowd']['words']} (District IQ default)"
    if "service disruption" in w:
        return "Essential service: the service is cut off (full 15, partly 5; District IQ default)"
    if w.startswith("access blocked"):
        return "Essential access: access is blocked (District IQ default)"
    if re.match(r"^about \d+ people affected", w):
        return "People affected: 100 or more 10, 500 or more 15 (District IQ default)"
    if w.startswith("affects "):
        cap = "24" if source == "grievance" else "16"
        return f"Vulnerable people or places: 8 points each, up to {cap} (District IQ default)"
    if w.startswith("describes an immediate hazard") or w.startswith("hazard described"):
        return "Immediate danger described: live wire, open manhole, collapse (District IQ default)"
    if w.startswith("citizen reports complaining before"):
        return "Recurrence: the citizen says it was reported before (District IQ default)"
    if w.startswith("capped at high"):
        return rr["unconfirmed_cap"]["words"].capitalize()
    return "District IQ default"


def points(reasons: Any, source: str = "", category_src: str = "", category_code: str = "") -> list[list]:
    """The stored reasons as [what, points or None, basis] items, the kind of event first. Works on older builds too
    (items without points come back with None)."""
    out: list[list] = []
    items = [s.strip() for s in str(reasons or "").split(";") if s.strip()] if isinstance(reasons, str) else []
    for i, s in enumerate(items):
        m = _ITEM.match(s)
        if m:
            what, pts = m["what"], float(m["n"]) * (-1 if m["sign"] == "-" else 1)
        else:
            lm = _LEGACY.match(s)
            what, pts = (lm["what"] if lm else s), None
        pts_out = int(pts) if pts is not None and float(pts).is_integer() else pts
        basis = _kind_basis(source, category_src, category_code, pts) if i == 0 else _factor_basis(what, source)
        out.append([what, pts_out, basis])
    return out
