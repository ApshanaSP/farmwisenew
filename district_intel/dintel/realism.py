"""Natural wording for the simulated police and PWD records.

The police generator writes every report from a handful of sentence templates ("Chain snatched from pedestrian near
X", "Traffic was held up for about 165 minutes"), so 12,000 reports read like one report repeated, and the PWD titles
were built here as "<Incident type>, <place>". Real station and control-room text is short, uneven and written in
the register of whoever logged it.

This rewrites the wording only. Every fact stays as the source wrote it: category, place, time, counts, status and
ids are untouched, and the description keeps the generator's sentence (only rounded and re-styled), so nothing
downstream that counts or matches records changes. Each choice is taken from a hash of the record id, so a record
reads the same in every build and on every machine, and no model or network is needed.

What varies, police:
  * title: about half come from a per-category phrasebook (outcome from the injured/death counts), the rest keep the
    generator's title
  * how it was logged: a channel prefix (112 call, complainant's statement, patrol, forwarded grievance, media)
  * the follow-up a station adds (hospital, BNS section, CSR, 1930 cyber helpline, AWPS ...), only where the record's
    own facts allow it (no "body sent for post-mortem" without a death)
  * numbers as people write them: long durations in hours, crowds rounded; some times in "hrs" style; common
    abbreviations (Rd, PS)
PWD: the title from a per-type phrasebook (the descriptions are already varied).
"""
from __future__ import annotations

import hashlib
import re

import numpy as np
import pandas as pd

from . import textproc as tp


def _h(key: str) -> int:
    return int.from_bytes(hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest(), "big")


def _pick(key: str, options: list[str]) -> str:
    return options[_h(key) % len(options)]


def _chance(key: str, p: float) -> bool:
    return (_h(key) % 10_000) < p * 10_000


def _int(v) -> int:
    try:
        return 0 if v is None or pd.isna(v) else int(v)
    except (TypeError, ValueError):
        return 0


WORDS = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five"}


def _count(n: int) -> str:
    return WORDS.get(n, str(n))


# Government hospitals by latitude band (north, central, south Chennai): where the injured and the dead are taken.
GH = [(13.10, ["Government Stanley Hospital", "Government Peripheral Hospital, Periyar Nagar"]),
      (13.05, ["Rajiv Gandhi Government General Hospital", "Government Kilpauk Medical College Hospital",
               "Government Omandurar Medical College Hospital"]),
      (-90.0, ["Government Royapettah Hospital", "Government Peripheral Hospital, K.K. Nagar"])]


def _gh(key: str, lat) -> str:
    lat = float(lat) if lat is not None and not pd.isna(lat) else 13.06
    for floor, names in GH:
        if lat >= floor:
            return _pick(key + "gh", names)
    return GH[-1][1][0]


# ------------------------------------------------------------------- police --

PREFIX = {
    "control_room_112": ["112 call: ", "Control room: caller reported that ", "Call on 112. ", "Control room msg - "],
    "fir_walk_in": ["Complainant stated that ", "As per the complaint, ", "FIR registered on complaint. ", "Petition received. "],
    "patrol": ["Patrol team reported that ", "Beat patrol: ", "On patrol, police found that ", "Patrol vehicle: "],
    "citizen_grievance": ["Forwarded from GCC grievance cell: ", "Public grievance forwarded. ", "Grievance received via portal: "],
    "media": ["Taken up from a news report: ", "As reported in the media, ", "Media report: "],
}

