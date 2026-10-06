"""Reading full articles, the LLM's extra details, Tamil-English story matching, story places and the pair check."""
import json

import numpy as np
import pandas as pd

from dintel import fulltext, geolocate, newsllm
from dintel.agents import workers
from dintel.loaders import news


# ------------------------------------------------------------- full text --

def test_headline_key_drops_publisher_suffix_and_punctuation():
    assert fulltext.norm_title("Woman found dead in Chennai - Dinakaran") == fulltext.norm_title("Woman found dead in Chennai!")
    assert fulltext.norm_title("சென்னையில் கோர விபத்து: இருவர் உயிரிழப்பு") == "சென்னையில் கோர விபத்து இருவர் உயிரிழப்பு"


def test_sitemap_lookup_matches_google_news_titles_with_extra_keywords():
    site = fulltext.Site("example.com", None, "bot", 5)
    site.entries = {fulltext.norm_title("சென்னையில் கத்தியை காட்டி மிரட்டி வழிப்பறி"): "https://example.com/a",
                    fulltext.norm_title("Power cut in Adyar tomorrow"): "https://example.com/b"}
    assert site.find("chennai crime சென்னையில் கத்தியை காட்டி மிரட்டி வழிப்பறி") == "https://example.com/a"
    assert site.find("Power cut in Adyar tomorrow - Example") == "https://example.com/b"
    assert site.find("Power cut in Velachery") is None  # too few shared words


def test_sitemap_parsing_reads_news_titles_not_image_titles(monkeypatch):
    xml = b"""<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
      <url><loc>https://example.com/story</loc><image:image><image:title>Photo caption</image:title></image:image>
      <news:news><news:title>Road caves in at Adyar</news:title></news:news></url></urlset>"""

    class R:
        def __init__(self, text=None, content=None):
            self.text, self.content, self.ok = text, content, True

    site = fulltext.Site("example.com", None, "bot", 5)
    site.delay = 0
    monkeypatch.setattr(site, "_get", lambda url: R(text="User-agent: *\nAllow: /\nSitemap: https://example.com/news.xml")
                        if url.endswith("robots.txt") else R(content=xml))
    site.load()
    assert site.entries == {"road caves in at adyar": "https://example.com/story"}


# ------------------------------------------------------------ LLM labels --

def test_old_labels_still_count_and_new_ones_win(tmp_path):
    p = tmp_path / "labels.jsonl"
    rows = [{"k": "a", "v": "news-v1", "category": "OLD"}, {"k": "b", "v": "news-v1", "category": "OLD"},
            {"k": "b", "v": "news-v2", "category": "NEW"}, {"k": "c", "v": "news-v0", "category": "GONE"}]
    p.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    got = newsllm._cache_read(p, "news-v2", ("news-v1",))
    assert {k: v["category"] for k, v in got.items()} == {"a": "OLD", "b": "NEW"}
    # a v1 line after the v2 answer does not replace it
    p.write_text("\n".join(json.dumps(r) for r in rows[2:3] + rows[1:2]), encoding="utf-8")
    assert newsllm._cache_read(p, "news-v2", ("news-v1",))["b"]["category"] == "NEW"


def test_classify_schema_asks_for_the_details():
    item = newsllm._classify_schema(["OTHER"])["properties"]["items"]["items"]
    for k in ("people", "organisations", "dead", "injured", "status", "place"):
        assert k in item["required"]


def test_details_become_document_columns():
    d = pd.DataFrame({"doc_id": ["a", "b"]})
    lab = pd.DataFrame({"doc_id": ["a", "b"], "people": [["Ravi", "Ravi", " "], None], "organisations": [["GCC"], None],
                        "dead": [2, None], "injured": [0, None], "status": ["action_taken", None], "place": ["Anna Salai", ""]})
    news._details(d, lab)
    assert d.loc[0, "ai_people"] == "Ravi" and d.loc[0, "ai_orgs"] == "GCC"
    assert d.loc[0, "ai_dead"] == 2 and np.isnan(d.loc[1, "ai_dead"])
    assert d.loc[0, "ai_status"] == "action_taken" and d.loc[1, "ai_status"] is None
    assert d.loc[0, "ai_place"] == "Anna Salai" and d.loc[1, "ai_place"] is None


# ----------------------------------------------------- Tamil-English stories --

def _docs(rows):
    d = pd.DataFrame(rows, columns=["lang", "category_code", "is_incident", "place_text", "geo_level", "dead", "hours"])
    d["story_id"] = [f"S{i}" for i in range(len(d))]
    d["published_at"] = pd.Timestamp("2026-10-04", tz="Asia/Kolkata") + pd.to_timedelta(d.pop("hours"), unit="h")
    return d


