"""Where did the event happen? The role of each place a news report names.

A report names places for many reasons: "Odisha worker stabbed to death in Velachery ... admitted to the Government
Royapettah Hospital" names Velachery (where it happened) and Royapettah (the hospital). Taking the most specific or
first place puts the stabbing at Royapettah; "வேளச்சேரி பாணியில் குன்றத்தூர் பள்ளி வேனில் புகை" ("Velachery-style
smoke in a Kundrathur school van") is not about Velachery at all.

So every mention of a gazetteer place gets
  * a role from its context (English and Tamil cues):
      event      "in/at/near X", the Tamil locative (X-இல், X அருகே), an "X:" dateline, X police, X road/lake/bridge
      hospital   "X Government Hospital", "X GH", "admitted to/taken to ... X"
      title      "X MLA", "X assistant commissioner", "Adyar Ananda Bhavan" (a title or a name)
      origin     "native of X", "hailing from X", "a resident of X", Tamil "X-ஐச் சேர்ந்த" (belonging to X)
      style      "X-style", "like X", Tamil "X பாணியில்" (in X's manner), "X போல"
      route      "from X to Y", Tamil "X-இல் இருந்து" (from X)
      list       one of three or more places in a list (power-cut schedules, many areas)
      mention    none of these
  * a probability that it is the event place, from a logistic regression over the role cues and the mention's
    position (headline, first sentence), how often the place is named and how specific it is. The model is trained
    on reference/labels/news_place_labels.csv (hand-labelled reports of this district; `run_pipeline.py news-eval`).

The event place is the place with the highest probability, if that is at least MIN_P; otherwise the report stays at
district level ("Chennai"). Every place and its role is kept (place_roles), so search still finds "Royapettah
hospital" without putting the stabbing on the Royapettah map.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .util import INTEL_DIR, REF_DIR

LABELS = REF_DIR / "labels" / "news_place_labels.csv"
MIN_P = 0.35
ROLES = ["event", "hospital", "origin", "title", "style", "route", "list", "mention"]
NOT_EVENT = {"style", "route", "list", "title"}
SPECIFICITY = {"locality": 1.0, "zone": 0.6, "taluk": 0.6, "district": 0.0}
FEATURES = ["in_title", "title_first", "dateline", "first_sentence", "pos", "count", "spec",
            "cue_event", "cue_ta_loc", "cue_landmark", "cue_police",
            "cue_hospital", "cue_sent", "cue_origin", "cue_title", "cue_style", "cue_route", "cue_list", "only_place"]

_TA = "஀-௿"
# what follows the matched name inside the same Tamil word: its case ending (வேளச்சேரி|யில், பட்டினப்பாக்க|த்தில்)
_TA_TAIL = re.compile(rf"[{_TA}]*")

EN_EVENT_BEFORE = re.compile(r"\b(?:in|at|near|on|off|outside|inside|opposite|behind|around|within|across)\s+(?:the\s+)?$", re.I)
EN_HOSPITAL_AFTER = re.compile(r"^[\s'’s,]*(?:Government\s+|Govt\.?\s+|General\s+|Medical\s+|Super[-\s]speciality\s+)*"
                               r"(?:Hospital|GH|Medical\s+College|Peripheral\s+Hospital|hospital|Institute\s+of\s+Child\s+Health|PHC|UPHC)\b")
EN_HOSPITAL_BEFORE = re.compile(r"\b(?:admitted|taken|rushed|shifted|referred|brought|moved|sent|treated|treatment|died)\b[\w\s,]{0,30}?"
                                r"\b(?:to|at|in)\s+(?:the\s+|a\s+)?(?:(?:government|govt\.?|private)\s+)?(?:hospital\s+(?:in|at)\s+)?$", re.I)
EN_HOSPITAL_WORD_BEFORE = re.compile(r"\b(?:Government|Govt\.?|Kilpauk|Stanley|Rajiv\s+Gandhi)\s+$|\bhospital\s+(?:in|at)\s+$", re.I)
EN_ORIGIN_BEFORE = re.compile(r"\b(?:native\s+of|natives\s+of|hailing\s+from|hails\s+from|resident\s+of|residents\s+of|residing\s+(?:in|at)|"
                              r"living\s+in|lives\s+in|belonging\s+to|belongs\s+to|who\s+lives?\s+in|of)\s+(?:the\s+)?$", re.I)
EN_FROM_BEFORE = re.compile(r"\bfrom\s+(?:the\s+)?$", re.I)
EN_STYLE_AFTER = re.compile(r"^[\s-]*(?:style|like|model|type)\b", re.I)
EN_STYLE_BEFORE = re.compile(r"\b(?:like|similar\s+to|as\s+in|after\s+the|reminiscent\s+of|compared\s+to)\s+(?:the\s+|in\s+)?$", re.I)
EN_TO_AFTER = re.compile(r"^\s*(?:to|-|–|and)\s+[A-Z]", re.S)
EN_LANDMARK_AFTER = re.compile(r"^[\s'’s]*(?:Main\s+Road|High\s+Road|Road|Salai|Street|bypass|flyover|bridge|subway|junction|signal|lake|"
                               r"metro(?:\s+rail)?\s+station|railway\s+station|bus\s+(?:stand|terminus|depot)|market|beach|canal|"
                               r"river|area|locality|neighbourhood)\b", re.I)
EN_POLICE_AFTER = re.compile(r"^[\s'’s]*(?:police|All\s+Women\s+Police|AWPS|traffic\s+police|fire\s+(?:and\s+rescue\s+)?station)\b", re.I)
EN_LIST_NEAR = re.compile(r"^\s*(?:,|and)\s+[A-Z]")

TA_LOCATIVE = re.compile(r"(?:இல்|ில்|ல்|யில்|வில்|த்தில்|ிலும்|யிலும்|லும்)$")
TA_NEAR_AFTER = re.compile(rf"^\s*(?:அருகே|அருகில்|அருகிலுள்ள|அருகில்\s+உள்ள|பகுதியில்|பகுதிகளில்|பகுதி|சாலையில்|மேம்பாலத்தில்|ஏரியில்|"
                           rf"கடற்கரையில்|ரயில்\s*நிலைய|பேருந்து\s*நிலைய|மார்க்கெட்)")
TA_POLICE_AFTER = re.compile(r"^\s*(?:போலீஸ|போலீசார்|காவல்\s*(?:நிலைய|துறை)|காவலர்|தீயணைப்பு)")
TA_HOSPITAL_AFTER = re.compile(r"^\s*(?:அரசு\s+)?(?:பொது\s+)?(?:மருத்துவமனை|மருத்துவக்\s*கல்லூரி|ஆஸ்பத்திரி)")
TA_HOSPITAL_TAIL = re.compile(r"மருத்துவமனை")
# taken to a hospital (not where it happened): "மருத்துவமனைக்கு" (to the hospital), "... அனுமதி" (admitted)
TA_SENT_AFTER = re.compile(r"^\s*(?:அரசு\s+)?(?:பொது\s+)?(?:மருத்துவமனை|மருத்துவக்\s*கல்லூரி\s*மருத்துவமனை)(?:க்கு|க்குக்|யில்\s+(?:அனுமதி|சேர்க்க|சிகிச்சை))")
TA_ORIGIN_AFTER = re.compile(r"^\s*(?:ச்\s*)?(?:சேர்ந்த|சேர்ந்தவர்|வசிக்கும்|வசித்து|வசித்த|வாசி)")
# a bare place name before a person noun: "ஆழ்வார்பேட்டை வாலிபர் பலி" (an Alwarpet youth killed)
TA_PERSON_AFTER = re.compile(r"^\s*(?:வாலிபர்|இளைஞர்|மாணவர்|மாணவி|சிறுவன்|சிறுமி|முதியவர்|மூதாட்டி|தொழிலாளி)")
TA_STYLE_AFTER = re.compile(r"^\s*(?:பாணியில்|பாணி|போல|போன்று|போன்ற|மாதிரி)")
# a corridor or route, possibly with a place outside the list: "Pallavaram-Thoraipakkam Radial Road",
# "Poonamallee - Vadapalani Metro", "வடபழனி - பூந்தமல்லி மெட்ரோ", "கிண்டி டூ செங்கல்பட்டு" (Guindy to Chengalpattu)
_W = rf"[A-Za-z{_TA}.]{{3,}}"
CORRIDOR = re.compile(r"\b(?:metro|corridor|stretch|road|highway|flyover|route|rail|train|express|bus|line|bridge)\b|"
                      r"இடையே|மெட்ரோ|வழித்தட|சாலை|ரயில்|ரெயில்|மேம்பால|பாலம்|பேருந்து|எக்ஸ்பிரஸ்", re.I)
TIGHT_BEFORE = re.compile(rf"{_W}[-–]$")
TIGHT_AFTER = re.compile(rf"^[-–]{_W}")
SPACED_BEFORE = re.compile(rf"({_W})\s+[-–]\s+$")
SPACED_AFTER = re.compile(rf"^\s+[-–]\s+({_W})(.{{0,30}})", re.S)
TO_BEFORE = re.compile(rf"(?:{_W}\s+(?:to|டூ)|\bbetween)\s+$", re.I)
TO_AFTER = re.compile(rf"^\s+(?:to|டூ)\s+[A-Z{_TA}]")


def _route(before: str, after: str) -> bool:
    """`before` ends at the mention; `after` starts after its Tamil case ending."""
    if TIGHT_BEFORE.search(before) or TIGHT_AFTER.match(after) or TO_BEFORE.search(before) or TO_AFTER.match(after):
        return True
    b = SPACED_BEFORE.search(before)
    if b and not CORRIDOR.match(b.group(1)) and CORRIDOR.search(after[:30]):
        return True
    a = SPACED_AFTER.match(after)
    return bool(a and not CORRIDOR.match(a.group(1)) and CORRIDOR.search(a.group(2)))


# the place is part of a title or a name, not where something happened: "Kolathur MLA", "Koyambedu assistant
# commissioner", "Adyar Ananda Bhavan", "Chepauk Super Gillies"
DESCRIPTOR_AFTER = re.compile(r"^\s*(?:MLA|M\.L\.A|MP\b|councillor|assistant\s+commissioner|deputy\s+commissioner|Ananda\s+Bhavan|"
                              r"Super\s+(?:Gillies|Kings)|(?:தவெக|திமுக|அதிமுக|பாஜக|காங்கிரஸ்)?\s*(?:எம்\.?\s*எல்\.?\s*ஏ|எம்எல்ஏ)|கவுன்சிலர்|உதவி\s+ஆணையர்|துணை\s+ஆணையர்)",
                              re.I)
TA_FROM_AFTER = re.compile(r"^\s*(?:இருந்து|முதல்)")
TA_FROM_TAIL = re.compile(r"(?:இலிருந்து|ிலிருந்து|லிருந்து|யிலிருந்து|இல்\s*இருந்து)$")


@dataclass
class Scored:
    name: str
    category: str
    lat: float | None
    lon: float | None
    role: str
    p: float


def _sentence_bounds(text: str, start: int, end: int) -> tuple[str, str]:
    """Text before and after a mention within its sentence (at most 80 characters each way)."""
    lo = max(0, start - 80)
    before = text[lo:start]
    cut = max(before.rfind(". "), before.rfind("| "), before.rfind("\n"), before.rfind("! "), before.rfind("? "))
    if cut >= 0:
        before = before[cut + 2:]
    after = text[end:end + 80]
    m = re.search(r"\.\s|\|\s|\n|!\s|\?\s", after)
    if m:
        after = after[:m.start()]
    return before, after


_LIST_GAP = re.compile(r"^[\s,;/&]*(?:and|மற்றும்)?[\s,;/&]*$", re.I)
_ROUTE_GAP = re.compile(r"^\s*(?:-|–|to|முதல்)\s*$", re.I)


def _joined(text: str, m1, m2) -> str:
    """How two neighbouring mentions are joined: "list" ("Velachery, Porur and Adyar"), "route" ("Velachery-Madipakkam",
    "Koyambedu to Tambaram") or "" (apart)."""
    if m1.place.name == m2.place.name:
        return ""
    gap = text[m1.end:m2.start]
    if len(gap) > 14:
        return ""
    gap = re.sub(rf"^[{_TA}]+", "", gap)  # the first name's Tamil case ending
    if _ROUTE_GAP.match(gap):
        return "route"
    if gap.strip() and _LIST_GAP.match(gap) or gap.strip() == "":
        return "list" if gap.strip() else ""
    return ""


def mention_rows(text: str, title_len: int, mentions: list) -> list[dict]:
    """One feature row per mention of a non-district place (role cues, position, count)."""
    named = [m for m in mentions if m.place.category != "district"]
    if not named:
        return []
    counts: dict[str, int] = {}
    for m in named:
        counts[m.place.name] = counts.get(m.place.name, 0) + 1
    first_title = next((m for m in named if m.start < title_len), None)
    first_stop = text.find(". ", title_len + 2)
    first_sentence_end = first_stop if first_stop > 0 else len(text)
    rows = []
    for k, m in enumerate(named):
        before, after = _sentence_bounds(text, m.start, m.end)
        tamil = bool(re.search(f"[{_TA}]", m.matched_text))
        tail = _TA_TAIL.match(text, m.end).group(0) if tamil else ""
        word = m.matched_text + tail
        after_word = text[m.end + len(tail):m.end + len(tail) + 60]
        joined = _joined(text, named[k - 1], m) if k else ""
        joined_next = _joined(text, m, named[k + 1]) if k + 1 < len(named) else ""
        in_list = "list" in (joined, joined_next)
        in_pair_route = "route" in (joined, joined_next)
        r = {
            "name": m.place.name, "category": m.place.category, "lat": m.place.latitude, "lon": m.place.longitude,
            "start": m.start,
            "in_title": int(m.start < title_len),
            "title_first": int(first_title is not None and m is first_title),
            "dateline": int(m.start < title_len and bool(re.match(r"^\s*[:|,–-]", text[m.end + len(tail):m.end + len(tail) + 3]))
                            and m.start <= 2),
            "first_sentence": int(m.start < first_sentence_end),
            "pos": min(1.0, m.start / 1500.0),
            "count": min(4, counts[m.place.name]) / 4.0,
            "spec": SPECIFICITY.get(m.place.category, 0.0),
            "cue_event": int(bool(EN_EVENT_BEFORE.search(before))),
            "cue_ta_loc": int(tamil and (bool(TA_LOCATIVE.search(word)) and not TA_FROM_TAIL.search(word)
                                         or bool(TA_NEAR_AFTER.match(after_word)))),
            "cue_landmark": int(bool(EN_LANDMARK_AFTER.match(after)) or (tamil and bool(re.match(r"^\s*(?:சாலை|மேம்பால|ஏரி|கடற்கரை)", after_word)))),
            "cue_police": int(bool(EN_POLICE_AFTER.match(after)) or (tamil and bool(TA_POLICE_AFTER.match(after_word)))),
            # the place names a hospital ("Kilpauk Government Hospital": the event may well be there) ...
            "cue_hospital": int(bool(EN_HOSPITAL_AFTER.match(after)) or bool(EN_HOSPITAL_WORD_BEFORE.search(before))
                                or (tamil and (bool(TA_HOSPITAL_AFTER.match(after_word)) or bool(TA_HOSPITAL_TAIL.search(word))))),
            # ... or someone was taken there ("body sent to the Royapettah GH", "admitted to"): not where it happened
            "cue_sent": int(bool(EN_HOSPITAL_BEFORE.search(before)) or (tamil and bool(TA_SENT_AFTER.match(after_word)))),
            "cue_origin": int(bool(EN_ORIGIN_BEFORE.search(before)) or (tamil and bool(TA_ORIGIN_AFTER.match(after_word)))
                              or (tamil and bool(TA_PERSON_AFTER.match(after_word)) and not TA_LOCATIVE.search(word))),
            # part of a title or a name: "Kolathur MLA", "Koyambedu assistant commissioner", "Adyar Ananda Bhavan"
            "cue_title": int(bool(DESCRIPTOR_AFTER.match(after if not tamil else after_word)) and not TA_LOCATIVE.search(word)),
            "cue_style": int(bool(EN_STYLE_AFTER.match(after)) or bool(EN_STYLE_BEFORE.search(before)) or (tamil and bool(TA_STYLE_AFTER.match(after_word)))),
            "cue_route": int(in_pair_route or _route(text[max(0, m.start - 60):m.start], text[m.end + len(tail):m.end + len(tail) + 60])
                             or bool(EN_FROM_BEFORE.search(before)) and bool(EN_TO_AFTER.match(after))
                             or (tamil and (bool(TA_FROM_AFTER.match(after_word)) or bool(TA_FROM_TAIL.search(word))))),
            "cue_list": int(in_list),
            "only_place": int(len(counts) == 1),
        }
        rows.append(r)
    return rows


def role_of(r: dict) -> str:
    """The mention's role from its cues (the most telling one wins)."""
    if r["cue_hospital"] and not (r["cue_event"] or r["cue_ta_loc"] or r["in_title"]):
        return "hospital"
    for cue, role in (("cue_sent", "hospital"), ("cue_title", "title"), ("cue_style", "style"), ("cue_origin", "origin"), ("cue_route", "route"),
                      ("cue_list", "list")):
        if r[cue]:
            return role
    if r["cue_event"] or r["cue_ta_loc"] or r["dateline"] or r["cue_landmark"] or r["cue_police"]:
        return "event"
    return "mention"