# (needs, sentence): needs is a fact the record must have; "{gh}" is the nearest government hospital
FOLLOW: dict[str, list[tuple[str, str]]] = {
    "ROAD_ACCIDENT": [("hurt", "Injured admitted to {gh}."), ("hurt", "Injured shifted to {gh} in a 108 ambulance."),
                      ("dead", "Body sent to {gh} for post-mortem."), ("dead", "Case registered under Sec 106(1) BNS."),
                      ("", "Traffic Investigation Wing informed."), ("", "CCTV footage from nearby shops being checked."),
                      ("", "Vehicles moved to the station."), ("", "Traffic cleared after the vehicles were removed.")],
    "THEFT_BURGLARY": [("house", "Fingerprint experts visited the spot."), ("house", "Special team formed to trace the accused."),
                       ("", "CCTV footage from the area is being checked."), ("", "Case registered under Sec 303(2) BNS."),
                       ("", "Complaint received; enquiry on."), ("closed", "CSR issued to the complainant.")],
    "TRAFFIC_OBSTRUCTION": [("", "Traffic personnel deployed to clear the stretch."), ("parking", "Vehicles towed away."),
                            ("", "Diversion arranged via nearby roads."), ("closed", "Cleared by local traffic police.")],
    "CYBER_FRAUD": [("", "Complaint also registered on the 1930 cyber helpline."), ("", "Bank asked to freeze the beneficiary account."),
                    ("", "Case taken up by the Cyber Crime Wing."), ("", "Case registered under Sec 318(4) BNS and IT Act Sec 66D.")],
    "PUBLIC_NUISANCE": [("", "Patrol vehicle sent to the spot."), ("", "Organisers warned."), ("", "Petition received; enquiry on."),
                        ("closed", "Settled at the spot.")],
    "ASSAULT": [("hurt", "Injured treated at {gh}."), ("", "Case registered under Sec 115(2) BNS."),
                ("", "Accused identified; search on."), ("", "Both parties summoned for enquiry.")],
    "CHAIN_SNATCHING": [("", "CCTV footage being analysed to trace the bike."), ("", "Case registered under Sec 304 BNS."),
                        ("", "Special team formed to trace the snatchers."), ("", "Victim could not note the vehicle number.")],
    "MISSING_PERSON": [("", "Photo shared with all stations."), ("", "Missing person case registered."),
                       ("", "Search on with the help of CCTV footage."), ("", "Details circulated to nearby stations and railway police.")],
    "PROTEST_LAW_AND_ORDER": [("", "Additional police deployed."), ("closed", "Protesters dispersed after talks with officials."),
                              ("", "Traffic diverted during the agitation."), ("closed", "Agitators detained and later released.")],
    "CRIMES_AGAINST_WOMEN": [("", "Case taken up by the All Women Police Station."), ("", "Complaint registered; woman counselled."),
                             ("", "Accused summoned for enquiry."), ("hurt", "Victim sent for medical examination.")],
    "DRUGS_ILLICIT_LIQUOR": [("", "Accused arrested; contraband seized."), ("narcotic", "Case registered under the NDPS Act."),
                             ("liquor", "Case booked under the Tamil Nadu Prohibition Act."), ("", "Seized items handed over to the station.")],
    "WEATHER_EMERGENCY": [("", "Fire and Rescue Services alerted."), ("", "GCC informed for clearance."), ("", "Area barricaded."),
                          ("stranded", "Residents shifted to a relief centre.")],
    "MURDER": [("dead", "Body sent to {gh} for post-mortem."), ("", "Case registered under Sec 103 BNS."),
               ("", "Special teams formed to nab the accused."), ("", "Senior officers visited the spot.")],
    "OTHER": [("", "Attended by patrol."), ("", "GCC informed."), ("", "Area made safe.")],
}

_HOUSE = re.compile(r"\b(house|home|door|lock|jewell?ery|cash|shop)\b", re.I)
_NARC = re.compile(r"\b(ganja|narcotic|drug|tablet|methamphetamine|heroin|cocaine)\b", re.I)
_LIQ = re.compile(r"\b(liquor|arrack|alcohol|ipl)\b", re.I)
_STRAND = re.compile(r"\b(stranded|marooned|residents)\b", re.I)
_TIME = re.compile(r"\baround (\d{1,2})\.(\d{2}) (am|pm)\b")
_MIN = re.compile(r"\b(?:for )?about (\d+) minutes\b")
_CROWD = re.compile(r"\b(roughly|around|about|estimated at) (\d{3,})\b", re.I)


