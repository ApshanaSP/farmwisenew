"""'Similar incidents here in 90 days' counts only incidents with a real location."""
import pandas as pd

from dintel.incidents import _recurrence
from dintel.refdata import Reference
from dintel.util import load_settings


def _inc(rows):
    df = pd.DataFrame(rows, columns=["category_code", "lat", "lon", "loc_precision_m", "day"])
    df["first_reported_at"] = pd.Timestamp("2026-10-01", tz="Asia/Kolkata") + pd.to_timedelta(df.pop("day"), unit="D")
    return df


def test_reports_placed_only_as_chennai_are_not_a_pattern():
    ref = Reference(load_settings())
    centre = (13.0827, 80.2707, 15000.0)          # "Chennai" only: the district's centre point
    inc = _inc([("VECTOR_DISEASE", *centre, d) for d in range(6)])
    assert _recurrence(inc, ref).tolist() == [0] * 6


def test_reports_at_a_real_place_still_count():
    ref = Reference(load_settings())
    adyar = (13.0012, 80.2565, 1500.0)
    inc = _inc([("VECTOR_DISEASE", *adyar, d) for d in range(4)])
    assert _recurrence(inc, ref).tolist() == [0, 1, 2, 3]