# ------------------------------------------------------------------ model --

# Before any labels exist: hand-set weights in the same form as the trained model (events up, other roles down).
PRIOR = {"in_title": 1.2, "title_first": 0.8, "dateline": 1.0, "first_sentence": 0.4, "pos": -0.6, "count": 0.6, "spec": 0.5,
         "cue_event": 1.4, "cue_ta_loc": 1.2, "cue_landmark": 0.6, "cue_police": 0.6,
         "cue_hospital": -0.8, "cue_sent": -2.5, "cue_origin": -2.0, "cue_title": -2.5, "cue_style": -3.0, "cue_route": -2.5, "cue_list": -2.0, "only_place": 0.5}
PRIOR_BIAS = -1.6


@dataclass
class RoleModel:
    coef: np.ndarray
    intercept: float
    mean: np.ndarray
    scale: np.ndarray

    def prob(self, X: np.ndarray) -> np.ndarray:
        return 1 / (1 + np.exp(-(((X - self.mean) / self.scale) @ self.coef + self.intercept)))


def prior_model() -> RoleModel:
    return RoleModel(np.array([PRIOR[f] for f in FEATURES]), PRIOR_BIAS, np.zeros(len(FEATURES)), np.ones(len(FEATURES)))


def fit(rows: pd.DataFrame, y: np.ndarray, C: float = 1.0) -> RoleModel:
    from sklearn.linear_model import LogisticRegression
    X = rows[FEATURES].to_numpy(dtype=float)
    mean, scale = X.mean(axis=0), X.std(axis=0)
    scale[scale == 0] = 1.0
    lr = LogisticRegression(C=C, max_iter=2000).fit((X - mean) / scale, y)
    return RoleModel(lr.coef_[0], float(lr.intercept_[0]), mean, scale)