def _hours(n: int, key: str) -> str:
    h, m = divmod(n, 60)
    if h == 1 and m < 20:
        return _pick(key, ["for over an hour", "for more than an hour"])
    if m >= 40:
        return f"for nearly {_count(h + 1).lower()} hours"
    word = _count(h).lower() if h > 1 else "an"
    return f"for {'over ' if m >= 10 else 'about '}{word} hour{'s' if h > 1 else ''}"


def _humanise(text: str, key: str) -> str:
    text = _MIN.sub(lambda m: _hours(int(m.group(1)), key) if int(m.group(1)) >= 60 else m.group(0), text)
    text = _CROWD.sub(lambda m: f"{m.group(1)} {int(round(int(m.group(2)) / 50.0) * 50)}", text)
    if _chance(key + "hrs", 0.3):  # station diaries write 24-hour time
        def hrs(m):
            h = int(m.group(1)) % 12 + (12 if m.group(3) == "pm" else 0)
            return f"at about {h:02d}:{m.group(2)} hrs"
        text = _TIME.sub(hrs, text, count=1)
    text = re.sub(r"(\d)(St|Nd|Rd|Th)\b", lambda m: m.group(1) + m.group(2).lower(), text)  # "6Th Cross" -> "6th Cross"
    if _chance(key + "abbr", 0.2):
        text = re.sub(r"\bRoad\b", "Rd", text)
        text = re.sub(r"\bPolice Station\b", "PS", text)
    return text


def _outcome(dead: int, inj: int) -> str:
    return "dead" if dead > 0 else "hurt" if inj > 0 else "none"


