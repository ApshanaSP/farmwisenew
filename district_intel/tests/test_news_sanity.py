"""The 13 Oct 2026 briefing said "101 deaths in 24 hours": 95 from a 1976 history column, and one Kodungaiyur gas death
of two workers counted three times (three articles of one story, each its own incident, read as vector-borne disease)."""
import pandas as pd

from dintel.linking import join_casualties, join_dup_groups
from dintel.loaders.news import DISEASE, GAS, archival
from dintel.util import UnionFind

PUB = "2026-10-13 07:15:00+05:30"


def test_history_column_is_archival():
    t = pd.Series(["13.10.1976: பம்பாயில் விமான விபத்தில் 95 பேர் பலி", "1984: Cyclone hits the coast",
                   "On this day: the first metro line opened", "இதே நாளில்: சென்னை துறைமுகம் திறப்பு"])
    assert archival(t, pd.Series([PUB] * len(t))).tolist() == [True, True, True, True]


def test_current_news_is_not_archival():
    t = pd.Series(["13.10.2026: Two workers die in a stormwater well", "Building from 1976 collapses in Royapuram",
                   "2026: city records its wettest October", ""])
    assert archival(t, pd.Series([PUB] * len(t))).tolist() == [False, False, False, False]


def test_gas_deaths_are_not_disease():
    s = pd.Series(["கொடுங்கையூரில் விஷவாயு தாக்கி தொழிலாளர்கள் இருவர் உயிரிழப்பு Two workers die in a chemical gas attack",
                   "Two sanitary workers suffocate in a septic tank", "Dengue cases rise in Kodungaiyur", "Fever after toxic water"])
    assert (s.str.contains(GAS) & ~s.str.contains(DISEASE)).tolist() == [True, True, False, False]


def test_a_news_story_is_one_incident():
    ids = ["NEWS-a", "NEWS-b", "NEWS-c", "NEWS-d"]
    groups = ["NEWS-STY-1", "NEWS-STY-1", "NEWS-STY-1", "NEWS-STY-2"]
    uf = UnionFind(ids)
    join_dup_groups(uf, ids, groups)
    assert uf.find("NEWS-a") == uf.find("NEWS-b") == uf.find("NEWS-c")
    assert uf.find("NEWS-d") != uf.find("NEWS-a")


def test_a_group_named_by_its_event_still_joins():
    ids = ["GRV-1", "GRV-2", "GRV-3"]
    uf = UnionFind(ids)
    join_dup_groups(uf, ids, ["GRV-1", "GRV-1", None])
    assert uf.find("GRV-2") == uf.find("GRV-1")
    assert uf.find("GRV-3") != uf.find("GRV-1")


def test_the_same_deaths_under_different_stories_are_one_incident():
    e = pd.DataFrame({
        "event_id": ["NEWS-etv", "NEWS-toi", "NEWS-tnm", "NEWS-mdv", "NEWS-later"],
        "source": ["news"] * 5,
        "dead": [2, 2, 2, 2, 2],
        "place_text": ["Kodungaiyur", "Kodungaiyur", "Kodungaiyur", "Maduravoyal", "Kodungaiyur"],
        "reported_at": ["2026-10-12 20:06:12", "2026-10-12 17:47:42", "2026-10-13 11:28:06", "2026-10-12 07:00:00", "2026-10-16 09:00:00"],
    })
    uf = UnionFind(e["event_id"])
    join_casualties(uf, e)
    assert uf.find("NEWS-etv") == uf.find("NEWS-toi") == uf.find("NEWS-tnm")
    assert uf.find("NEWS-mdv") != uf.find("NEWS-toi")
    assert uf.find("NEWS-later") != uf.find("NEWS-toi")


def test_horoscopes_and_natural_obituaries_are_not_incidents():
    from dintel.loaders.news import not_an_incident
    t = pd.Series(["Veteran filmmaker Singeetham Srinivasa Rao passes away at 94 in a Chennai hospital",
                   "Spiritual Guru Kalki Bhagavan Passes Away In Chennai At 77, Final Rites To Be Conducted On Saturday",
                   "இன்றைய ராசி பலன் - மேஷம் முதல் மீனம் வரை",
                   "Youth passes away after bike accident on OMR", "Worker passed away after falling into stormwater drain",
                   "Two killed in accident on Maduravoyal bypass road"])
    assert not_an_incident(t).tolist() == [True, True, True, False, False, False]
