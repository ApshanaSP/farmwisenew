"""The local news classifier: whole Tamil words are separate features, so suicide is never read as murder."""
from pathlib import Path

import pandas as pd
import pytest

from dintel.newslocal import LocalModel, _fit, normalize

MODEL = Path(__file__).resolve().parents[1] / "output" / "models" / "news_local"


def _toy():
    rows = [("சென்னையில் இளைஞர் வெட்டிக் கொலை", "CRIME_VIOLENT"), ("ரவுடி கொலை வழக்கில் இருவர் கைது", "CRIME_VIOLENT"),
            ("Youth hacked to death in Chennai", "CRIME_VIOLENT"), ("Man murdered over dispute", "CRIME_VIOLENT"),
            ("மருத்துவ மாணவர் தற்கொலை", "SUICIDE_SELF_HARM"), ("கடன் தொல்லையால் தொழிலாளி தற்கொலை", "SUICIDE_SELF_HARM"),
            ("Student dies by suicide in hostel", "SUICIDE_SELF_HARM"), ("Woman ends life in Chennai", "SUICIDE_SELF_HARM")] * 3
    texts = [normalize(t, "") for t, _ in rows]
    y = {"category": [c for _, c in rows], "report_type": ["incident"] * len(rows), "is_incident": [True] * len(rows), "in_chennai": [True] * len(rows)}
    return texts, y


def test_suicide_is_not_murder_in_a_trained_toy_model():
    texts, y = _toy()
    import numpy as np

    vec, heads = _fit(texts, y, np.ones(len(texts)))
    m = LocalModel(Path("."))
    m.vec, m.heads = vec, heads
    p = m.predict(pd.DataFrame({"doc_id": [1, 2], "title": ["ஆட்டோ டிரைவர் தற்கொலை", "இளைஞர் கொலை"], "summary": ["", ""]}))
    assert p.loc[0, "category"] == "SUICIDE_SELF_HARM"
    assert p.loc[1, "category"] == "CRIME_VIOLENT"


@pytest.mark.skipif(not (MODEL / "model.joblib").exists(), reason="no trained local model (run train-news-local)")
def test_production_model_never_calls_a_tamil_suicide_murder():
    m = LocalModel(MODEL).load()
    p = m.predict(pd.DataFrame({"doc_id": [1], "title": ["சென்னையில் மருத்துவ மாணவர் தற்கொலை"], "summary": [""]}))
    assert p.loc[0, "category"] != "CRIME_VIOLENT"
