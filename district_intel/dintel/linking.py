"""Cross-source linking: same real-world incident reported by different sources.

Blocking -> pair features -> calibrated scorer -> decision bands -> union-find.

* Blocking: only compatible category groups, within the category's own time window
  (plus a 48 h lag for news) and distance (plus both points' location precision).
  A KD-tree finds spatial candidates, so the cost grows with neighbours, not n^2.
* Scorer: logistic regression on distance, time gap, wording (character n-grams), meaning
  (multilingual-e5 cosine, so Tamil and English can match), shared named things (landmarks,
  roads, agencies, amounts), same category, same ward and precision. Trained on half of the
  overlay's world events; the other half is held out for evaluation. Falls back to a fixed
  formula when there is no truth.
* Bands: >= merge threshold links; the review band goes to the review queue (Linker agent,
  then a person); below it, no link. Each event keeps only its best partner per source.
* Real-data check: the overlay's truth is synthetic, so real news-vs-record candidate pairs are
  written out for a person to mark (reference/labels/link_pair_labels.csv); every build reports
  the scorer's accuracy on the marked ones.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from . import embed
from . import textproc as tp
from .refdata import Reference
from .util import INTEL_DIR, IST, UnionFind, jdump, log, to_xy

LINK_GROUP = {"FLOOD": "WATER", "DRAINAGE": "WATER", "ROADS_TRAFFIC": "ROADS", "GREEN": "ROADS", "ELECTRICAL": "ELEC",
              "PUBLIC_SAFETY": "ELEC", "STRUCTURES_LAND": "STRUCT", "HEALTH": "HEALTH", "WASTE_SANITATION": "WASTE",
              "CRIME": "CRIME", "PUBLIC_ORDER": "ORDER", "WORKS": "WORKS", "ENVIRONMENT": "ENV"}
LINK_SOURCES = {"grievance", "police", "pwd", "hospital", "news"}
FEATURES = ["dist_norm", "dt_norm", "text_sim", "sem_sim", "ent_overlap", "same_cat", "same_ward", "coarse", "has_news"]
SEM_FLOOR = 0.75             # e5 cosine of two unrelated Chennai reports; sem_sim = (cosine - floor) / (1 - floor)
# record texts change with every generator run, so their vectors live in their own pruned file
RECORD_VECTORS = INTEL_DIR / "output" / "cache" / "e5_small_records.npz"
LABELS = INTEL_DIR / "reference" / "labels" / "link_pair_labels.csv"
REAL_CANDIDATES = INTEL_DIR / "output" / "eval" / "link_real_candidates.csv"


def _candidates(e: pd.DataFrame, ref: Reference) -> pd.DataFrame:
    rad = e["category_code"].map(lambda c: ref.cat.get(c, ref.cat["OTHER"])["link_radius_m"]).to_numpy(float)
    win = e["category_code"].map(lambda c: ref.cat.get(c, ref.cat["OTHER"])["link_window_h"]).to_numpy(float)
    prec = e["loc_precision_m"].fillna(300).clip(upper=4000).to_numpy(float)
    xy = to_xy(e["lat"].to_numpy(), e["lon"].to_numpy())
    t = e["reported_at"].astype("int64").to_numpy() / 3.6e12
    src = e["source"].to_numpy()
    grp = e["_lg"].to_numpy()
    news = src == "news"
    out = []
    for g in np.unique(grp):
        idx = np.where(grp == g)[0]
        if len(idx) < 2:
            continue
        tree = cKDTree(xy[idx])
        rmax = rad[idx].max()
        fine = prec[idx] <= 300
        pairs = tree.query_pairs(rmax + 600, output_type="ndarray")
        if len(fine) and (~fine).any():
            # points with coarse locations get a wider search: all of them in one KD-tree call, and the pairs are
            # de-duplicated as one integer key per pair (sorting rows with np.unique(axis=0) was the slow part)
            coarse = np.where(~fine)[0]
            hits = tree.query_ball_point(xy[idx[coarse]], rmax + prec[idx[coarse]] + 300)
            k = np.repeat(coarse, [len(h) for h in hits])
            m = np.fromiter((j for h in hits for j in h), dtype=np.int64, count=len(k))
            keep = k != m
            lo, hi = np.minimum(k[keep], m[keep]), np.maximum(k[keep], m[keep])
            if len(lo):
                n = len(idx)
                p0 = pairs.reshape(-1, 2).astype(np.int64)
                key = np.unique(np.concatenate([p0[:, 0] * n + p0[:, 1], lo * n + hi]))
                pairs = np.column_stack([key // n, key % n])
        if not len(pairs):
            continue
        a, b = idx[pairs[:, 0]], idx[pairs[:, 1]]
        keep = src[a] != src[b]
        a, b = a[keep], b[keep]
        dt = np.abs(t[a] - t[b])
        wmax = np.maximum(win[a], win[b]) + np.where(news[a] | news[b], 48, 0)
        d = np.hypot(*(xy[a] - xy[b]).T)
        allow = np.maximum(rad[a], rad[b]) + (prec[a] + prec[b]) / 2
        keep = (dt <= wmax) & (d <= allow)
        out.append(pd.DataFrame({"a": a[keep], "b": b[keep], "dist_m": d[keep], "dt_h": dt[keep],
                                 "dist_norm": d[keep] / allow[keep], "dt_norm": dt[keep] / wmax[keep]}))
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame(columns=["a", "b", "dist_m", "dt_h", "dist_norm", "dt_norm"])


def _split(world_id: str) -> str:
    return "train" if int(hashlib.md5(world_id.encode()).hexdigest(), 16) % 2 == 0 else "test"


def link(events: pd.DataFrame, ref: Reference, truth: pd.DataFrame | None, merge_thr: float, review_thr: float,
         english: dict | None = None) -> dict:
    """english: event_id -> English headline of a Tamil news report (for named things; meaning reads Tamil directly)."""
    e = events
    lk = e["source"].isin(LINK_SOURCES) & e["lat"].notna() & (e["in_district"] == 1) & (e["geo_level"] != "district") \
        & e["category_family"].map(LINK_GROUP).notna() & (e["junk_flag"] != 1)
    L = e[lk].copy().reset_index()
    L["_lg"] = L["category_family"].map(LINK_GROUP)
    cand = _candidates(L, ref)
    # different dup groups only
    same_grp = L["dup_group_id"].to_numpy()[cand["a"]] == L["dup_group_id"].to_numpy()[cand["b"]]
    cand = cand[~same_grp].reset_index(drop=True)
    # features
    text = (L["title"].fillna("") + " " + L["text"].fillna("").str.slice(0, 300)).map(tp.normalize)
    X = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True).fit_transform(text)
    cand["text_sim"] = np.asarray(X[cand["a"].to_numpy()].multiply(X[cand["b"].to_numpy()]).sum(axis=1)).ravel()
    cat = L["category_code"].to_numpy()
    ward = L["ward_no"].astype("float").to_numpy()
    prec = L["loc_precision_m"].fillna(300).to_numpy()
    src = L["source"].to_numpy()
    cand["same_cat"] = (cat[cand["a"]] == cat[cand["b"]]).astype(int)
    cand["same_ward"] = (ward[cand["a"]] == ward[cand["b"]]).astype(int)
    cand["coarse"] = (np.maximum(prec[cand["a"]], prec[cand["b"]]) > 300).astype(int)
    cand["has_news"] = ((src[cand["a"]] == "news") | (src[cand["b"]] == "news")).astype(int)
    feats = list(FEATURES)
    # meaning and named things, for the events that are in some candidate pair. A real citizen's complaint is
    # encoded every build but its vector is never written to disk (the cache folder is published).
    used = np.unique(np.r_[cand["a"].to_numpy(), cand["b"].to_numpy()]).astype(int)
    raw = (L["title"].fillna("") + ". " + L["text"].fillna("").str.slice(0, 300)).to_numpy()
    private = ((L["source"] == "grievance") & (L["is_synthetic"].fillna(1) != 1)).to_numpy()
    pos = np.full(len(L), -1)
    pos[used] = np.arange(len(used))
    V = embed.encode(raw[used].tolist(), cache_path=RECORD_VECTORS, prune=True, store=(~private[used]).tolist()) if len(used) else None
    if V is not None and len(cand):
        # e5 cosines of any two Chennai reports sit in 0.75-0.95: stretched to 0-1 so the scorer weighs it like the others
        cos = np.einsum("ij,ij->i", V[pos[cand["a"]]], V[pos[cand["b"]]])
        cand["sem_sim"] = ((cos - SEM_FLOOR) / (1 - SEM_FLOOR)).clip(0, 1).round(4)
    else:
        feats.remove("sem_sim")
        cand["sem_sim"] = np.nan
    en, lid = english or {}, L["event_id"].to_numpy()
    ents = [tp.entities(f"{en.get(lid[i], '')} {raw[i]}") for i in used]
    cand["ent_overlap"] = [round(tp.entity_overlap(ents[pos[a]], ents[pos[b]]), 3) for a, b in zip(cand["a"], cand["b"])]

    # labels from the overlay truth (never used as a feature)
    metrics: dict = {"candidate_pairs": int(len(cand)), "linkable_events": int(len(L)), "features": feats}
    model = None
    if truth is not None and len(truth):
        wmap = dict(zip(truth["event_id"], truth["world_event_id"]))
        wa = L["event_id"].map(wmap).to_numpy()[cand["a"]]
        wb = L["event_id"].map(wmap).to_numpy()[cand["b"]]
        involved = pd.notna(wa) | pd.notna(wb)
        label = np.where(pd.notna(wa) & (wa == wb), 1, 0)
        split = np.array([_split(w if isinstance(w, str) else v) if involved[i] else "none"
                          for i, (w, v) in enumerate(zip(wa, wb))])
        tr = involved & (split == "train")
        if tr.sum() >= 30 and label[tr].sum() >= 10:
            model = LogisticRegression(max_iter=2000, class_weight="balanced").fit(cand.loc[tr, feats], label[tr])
            metrics["scorer"] = "logistic_regression"
            metrics["scorer_coefficients"] = dict(zip(feats, np.round(model.coef_[0], 3).tolist()))
            metrics["train_pairs"] = int(tr.sum())
            metrics["train_positive_pairs"] = int(label[tr].sum())
    if model is not None:
        cand["prob"] = model.predict_proba(cand[feats])[:, 1]
        # calibrate the merge threshold on the training half: the cut that maximises pair F1
        ptr, ytr = cand.loc[tr, "prob"].to_numpy(), label[tr]
        best_thr, best_f1 = merge_thr, -1.0
        for thr in np.arange(0.30, 0.96, 0.025):
            pred = ptr >= thr
            tp_ = int((pred & (ytr == 1)).sum())
            f1 = 2 * tp_ / max(int(pred.sum()) + int(ytr.sum()), 1)
            if f1 > best_f1:
                best_thr, best_f1 = float(thr), f1
        merge_thr = round(best_thr, 3)
        review_thr = round(max(0.2, merge_thr - 0.25), 3)
        metrics["merge_threshold"] = merge_thr
        metrics["review_threshold"] = review_thr
    else:
        z = 3.0 - 3.5 * cand["dist_norm"] - 2.0 * cand["dt_norm"] + 3.0 * cand["text_sim"] + 1.0 * cand["same_cat"] + 0.5 * cand["same_ward"]
        z += 1.0 * cand["ent_overlap"] + (3.0 * cand["sem_sim"] - 1.5 if "sem_sim" in feats else 0.0)
        cand["prob"] = 1 / (1 + np.exp(-z))
        metrics["scorer"] = "fixed_formula"

    # best partner per (event, other source)
    cand["src_a"], cand["src_b"] = src[cand["a"]], src[cand["b"]]
    best_a = cand.sort_values("prob", ascending=False).drop_duplicates(["a", "src_b"]).index
    best_b = cand.sort_values("prob", ascending=False).drop_duplicates(["b", "src_a"]).index
    cand["best"] = cand.index.isin(best_a) | cand.index.isin(best_b)
    accept = cand[(cand["prob"] >= merge_thr) & cand["best"]]
    review = cand[(cand["prob"] >= review_thr) & (cand["prob"] < merge_thr) & cand["best"]]

    # union-find over within-source groups + accepted cross-source links
    uf = UnionFind(e["event_id"])
    for eid, g in zip(e["event_id"], e["dup_group_id"]):
        if isinstance(g, str) and g in uf.parent:
            uf.union(eid, g)
    ids = L["event_id"].to_numpy()
    for a, b in zip(accept["a"], accept["b"]):
        uf.union(ids[a], ids[b])
    first = dict(zip(e["event_id"], e["reported_at"]))
    comp = uf.groups()
    inc_of = {}
    for root, members in comp.items():
        m0 = min(members, key=lambda m: (first[m], m))
        iid = f"INC-{first[m0].tz_convert(IST):%Y%m%d}-{hashlib.md5(m0.encode()).hexdigest()[:6].upper()}"
        for m in members:
            inc_of[m] = iid
    e["incident_id"] = e["event_id"].map(inc_of)
    best_prob = pd.concat([accept[["a", "prob"]].rename(columns={"a": "i"}), accept[["b", "prob"]].rename(columns={"b": "i"})])
    bp = best_prob.groupby("i")["prob"].max()
    e["link_prob"] = e["event_id"].map(pd.Series(bp.values, index=ids[bp.index.to_numpy()]) if len(bp) else {}).round(3)
    e["link_method"] = np.where(e["link_prob"].notna(), "scorer", np.where(e["event_id"] != e["dup_group_id"].fillna(e["event_id"]),
                                                                              "within_source_rule", "singleton"))

    pairs = accept.assign(event_a=ids[accept["a"]], event_b=ids[accept["b"]], decision="linked")
    rq = review.assign(event_a=ids[review["a"]], event_b=ids[review["b"]], decision="review")
    link_rows = pd.concat([pairs, rq], ignore_index=True)
    link_rows["features"] = [jdump({k: round(float(r[k]), 3) for k in ["dist_m", "dt_h"] + feats}) for _, r in link_rows.iterrows()]
    link_rows = link_rows[["event_a", "event_b", "src_a", "src_b", "prob", "decision", "features"]]

    # evaluation on the held-out half of the world events
    if truth is not None and len(truth):
        metrics.update(_evaluate(e, truth))
    # real pairs: a real news report against a departmental record the overlay did not plant
    real = _real_pairs(cand, L, private, inc_of, merge_thr, review_thr)
    metrics["real_candidate_pairs"] = {"total": int(len(real)), **real["band"].value_counts().to_dict()} if len(real) else {"total": 0}
    ev_real = evaluate_labels(inc_of)
    if ev_real:
        metrics["eval_real_pairs"] = ev_real
    metrics.update({"linked_pairs": int(len(accept)), "review_pairs": int(len(review)),
                    "multi_source_incidents": int(e.groupby("incident_id")["source"].nunique().gt(1).sum())})
    log.info("linking: %s", {k: v for k, v in metrics.items() if k != "scorer_coefficients"})
    return {"events": e, "pairs": link_rows, "metrics": metrics, "real_pairs": real}


def _real_pairs(cand: pd.DataFrame, L: pd.DataFrame, private: np.ndarray, inc_of: dict, merge_thr: float, review_thr: float) -> pd.DataFrame:
    """Candidate pairs of a real news report and a departmental record that the overlay did not plant (and that is
    not a real citizen's complaint, whose text must not leave the store), with the band each one fell in."""
    src = L["source"].to_numpy()
    news = src == "news"
    planted = L["is_overlay"].fillna(0).to_numpy() == 1
    a, b = cand["a"].to_numpy(), cand["b"].to_numpy()
    keep = (news[a] ^ news[b]) & ~planted[a] & ~planted[b] & ~private[a] & ~private[b]
    c = cand[keep]
    if not len(c):
        return pd.DataFrame()
    n_side = np.where(news[c["a"]], c["a"], c["b"])
    r_side = np.where(news[c["a"]], c["b"], c["a"])
    ids = L["event_id"].to_numpy()
    out = pd.DataFrame({"news_event_id": ids[n_side], "record_event_id": ids[r_side], "record_source": src[r_side],
                        "prob": c["prob"].round(3).to_numpy()})
    out["linked"] = [int(inc_of.get(x) == inc_of.get(y)) for x, y in zip(out["news_event_id"], out["record_event_id"])]
    out["band"] = np.select([out["linked"] == 1, out["prob"] >= review_thr], ["linked", "review"], "below")
    for k in ["dist_m", "dt_h"] + FEATURES:
        out[k] = c[k].round(3).to_numpy()
    REAL_CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(REAL_CANDIDATES, index=False, encoding="utf-8-sig")
    return out


def _yes(v) -> int | None:
    s = str(v).strip().lower()
    return 1 if s in ("1", "yes", "y", "same") else 0 if s in ("0", "no", "n", "different") else None


def evaluate_labels(inc_of: dict) -> dict:
    """Accuracy of this build's links on the real pairs a person has marked. Each label carries its sampling
    band's weight, so the figures estimate all real candidate pairs, not just the sample."""
    if not LABELS.exists():
        return {}
    lab = pd.read_csv(LABELS, dtype=str, encoding="utf-8-sig").fillna("")
    lab["y"] = lab["same_incident"].map(_yes)
    lab = lab[lab["y"].notna()]
    if not len(lab):
        return {"marked": 0}
    lab["in_build"] = [x in inc_of and y in inc_of for x, y in zip(lab["news_event_id"], lab["record_event_id"])]
    lab["pred"] = [int(inc_of.get(x) is not None and inc_of.get(x) == inc_of.get(y)) for x, y in zip(lab["news_event_id"], lab["record_event_id"])]
    w = pd.to_numeric(lab["weight"], errors="coerce").fillna(1.0).to_numpy()
    y, p = lab["y"].astype(int).to_numpy(), lab["pred"].to_numpy()
    tp_, fp, fn = (w * (p & y)).sum(), (w * (p & (1 - y))).sum(), (w * ((1 - p) & y)).sum()
    P = tp_ / (tp_ + fp) if tp_ + fp else None
    R = tp_ / (tp_ + fn) if tp_ + fn else None
    r3 = lambda v: None if v is None else round(float(v), 3)  # noqa: E731
    return {"marked": int(len(lab)), "marked_same": int(y.sum()), "found_in_build": int(lab["in_build"].sum()),
            "precision": r3(P), "recall": r3(R), "f1": r3(2 * P * R / (P + R)) if P and R else None,
            "accuracy": r3((w * (p == y)).sum() / w.sum()), "wrong_links": int(((p == 1) & (y == 0)).sum()),
            "missed_links": int(((p == 0) & (y == 1)).sum()), "by": sorted(set(lab.get("labeled_by", pd.Series(dtype=str))) - {""})}


LABEL_COLUMNS = ["pair_id", "news_event_id", "record_event_id", "record_source", "band", "weight", "prob_when_sampled",
                 "news_published", "news_title", "news_text", "news_place", "record_reported", "record_title", "record_text",
                 "record_place", "distance_m", "hours_apart", "same_incident", "note", "labeled_by"]


def make_label_set(db_path: Path, n: int, seed: int = 7) -> dict:
    """Add a stratified sample of real candidate pairs to the labelling file (existing rows and marks are kept).
    Bands: linked, review, below; equal shares, each row weighted by its band's size / its band's sample."""
    import sqlite3

    if not REAL_CANDIDATES.exists():
        raise SystemExit(f"{REAL_CANDIDATES} not found: run a build first")
    real = pd.read_csv(REAL_CANDIDATES, encoding="utf-8-sig")
    real["pair_id"] = real["news_event_id"] + "~" + real["record_event_id"]
    old = pd.read_csv(LABELS, dtype=str, encoding="utf-8-sig").fillna("") if LABELS.exists() else pd.DataFrame(columns=LABEL_COLUMNS)
    pool = real[~real["pair_id"].isin(old["pair_id"])]
    rng = np.random.default_rng(seed)
    bands = ["linked", "review", "below"]
    share = {b: n // 3 + (1 if i < n % 3 else 0) for i, b in enumerate(bands)}
    picks = []
    for b in bands:
        g = pool[pool["band"] == b]
        k = min(share[b], len(g))
        if k:
            s = g.iloc[rng.choice(len(g), size=k, replace=False)].copy()
            s["weight"] = round(int((real["band"] == b).sum()) / k, 3)
            picks.append(s)
    if not picks:
        return {"added": 0, "total": int(len(old))}
    s = pd.concat(picks, ignore_index=True)
    con = sqlite3.connect(db_path)
    ids = list(set(s["news_event_id"]) | set(s["record_event_id"]))
    ev = pd.read_sql(f"SELECT event_id, reported_at, title, text, place_text FROM events WHERE event_id IN ({','.join('?' * len(ids))})",
                     con, params=ids).set_index("event_id")
    con.close()
    cut = lambda v, k: (str(v)[:k] if isinstance(v, str) else "")  # noqa: E731
    rows = pd.DataFrame({
        "pair_id": s["pair_id"], "news_event_id": s["news_event_id"], "record_event_id": s["record_event_id"],
        "record_source": s["record_source"], "band": s["band"], "weight": s["weight"], "prob_when_sampled": s["prob"],
        "news_published": s["news_event_id"].map(ev["reported_at"]).map(lambda v: cut(v, 16)),
        "news_title": s["news_event_id"].map(ev["title"]).map(lambda v: cut(v, 200)),
        "news_text": s["news_event_id"].map(ev["text"]).map(lambda v: cut(v, 400)),
        "news_place": s["news_event_id"].map(ev["place_text"]).map(lambda v: cut(v, 80)),
        "record_reported": s["record_event_id"].map(ev["reported_at"]).map(lambda v: cut(v, 16)),
        "record_title": s["record_event_id"].map(ev["title"]).map(lambda v: cut(v, 200)),
        "record_text": s["record_event_id"].map(ev["text"]).map(lambda v: cut(v, 400)),
        "record_place": s["record_event_id"].map(ev["place_text"]).map(lambda v: cut(v, 80)),
        "distance_m": s["dist_m"].round(0), "hours_apart": s["dt_h"].round(1), "same_incident": "", "note": "", "labeled_by": ""})
    # a band's weight depends on how many of it were sampled in total: recompute for old rows of the same band too
    out = pd.concat([old, rows.astype(str)], ignore_index=True)[LABEL_COLUMNS]
    pop = real["band"].value_counts()
    cnt = out["band"].value_counts()
    out["weight"] = [str(round(float(pop.get(b, 0)) / cnt[b], 3)) if pop.get(b, 0) else w for b, w in zip(out["band"], out["weight"])]
    LABELS.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(LABELS, index=False, encoding="utf-8-sig")
    return {"added": int(len(rows)), "total": int(len(out)), "by_band": rows["band"].value_counts().to_dict(), "file": str(LABELS)}


def _evaluate(e: pd.DataFrame, truth: pd.DataFrame) -> dict:
    t = truth[truth["world_event_id"].map(_split) == "test"]
    t = t[t["event_id"].isin(e["event_id"])]
    inc = dict(zip(e["event_id"], e["incident_id"]))
    src = dict(zip(e["event_id"], e["source"]))
    tp_ = fp = fn = 0
    rows = t.to_dict("records")
    by_w = t.groupby("world_event_id")["event_id"].apply(list).to_dict()
    members = list(t["event_id"])
    wof = dict(zip(t["event_id"], t["world_event_id"]))
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            a, b = members[i], members[j]
            if src[a] == src[b]:
                continue
            same_w = wof[a] == wof[b]
            same_i = inc[a] == inc[b]
            tp_ += same_w and same_i
            fp += (not same_w) and same_i
            fn += same_w and not same_i
    P = tp_ / (tp_ + fp) if tp_ + fp else 0.0
    R = tp_ / (tp_ + fn) if tp_ + fn else 0.0
    whole = sum(1 for w, ms in by_w.items() if len({src[m] for m in ms}) > 1 and len({inc[m] for m in ms}) == 1)
    multi = sum(1 for w, ms in by_w.items() if len({src[m] for m in ms}) > 1)
    return {"eval_cross_source_pairs": {"precision": round(P, 3), "recall": round(R, 3),
                                        "f1": round(2 * P * R / (P + R), 3) if P + R else 0.0, "true_pairs": tp_ + fn},
            "eval_world_events_fully_joined": f"{whole}/{multi}"}