# Titles by category and sub-type. A rule applies when its pattern is found in the report; the first rule that fits is
# used, and only templates whose slots the report can fill are drawn. Slots: {place} locality, {lm} landmark (or the
# locality), {who} the person, {veh} vehicle, {rs} amount, {sov} sovereigns, {qty} quantity, {grp} who protested,
# {dead_w}/{inj}/{inj_w}/{lives} from the death and injury counts; a "_c" suffix capitalises. A template starting with
# "!dead ", "!hurt " or "!none " is used only for that outcome.
POLICE_RULES: dict[str, list[tuple[str, list[str]]]] = {
    "ROAD_ACCIDENT": [
        (r"pedestrian|knocked down", ["!dead Pedestrian killed by speeding vehicle near {lm}", "!dead {place}: pedestrian mowed down",
                                      "!hurt Pedestrian hit by vehicle near {lm}", "!hurt {place}: pedestrian injured while crossing road",
                                      "Vehicle hits pedestrian at {place}", "!none Pedestrian escapes unhurt after vehicle brushes past, {place}"]),
        (r"skid|fell|lost control|toppled|swerved", ["!dead Two-wheeler rider dies after skid at {place}", "!hurt Biker skids, injured near {lm}", "!hurt {place}: rider hurt after bike skids", "!hurt Two-wheeler skids near {lm}; rider injured",
                                                     "!hurt {veh_c} topples at {place}; {inj} hurt", "{veh_c} skids near {lm}",
                                                     "!none Rider escapes with bruises after skid at {place}"]),
        (r"", ["!dead {veh_c} accident kills {dead_w} at {place}", "!dead Fatal crash near {lm}", "!dead {place}: road accident claims {lives}",
               "!hurt {inj_w} injured as {veh} crashes near {lm}", "!hurt Collision at {place} leaves {inj} injured",
               "!hurt {veh_c} involved in crash at {lm}", "!none Vehicles collide at {place}, no one hurt", "!none Minor collision near {lm}",
               "{veh_c} accident reported at {place}"]),
    ],
    "THEFT_BURGLARY": [
        (r"phone|mobile", ["Phone stolen from commuter at {lm}", "{place}: mobile phone lifted in crowd", "Mobile theft near {lm}",
                           "Commuter loses phone at {place}"]),
        (r"motorcycle|two-wheeler|bike|scooter", ["Two-wheeler stolen at {place}", "{place}: parked bike goes missing",
                                                  "Motorcycle theft reported near {lm}", "Bike stolen from outside house, {place}"]),
        (r"shop|store|godown", ["Shop burgled at {place}", "{place}: cash stolen from shop", "Break-in at store near {lm}"]),
        (r"broke into|break-in|burglary|lock", ["House burgled at {place}", "{place}: lock broken, valuables stolen", "Burglary near {lm}", "Locked house targeted at {place}", "{place}: jewels and cash stolen from house",
                                                "Thieves break into house at {place}"]),
        (r"", ["Theft reported at {place}", "{place}: theft complaint", "Valuables stolen near {lm}"]),
    ],
    "TRAFFIC_OBSTRUCTION": [
        (r"park", ["Illegal parking chokes {lm}", "{place}: parked vehicles block road", "Parking mess near {lm} slows traffic", "Double parking on {lm} holds up vehicles", "{place}: vehicles parked on both sides narrow the road", "No-parking violations jam {lm}"]),
        (r"signal", ["Signal failure at {lm} causes snarl", "{place}: traffic signal down, vehicles pile up", "Signal snag at {lm}; police regulate traffic manually"]),
        (r"broke down|stalled|breakdown", ["{veh_c} breakdown blocks {lm}", "{place}: stalled {veh} holds up traffic",
                                           "Broken-down {veh} causes snarl near {lm}"]),
        (r"", ["Traffic snarl near {lm}", "{place}: traffic held up", "Congestion on {lm} stretch"]),
    ],
    "CYBER_FRAUD": [
        (r"\bqr\b", ["Fake QR code fraud: {place} seller loses {rs}", "{place}: QR code scam costs {rs}", "QR code fraud complaint, {place}"]),
        (r"part-time|work-from-home|job|task", ["Part-time job scam: {place} resident loses {rs}", "{place}: online job offer turns into {rs} fraud",
                                                "Task-based job fraud reported, {place}"]),
        (r"investigator|arrest|customs|courier", ["'Digital arrest' scam: {place} resident loses {rs}", "{place}: fake officials extort {rs}",
                                                  "Impersonation fraud complaint from {place}"]),
        (r"bank|kyc|card|otp", ["Bank KYC fraud: {rs} lost, {place}", "{place}: fake bank call costs resident {rs}", "OTP fraud complaint, {place}"]),
        (r"", ["Online fraud: {place} resident loses {rs}", "Cyber fraud complaint from {place}", "{place}: {rs} lost to online cheats"]),
    ],
    "PUBLIC_NUISANCE": [
        (r"loudspeaker|noise|music", ["Loudspeaker nuisance at {lm}", "{place}: residents complain of noise late at night", "Noise complaint near {lm}", "Late-night loudspeakers near {lm} draw complaint", "{place}: function plays music past permitted hours"]),
        (r"drunk|intoxicated|drinking", ["Drunk men create ruckus at {lm}", "{place}: public drinking complaint", "Ruckus by drunk men, {place}", "Residents object to open drinking near {lm}", "{place}: intoxicated men pick fights with passers-by"]),
        (r"", ["Crowd causes nuisance at {lm}", "{place}: public nuisance complaint", "Nuisance reported near {lm}"]),
    ],
    "ASSAULT": [
        (r"driver|motorist|road-rage|vehicles", ["Road rage at {place}: motorist attacked", "!hurt Motorist assaulted near {lm}, {inj} hurt",
                                                 "{place}: drivers come to blows"]),
        (r"group|gang|rival|youths", ["Group clash at {place}", "!hurt Youths attacked near {lm}; {inj} injured", "{place}: gang attacks youths"]),
        (r"famil|neighbour|water|dispute|quarrel", ["Neighbours clash at {place}", "!hurt Family dispute turns violent at {place}, {inj} hurt", "Dispute between families ends in fight, {place}", "!hurt {place}: {inj} hurt in clash between neighbours",
                                                   "{place}: quarrel ends in assault"]),
        (r"", ["Assault reported at {place}", "!hurt Person attacked near {lm}", "{place}: assault case registered"]),
    ],
    "CHAIN_SNATCHING": [
        (r"", ["{who_c} loses {sov} chain to snatchers at {place}", "Bike-borne men snatch {sov} chain from {who} near {lm}",
               "{place}: {sov} gold chain snatched", "Chain snatched from {who} near {lm}", "{sov} chain snatched at {place}"]),
    ],
    "MISSING_PERSON": [
        (r"", ["{who_c} missing from {place}", "{place}: family searching for missing {who}", "Missing: {who} from {place}",
               "{who_c} goes missing near {lm}"]),
    ],
    "PROTEST_LAW_AND_ORDER": [
        (r"stone|pelting", ["Stone pelting at {place}", "{place}: stones thrown during protest", "Tension at {lm} after stone pelting"]),
        (r"clash", ["Clash during agitation at {place}", "{place}: protesters clash with police", "Agitation turns violent near {lm}"]),
        (r"roko|blockade", ["{grp_c} stage road roko at {place}", "Road roko over {issue} at {place}", "{place}: {grp} block road over {issue}",
                            "Road roko near {lm}", "{place}: road blocked by protesters"]),
        (r"", ["{grp_c} protest at {place}", "{grp_c} protest over {issue} at {place}", "Protest over {issue} near {lm}",
               "{place}: {grp} demand action on {issue}", "{place}: agitation by {grp}", "Demonstration near {lm}"]),
    ],
    "CRIMES_AGAINST_WOMEN": [
        (r"domestic|beaten at home|husband", ["Domestic violence complaint, {place}", "{place}: woman beaten at home",
                                              "Woman alleges abuse at home, {place}"]),
        (r"stalk", ["Woman stalked near {lm}", "{place}: stalking complaint", "Stalker harasses woman, {place}"]),
        (r"\bbus\b|train|crowded", ["Woman harassed on crowded bus, {place}", "{place}: harassment during commute"]),
        (r"", ["Woman harassed at {place}", "{place}: harassment complaint by woman", "Harassment of woman near {lm}"]),
    ],
    "DRUGS_ILLICIT_LIQUOR": [
        (r"ganja", ["{qty} ganja seized at {place}", "{place}: ganja peddler held with {qty}", "Ganja haul near {lm}"]),
        (r"liquor|arrack", ["Illicit liquor sale busted at {place}", "{place}: {qty} of liquor seized", "Liquor seized near {lm}"]),
        (r"tablet|narcotic", ["Narcotic tablets seized at {place}", "{place}: drug tablet racket busted"]),
        (r"", ["Contraband seized at {place}", "Raid near {lm}"]),
    ],
    "WEATHER_EMERGENCY": [
        (r"tree", ["Tree falls across road at {place}", "{place}: uprooted tree blocks road", "Tree crashes near {lm}"]),
        (r"wire|electr|shock", ["Live wire mishap at {place}", "{place}: electrocution risk after rain", "Snapped wire hazard near {lm}"]),
        (r"wall|building|collapse", ["Wall collapses after rain at {place}", "{place}: portion of old structure gives way",
                                     "Rain-hit wall caves in near {lm}"]),
        (r"flood|stranded|inundat|water", ["Families stranded by flooding at {place}", "{place}: inundation strands residents",
                                           "Floodwater traps residents near {lm}"]),
        (r"", ["Weather emergency at {place}", "{place}: rain-related emergency"]),
    ],
    "MURDER": [
        (r"body", ["Body found at {place}; murder case registered", "{place}: man found dead, murder suspected"]),
        (r"gang|armed", ["Gang hacks man to death at {place}", "{place}: armed gang kills man", "Murder near {lm} over old enmity"]),
        (r"", ["Murder at {place}", "{place}: quarrel ends in murder", "Man killed near {lm}"]),
    ],
}

