"""Where a news event happened (dintel/placerole.py) and which reports are the same event (dintel/eventmatch.py)."""
import numpy as np
import pandas as pd
import pytest

from dintel import eventmatch as em
from dintel import placerole as pr
from dintel.loaders import news
from dintel.util import load_settings


@pytest.fixture(scope="module")
def gaz():
    _, g, _ = news.build_gazetteer(load_settings(), pd.DataFrame(columns=["name", "lat", "lon"]))
    return g


def where(gaz, title: str, rest: str = "") -> tuple[str | None, dict]:
    text = title + (". " + rest if rest else "")
    ev, places = pr.decide(pr.mention_rows(text, len(title), gaz.find_mentions(text)), pr.prior_model())
    return (ev.name if ev else None), {p.name: p.role for p in places}


# ------------------------------------------------------------------ places --

def test_hospital_the_body_was_sent_to_is_not_where_it_happened(gaz):
    ev, roles = where(gaz, "Odisha guest worker stabbed to death over money dispute in Velachery",
                      "Police rushed to the scene and sent the body to the Royapettah GH for post-mortem.")
    assert ev == "Velachery" and roles["Royapettah"] == "hospital"


def test_an_event_inside_a_hospital_stays_there(gaz):
    assert where(gaz, "Man dies by suicide at Kilpauk Government Hospital")[0] == "Kilpauk"


def test_style_reference_is_not_the_place(gaz):
    # "Velachery-style smoke in a Kundrathur school van": Kundrathur is outside the list, Velachery is only a comparison
    ev, roles = where(gaz, "வேளச்சேரி பாணியில் குன்றத்தூர் பள்ளி வேனில் புகை.. கன நொடியில் தப்பிய குழந்தைகள்")
    assert ev is None and roles["Velachery"] == "style"


def test_home_town_is_not_the_place(gaz):
    ev, roles = where(gaz, "Youth hailing from Tambaram killed in accident near Guindy")
    assert ev == "Guindy"
    ev, roles = where(gaz, "வேளச்சேரியைச் சேர்ந்த இளைஞர் கிண்டியில் விபத்தில் பலி")
    assert ev == "Guindy" and roles["Velachery"] == "origin"


def test_corridor_is_not_a_place(gaz):
    assert where(gaz, "PM Modi to Open Poonamallee-Vadapalani Metro Stretch on October 11")[0] is None
    assert where(gaz, "வடபழனி - பூந்தமல்லி மெட்ரோ .. அக்.11ல் தொடங்கி வைக்கிறார் பிரதமர்")[0] is None
    # a spaced dash before a clause is not a corridor
    assert where(gaz, "சென்னை மெரினாவில் உள்ள மெட்ரோ அலுவலகத்தில் தீ விபத்து")[0] == "Marina Beach"


def test_list_of_areas_is_not_one_place(gaz):
    ev, roles = where(gaz, "Sewage overflow likely at Teynampet, Adyar tomorrow")
    assert roles == {"Teynampet": "list", "Adyar": "list"}


def test_tamil_locative_and_dateline(gaz):
    assert where(gaz, "திருவல்லிக்கேணியில் இளைஞா் வெட்டிக் கொலை: போலீஸாா் விசாரணை")[0] == "Triplicane"
    assert where(gaz, "கிண்டி: ரயில்வே நிலைய மேம்பாலம் அருகே சுகாதார சீர்கேடு")[0] == "Guindy"


def test_roles_json_marks_the_event_place():
    s = [pr.Scored("Velachery", "taluk", 1.0, 2.0, "event", 0.9), pr.Scored("Royapettah", "locality", 1.0, 2.0, "hospital", 0.1)]
    out = pr.roles_json(s, s[0])
    assert '"place": "Velachery", "role": "event"' in out and '"role": "hospital"' in out


# --------------------------------------------------------------- same event --

def test_match_text_drops_a_summary_that_repeats_the_headline():
    assert em.match_text("Fire at Pudupet warehouse", "Fire at Pudupet warehouse") == "Fire at Pudupet warehouse"
    assert em.match_text("Fire at Pudupet", "Three fire tenders rushed") == "Fire at Pudupet. Three fire tenders rushed"


