"""When a feed is due again. Run: python -m pytest -q"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import run_pipeline as rp  # noqa: E402

HOURLY = {"name": "cpcb", "every_minutes": 60}
T = 1_790_000_000.0  # any time; only differences matter


def test_hourly_feed_runs_on_the_next_hour_even_after_a_long_run():
    # started 12:00, took 11 minutes; the task fires again at 13:00
    st = {"cpcb": {"started": T, "last_run": T + 11 * 60, "ok": True, "last_ok": T + 11 * 60}}
    assert rp.is_due(HOURLY, st, T + 3600, 6)


def test_run_after_sign_in_does_not_push_the_next_hour_back():
    # signed in at 11:16, the task fires at 12:00
    st = {"cpcb": {"started": T, "last_run": T + 9 * 60, "ok": True, "last_ok": T + 9 * 60}}
    assert rp.is_due(HOURLY, st, T + 44 * 60, 6)


def test_two_triggers_close_together_run_once():
    st = {"cpcb": {"started": T, "last_run": T + 9 * 60, "ok": True, "last_ok": T + 9 * 60}}
    assert not rp.is_due(HOURLY, st, T + 20 * 60, 6)


def test_old_record_without_start_time_still_works():
    st = {"cpcb": {"last_run": T, "ok": True, "last_ok": T}}
    assert rp.is_due(HOURLY, st, T + 50 * 60, 6)
    assert rp.is_due(HOURLY, {}, T, 6)
