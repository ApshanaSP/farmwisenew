"""Briefing notes: stored notes become rows (health and law share one record), and the number check."""
import time

import pytest

import pandas as pd

from dintel import briefai
from dintel.newsllm import LLM
from dintel.util import load_settings


def _s(record):
    return {"hash": "h", "crit": "c", "at": time.time(), "written_for": "03 Oct, 11:30 PM", "model": "gemini-3.8-flash", "record": record}


def test_rows_from_every_section():
    state = {"_v": briefai.VERSION,
             "situation": _s({"summary": "A quiet day.", "summary_ta": "அமைதியான நாள்."}),
             "weather": _s({"outlook": "Light rain.", "outlook_ta": "லேசான மழை."}),
             "notes": _s({"health": "Beds are full.", "health_ta": "படுக்கைகள் நிரம்பின.", "law": "Fewer thefts.", "law_ta": "திருட்டு குறைவு."}),
             "departments": _s({"items": [{"code": "GCC-SWD", "brief": "Drains need clearing."}]}),
             "news": _s({"items": [{"id": "D1", "group": "incident", "line": "Fire at a flat.", "why": "Safety."}]})}
    rows = briefai._rows(state, pd.Timestamp("2026-10-03 23:30", tz="Asia/Kolkata"))
    assert {(r["section"], r["item_key"]) for r in rows} == {("situation", ""), ("weather", ""), ("health", ""), ("law", ""),
                                                             ("departments", "GCC-SWD"), ("news", "D1")}
    assert next(r for r in rows if r["section"] == "law")["text_ta"] == "திருட்டு குறைவு."


def test_number_check():
    facts = {"deaths": 2, "lakes_above_95_pct": 13}
    assert briefai._ok(["2 people died; 13 lakes are nearly full."], facts)
    assert not briefai._ok(["Five people died."], facts)
    assert not briefai._ok([""], facts)


def test_each_job_uses_its_own_provider():
    cfg = load_settings().raw["news_llm"]
    for role, provider in (("classify", "groq"), ("explain", "groq"), ("brief", "gemini")):
        chain = LLM(cfg, role).chain
        if not chain:
            pytest.skip("no Groq or Gemini key on this machine (district_intel/.env)")
        assert chain and {p for p, _ in chain} == {provider}, role
