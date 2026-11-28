"""Why an incident has its severity, priority and deadline, in a form the Collector can read.

incidents.score_why (JSON text), one per incident:
    {"v": 1,
     "sev": [[what, points, basis], ...],     the severity's named points (severity.points), the kind of event first
     "pri": [[key, words, points], ...],      the priority's terms (priority.terms); they add up to priority_score
     "sla": {"h", "basis", "official", "source", "clause", "rule", "url", "checked", "fit", "related": [...]}}
           fit: how far the published rule fits (it is set per kind of fault; the deadline per category and level)
incidents.sla_source (text): where the deadline comes from, e.g. "TNERC Distribution Standards of Performance
Regulations, 2004, regulation 12(II)" or "District IQ default" (reference/sla_sources.yaml).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

import pandas as pd

from . import priority, severity
from .refdata import SEV_RANK, SEVERITIES
from .util import load_ref


@lru_cache(maxsize=1)
def register() -> dict:
    """reference/sla_sources.yaml, read once."""
    return load_ref("sla_sources.yaml")


@lru_cache(maxsize=256)
def _rx(p: str) -> re.Pattern:
    return re.compile(p, re.I)


def fault_fits(code: str, level: str, text: str) -> bool:
    """Is the case the kind of fault the official clause for this category and level covers? A clause with no `match`
    covers every case; one with a `match` only the cases whose sub-type, title or text names that fault."""
    c = register()["categories"].get(code) or {}
    off = (c.get("official") or {}).get(SEVERITIES[SEV_RANK.get(level, 3)])
    return bool(off) and (not off.get("match") or bool(_rx(off["match"]).search(text or "")))


@lru_cache(maxsize=512)
def sla_entry(code: str, level: str, fits: bool = True) -> dict:
    """The deadline of a category at a severity, with its source. `fits`: the case is the kind of fault the official
    clause covers (fault_fits); when it is not, the deadline is the District IQ default and the clause is a related note."""
    R = register()
    c = R["categories"].get(code) or R["categories"]["OTHER"]
    i = SEV_RANK.get(level, 3)
    off = (c.get("official") or {}).get(SEVERITIES[i])
    if off and off.get("match") and not fits:
        off = None
    src = R["sources"][off["source"] if off else "district_iq_default"]
    out = {"h": c["h"][i], "basis": c.get("basis", "resolution"), "official": bool(off and src.get("official")), "source": src["name"]}
    if off:
        out.update(clause=off["clause"], rule=off["rule"], url=src.get("url"), checked=str(src.get("checked")))
        if off.get("fit"):
            out["fit"] = off["fit"]
    rel = []
    for x in c.get("related") or []:
        s = R["sources"][x["source"]]
        rel.append({"source": s["name"], "clause": x["clause"], "rule": x["rule"], "url": x.get("url") or s.get("url"), "official": bool(s.get("official"))})
    if rel:
        out["related"] = rel
    return out


def sla_label(code: str, level: str) -> str:
    e = sla_entry(code, level)
    return f"{e['source']}, {e['clause']}" if e["official"] else "District IQ default"


def _lead_text(lead: pd.DataFrame) -> list[str]:
    cols = [c for c in ("subcategory_src", "title", "text") if c in lead.columns]
    if not cols:
        return [""] * len(lead)
    return [" | ".join(str(v) for v in vals if isinstance(v, str)) for vals in zip(*(lead[c] for c in cols))]


def build(inc: pd.DataFrame, lead: pd.DataFrame) -> tuple[list[str], list[str]]:
    """(sla_source, score_why) for each incident row. `lead`: per incident (same order), the member whose severity the
    incident carries, with source, category_src, category_code and severity_reasons (and its sub-type, title and text,
    which decide whether a fault-specific official clause applies)."""
    texts = _lead_text(lead)
    pri = priority.terms(inc)
    dump = json.JSONEncoder(ensure_ascii=False, separators=(",", ":")).encode
    # the severity points and the deadline repeat across thousands of incidents: each is encoded once and the JSON text
    # is joined (the same text json.dumps of {"v", "sev", "pri", "sla"} gives)
    sev_js: dict[tuple, str] = {}
    sla_js: dict[tuple, tuple[str, str]] = {}
    labels, why = [], []
    for (code, level), (src, csrc, ccode, rs), p, txt in zip(zip(inc["category_code"], inc["severity_level"]),
                                                          zip(lead["source"], lead["category_src"], lead["category_code"], lead["severity_reasons"]),
                                                          pri, texts):
        key = (rs if isinstance(rs, str) else "", src, csrc, ccode)
        s = sev_js.get(key)
        if s is None:
            s = sev_js[key] = dump(severity.points(rs, str(src or ""), str(csrc or ""), str(ccode or "")))
        k2 = (str(code), str(level), fault_fits(str(code), str(level), txt))
        d = sla_js.get(k2)
        if d is None:
            e = sla_entry(*k2)
            d = sla_js[k2] = (f"{e['source']}, {e['clause']}" if e["official"] else "District IQ default", dump(e))
        labels.append(d[0])
        why.append(f'{{"v":1,"sev":{s},"pri":{dump(p)},"sla":{d[1]}}}')
    return labels, why
