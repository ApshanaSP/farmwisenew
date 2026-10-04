"""Source health reads the refresh record as well as file times. Run: python -m pytest -q"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel.agents import steward  # noqa: E402
from dintel.util import IST, Settings  # noqa: E402


def test_generator_that_skips_writing_is_not_stale(tmp_path):
    six_hours_ago = time.time() - 6 * 3600
    hosp, pwd = tmp_path / "hospital.csv", tmp_path / "pwd_incidents.csv"
    for f in (hosp, pwd):
        f.write_text("x", encoding="utf-8")
        os.utime(f, (six_hours_ago, six_hours_ago))
    state = tmp_path / "out" / "state"
    state.mkdir(parents=True)
    # the hospital generator ran two minutes ago but found today's rows already there, so its file kept the old time
    (state / "refresh_state.json").write_text(json.dumps({
        "hospital": {"last_run": time.time() - 120, "ok": True, "last_ok": time.time() - 120},
        "_last_collection": {"at": time.time() - 300}}), encoding="utf-8")
    none = str(tmp_path / "missing")
    settings = Settings({
        "refresh": [{"name": n, "every_minutes": 60} for n in ("hospital", "pwd")],
        "output": {"dir": str(tmp_path / "out")},
        "sources": {"imd": {"dir": none}, "cpcb": {"dir": none}, "cfm": {"dir": none}, "news": {"master": none},
                    "grievances": {"complaints": none}, "police": {"reports": none},
                    "pwd": {"dir": str(tmp_path)}, "hospital": {"csv": str(hosp)}}})
    now = pd.Timestamp.now(tz=IST)
    events = pd.DataFrame({"source": ["hospital", "pwd"], "is_overlay": [0, 0], "reported_at": [now, now]})
    obs = pd.DataFrame(columns=["source", "metric", "observed_at", "quality"])

    h = steward.source_health(settings, events, obs, 0, now).set_index("source")

    assert h.loc["hospital", "status"] == "ok"
    assert h.loc["hospital", "minutes_since_success"] <= 3
    assert h.loc["pwd", "status"] == "stale"  # no refresh record: the file time still decides