_LM = re.compile(r"\b(?:near|on|at|outside) (?:the )?((?:[A-Z0-9][\w.'&-]*)(?: (?:[A-Z0-9(][\w.'&()-]*|of|and))*)")
_WHO = re.compile(r"\b(elderly woman|elderly man|young woman|young man|teenage girl|teenage boy|schoolgirl|schoolboy|college student|"
                  r"woman|man|girl|boy|commuter|resident|shopkeeper)\b", re.I)
_VEH = re.compile(r"\b(MTC bus|container lorry|sand-laden lorry|trailer truck|bus|lorry|truck|tanker|SUV|car|cab|autorickshaw|auto|van|"
                  r"two-wheeler|motorcycle|bike|scooter)\b", re.I)
_RS = re.compile(r"Rs\.? ?[\d,]+(?:\.\d+)?(?: (?:lakh|crore))?")
_SOV = re.compile(r"(\d+)-sovereign")
_QTY = re.compile(r"(\d+(?:\.\d+)?) ?(kg|litres|grams)\b")
_GRP = re.compile(r"\b(party cadres|auto drivers|contract workers|transport workers|sanitary workers|residents|students|traders|"
                  r"fishermen|farmers|activists|parents)\b", re.I)
_ISSUE = re.compile(r"\b(?:over|protesting|demanding|against|on) ((?:[a-z][\w'-]*)(?: [a-z][\w'-]*){1,5})(?=[.;,]|$)")
_SLOT = re.compile(r"\{(\w+)\}")


