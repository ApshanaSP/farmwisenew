"""LT-03: forecasts, government work, rescues, roundups, opinion and promotions are news, not incidents.
The same cases as the website's src/lib/collector/reporttype.test.ts (real headlines, 22-26 Oct 2026)."""
import pytest

from dintel.reporttype import report_kind

CASES = [
    ("'Yellow' alert for Chennai today", "alert"),
    ("Rain to continue in Chennai and 30 districts for the next 2 hours!", "alert"),
    ("Arnab Cyclone warning: No direct impact on Chennai - Meteorological Department information!", "alert"),
    ("43 tonnes of items including tires and plastics that cause mosquito breeding removed in Chennai", "government_action"),
    ("980 fire personnel on standby to face monsoon in Chennai", "government_action"),
    ("Chennai Corporation starts inspection of dilapidated buildings to prevent collapse this Northeast Monsoon", "government_action"),
    ("₹80-crore stormwater drain to ease flooding in Korattur", "government_action"),
    ("Ambattur Missing Boys | 5 boys missing near Ambattur rescued near Guntur", "resolution"),
    ("MTC bus driver gets 4.5-year jail for double fatal incident", "resolution"),
    ("Chennai Latest News Today on October 26th, 2026: Cyclone Arnab, Heavy Rains & Water Levels Rise", "roundup"),
    ("Crime Corner: Chennai", "roundup"),
    ("Water inflow decreases into Chennai drinking water reservoirs", "roundup"),
    ("Increased dengue spread in Chennai due to Tewag’s sluggish response: Mayor Priya accuses!", "opinion"),
    ("'Growing buildings, shrinking water bodies' - Why does flooding happen often in Chennai? Information in new study", "opinion"),
    ("MISSO robotic technology with artificial intelligence for knee joint replacement surgery at Chennai Shivam Ortho Hospital", "other"),
    ("Chennai: Woman dies after pushed to floor while rescuing son", "incident"),
    ("Class 12 student killed and four injured in accident on Tambaram-Maduravoyal bypass", "incident"),
    ("Boats stranded at Chennai Kasimedu fishing harbor due to storm", "incident"),
    ("Car plunges into canal - 5 people from Chennai escape safely", "incident"),
    ("Former DMK Minister Anbil Mahesh Poyyamozhi arrested in ₹100-crore private schools fraud case", "incident"),
    ("Residents flag safety risk as silt removed from canals piles up along city roads", "incident"),
    ("Chennai: Two jailbreaks at Puzhal prison within 24 hours", "incident"),
]


@pytest.mark.parametrize("title,want", CASES)
def test_report_kind(title, want):
    assert report_kind(title) == want
