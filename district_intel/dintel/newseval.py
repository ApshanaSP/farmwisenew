"""Labelled checks for news places and same-event grouping (`run_pipeline.py news-labels` / `news-eval`).

Both read the last build's documents, so "before" is what that build stored and "after" is recomputed from the
same reports with dintel/placerole.py and dintel/eventmatch.py. Every "after" number is cross-validated: the
model that scores a labelled item never saw that item's label.

  places  reference/labels/news_place_labels.csv: doc_id -> event_place (a gazetteer name, or NONE when the report
          names no district place where the event happened: only "Chennai", many areas, or outside the district)
  pairs   reference/labels/news_pair_labels.csv: a_id, b_id -> same (1 = the same real-world event)
"""
from __future__ import annotations

import json
import sqlite3

import numpy as np
import pandas as pd

from . import eventmatch as em
from . import placerole as pr
from .util import Settings, log

NONE = "NONE"


def load_docs(settings: Settings) -> pd.DataFrame:
    con = sqlite3.connect(settings.path(settings.raw["output"]["sqlite"]))
    d = pd.read_sql("SELECT doc_id, lang, title, summary, body, published_at, is_district, is_incident, report_type, "
                    "category_code, dead, injured, places, place_text, geo_level, story_id FROM documents "
                    "WHERE source_kind = 'news'", con)
    con.close()
    d["published_at"] = pd.to_datetime(d["published_at"], utc=True)
    d["_text"] = (d["title"].fillna("") + ". " + d["summary"].fillna("") + ". " + d["body"].fillna("")).str.slice(0, 6000)
    return d.reset_index(drop=True)


def gazetteer(settings: Settings):
    """The build's gazetteer: the news pipeline's places plus police and PWD localities (as dintel/pipeline.py)."""
    from .loaders import news
    pol = json.loads(settings.src("police", "taluks_config").read_text(encoding="utf-8"))
    rows = [{"name": l["name"], "lat": l["lat"], "lon": l["lng"]} for t in pol["taluks"] for l in t["localities"]]
    con = sqlite3.connect(settings.path(settings.raw["output"]["sqlite"]))
    p = pd.read_sql("SELECT place_text, lat, lon FROM events WHERE source = 'pwd' AND place_text IS NOT NULL", con)
    con.close()
    p = p.groupby("place_text")[["lat", "lon"]].mean().reset_index()
    p["name"] = p["place_text"].str.replace(r"\s*\(.*\)$", "", regex=True)
    extra = pd.DataFrame(rows + p[["name", "lat", "lon"]].to_dict("records")).drop_duplicates("name")
    return news.build_gazetteer(settings, extra)


def mentions_of(d: pd.DataFrame, gaz) -> list:
    return [gaz.find_mentions(t) for t in d["_text"]]


# ------------------------------------------------------------------ sampling --

def place_sample(settings: Settings, n: int = 320, seed: int = 11) -> pd.DataFrame:
    """Reports to label: Chennai reports naming at least one district place, incidents and several-place reports first."""
    d = load_docs(settings)
    rf, gaz, _ = gazetteer(settings)
    ms = mentions_of(d, gaz)
    names = [list(dict.fromkeys(m.place.name for m in x if m.place.category != "district")) for x in ms]
    d["_names"] = names
    d["_n"] = [len(x) for x in names]
    pool = d[(d["is_district"] == 1) & (d["_n"] > 0)]
    rng = np.random.default_rng(seed)
    w = 1.0 + 2.0 * pool["is_incident"].fillna(0).to_numpy() + 2.0 * (pool["_n"] > 1).to_numpy()
    pick = rng.choice(len(pool), size=min(n, len(pool)), replace=False, p=w / w.sum())
    s = pool.iloc[np.sort(pick)]
    out = []
    for i, r in s.iterrows():
        ctx = []
        for m in ms[i]:
            if m.place.category == "district":
                continue
            ctx.append(f"[{m.place.name}] …{r['_text'][max(0, m.start - 70):m.end + 70]}…".replace("\n", " "))
        out.append({"doc_id": r["doc_id"], "lang": r["lang"], "is_incident": r["is_incident"], "title": r["title"],
                    "candidates": "|".join(r["_names"]), "contexts": " || ".join(ctx[:6]), "old_place": r["place_text"],
                    "event_place": "", "note": ""})
    return pd.DataFrame(out)