def details(text: str, place: str) -> dict[str, str]:
    """The particulars a title can name, read from the report's own sentence."""
    d: dict[str, str] = {}
    for m in _LM.finditer(text):
        lm = m.group(1).strip(" .,;")
        if lm and lm != place and not lm[0].isdigit() and len(lm) > 3 and not re.match(r"(?:Rs|BNS|FIR)\b", lm):
            d["lm"] = lm
            break
    if (m := _WHO.search(text)):
        d["who"] = m.group(1).lower()
    if (m := _VEH.search(text)):
        v = m.group(1)
        d["veh"] = v if v.isupper() or v.startswith("MTC") else v.lower()
    if (m := _RS.search(text)):
        d["rs"] = "Rs " + re.sub(r"^Rs\.? ?", "", m.group(0))
    if (m := _SOV.search(text)):
        d["sov"] = f"{m.group(1)}-sovereign"
    if (m := _QTY.search(text)):
        d["qty"] = f"{m.group(1)} {m.group(2)}"
    if (m := _GRP.search(text)):
        d["grp"] = m.group(1).lower()
    if (m := _ISSUE.search(text)):
        d["issue"] = m.group(1).strip()
    return d


def police_title(r: dict) -> str:
    key, cat = str(r["event_id"]), str(r.get("category_src") or "")
    rules = POLICE_RULES.get(cat)
    place = str(r.get("place_text") or "").strip()
    text = str(r.get("text") or "")
    if not rules or not place or not _chance(key + "title", 0.65):
        return r["title"]
    dead, inj = _int(r.get("dead")), _int(r.get("injured"))
    out = _outcome(dead, inj)
    d = {"place": place, "lm": place, "dead_w": _count(dead).lower(), "inj": _count(inj).lower(), "inj_w": _count(inj),
         "lives": "a life" if dead == 1 else f"{dead} lives", **details(text, place)}
    for k in ("veh", "who", "grp"):
        if k in d:
            d[k + "_c"] = d[k][:1].upper() + d[k][1:]
    for pat, templates in rules:
        if pat and not re.search(pat, text, re.I):
            continue
        fit = []
        for t in templates:
            if t.startswith("!"):
                need, body = t.split(" ", 1)
                if need[1:] != out:
                    continue
            else:
                body = t
            if all(sl in d for sl in _SLOT.findall(body)):
                fit.append(body)
        if fit:
            t = _pick(key + "t", fit).format(**d)
            return t[:1].upper() + t[1:]
        break
    return r["title"]


