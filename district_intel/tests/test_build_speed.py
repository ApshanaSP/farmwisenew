"""The hourly build's speed-ups must not change results: faster code gives the same values, and the caches give back
exactly what a fresh run would. Run: python -m pytest -q"""
from __future__ import annotations

import hashlib
import sys
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dintel import store  # noqa: E402
from dintel import textproc as tp  # noqa: E402
from dintel.incidents import _sets  # noqa: E402
from dintel.loaders.news import MentionCache  # noqa: E402


def _simhash_reference(text) -> str:
    """The original one-shingle-at-a-time version."""
    toks = tp.normalize(text).split()
    shingles = [" ".join(toks[i:i + 3]) for i in range(max(1, len(toks) - 2))] if toks else [""]
    v = np.zeros(64)
    for sh in shingles:
        h = int.from_bytes(hashlib.md5(sh.encode("utf-8")).digest()[:8], "big")
        v += np.where(np.array([(h >> i) & 1 for i in range(64)]) == 1, 1, -1)
    return f"{sum(1 << i for i in range(64) if v[i] > 0):016x}"


def test_simhash_matches_the_original():
    texts = ["", None, float("nan"), "a", "one two", "Waterlogging on Anna Salai near the subway, residents complain",
             "மழைநீர் தேங்கி பொதுமக்கள் அவதி", "Pothole pothole pothole pothole"]
    assert [tp.simhash64(t) for t in texts] == [_simhash_reference(t) for t in texts]


def test_sqlable_keeps_text_and_converts_the_rest():
    df = pd.DataFrame({"text": ["a", None, "c"], "lists": [["x"], None, {"k": 1}],
                       "nums": pd.Series([np.int64(3), None, "x"], dtype=object)})
    out = store._sqlable(df)
    assert out["text"].tolist() == ["a", None, "c"]
    assert out["lists"].tolist() == ['["x"]', None, '{"k": 1}']
    assert type(out["nums"][0]) is int


def test_sets_skip_blanks_by_default():
    ids = np.array(["I1", "I1", "I2", "I2"])
    vals = np.array(["b", "a", np.nan, "a"], dtype=object)
    assert _sets(ids, vals) == {"I1": {"a", "b"}, "I2": {"a"}}


@dataclass
class _Place:
    name: str
    category: str
    requires_context: bool = False


@dataclass
class _Mention:
    place: _Place
    start: int
    end: int
    matched_text: str


class _Gaz:
    def __init__(self, entries):
        self.entries, self.calls = entries, 0

    def find_mentions(self, text):
        self.calls += 1
        out = []
        for p, aliases, _ in self.entries:
            for a in aliases:
                k = text.find(a)
                if k >= 0:
                    out.append(_Mention(p, k, k + len(a), a))
        return sorted(out, key=lambda m: m.start)


def _cache(entries, path):
    rf = SimpleNamespace(__file__=__file__, Mention=_Mention)
    gaz = _Gaz(entries)
    return MentionCache(rf, gaz, entries, path=path), gaz


def test_mention_cache_gives_back_the_same_mentions(tmp_path):
    path = tmp_path / "mentions.json"
    entries = [(_Place("Velachery", "locality"), ["Velachery"], []), (_Place("Adyar", "zone"), ["Adyar"], [])]
    texts = ["Flooding in Velachery and Adyar", "No place here", ""]
    first, gaz = _cache(entries, path)
    fresh = [first.find(t) for t in texts]
    first.save()
    assert gaz.calls == 3
    # a new build: new Place objects (coordinates may differ), same names and aliases -> nothing is matched again
    entries2 = [(_Place("Velachery", "locality"), ["Velachery"], []), (_Place("Adyar", "zone"), ["Adyar"], [])]
    second, gaz2 = _cache(entries2, path)
    again = [second.find(t) for t in texts]
    assert gaz2.calls == 0 and second.hits == 3
    assert [[(m.place.name, m.start, m.end, m.matched_text) for m in ms] for ms in again] == \
           [[(m.place.name, m.start, m.end, m.matched_text) for m in ms] for ms in fresh]
    assert again[0][0].place is entries2[0][0]  # rebuilt on this build's own Place objects


def test_mention_cache_is_dropped_when_aliases_change(tmp_path):
    path = tmp_path / "mentions.json"
    first, _ = _cache([(_Place("Velachery", "locality"), ["Velachery"], [])], path)
    first.find("Velachery rain")
    first.save()
    second, gaz = _cache([(_Place("Velachery", "locality"), ["Velachery", "Velacheri"], [])], path)
    second.find("Velachery rain")
    assert gaz.calls == 1 and second.hits == 0


def test_mention_cache_default_file(tmp_path, monkeypatch):
    """The pipeline passes no path: the cache must use (and reload) MENTION_CACHE."""
    from dintel.loaders import news
    monkeypatch.setattr(news, "MENTION_CACHE", tmp_path / "default.json")
    entries = [(_Place("Adyar", "zone"), ["Adyar"], [])]
    rf = SimpleNamespace(__file__=__file__, Mention=_Mention)
    c = MentionCache(rf, _Gaz(entries), entries)
    c.find("Adyar")
    c.save()
    again = MentionCache(rf, _Gaz(entries), entries)
    again.find("Adyar")
    assert again.hits == 1