def test_numbers_leave_out_dates_and_years():
    assert em.numbers("2 dead, 35-year-old man, on 24.09.2026 in 2026") == frozenset({"2", "35"})


def _docs(rows):
    d = pd.DataFrame(rows, columns=["doc_id", "lang", "published_at", "category_code", "is_incident", "place_text", "geo_level", "dead",
                                    "_match_text"])
    d["published_at"] = pd.to_datetime(d["published_at"], utc=True)
    return d


def test_a_rising_toll_is_a_developing_story_a_falling_one_counts_against():
    d = _docs([("a", "en", "2026-10-01 10:00", "ACCIDENT", 1, "Guindy", "taluk", 1, "x"),
               ("b", "ta", "2026-10-01 18:00", "ACCIDENT", 1, "Guindy", "taluk", 2, "y"),
               ("c", "en", "2026-10-02 08:00", "ACCIDENT", 1, "Guindy", "taluk", 1, "z")])
    c = pd.DataFrame({"a": [0, 1], "b": [1, 2], "cos": [0.8, 0.8], "margin": [1.1, 1.1]})
    f = em.features(d, c)
    assert f["dead_drop"].tolist() == [0, 1] and f["place_agree"].tolist() == [1, 1] and f["cross_lang"].tolist() == [1, 1]


def test_grouping_does_not_chain_different_events():
    # A~B and B~C are strong, but A and C are clearly different: only one join happens
    base = np.array(["A", "B", "C"])
    a, b = np.array([0, 1, 0]), np.array([1, 2, 2])
    p = np.array([0.95, 0.9, 0.02])
    out = em.group(base, a, b, p, p >= em.MERGE_P)
    assert out[0] == out[1] and out[2] != out[0]


def test_grouping_joins_tamil_and_english_reports_of_one_event():
    base = np.array(["EN", "TA", "EN2"])
    a, b = np.array([0, 0, 1]), np.array([1, 2, 2])
    p = np.array([0.93, 0.88, 0.9])
    out = em.group(base, a, b, p, p >= em.MERGE_P)
    assert len(set(out)) == 1


def test_grouping_respects_the_size_cap():
    n = em.MAX_GROUP + 3
    a, b = np.arange(n - 1), np.arange(1, n)
    out = em.group(np.array([str(i) for i in range(n)]), a, b, np.full(n - 1, 0.99), np.ones(n - 1, bool))
    assert max(pd.Series(out).value_counts()) <= em.MAX_GROUP


def test_pair_model_saved_and_reloaded(tmp_path):
    rng = np.random.default_rng(0)
    F = pd.DataFrame(rng.random((80, len(em.FEATURES))), columns=em.FEATURES)
    y = (F["rerank"] > 0.5).astype(int).to_numpy()
    path = tmp_path / "m.json"
    full, part = em.models_for(F, y, path)
    again = em.models_for(F.iloc[:0], y[:0], path)
    assert again is not None and np.allclose(again[0].prob(F), full.prob(F))


def test_hours_do_not_depend_on_the_datetime_unit():
    # pandas 3 reads text as microseconds; the pipeline's own columns are nanoseconds: both must give 48 h
    a = pd.to_datetime(pd.Series(["2026-10-01 10:00:00+05:30", "2026-10-03 10:00:00+05:30"]), utc=True)
    b = a.astype("datetime64[ns, UTC]").dt.tz_convert("Asia/Kolkata")
    assert np.diff(em.hours(a))[0] == pytest.approx(48) and np.diff(em.hours(b))[0] == pytest.approx(48)


def test_evidence_against_a_merge_never_gets_a_positive_weight():
    # place_conflict made (spuriously) more common among same-event pairs: the fit must not reward it
    rng = np.random.default_rng(1)
    F = pd.DataFrame(rng.random((200, len(em.FEATURES))), columns=em.FEATURES)
    y = (F["rerank"] > 0.5).astype(int).to_numpy()
    F["place_conflict"] = ((y == 1) & (rng.random(200) < 0.6)).astype(int)
    m = em.fit(F, y, em.FEATURES)
    w = dict(zip(em.FEATURES, m.coef))
    assert w["place_conflict"] <= 0 and w["rerank"] > 0