def pair_sample(settings: Settings, n: int = 340, seed: int = 5) -> pd.DataFrame:
    """Candidate pairs to label, stratified by cosine band and language mix, plus hard negatives (same day,
    same category, both incidents)."""
    from . import embed
    d = load_docs(settings)
    d["_match_text"] = [em.match_text(t, s) for t, s in zip(d["title"], d["summary"])]
    E = embed.encode(d["_match_text"].tolist(), prefix="", cache_path=embed.BGE_CACHE, model=embed.BGE)
    scope = (d["is_district"] == 1).to_numpy()
    c = em.candidates(d, E, scope)
    lang = d["lang"].to_numpy()
    c["cross"] = lang[c["a"]] != lang[c["b"]]
    inc = d["is_incident"].fillna(0).to_numpy()
    c["inc"] = (inc[c["a"]] == 1) | (inc[c["b"]] == 1)
    c["band"] = pd.cut(c["cos"], [0, 0.62, 0.7, 0.78, 0.86, 1.01], labels=False)
    rng = np.random.default_rng(seed)
    parts = []
    # half the sample from incident pairs (the ones the map and briefing use), cross-language pairs over-weighted
    for (band, cross), g in c[c["inc"]].groupby(["band", "cross"]):
        k = int(round(n * 0.6 / 10 * (1.4 if cross else 0.6)))
        parts.append(g.sample(min(k, len(g)), random_state=int(rng.integers(1e9))))
    rest = c[~c["inc"]]
    parts.append(rest.sample(min(int(n * 0.2), len(rest)), random_state=seed))
    # hard negatives: same category, both incidents, within a day, not near-duplicates
    cat = d["category_code"].to_numpy()
    t = em.hours(d["published_at"])
    hard = c[(inc[c["a"]] == 1) & (inc[c["b"]] == 1) & (cat[c["a"]] == cat[c["b"]]) & (np.abs(t[c["a"]] - t[c["b"]]) < 24)
             & (c["cos"] < 0.8)]
    parts.append(hard.sample(min(int(n * 0.2), len(hard)), random_state=seed + 1))
    s = pd.concat(parts).drop_duplicates(["a", "b"]).head(n)
    ids, txt = d["doc_id"].to_numpy(), d["_match_text"].to_numpy()
    when = d["published_at"].dt.tz_convert("Asia/Kolkata").dt.strftime("%m-%d %H:%M").to_numpy()
    return pd.DataFrame({"a_id": ids[s["a"]], "b_id": ids[s["b"]], "a_lang": lang[s["a"]], "b_lang": lang[s["b"]],
                         "a_time": when[s["a"]], "b_time": when[s["b"]], "a_text": [x[:300] for x in txt[s["a"]]],
                         "b_text": [x[:300] for x in txt[s["b"]]], "cos": s["cos"].round(3).to_numpy(), "same": "", "note": ""})


# ---------------------------------------------------------------- evaluation --

def _folds(keys: list[str], k: int = 5, seed: int = 3) -> dict[str, int]:
    u = sorted(set(keys))
    rng = np.random.default_rng(seed)
    rng.shuffle(u)
    return {x: i % k for i, x in enumerate(u)}


def eval_places(settings: Settings, d: pd.DataFrame | None = None, gaz=None) -> dict:
    d = load_docs(settings) if d is None else d
    if gaz is None:
        _, gaz, _ = gazetteer(settings)
    lab = pr.load_labels()
    pos = {k: i for i, k in enumerate(d["doc_id"])}
    lab = lab[lab["doc_id"].isin(pos)]
    if lab.empty:
        return {"labelled": 0}
    gold = dict(zip(lab["doc_id"], lab["event_place"]))
    docs = [(k, d.at[pos[k], "_text"], len(str(d.at[pos[k], "title"] or "")), gaz.find_mentions(d.at[pos[k], "_text"])) for k in gold]
    rows, y, ids = pr.training_rows(docs, lab)
    fold = _folds(list(gold))
    pred = {}
    for f in range(5):
        tr = np.array([fold[i] != f for i in ids])
        model = pr.fit(rows[tr], y[tr]) if tr.any() and len(set(y[tr])) == 2 else pr.prior_model()
        for k, text, tlen, ms in docs:
            if fold[k] == f:
                ev, _ = pr.decide(pr.mention_rows(text, tlen, ms), model)
                pred[k] = ev.name if ev else NONE
    prior = {}
    for k, text, tlen, ms in docs:
        ev, _ = pr.decide(pr.mention_rows(text, tlen, ms), pr.prior_model())
        prior[k] = ev.name if ev else NONE
    old = {k: (NONE if d.at[pos[k], "geo_level"] in (None, "district") or pd.isna(d.at[pos[k], "geo_level"]) else d.at[pos[k], "place_text"])
           for k in gold}
    acc = lambda p: round(float(np.mean([p[k] == gold[k] for k in gold])), 4)
    has_place = [k for k in gold if gold[k] != NONE]
    wrong_place = lambda p: round(float(np.mean([p[k] not in (gold[k], NONE) for k in gold])), 4)
    return {"labelled": len(gold), "with_event_place": len(has_place),
            "accuracy_before": acc(old), "accuracy_after_rules_only": acc(prior), "accuracy_after": acc(pred),
            "wrong_place_before": wrong_place(old), "wrong_place_after": wrong_place(pred),
            "place_found_before": round(float(np.mean([old[k] == gold[k] for k in has_place])), 4) if has_place else None,
            "place_found_after": round(float(np.mean([pred[k] == gold[k] for k in has_place])), 4) if has_place else None,
            "errors_after": [(k, gold[k], pred[k]) for k in gold if pred[k] != gold[k]][:40]}


