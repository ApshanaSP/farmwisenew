"""Incident ids stay the same from build to build (linking.stable_ids)."""
import pandas as pd

from dintel.linking import stable_ids

T = lambda s: pd.Timestamp(s, tz="Asia/Kolkata")  # noqa: E731


def test_an_incident_keeps_its_id_when_an_earlier_report_joins(tmp_path):
    reg = tmp_path / "ids.json"
    first = {"GRV-B": T("2026-10-06 14:33"), "GRV-C": T("2026-10-06 19:07"), "NEWS-A": T("2026-10-06 09:00")}
    one = stable_ids({"r": ["GRV-B", "GRV-C"]}, first, reg)
    old = one["GRV-B"]
    # next build: a news report published earlier joins: by the old rule its id would have become the incident's
    two = stable_ids({"r": ["NEWS-A", "GRV-B", "GRV-C"]}, first, reg)
    assert set(two.values()) == {old}


def test_a_split_leaves_the_id_with_the_larger_part(tmp_path):
    reg = tmp_path / "ids.json"
    first = {k: T(f"2026-10-06 0{n}:00") for n, k in enumerate(["A", "B", "C", "D"])}
    old = stable_ids({"r": ["A", "B", "C", "D"]}, first, reg)["A"]
    two = stable_ids({"x": ["A"], "y": ["B", "C", "D"]}, first, reg)
    assert two["B"] == old and two["A"] != old


def test_new_incidents_get_new_ids_and_ids_are_unique(tmp_path):
    reg = tmp_path / "ids.json"
    first = {"A": T("2026-10-06 01:00"), "B": T("2026-10-06 02:00")}
    ids = stable_ids({"x": ["A"], "y": ["B"]}, first, reg)
    assert ids["A"] != ids["B"]
    assert ids["A"].startswith("INC-20261006-")
