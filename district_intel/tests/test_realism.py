"""The wording layer for simulated police and PWD records: varied, stable, and never changes a fact."""
import re

import pandas as pd

from dintel import realism


def _rows():
    return pd.DataFrame([
        {"event_id": f"POL-{i:05d}", "source": "police", "category_src": c, "title": t, "text": x, "place_text": p,
         "dead": d, "injured": j, "channel": ch, "status_src": st, "lat": 13.08, "simhash": None}
        for i, (c, t, x, p, d, j, ch, st) in enumerate([
            ("CHAIN_SNATCHING", "Chain snatching reported at Kolathur", "A woman walking home lost a 5-sovereign chain to bike-borne "
             "snatchers in Kolathur around 6.45 am.", "Kolathur", 0, 0, "control_room_112", "CLOSED"),
            ("ROAD_ACCIDENT", "Road accident at Egmore", "Two vehicles, a SUV and a motorcycle, collided at Egmore around 2.35 am. "
             "One person was injured.", "Egmore", 0, 1, "patrol", "CLOSED"),
            ("ROAD_ACCIDENT", "Pedestrian hit at Puzhal", "Pedestrian was struck by a vehicle at Puzhal around 12.05 am; one person "
             "was injured.", "Puzhal", 0, 1, "fir_walk_in", "REPORTED"),
            ("PROTEST_LAW_AND_ORDER", "Road roko at Korattur", "Road roko in Korattur around 12.50 pm by roughly 160 residents over "
             "poor road conditions. Traffic was held up for about 170 minutes.", "Korattur", 0, 0, "media", "CLOSED"),
        ] * 50)
    ])


def test_facts_and_ids_are_kept():
    ev = _rows()
    before = ev.copy()
    realism.apply(ev)
    for col in ("event_id", "category_src", "place_text", "dead", "injured", "channel", "status_src"):
        assert ev[col].equals(before[col])
    # the generator's sentence is still inside the new text (only rounded / restyled), and the place is named
    for old, new, place in zip(before["text"], ev["text"], ev["place_text"]):
        assert place in new
        assert "sovereign" not in old or "5-sovereign" in new


def test_same_record_reads_the_same_every_build():
    a, b = realism.apply(_rows()), realism.apply(_rows())
    assert a["title"].equals(b["title"]) and a["text"].equals(b["text"])


def test_no_death_words_without_a_death():
    ev = realism.apply(_rows())
    for t, x in zip(ev["title"], ev["text"]):
        assert not re.search(r"post-mortem|killed|dies|fatal|106\(1\)", f"{t} {x}", re.I)


def test_long_durations_and_crowds_are_rounded():
    ev = realism.apply(_rows())
    protest = ev[ev["category_src"] == "PROTEST_LAW_AND_ORDER"]["text"]
    assert not protest.str.contains("170 minutes").any()
    assert protest.str.contains("three hours").all()


def test_titles_vary():
    ev = realism.apply(_rows())
    assert ev["title"].nunique() >= 8


def test_clause_prefix_only_before_a_clause():
    ev = pd.DataFrame([{"event_id": f"POL-X{i}", "source": "police", "category_src": "TRAFFIC_OBSTRUCTION", "title": "t",
                        "text": "Complaint of illegal parking obstructing traffic near Udhayam Theatre Junction in Ashok Nagar around 5.00 pm.",
                        "place_text": "Ashok Nagar", "dead": 0, "injured": 0, "channel": ch, "status_src": "CLOSED", "lat": 13.0,
                        "simhash": None} for i in range(60) for ch in ("patrol", "fir_walk_in", "control_room_112")])
    realism.apply(ev)
    assert not ev["text"].str.contains(r"that complaint|, complaint|Night patrol", case=False).any()