def load_labels(path: Path = LABELS) -> pd.DataFrame:
    """doc_id -> the event place's gazetteer name, or NONE (no district place / only "Chennai" / many areas)."""
    if not path.exists():
        return pd.DataFrame(columns=["doc_id", "event_place"])
    lab = pd.read_csv(path, encoding="utf-8-sig", dtype=str).fillna("")
    return lab[lab["event_place"].str.strip() != ""][["doc_id", "event_place"]]


def training_rows(docs: list[tuple[str, str, int, list]], lab: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray, list[str]]:
    """Mention rows of labelled reports, y = the mention names the labelled event place; plus each row's doc_id."""
    gold = dict(zip(lab["doc_id"], lab["event_place"]))
    rows, y, ids = [], [], []
    for doc_id, text, tlen, mentions in docs:
        if doc_id not in gold:
            continue
        for r in mention_rows(text, tlen, mentions):
            rows.append(r)
            y.append(int(r["name"] == gold[doc_id]))
            ids.append(doc_id)
    return pd.DataFrame(rows, columns=["name"] + FEATURES), np.array(y, int), ids


def decide(rows: list[dict], model: RoleModel) -> tuple[Scored | None, list[Scored]]:
    """The event place (None: stays at district level) and every place with its role and probability."""
    if not rows:
        return None, []
    X = np.array([[r[f] for f in FEATURES] for r in rows], dtype=float)
    p = model.prob(X)
    best: dict[str, Scored] = {}
    for r, v in zip(rows, p):
        role = role_of(r)
        s = best.get(r["name"])
        if s is None or v > s.p:
            # a place keeps its strongest mention; its role is that mention's role
            best[r["name"]] = Scored(r["name"], r["category"], r["lat"], r["lon"], role, float(v))
    places = sorted(best.values(), key=lambda s: -s.p)
    # a corridor end, one of a list of areas or a comparison is never where the event happened
    able = [x for x in places if x.role not in NOT_EVENT]
    top = able[0] if able else None
    return (top if top is not None and top.p >= MIN_P else None), places