def _prf(pred: np.ndarray, y: np.ndarray) -> dict:
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum()); fn = int((~pred & (y == 1)).sum())
    P = tp / (tp + fp) if tp + fp else 0.0
    R = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": round(P, 4), "recall": round(R, 4), "f1": round(2 * P * R / (P + R), 4) if P + R else 0.0,
            "false_merge_rate": round(fp / max(1, int((y == 0).sum())), 4), "tp": tp, "fp": fp, "fn": fn}


def eval_pairs(settings: Settings, d: pd.DataFrame | None = None, gaz=None, use_llm: bool = True) -> dict:
    from . import embed
    d = load_docs(settings) if d is None else d
    lab = em.load_labels()
    pos = {k: i for i, k in enumerate(d["doc_id"])}
    lab = lab[lab["a_id"].isin(pos) & lab["b_id"].isin(pos)].reset_index(drop=True)
    if lab.empty:
        return {"labelled": 0}
    y = lab["same"].to_numpy()
    sid = d["story_id"].to_numpy()
    old = np.array([sid[pos[a]] == sid[pos[b]] for a, b in zip(lab["a_id"], lab["b_id"])])
    # the new places first (place agreement is a feature)
    apply_places(d, gaz if gaz is not None else gazetteer(settings)[1])
    d["_match_text"] = [em.match_text(t, s) for t, s in zip(d["title"], d["summary"])]
    E = embed.encode(d["_match_text"].tolist(), prefix="", cache_path=embed.BGE_CACHE, model=embed.BGE)
    rr = em.Reranker()
    F, _ = em.labelled_features(d, E, lab, rr)
    cross = F["cross_lang"].to_numpy() == 1
    keys = [em.pair_key(a, b) for a, b in zip(lab["a_id"], lab["b_id"])]
    cache = em._cache_read_same() if use_llm else {}
    fold = _folds(keys)
    fk = np.array([fold[k] for k in keys])
    p = np.zeros(len(y))
    for f in range(5):
        tr, te = fk != f, fk == f
        m = em.fit(F[tr], y[tr], em.FEATURES)
        p[te] = m.prob(F[te])
    rerank_only = F["rerank"].fillna(0).to_numpy() >= 0.5
    model_only = p >= em.MERGE_P
    gray = (p >= em.REVIEW_P) & (p < em.MERGE_P)
    llm_yes = np.array([cache.get(k) is True for k in keys])
    llm_known = np.array([k in cache for k in keys])
    with_llm = model_only | (gray & llm_yes)
    out = {"labelled": int(len(y)), "same_event_pairs": int(y.sum()), "cross_language_pairs": int(cross.sum()),
           "cross_language_same": int(y[cross].sum()),
           "before": _prf(old, y), "before_cross_language": _prf(old[cross], y[cross]),
           "reranker_alone": _prf(rerank_only, y),
           "after_model": _prf(model_only, y), "after_model_cross_language": _prf(model_only[cross], y[cross]),
           "after_with_llm": _prf(with_llm, y), "after_with_llm_cross_language": _prf(with_llm[cross], y[cross]),
           "gray_pairs": int(gray.sum()), "gray_pairs_with_llm_answer": int((gray & llm_known).sum())}
    return out


def apply_places(d: pd.DataFrame, gaz) -> None:
    """Recompute place_text / geo_level with the role model (trained on all labels) for d in place."""
    lab = pr.load_labels()
    pos = {k: i for i, k in enumerate(d["doc_id"])}
    ms = mentions_of(d, gaz)
    docs = [(k, d.at[pos[k], "_text"], len(str(d.at[pos[k], "title"] or "")), ms[pos[k]]) for k in lab["doc_id"] if k in pos]
    rows, y, _ = pr.training_rows(docs, lab)
    model = pr.fit(rows, y) if len(set(y)) == 2 else pr.prior_model()
    place, level = [], []
    for t, title, m in zip(d["_text"], d["title"], ms):
        ev, _ = pr.decide(pr.mention_rows(t, len(str(title or "")), m), model)
        place.append(ev.name if ev else "Chennai")
        level.append(ev.category if ev else "district")
    d["place_text"], d["geo_level"] = place, level


