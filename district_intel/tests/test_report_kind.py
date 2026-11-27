"""LT-03: forecasts, government work, rescues, roundups, opinion and promotions are news, not incidents.
The same cases as the website's src/lib/collector/reporttype.test.ts (real headlines, 22-26 Oct 2026)."""
import pytest

from dintel.reporttype import overriding_kind, report_kind

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
    ("14 deaths due to monsoon so far.... Minister Sengottaiyan information regarding rain damage", "roundup"),
    ("14 deaths so far due to monsoon.... Minister Sengottaiyan information regarding rain damage", "roundup"),
    ("Death toll in Ennore gas leak rises to 3 so far", "incident"),
    ("2 dead so far as building collapses in Chennai during monsoon", "incident"),
    ("More boats for flood-prone areas this monsoon season in Chennai", "government_action"),
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
    # routed to officers as complaints on 27 Oct before the website's corrections ran
    ("Water level in Pondicherry Lake, which supplies drinking water to Chennai, has decreased", "roundup"),
    ("Nine days of rain add 28 days of drinking water to Chennai’s reserves", "roundup"),
    ("Chennai Sewage Cleanup Covers 227 Streets Ahead of Rain", "government_action"),
    ('Chennai Rain|Sengottaiyan |"Rainwater drainage works were not completed in the last 5 years" Minister KAS', "opinion"),
    ("On behalf of Chennai Municipal Administration and Water Supply Department at Chennai Chepauk headquarters", "other"),
    ("Unsold vegetables pile up at Koyambedu market as festival trade slows", "other"),
    ("Tambaram-Velachery Road in Chennai riddled with potholes; ambulance overturns, two injured", "incident"),
    ("Will the Northeast monsoon help? Water stock low in Chennai's drinking water lakes!", "roundup"),
    ("Chennai Metrowater Clears 227 Streets, Boosts Sewage Response", "government_action"),
    ("Anti-rabies vaccine administered to 1.50 lakh stray dogs: Chennai Corporation information", "government_action"),
    # 24 Nov 2026: words that look like an event and are not
    ("Minister recovers after cardiac arrest", None),
    ("TV debate moderator dies of cardiac arrest on GST Road", "incident"),
    ("Back to Vice City: Why GTA 6 is a big deal", None),
    ("School teacher arrested for misbehaving with college girl in Kotturpuram", "incident"),
]


@pytest.mark.parametrize("title,want", CASES)
def test_report_kind(title, want):
    assert report_kind(title) == want


# 27 Nov 2026: over the language model's own label the rules set only a forecast or a roundup; the website's news desk decides
# the rest ("Silver worth Rs 1 crore looted" was read as government work, "girl kidnapped ... police rescued her" as a resolution)
@pytest.mark.parametrize("kind,from_ai,want", [
    ("alert", True, "alert"), ("roundup", True, "roundup"),
    ("government_action", True, None), ("resolution", True, None), ("opinion", True, None), ("other", True, None),
    ("government_action", False, "government_action"), ("resolution", False, "resolution"), ("alert", False, "alert"),
    ("incident", True, None), ("incident", False, None), (None, True, None), (None, False, None),
])
def test_overriding_kind(kind, from_ai, want):
    assert overriding_kind(kind, from_ai) == want


def test_rules_still_read_the_headline_the_same_way():
    # the rules themselves are unchanged: a local model's label still takes their kind
    assert overriding_kind(report_kind("Silver worth Rs 1 crore looted from jewellery shop"), False) == "government_action"
    assert overriding_kind(report_kind("Silver worth Rs 1 crore looted from jewellery shop"), True) is None
    assert overriding_kind(report_kind("'Yellow' alert for Chennai today"), True) == "alert"
