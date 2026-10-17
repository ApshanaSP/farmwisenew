"""A news report links to a departmental record only when both are the same kind of incident."""
import pandas as pd

from dintel.linking import _news_gate


def test_news_pairs_need_the_same_category():
    cand = pd.DataFrame({"has_news": [1, 1, 0, 0], "same_cat": [0, 1, 0, 1], "prob": [0.97, 0.97, 0.97, 0.97]})
    _news_gate(cand)
    # news + different category: blocked; news + same category and departmental pairs: the scorer decides
    assert cand["prob"].tolist() == [0.0, 0.97, 0.97, 0.97]
    assert cand["news_gate"].tolist() == [True, False, False, False]