def test_translated_tamil_headline_joins_the_english_story():
    d = _docs([("ta", "FIRE", 1, "Adyar", "locality", 0, 0), ("en", "FIRE", 1, "Adyar", "locality", 0, 3),
               ("en", "FIRE", 1, "Adyar", "locality", 0, 40)])  # the third is outside the 24 h window
    E = np.eye(3, 4, dtype=np.float32)  # multilingual vectors that do not match
    E_en = np.tile(np.array([[1, 0, 0, 0]], dtype=np.float32), (3, 1))  # the translations match
    out = news._embed_stories(d, E, E_en, np.ones(3, bool))
    assert out["english_tamil_translated_merges"] == 1
    assert d["story_id"].iloc[0] == d["story_id"].iloc[1] != d["story_id"].iloc[2]


def _translated_merges(rows):
    d = _docs(rows)
    E_en = np.tile(np.array([[1, 0, 0, 0]], dtype=np.float32), (len(d), 1))
    return news._embed_stories(d, np.eye(len(d), 4, dtype=np.float32), E_en, np.ones(len(d), bool))["english_tamil_translated_merges"]


def test_translated_match_needs_the_same_place():
    # two different places
    assert _translated_merges([("ta", "FIRE", 1, "Adyar", "locality", 0, 0), ("en", "FIRE", 1, "Tondiarpet", "locality", 0, 1)]) == 0
    # neither names a place
    assert _translated_merges([("ta", "FIRE", 1, "Chennai", "district", 0, 0), ("en", "FIRE", 1, "Chennai", "district", 0, 1)]) == 0
    # only one names a place: also the same category
    assert _translated_merges([("ta", "FIRE", 1, "Adyar", "locality", 0, 0), ("en", "FLOOD", 1, "Chennai", "district", 0, 1)]) == 0
    assert _translated_merges([("ta", "FIRE", 1, "Adyar", "locality", 0, 0), ("en", "FIRE", 1, "Chennai", "district", 0, 1)]) == 1
    # death counts that disagree
    assert _translated_merges([("ta", "FIRE", 1, "Adyar", "locality", 2, 0), ("en", "FIRE", 1, "Adyar", "locality", 3, 1)]) == 0


# ------------------------------------------------------------ story places --

def test_headline_incident_takes_the_place_of_its_story():
    events = pd.DataFrame({"source": ["news", "news", "police"], "geo_level": ["district", "district", "point"],
                           "ext_ref": ["S1", "S2", None], "lat": [13.08, 13.08, 13.0], "lon": [80.27, 80.27, 80.2],
                           "place_text": ["Chennai", "Chennai", "x"], "loc_precision_m": [15000.0, 15000.0, 10.0],
                           "geo_conf": [0.3, 0.3, 1.0], "geo_method": ["gazetteer"] * 3})
    docs = pd.DataFrame({"doc_id": ["d1", "d2", "d3"], "story_id": ["S1", "S1", "S1"], "is_district": [1, 1, 1],
                         "geo_level": ["district", "zone", "locality"], "place_text": ["Chennai", "Adyar zone", "Besant Nagar"],
                         "lat": [13.08, 13.0, 13.0], "lon": [80.27, 80.25, 80.26]})
    e = geolocate.place_from_story(events, docs)
    assert e.loc[0, "place_text"] == "Besant Nagar" and e.loc[0, "geo_level"] == "locality" and e.loc[0, "geo_method"] == "story_place"
    assert e.loc[1, "geo_level"] == "district"  # its story names no place: it stays district-wide
    assert e.loc[2, "place_text"] == "x"


# ------------------------------------------------------------- pair check --

class FakeLLM:
    model = "fake"

    def __init__(self):
        self.calls = 0

    def available(self):
        return True

    def json(self, system, user, schema, max_tokens=1500):
        self.calls += 1
        n = user.count("[id ")
        return {"items": [{"id": str(i), "same": i == 0, "reason": "same street, same hour"} for i in range(n)]}


def test_linker_asks_once_and_caches(tmp_path):
    ev = pd.DataFrame({"event_id": ["A", "B", "C"], "source": ["police", "news", "news"], "title": ["t1", "t2", "t3"],
                       "text": ["x", "y", "z"], "place_text": ["Adyar"] * 3,
                       "reported_at": pd.to_datetime(["2026-10-04"] * 3)})
    pairs = pd.DataFrame({"event_a": ["A", "A"], "event_b": ["B", "C"], "prob": [0.6, 0.5], "decision": ["review", "review"],
                          "features": ["{}", "{}"]})
    llm = FakeLLM()
    items, _ = workers.linker(pairs, ev, llm, tmp_path / "link.jsonl")
    assert llm.calls == 1
    assert items["suggestion"].str.startswith("AI suggests same incident").tolist() == [True, False]
    again = FakeLLM()
    items2, _ = workers.linker(pairs, ev, again, tmp_path / "link.jsonl")
    assert again.calls == 0 and items2["suggestion"].tolist() == items["suggestion"].tolist()
    none, _ = workers.linker(pairs, ev, None, tmp_path / "other.jsonl")
    assert none["suggestion"].eq("person to decide").all()