def report(settings: Settings) -> dict:
    d = load_docs(settings)
    _, gaz, _ = gazetteer(settings)
    out = {"places": eval_places(settings, d.copy(), gaz)}
    inc = d[(d["is_incident"] == 1)].copy()
    before = float((inc["geo_level"].fillna("district") == "district").mean())
    apply_places(inc, gaz)
    out["incident_reports_chennai_only"] = {"before": round(before, 4),
                                            "after": round(float((inc["geo_level"] == "district").mean()), 4), "n": len(inc)}
    out["pairs"] = eval_pairs(settings, d.copy(), gaz)
    out["grouping"] = eval_grouping(settings, d.copy(), gaz)
    log.info("news eval: %s", json.dumps({k: v for k, v in out.items()}, default=str)[:4000])
    return out


def eval_grouping(settings: Settings, d: pd.DataFrame | None = None, gaz=None) -> dict:
    """The final story groups, not just pair scores: for each fold, models trained on the other folds score every
    candidate pair of the build, the constrained grouping runs over all reports, and the fold's labelled pairs are
    checked (same group or not). Reranker scores come from the cache (pairs not scored use the model without them);
    LLM answers from its cache."""
    from . import embed
    d = load_docs(settings) if d is None else d
    apply_places(d, gaz if gaz is not None else gazetteer(settings)[1])
    d["_match_text"] = [em.match_text(t, s) for t, s in zip(d["title"], d["summary"])]
    E = embed.encode(d["_match_text"].tolist(), prefix="", cache_path=embed.BGE_CACHE, model=embed.BGE)
    rr = em.Reranker()
    rr.ok = False  # cache only: no new model calls here
    lab = em.load_labels()
    pos = {k: i for i, k in enumerate(d["doc_id"])}
    lab = lab[lab["a_id"].isin(pos) & lab["b_id"].isin(pos)].reset_index(drop=True)
    LF, y = em.labelled_features(d, E, lab, rr)
    c = em.candidates(d, E, (d["is_district"] == 1).to_numpy())
    txt = d["_match_text"].to_numpy()
    c["rerank"] = rr.scores([(txt[i], txt[j]) for i, j in zip(c["a"], c["b"])])
    F = em.features(d, c)
    ids = d["doc_id"].to_numpy()
    keys_c = [em.pair_key(ids[i], ids[j]) for i, j in zip(c["a"], c["b"])]
    llm = em._cache_read_same()
    keys = [em.pair_key(a, b) for a, b in zip(lab["a_id"], lab["b_id"])]
    fold = _folds(keys)
    fk = np.array([fold[k] for k in keys])
    together = np.zeros(len(y), bool)
    for f in range(5):
        tr = fk != f
        has = LF["rerank"].notna().to_numpy() & tr
        full, part = em.fit(LF[has], y[has], em.FEATURES), em.fit(LF[tr], y[tr], em.FEATURES_NO_RERANK)
        p = np.where(F["rerank"].notna(), full.prob(F), part.prob(F))
        gray = (p >= em.REVIEW_P) & (p < em.MERGE_P)
        yes = np.array([llm.get(k) is True for k in keys_c])
        no = np.array([llm.get(k) is False for k in keys_c])
        decided = (p >= em.MERGE_P) | (gray & yes)
        p_eff = np.where(gray & no, 0.0, np.where(gray & yes, np.maximum(p, em.MERGE_P), p))
        g = em.group(d["story_id"].to_numpy(), c["a"].to_numpy(), c["b"].to_numpy(), p_eff, decided)
        te = np.where(fk == f)[0]
        together[te] = [g[pos[lab.at[i, "a_id"]]] == g[pos[lab.at[i, "b_id"]]] for i in te]
    cross = LF["cross_lang"].to_numpy() == 1
    sid = d["story_id"].to_numpy()
    old = np.array([sid[pos[a]] == sid[pos[b]] for a, b in zip(lab["a_id"], lab["b_id"])])
    return {"candidates": int(len(c)), "reranked": int(c["rerank"].notna().sum()),
            "before": _prf(old, y), "after": _prf(together, y),
            "before_cross_language": _prf(old[cross], y[cross]), "after_cross_language": _prf(together[cross], y[cross])}