def roles_json(places: list[Scored], event: Scored | None) -> str | None:
    if not places:
        return None
    return json.dumps([{"place": s.name, "role": "event" if event is not None and s.name == event.name else
                        ("mention" if s.role == "event" else s.role), "p": round(s.p, 3)} for s in places], ensure_ascii=False)


MODEL_FILE = INTEL_DIR / "output" / "models" / "place_role.json"


def model_for(docs: list[tuple[str, str, int, list]], path: Path = MODEL_FILE) -> tuple[RoleModel, str]:
    """The role model for this build: trained on the labelled reports in it (and saved), else the last saved model
    (labels age out of the build's window), else the hand-set prior. docs: (doc_id, text, title length, mentions)."""
    rows, y, ids = training_rows(docs, load_labels())
    if len(rows) >= 50 and len(set(y.tolist())) == 2:
        m = fit(rows, y)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"features": FEATURES, "coef": m.coef.tolist(), "intercept": m.intercept,
                                        "mean": m.mean.tolist(), "scale": m.scale.tolist(), "rows": len(rows)}), encoding="utf-8")
        except OSError:
            pass
        return m, f"trained on {len(set(ids))} labelled reports"
    try:
        j = json.loads(path.read_text(encoding="utf-8"))
        if j.get("features") == FEATURES:
            return RoleModel(np.array(j["coef"]), float(j["intercept"]), np.array(j["mean"]), np.array(j["scale"])), "saved"
    except (OSError, ValueError, KeyError):
        pass
    return prior_model(), "prior"