# A sentence that can follow "... reported that": it opens with who did what. A headline-like opening ("Complaint of
# illegal parking ...", "OTP fraud: ...") takes a prefix that ends in ": " or ". " instead.
_CLAUSE = re.compile(r"^(?:A|An|The|Two|Three|Four|Five|Some|Residents|Family|Owner|Commuter|Police|Unidentified|Fraudsters|Callers?|"
                     r"Rider|Pedestrian|Vehicles|Men|Woman|Cattle|Stray|Students|Traders|About|Part)\b")


def _join(prefix: str, text: str, places: frozenset, key: str = "", options: list[str] | None = None) -> str:
    """Prefix + sentence; the sentence's first word is lowercased after "that " or ", " unless it is a name."""
    if prefix.endswith(("that ", ", ")) and not _CLAUSE.match(text):
        plain = [o for o in (options or []) if not o.endswith(("that ", ", "))]
        if not plain:
            return text
        prefix = _pick(key + "p2", plain)
    first = text.split(" ", 1)[0].strip(":,")
    if prefix.endswith(("that ", ", ")) and not text[:2].isupper() and first not in places:
        text = text[0].lower() + text[1:]
    return prefix + text


def police_text(r: dict, places: frozenset = frozenset()) -> str:
    key, cat = str(r["event_id"]), str(r.get("category_src") or "")
    text = _humanise(str(r.get("text") or "").strip(), key)
    if not text:
        return text
    prefixes = PREFIX.get(str(r.get("channel") or ""))
    if prefixes and _chance(key + "pre", 0.55):
        text = _join(_pick(key + "p", prefixes), text, places, key, prefixes)
    dead, inj = _int(r.get("dead")), _int(r.get("injured"))
    closed = str(r.get("status_src") or "").upper() in ("CLOSED", "RESOLVED")
    have = {"": True, "dead": dead > 0, "hurt": inj > 0, "closed": closed, "house": bool(_HOUSE.search(text)),
            "narcotic": bool(_NARC.search(text)), "liquor": bool(_LIQ.search(text)), "stranded": bool(_STRAND.search(text)), "parking": "park" in text.lower()}
    fit = [s for need, s in FOLLOW.get(cat, []) if have.get(need, False)]
    if fit and _chance(key + "fol", 0.6):
        text = text.rstrip() + ("" if text.rstrip().endswith(".") else ".") + " " + _pick(key + "f", fit).format(gh=_gh(key, r.get("lat")))
    return text


# ---------------------------------------------------------------------- PWD --

PWD_TITLES = {
    "waterlogging": ["Knee-deep water near {asset}, {place}", "Waterlogging at {place}", "{place}: rainwater stagnation", "Water stagnant on roads, {place}",
                     "Inundation reported in {place}", "{place} low-lying area waterlogged"],
    "blocked_drain": ["{asset} choked at {place}", "Silt and debris block {asset}", "Drain blocked at {place}", "{place}: choked storm water drain", "Silt blocks drain near {place}",
                      "Drain overflow at {place}", "Desilting needed for drain, {place}"],
    "building_crack": ["Cracks widen at {asset}", "{asset}: cracks reported, inspection sought", "Cracks in govt building, {place}", "{place}: building cracks reported", "Structural cracks noticed at {place}",
                       "Inspection sought for cracked building, {place}"],
    "encroachment": ["Encroachment along {asset}", "Huts come up along {asset}", "Encroachment on water body, {place}", "{place}: encroachment on PWD land", "Encroachment complaint, {place}",
                     "New structures on waterway bank, {place}"],
    "sluice_failure": ["{asset}: sluice leaking", "Sluice gate fault at {place}", "{place}: sluice not operating", "Sluice shutter problem, {place}"],
    "wall_collapse": ["Wall along {asset} gives way at {place}", "Wall collapse at {place}", "{place}: retaining wall gives way", "Wall caves in at {place}"],
    "canal_overflow": ["{asset} overflows into streets at {place}", "Canal overflowing at {place}", "{place}: canal water entering streets", "Overflow from canal, {place}"],
    "bridge_damage": ["Damage to {asset} reported", "Bridge damage reported, {place}", "{place}: damage to bridge", "Cracks on bridge near {place}"],
    "bund_breach": ["Breach in {asset} bund", "Bund breach at {place}", "{place}: lake bund weakened", "Breach in bund, {place}"],
    "lake_surplus": ["{asset} surplusing", "Lake surplusing at {place}", "{place}: lake overflows its weir", "Surplus water from lake, {place}"],
}


def pwd_title(r: dict) -> str:
    """"Anna Nagar (Anna Nagar Macro Drain)" -> locality and asset; the asset is named when the template has room."""
    key, itype = str(r["event_id"]), str(r.get("category_src") or "")
    raw = str(r.get("place_text") or "").strip()
    m = re.match(r"^(.*?)\s*\((.+)\)$", raw)
    place, asset = (m.group(1), m.group(2)) if m else (raw, "")
    opts = PWD_TITLES.get(itype)
    if not opts or not place or not _chance(key + "title", 0.8):
        return r["title"]
    fit = [t for t in opts if "{asset}" not in t or asset] if asset else [t for t in opts if "{asset}" not in t]
    t = _pick(key + "t", fit or opts).format(place=place, asset=asset or place)
    return t[:1].upper() + t[1:]


# --------------------------------------------------------------------- apply --

def apply(events: pd.DataFrame) -> pd.DataFrame:
    """Rewrite the wording of police and PWD rows in place (other sources untouched); returns the frame."""
    if not len(events):
        return events
    pol = events["source"].eq("police")
    if pol.any():
        rows = events.loc[pol].to_dict("records")
        places = frozenset(str(p).split(" ", 1)[0] for p in events["place_text"].dropna().unique())
        events.loc[pol, "title"] = [police_title(r) for r in rows]
        events.loc[pol, "text"] = [police_text(r, places) for r in rows]
    pw = events["source"].eq("pwd")
    if pw.any():
        events.loc[pw, "title"] = [pwd_title(r) for r in events.loc[pw].to_dict("records")]
    m = pol | pw
    events.loc[m, "simhash"] = [tp.simhash64(t) for t in events.loc[m, "text"]]
    return events


def _pattern(title: str) -> str:
    """A title with its names and numbers masked: what is left is the template a reader would notice repeating."""
    words = re.sub(r"\d[\d,.]*", "#", str(title)).split()
    out = [w.lower() if i == 0 or not w[:1].isupper() else "X" for i, w in enumerate(words)]
    return re.sub(r"(X[\s,:;()-]*)+", "X ", " ".join(out)).strip()


def report(events: pd.DataFrame) -> dict:
    """How repetitive each simulated source reads: distinct title templates (names and numbers masked) and the most
    repeated one. Written to the build metrics so a regression shows."""
    out = {}
    for src in ("police", "pwd", "grievance"):
        e = events[events["source"].eq(src)]
        if not len(e):
            continue
        vc = pd.Series([_pattern(t) for t in e["title"]]).value_counts()
        out[src] = {"records": int(len(e)), "title_templates": int(len(vc)), "most_repeated": int(vc.iloc[0]),
                    "most_repeated_template": vc.index[0], "share_in_top_10": round(float(vc.iloc[:10].sum() / len(e)), 3)}
    return out
