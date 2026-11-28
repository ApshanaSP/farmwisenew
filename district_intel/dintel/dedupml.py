"""Within-source duplicates, learned: blocking -> pair features -> logistic regression -> average-linkage clustering.

The rule it replaces (dedup.py) joined every pair that passed a fixed test (same category, so many hours, so many
metres) with union-find. Union-find chains: A-B and B-C join A and C even when A and C are far apart, so a burst of
complaints about one kind of problem in one ward (a rain-driven hotspot of separate flooded streets) became one
"duplicate". Here:

* Blocking (which pairs are compared at all): the same source key (grievance: complaint type | sub type | department;
  police: category), within `window_h` hours and `radius_m` metres (a KD-tree per key, so the cost grows with the
  neighbours, not n^2). Police reports from the same channel are never compared (the rule's veto, kept).
  Grievances without a map pin have no distance; no labelled duplicate lacks a pin, so nothing can be learned or
  checked for them, and the rule's same-ward, same-street join is kept for them (`nopin_rule`).
* Pair features: what a person checking two complaints would look at: distance, hours apart, same street, locality,
  area or landmark, wording (TF-IDF character n-grams, so spelling variants and transliterations still match), and
  for police the same locality name and agreeing casualty counts. Things only the data generator would know are left
  out on purpose (the complainant's identity and a switch of language, both planted by the generator, would teach the
  model the generator, not duplicates).
* Scorer: logistic regression (class-balanced, standardised features, L-BFGS-B, deterministic) with sign constraints:
  distance, hours apart and count mismatches may only lower a match, agreements only raise it (see fit). Each merge
  keeps its top feature contributions in words ("40 m apart, same street, wording 0.82 similar, 25 min apart").
  Gradient-boosted trees with the same monotonic constraints were tried: about 0.02 better pairwise F1 on
  grievances, equal B-cubed, 4-5 times slower and without per-feature reasons, so not used.
* Clustering: average linkage over the candidate graph. Two groups join only while the mean match probability over
  all their cross pairs reaches the threshold; a pair never compared counts as 0, so a chain does not join its far
  ends. Officers' "Duplicate of" decisions are must-links (joined first as connected components, which is exactly what
  union-find did for them). Cannot-link: two police reports from the same channel never share a group.
* Threshold: the one with the best B-cubed F1 over 5 folds of the labelled pairs (folds are whole connected parts of
  the candidate graph, so no pair is scored by a model that saw its neighbours).
* Held-out check: outer 5-fold cross-fitting gives every labelled item a group from a model that never saw it; B-cubed
  and pairwise precision / recall are reported for the model and the rule on the same items. A build uses the model
  only when its held-out B-cubed F1 is at least the rule's; otherwise the rule.
* The fitted model is saved to output/models/dedup_model.json (coefficients and threshold only, no text) and used when
  a later build has no truth files; with neither, the rule.

Labels: the grievance generator's duplicate truth (_truth/duplicate_truth.csv; its hotspot bursts are separate
complaints) and the police generator's ground_truth_events.csv. Both datasets are generated, so every figure here
measures recovery of planted duplicates, not of real ones.

Measured 28 Nov 2026 on 16,287 grievances and 12,263 police reports (held out, 5-fold cross-fitting; rule in brackets):
grievance pairwise precision 0.705 (0.489), recall 0.994 (1.0), F1 0.825 (0.656); B-cubed F1 0.9969 (0.9948);
police pairwise precision 0.988 (0.959), recall 0.995 (1.0), F1 0.991 (0.979); B-cubed F1 0.9977 (0.9958).
"""
from __future__ import annotations

import hashlib
import heapq
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
from sklearn.feature_extraction.text import TfidfVectorizer

from . import textproc as tp
from .util import INTEL_DIR, epoch_hours, log, to_xy

MODEL_PATH = INTEL_DIR / "output" / "models" / "dedup_model.json"
MODEL_VERSION = "dedupml-1"
FOLDS = 5
THRESHOLDS = [round(float(x), 3) for x in np.arange(0.05, 0.951, 0.025)]
EDGE_FLOOR = 0.02
DEFAULTS = {
    "grievance": {"window_h": 72, "radius_m": 300, "nopin_rule": True},
    "police": {"window_h": 4, "radius_m": 900, "cannot_same_channel": True},
}

FEATURES = {
    "grievance": ["dist_100m", "dt_day", "same_street", "same_locality", "same_area", "same_landmark", "text_sim"],
    "police": ["dist_100m", "dt_h", "same_place", "text_sim", "count_gap", "dead_differs", "weapon_differs"],
}
# the direction each weight may take (see fit); a feature not listed may only raise the match
SIGN = {"dist_100m": -1, "dt_day": -1, "dt_h": -1, "count_gap": -1, "dead_differs": -1, "weapon_differs": -1}


# ---------------------------------------------------------------------------------------------------- blocking --

def _keyed_pairs(df: pd.DataFrame, key: np.ndarray, t: np.ndarray, xy: np.ndarray, window_h: float, radius_m: float,
                 mask: np.ndarray | None = None) -> np.ndarray:
    """Row-position pairs (i < j) with the same key, within radius_m and window_h. NaN points never pair."""
    ok = ~np.isnan(xy).any(axis=1) & ~np.isnan(t)
    if mask is not None:
        ok &= mask
    out = []
    order = pd.Series(key[ok]).groupby(key[ok]).indices
    pos = np.where(ok)[0]
    for k in sorted(order):
        idx = pos[order[k]]
        if len(idx) < 2:
            continue
        pr = cKDTree(xy[idx]).query_pairs(radius_m, output_type="ndarray")
        if not len(pr):
            continue
        a, b = idx[pr[:, 0]], idx[pr[:, 1]]
        keep = np.abs(t[a] - t[b]) <= window_h
        out.append(np.column_stack([np.minimum(a[keep], b[keep]), np.maximum(a[keep], b[keep])]))
    return np.concatenate(out) if out else np.empty((0, 2), dtype=np.int64)


def _grievance_frame(ev: pd.DataFrame) -> pd.DataFrame:
    g = ev[ev["source"] == "grievance"].copy()
    g["_key"] = g["category_src"].fillna("") + "|" + g["subcategory_src"].fillna("") + "|" + g["dept_src"].fillna("")
    return g.reset_index(drop=True)


def grievance_candidates(g: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Pinned pairs (scored) and, for complaints without a pin, the rule's same key + ward + street pairs."""
    t = epoch_hours(g["reported_at"])
    pinned = g["geo_method"].astype(str).str.startswith("pin").to_numpy()
    xy = to_xy(g["lat"].to_numpy(), g["lon"].to_numpy())
    key = g["_key"].to_numpy()
    scored = _keyed_pairs(g, key, t, xy, cfg["window_h"], cfg["radius_m"], mask=pinned)
    frames = [pd.DataFrame({"a": scored[:, 0], "b": scored[:, 1], "kind": "model"})]
    if cfg.get("nopin_rule", True) and "_street" in g:
        street = g["_street"].fillna("").astype(str).to_numpy()
        ward = g["ward_no"].astype("float").to_numpy()
        rows = []
        grp = pd.Series(np.arange(len(g))).groupby([key, ward, street]).indices
        for k in sorted(grp, key=str):
            idx = np.asarray(grp[k])
            if len(idx) < 2 or k[2] == "" or pinned[idx].all():
                continue
            idx = idx[np.argsort(t[idx], kind="stable")]
            for x in range(len(idx)):
                for y in range(x + 1, len(idx)):
                    if t[idx[y]] - t[idx[x]] > cfg["window_h"]:
                        break
                    i, j = idx[x], idx[y]
                    if pinned[i] and pinned[j]:
                        continue  # two pins: the model decides
                    rows.append((min(i, j), max(i, j)))
        if rows:
            r = np.array(sorted(set(rows)))
            frames.append(pd.DataFrame({"a": r[:, 0], "b": r[:, 1], "kind": "rule"}))
    out = pd.concat(frames, ignore_index=True)
    return out.drop_duplicates(["a", "b"]).reset_index(drop=True)


def _police_frame(ev: pd.DataFrame) -> pd.DataFrame:
    p = ev[ev["source"] == "police"].copy()
    p["_key"] = p["category_src"].fillna("").astype(str)
    return p.reset_index(drop=True)


def police_candidates(p: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    t = epoch_hours(p["occurred_at"].fillna(p["reported_at"]))
    xy = to_xy(p["lat"].to_numpy(), p["lon"].to_numpy())
    pr = _keyed_pairs(p, p["_key"].to_numpy(), t, xy, cfg["window_h"], cfg["radius_m"])
    c = pd.DataFrame({"a": pr[:, 0], "b": pr[:, 1], "kind": "model"})
    if cfg.get("cannot_same_channel", True) and len(c):
        ch = p["channel"].fillna("").astype(str).to_numpy()
        c = c[ch[c["a"]] != ch[c["b"]]]
    return c.reset_index(drop=True)


# ---------------------------------------------------------------------------------------------------- features --

def _text_sim(texts: pd.Series, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if not len(a):
        return np.zeros(0)
    used = np.unique(np.r_[a, b])
    norm = texts.iloc[used].fillna("").map(tp.normalize)
    if not (norm.str.len() > 0).any():
        return np.zeros(len(a))
    X = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True, dtype=np.float32).fit_transform(norm)
    pos = np.full(len(texts), -1)
    pos[used] = np.arange(len(used))
    return np.asarray(X[pos[a]].multiply(X[pos[b]]).sum(axis=1)).ravel().round(4)


def _same(v: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    va, vb = v[a], v[b]
    return ((va == vb) & (va != "")).astype(int)


def _norm_str(s: pd.Series) -> np.ndarray:
    return s.fillna("").astype(str).str.lower().str.replace(r"[^\w]+", " ", regex=True).str.strip().to_numpy()


def grievance_features(g: pd.DataFrame, c: pd.DataFrame) -> pd.DataFrame:
    a, b = c["a"].to_numpy(), c["b"].to_numpy()
    xy = to_xy(g["lat"].to_numpy(), g["lon"].to_numpy())
    t = epoch_hours(g["reported_at"])
    f = pd.DataFrame(index=c.index)
    f["dist_m"] = np.hypot(*(xy[a] - xy[b]).T).round(1) if len(a) else np.zeros(0)
    f["dt_h"] = np.abs(t[a] - t[b]).round(2)
    f["dist_100m"] = (f["dist_m"] / 100).clip(upper=10)
    f["dt_day"] = f["dt_h"] / 24
    for col, name in (("_street", "same_street"), ("_locality", "same_locality"), ("_area", "same_area"), ("_landmark", "same_landmark")):
        v = _norm_str(g[col]) if col in g else np.full(len(g), "")
        f[name] = _same(v, a, b)
    f["text_sim"] = _text_sim(g["text"], a, b)
    return f


def police_features(p: pd.DataFrame, c: pd.DataFrame) -> pd.DataFrame:
    a, b = c["a"].to_numpy(), c["b"].to_numpy()
    xy = to_xy(p["lat"].to_numpy(), p["lon"].to_numpy())
    t = epoch_hours(p["occurred_at"].fillna(p["reported_at"]))
    f = pd.DataFrame(index=c.index)
    f["dist_m"] = np.hypot(*(xy[a] - xy[b]).T).round(1) if len(a) else np.zeros(0)
    f["dt_h"] = np.abs(t[a] - t[b]).round(2)
    f["dist_100m"] = (f["dist_m"] / 100).clip(upper=20)
    f["same_place"] = _same(_norm_str(p["place_text"]), a, b)
    f["text_sim"] = _text_sim(p["title"].fillna("") + ". " + p["text"].fillna(""), a, b)
    num = lambda col: pd.to_numeric(p[col], errors="coerce").fillna(0).to_numpy(float)  # noqa: E731
    gap = np.zeros(len(a))
    for col in ("persons_affected", "injured", "dead"):
        v = num(col)
        gap += np.abs(v[a] - v[b])
    f["count_gap"] = np.clip(gap, 0, 6)
    dead = num("dead")
    f["dead_differs"] = (dead[a] != dead[b]).astype(int)
    w = num("hazard_flag")
    f["weapon_differs"] = (w[a] != w[b]).astype(int)
    return f


# ------------------------------------------------------------------------------------------------------- model --

def fit(X: np.ndarray, y: np.ndarray, features: list[str], C: float = 1.0) -> dict:
    """Class-balanced, L2-regularised logistic regression on standardised features with sign constraints (SIGN):
    more distance, more hours or a count mismatch may only lower the match, an agreement may only raise it.

    Unconstrained, the generated data taught the opposite in places: grievance hotspot bursts all fall within 48 h while
    re-reports spread over 72 h ("later is more duplicate"), and the police generator plants look-alike events at the
    same locality ("same place is less duplicate"). Both would be wrong on real reports, so the weight is held at 0
    instead. The same objective as sklearn's LogisticRegression(class_weight="balanced"), solved by L-BFGS-B with
    bounds; deterministic. Kept as plain numbers (JSON-safe, no text)."""
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0] = 1.0
    Z = (X - mu) / sd
    n1 = max(int(y.sum()), 1)
    n0 = max(len(y) - n1, 1)
    w = np.where(y == 1, len(y) / (2 * n1), len(y) / (2 * n0))
    s = 2 * np.asarray(y, float) - 1

    def obj(theta):
        beta = theta[1:]
        m = -s * (theta[0] + Z @ beta)
        sig = 0.5 * (1 + np.tanh(0.5 * m))  # 1 / (1 + exp(-m)) without overflow
        g = -w * sig * s
        return float(np.sum(w * np.logaddexp(0, m)) + 0.5 / C * beta @ beta), np.r_[g.sum(), Z.T @ g + beta / C]

    bounds = [(None, None)] + [((None, 0.0) if SIGN.get(f, 1) < 0 else (0.0, None)) for f in features]
    res = minimize(obj, np.zeros(Z.shape[1] + 1), jac=True, method="L-BFGS-B", bounds=bounds, options={"maxiter": 3000})
    return {"features": list(features), "mean": mu.round(6).tolist(), "scale": sd.round(6).tolist(),
            "coef": np.round(res.x[1:], 6).tolist(), "intercept": round(float(res.x[0]), 6)}


def predict(model: dict, X: np.ndarray) -> np.ndarray:
    z = model["intercept"] + ((X - np.asarray(model["mean"])) / np.asarray(model["scale"])) @ np.asarray(model["coef"])
    return 1 / (1 + np.exp(-z))


def contributions(model: dict, X: np.ndarray) -> np.ndarray:
    """Per-feature terms of the log-odds (coef * standardised value): which evidence pushed a pair up or down."""
    return ((X - np.asarray(model["mean"])) / np.asarray(model["scale"])) * np.asarray(model["coef"])


_PHRASE = {
    "dist_100m": lambda r: f"{r['dist_m']:.0f} m apart",
    "dt_day": lambda r: _gap(r["dt_h"]), "dt_h": lambda r: _gap(r["dt_h"]),
    "same_street": lambda r: "same street", "same_locality": lambda r: "same locality", "same_area": lambda r: "same area",
    "same_landmark": lambda r: "same landmark", "same_place": lambda r: "same locality name",
    "text_sim": lambda r: f"wording {r['text_sim']:.2f} similar",
    "count_gap": lambda r: "same people counts" if r["count_gap"] == 0 else "people counts within " + f"{r['count_gap']:.0f}",
    "dead_differs": lambda r: "same death count", "weapon_differs": lambda r: "weapon detail agrees",
}


def _gap(h: float) -> str:
    return f"{h * 60:.0f} min apart" if h < 2 else f"{h:.0f} h apart" if h < 48 else f"{h / 24:.1f} days apart"


def explain(model: dict | None, row: dict, contrib: np.ndarray | None, k: int = 4) -> str:
    """Words for the strongest evidence for a merge, strongest first; distance and time are always named."""
    if model is None or contrib is None:
        return ", ".join(p for p in (_PHRASE["dist_100m"](row) if "dist_m" in row else "", _gap(row["dt_h"]) if "dt_h" in row else "") if p)
    feats = model["features"]
    order = [feats[i] for i in np.argsort(-contrib, kind="stable") if contrib[i] > 0.05 and _shown(feats[i], row)]
    for must in ("dist_100m", "dt_day", "dt_h"):
        if must in feats and must not in order[:k]:
            order.append(must)
    seen, words = set(), []
    for f in order:
        w = _PHRASE[f](row)
        if w not in seen:
            seen.add(w)
            words.append(w)
    return ", ".join(words[:k + 1])


def _shown(f: str, row: dict) -> bool:
    # a "same ..." flag that is 0, or a "... differs" flag that is 1, has no story to tell
    if f.startswith("same_"):
        return bool(row.get(f))
    if f.endswith("_differs"):
        return not row.get(f)
    return True


# -------------------------------------------------------------------------------------------------- clustering --

def cluster(n: int, a: np.ndarray, b: np.ndarray, w: np.ndarray, thr: float, must: list[tuple[int, int]] = (),
            tag: np.ndarray | None = None) -> np.ndarray:
    """Average-linkage agglomerative clustering on a sparse similarity graph of n items.

    Edges (a[i], b[i]) carry a match probability w[i]; pairs without an edge count as 0. Must-link pairs are joined
    first. Two groups merge, best first, while the mean probability over all their cross pairs is >= thr. With `tag`,
    two groups sharing a tag value never merge (cannot-link). Deterministic: ties go to the lower group ids.
    Returns a label per item (the smallest item index in its group).

    Groups only ever merge inside a connected part of the positive edges, so each part is clustered on its own; a part
    of two groups (most of them) is decided in one vectorised step, larger parts by a best-first heap."""
    a = np.asarray(a, dtype=np.int64)
    b = np.asarray(b, dtype=np.int64)
    w = np.asarray(w, dtype=float)
    if n == 0:
        return np.zeros(0, dtype=np.int64)
    mu = np.asarray(list(must), dtype=np.int64).reshape(-1, 2)
    grp = _cc(n, mu[:, 0], mu[:, 1])            # must-link groups 0..G-1
    G = int(grp.max()) + 1
    gsize = np.bincount(grp, minlength=G).astype(float)
    ga, gb = grp[a], grp[b]
    keep = ga != gb
    lo, hi = np.minimum(ga, gb)[keep], np.maximum(ga, gb)[keep]
    if len(lo):
        uk, inv = np.unique(lo * G + hi, return_inverse=True)
        s = np.bincount(inv, weights=w[keep])
        lo, hi = uk // G, uk % G
        pos = s > 0
        lo, hi, s = lo[pos], hi[pos], s[pos]
    else:
        s = np.zeros(0)
    tags: dict[int, set] = {}
    if tag is not None:
        for i, v in enumerate(tag):
            if v is not None and v == v and v != "":
                tags.setdefault(int(grp[i]), set()).add(v)
    rep = np.arange(G)                          # each group's final cluster (named by a group id)
    comp = _cc(G, lo, hi)
    csize = np.bincount(comp, minlength=G)
    ec = comp[lo]
    two = csize[ec] == 2                        # a part of two groups has exactly one edge
    ok = two & (s / (gsize[lo] * gsize[hi]) >= thr)
    if tag is not None and ok.any():
        if G == n:  # no must-links: one tag per group, compared in one step
            t = np.asarray(tag, dtype=object)
            empty = np.array([v is None or v != v or v == "" for v in t[lo[ok]]], dtype=bool)
            ok[ok] = empty | (t[lo[ok]] != t[hi[ok]])
        else:
            ok &= np.array([not (tags.get(int(x), set()) & tags.get(int(y), set())) for x, y in zip(lo, hi)], dtype=bool)
    rep[hi[ok]] = lo[ok]
    big = np.where(~two)[0]
    if len(big):
        big = big[np.argsort(ec[big], kind="stable")]
        cuts = np.flatnonzero(np.diff(ec[big])) + 1
        for part in np.split(big, cuts):
            _agglomerate(lo[part], hi[part], s[part], gsize, thr, tags, rep)
    cl = rep[grp]
    first = np.full(G, n, dtype=np.int64)
    np.minimum.at(first, cl, np.arange(n))
    return first[cl]


def _cc(n: int, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Connected-component label per node (scipy, C speed)."""
    if not len(a):
        return np.arange(n)
    g = coo_matrix((np.ones(len(a)), (np.asarray(a), np.asarray(b))), shape=(n, n))
    return connected_components(g, directed=False)[1]


def _agglomerate(lo: np.ndarray, hi: np.ndarray, s: np.ndarray, gsize: np.ndarray, thr: float, tags: dict, rep: np.ndarray) -> None:
    """Best-first average linkage inside one connected part; writes each group's final cluster into rep."""
    S: dict[int, dict[int, float]] = defaultdict(dict)
    size: dict[int, float] = {}
    for x, y, v in zip(lo.tolist(), hi.tolist(), s.tolist()):
        S[x][y] = v
        S[y][x] = v
        size[x], size[y] = gsize[x], gsize[y]
    tg = {x: set(tags.get(x, ())) for x in size}
    heap = [(-v / (size[x] * size[y]), x, y) for x, y, v in zip(lo.tolist(), hi.tolist(), s.tolist()) if v / (size[x] * size[y]) >= thr]
    heapq.heapify(heap)
    members = {x: [x] for x in size}
    while heap:
        neg, x, y = heapq.heappop(heap)
        if x not in members or y not in members:
            continue
        if abs(S[x].get(y, 0.0) / (size[x] * size[y]) + neg) > 1e-12:
            continue  # stale entry: the pair's groups changed since it was pushed
        if tg[x] & tg[y]:
            continue
        # merge y into x (x < y keeps the lower id)
        size[x] += size[y]
        tg[x] |= tg.pop(y)
        members[x] += members.pop(y)
        for z, v in S.pop(y).items():
            S[z].pop(y, None)
            if z != x:
                S[x][z] = S[x].get(z, 0.0) + v
                S[z][x] = S[x][z]
        S[x].pop(y, None)
        for z, v in S[x].items():
            avg = v / (size[x] * size[z])
            if avg >= thr:
                heapq.heappush(heap, (-avg, min(x, z), max(x, z)))
    for x, ms in members.items():
        rep[ms] = x


# -------------------------------------------------------------------------------------------------- evaluation --

def bcubed(pred: dict, truth: dict) -> dict:
    items = list(truth)
    if not items:
        return {"precision": None, "recall": None, "f1": None, "n": 0}
    pc, tc = defaultdict(set), defaultdict(set)
    for i in items:
        pc[pred[i]].add(i)
        tc[truth[i]].add(i)
    P = sum(len(pc[pred[i]] & tc[truth[i]]) / len(pc[pred[i]]) for i in items) / len(items)
    R = sum(len(pc[pred[i]] & tc[truth[i]]) / len(tc[truth[i]]) for i in items) / len(items)
    return {"precision": round(P, 4), "recall": round(R, 4), "f1": round(2 * P * R / (P + R), 4) if P + R else 0.0, "n": len(items)}


def pairwise(pred: dict, truth: dict) -> dict:
    items = list(truth)
    both, pp, tt = defaultdict(int), defaultdict(int), defaultdict(int)
    for i in items:
        both[(pred[i], truth[i])] += 1
        pp[pred[i]] += 1
        tt[truth[i]] += 1
    c2 = lambda d: sum(v * (v - 1) // 2 for v in d.values())  # noqa: E731
    tp_, npred, ntrue = c2(both), c2(pp), c2(tt)
    P = tp_ / npred if npred else 1.0
    R = tp_ / ntrue if ntrue else 1.0
    return {"precision": round(P, 4), "recall": round(R, 4), "f1": round(2 * P * R / (P + R), 4) if P + R else 0.0,
            "true_pairs": ntrue, "predicted_pairs": npred}


def scores(pred: dict, truth: dict) -> dict:
    """B-cubed over all items (the old headline: singletons make it look high), B-cubed over the items that matter
    (in a true duplicate group or a predicted one) and pairwise precision / recall."""
    tsz, psz = defaultdict(int), defaultdict(int)
    for i in truth:
        tsz[truth[i]] += 1
        psz[pred[i]] += 1
    inv = {i: truth[i] for i in truth if tsz[truth[i]] > 1 or psz[pred[i]] > 1}
    return {"bcubed_all": bcubed(pred, truth), "bcubed_involved": bcubed(pred, inv), "pairwise": pairwise(pred, truth)}


# ------------------------------------------------------------------------------------------------- one source --

def _components(n: int, a: np.ndarray, b: np.ndarray, must: list) -> np.ndarray:
    mu = np.asarray(list(must), dtype=np.int64).reshape(-1, 2)
    return _cc(n, np.r_[np.asarray(a, dtype=np.int64), mu[:, 0]], np.r_[np.asarray(b, dtype=np.int64), mu[:, 1]])


def _fold_of(ids: np.ndarray, comp: np.ndarray, k: int) -> np.ndarray:
    """Fold per item: from the md5 of its component's smallest event id, so folds do not depend on row order."""
    low: dict[int, str] = {}
    for i, c in enumerate(comp):
        c = int(c)
        if c not in low or ids[i] < low[c]:
            low[c] = ids[i]
    f = {c: int(hashlib.md5(e.encode()).hexdigest(), 16) % k for c, e in low.items()}
    return np.array([f[int(c)] for c in comp])


def _labels_arr(n, cand, prob, thr, must, tag, rule_p=1.0) -> np.ndarray:
    """Group label per row position (the group's smallest position). Only items with an edge or a must-link are
    clustered; the rest stay alone. Rule pairs (no map pin) carry probability rule_p. Pairs below EDGE_FLOOR are
    treated as never compared (they change a group average by less than the floor and only slow the search)."""
    w = np.where(cand["kind"].to_numpy() == "rule", rule_p, prob)
    keep = w >= EDGE_FLOOR
    cand, w = cand[keep], w[keep]
    a, b = cand["a"].to_numpy(), cand["b"].to_numpy()
    mu = np.asarray(must, dtype=np.int64).reshape(-1, 2)
    used = np.unique(np.r_[a, b, mu.ravel()]).astype(np.int64)
    out = np.arange(n)
    if not len(used):
        return out
    pos = np.full(n, -1, dtype=np.int64)
    pos[used] = np.arange(len(used))
    lab = cluster(len(used), pos[a], pos[b], w, thr, [(pos[x], pos[y]) for x, y in mu], None if tag is None else tag[used])
    out[used] = used[lab]
    return out


def _partition(n, cand, prob, thr, must, tag, ids, rule_p=1.0) -> dict:
    """event_id -> group (named by a member)."""
    return dict(zip(ids, ids[_labels_arr(n, cand, prob, thr, must, tag, rule_p)]))


def _b3_f1(lab: np.ndarray, tcode: np.ndarray, mask: np.ndarray) -> float:
    """B-cubed F1 of row labels against integer truth codes, over the rows in mask (vectorised; same as bcubed())."""
    m = mask & (tcode >= 0)
    if not m.any():
        return 0.0
    _, li, lc = np.unique(lab[m], return_inverse=True, return_counts=True)
    _, ti, tc = np.unique(tcode[m], return_inverse=True, return_counts=True)
    _, ki, kc = np.unique(li.astype(np.int64) * len(tc) + ti, return_inverse=True, return_counts=True)
    inter = kc[ki]
    P, R = float(np.mean(inter / lc[li])), float(np.mean(inter / tc[ti]))
    return 2 * P * R / (P + R) if P + R else 0.0


def _best_threshold(n, cand, prob, tcode: np.ndarray, must, tag, allowed: np.ndarray) -> tuple[float, float]:
    """Threshold with the best B-cubed F1 over the labelled items in `allowed` (an item mask); ties keep the lower."""
    best = (THRESHOLDS[0], -1.0)
    for thr in THRESHOLDS:
        f1 = _b3_f1(_labels_arr(n, cand, prob, thr, must, tag), tcode, allowed)
        if f1 > best[1] + 1e-9:
            best = (thr, round(f1, 4))
    return best


def _labels(cand: pd.DataFrame, ids: np.ndarray, truth: dict) -> tuple[np.ndarray, np.ndarray]:
    """y per candidate pair (same true group) and a mask of the pairs whose both ends are labelled."""
    ta = np.array([truth.get(e) for e in ids[cand["a"]]], dtype=object)
    tb = np.array([truth.get(e) for e in ids[cand["b"]]], dtype=object)
    known = np.array([x is not None and y is not None for x, y in zip(ta, tb)], dtype=bool)
    y = np.array([int(x is not None and x == yv) for x, yv in zip(ta, tb)])
    return y, known


def learn(df: pd.DataFrame, cand: pd.DataFrame, X: np.ndarray, features: list[str], truth: dict, must: list,
          tag: np.ndarray | None, folds: int = FOLDS) -> dict:
    """Cross-fitted evaluation, then the final model on all labels. truth: event_id -> true group, for labelled items
    only (an unlabelled planted record has none). Returns the model, held-out out-of-fold partition and figures."""
    ids = df["event_id"].to_numpy()
    n = len(df)
    a, b = cand["a"].to_numpy(), cand["b"].to_numpy()
    comp = _components(n, a, b, must)
    fold = _fold_of(ids, comp, folds)
    y, known = _labels(cand, ids, truth)
    scored = cand["kind"].to_numpy() == "model"
    pair_fold = fold[a]
    codes: dict = {}
    tcode = np.array([codes.setdefault(truth[e], len(codes)) if e in truth else -1 for e in ids])
    allp = scored & known
    if allp.sum() < 20 or y[allp].sum() < 5 or len(set(y[allp])) < 2:
        return {"status": "too_few_labels", "labelled_pairs": int(allp.sum()), "positive_pairs": int(y[allp].sum())}

    def oof_probs(mask: np.ndarray, skip: int | None = None) -> np.ndarray:
        """Each pair's probability from a model fitted on the other folds' pairs in mask."""
        p = np.zeros(len(cand))
        for j in range(folds):
            if j == skip:
                continue
            fm = mask & (pair_fold != j)
            if fm.sum() >= 10 and len(set(y[fm])) == 2:
                sel = pair_fold == j
                p[sel] = predict(fit(X[fm], y[fm], features), X[sel])
        return p

    oof = np.arange(n)
    thr_used = []
    for k in range(folds):
        tr_pairs = allp & (pair_fold != k)
        if tr_pairs.sum() < 10 or len(set(y[tr_pairs])) < 2:
            continue  # fold k keeps singletons: counted against the model, never for it
        # inner folds on the training part choose the threshold; fold k is never seen
        thr, _ = _best_threshold(n, cand, oof_probs(tr_pairs, skip=k), tcode, must, tag, fold != k)
        thr_used.append(thr)
        prob = np.zeros(len(cand))
        sel = pair_fold == k
        prob[sel] = predict(fit(X[tr_pairs], y[tr_pairs], features), X[sel])
        lab = _labels_arr(n, cand, prob, thr, must, tag)
        oof[fold == k] = lab[fold == k]
    # final model: all labelled pairs; threshold from 5-fold out-of-fold probabilities on all of them
    thr, f1 = _best_threshold(n, cand, oof_probs(allp), tcode, must, tag, np.ones(n, dtype=bool))
    model = fit(X[allp], y[allp], features)
    model.update({"threshold": thr, "cv_bcubed_f1": f1, "train_pairs": int(allp.sum()), "train_positive_pairs": int(y[allp].sum()),
                  "fold_thresholds": thr_used})
    return {"status": "trained", "model": model, "oof_partition": dict(zip(ids, ids[oof]))}


# --------------------------------------------------------------------------------------------- model on disk --

def load_saved(path: Path | None = None) -> dict:
    """The models saved by an earlier build ({} when missing, unreadable or of another version)."""
    path = path or MODEL_PATH
    try:
        m = json.loads(path.read_text(encoding="utf-8"))
        return m if m.get("version") == MODEL_VERSION else {}
    except (OSError, ValueError, AttributeError):
        return {}


def save(models: dict, path: Path | None = None) -> None:
    path = path or MODEL_PATH
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"version": MODEL_VERSION, "saved_at": pd.Timestamp.now(tz="Asia/Kolkata").isoformat(), **models},
                                  indent=1), encoding="utf-8")
        tmp.replace(path)
    except OSError as exc:
        log.warning("dedup model not saved: %s", exc)


# ------------------------------------------------------------------------------------------------- merge rows --

PAIR_COLUMNS = ["event_a", "event_b", "src_a", "src_b", "prob", "decision", "features"]


def merge_rows(df: pd.DataFrame, cand: pd.DataFrame, F: pd.DataFrame, prob: np.ndarray, part: dict, model: dict | None,
               source: str, method: str, must: list = ()) -> pd.DataFrame:
    """One row per merged report: its strongest in-group partner and why (for link_pairs, decision = duplicate)."""
    ids = df["event_id"].to_numpy()
    if not len(cand):
        return pd.DataFrame(columns=PAIR_COLUMNS)
    ea, eb = ids[cand["a"]], ids[cand["b"]]
    same = np.array([part[x] == part[y] for x, y in zip(ea, eb)], dtype=bool)
    c = cand[same].copy()
    c["prob"] = prob[same]
    c["i"] = np.arange(len(cand))[same]
    # each member's best partner (a member may be a or b)
    long = pd.concat([c.assign(m=c["a"]), c.assign(m=c["b"])])
    best = long.sort_values(["prob", "i"], ascending=[False, True], kind="stable").drop_duplicates("m")
    best = best.drop_duplicates("i").sort_values("i")
    contrib = contributions(model, F.loc[best.index, model["features"]].to_numpy(float)) if model is not None else None
    feats = []
    for n_, (row, kind) in enumerate(zip(F.loc[best.index].astype(float).to_dict("records"), best["kind"])):
        if kind == "rule":
            why = "no map pin: same ward and street, " + _gap(row["dt_h"])
            m_ = "rule"
        elif model is None:
            why = "same category, " + explain(None, row, None)
            m_ = method
        else:
            why = explain(model, row, contrib[n_] if contrib is not None else None)
            m_ = method
        out = {"why": why, "method": m_, "dist_m": round(row.get("dist_m", 0.0)), "dt_h": round(row.get("dt_h", 0.0), 2)}
        if "text_sim" in row:
            out["text_sim"] = round(row["text_sim"], 3)
        if contrib is not None and kind != "rule":
            terms = dict(zip(model["features"], np.round(contrib[n_], 2).tolist()))
            out["top"] = {k: v for k, v in sorted(terms.items(), key=lambda kv: -kv[1])[:3]}
        feats.append(json.dumps(out, ensure_ascii=False))
    rows = pd.DataFrame({"event_a": ids[best["a"]], "event_b": ids[best["b"]], "src_a": source, "src_b": source,
                         "prob": best["prob"].round(3).to_numpy(), "decision": "duplicate", "features": feats})
    # a report joined only by an officer's "Duplicate of" decision
    covered = set(rows["event_a"]) | set(rows["event_b"])
    extra = [(ids[x], ids[y]) for x, y in must if part[ids[x]] == part[ids[y]] and (ids[x] not in covered or ids[y] not in covered)]
    if extra:
        rows = pd.concat([rows, pd.DataFrame({"event_a": [x for x, _ in extra], "event_b": [y for _, y in extra], "src_a": source,
                                              "src_b": source, "prob": 1.0, "decision": "duplicate",
                                              "features": json.dumps({"why": "an officer marked it a duplicate", "method": "officer"})})],
                         ignore_index=True)
    return rows


def name_groups(df: pd.DataFrame, part: dict) -> dict:
    """event_id -> its group's first report (earliest, then smallest id), as dedup.py names groups."""
    t = dict(zip(df["event_id"], df["reported_at"]))
    members: dict = defaultdict(list)
    for e, g in part.items():
        members[g].append(e)
    out = {}
    for ms in members.values():
        first = min(ms, key=lambda m: (t.get(m), m))
        for m in ms:
            out[m] = first
    return out


def run_source(ev: pd.DataFrame, source: str, cfg: dict, truth: dict | None, must_ids: list[tuple[str, str]],
               rule_groups: dict, saved: dict | None) -> dict:
    """Groups for one source by the learned method, with the held-out comparison against the rule's groups."""
    t0 = time.time()
    df = _grievance_frame(ev) if source == "grievance" else _police_frame(ev)
    cfg = {**DEFAULTS[source], **(cfg or {})}
    cand = grievance_candidates(df, cfg) if source == "grievance" else police_candidates(df, cfg)
    F = grievance_features(df, cand) if source == "grievance" else police_features(df, cand)
    feats = FEATURES[source]
    X = F[feats].to_numpy(float) if len(F) else np.zeros((0, len(feats)))
    ids = df["event_id"].to_numpy()
    pos = {e: i for i, e in enumerate(ids)}
    must = [(pos[x], pos[y]) for x, y in must_ids if x in pos and y in pos]
    tag = df["channel"].fillna("").astype(str).to_numpy() if source == "police" and cfg.get("cannot_same_channel", True) else None
    info: dict = {"candidate_pairs": int(len(cand)), "scored_pairs": int((cand["kind"] == "model").sum()),
                  "rule_pairs_no_pin": int((cand["kind"] == "rule").sum()), "must_links": len(must), "features": feats}
    model, held, oof = None, None, None
    if truth:
        L = learn(df, cand, X, feats, truth, must, tag)
        info["learn"] = L["status"]
        if L["status"] == "trained":
            model, oof = L["model"], L["oof_partition"]
            rule_items = {e: rule_groups.get(e, e) for e in truth}
            held = {"model": scores({e: L["oof_partition"][e] for e in truth}, truth),
                    "rule": scores(rule_items, truth)}
            info["held_out"] = held
    if model is None and saved and saved.get(source):
        model = saved[source]
        info["model_from"] = "saved"
    elif model is not None:
        info["model_from"] = "trained_this_build"
    use_model = model is not None and model.get("features") == feats
    if use_model and held is not None:
        mf, rf = held["model"]["bcubed_all"]["f1"] or 0, held["rule"]["bcubed_all"]["f1"] or 0
        if mf < rf:
            use_model = False
            info["kept_rule_because"] = f"held-out B-cubed F1 {mf} below the rule's {rf}"
    if use_model:
        prob = np.where(cand["kind"].to_numpy() == "rule", 1.0, predict(model, X)) if len(cand) else np.zeros(0)
        part = _partition(len(df), cand, prob, model["threshold"], must, tag, ids)
        info.update({"method": "model", "threshold": model["threshold"],
                     "coefficients": dict(zip(feats, np.round(model["coef"], 3).tolist()))})
        groups = name_groups(df, part)
        rows = merge_rows(df, cand, F, prob, part, model, source, "model", must)
    else:
        groups = {e: rule_groups.get(e, e) for e in ids}
        info["method"] = "rule"
        # the rule has no probability: the nearest in-group partner explains each merge
        near = (1 / (1 + F["dist_m"].to_numpy(float))) if len(F) else np.zeros(0)
        rows = merge_rows(df, cand, F, near, groups, None, source, "rule", must)
        rows["prob"] = np.nan
    info["groups_of_2_plus"] = int(pd.Series(list(groups.values())).value_counts().gt(1).sum()) if groups else 0
    info["runtime_s"] = round(time.time() - t0, 2)
    return {"groups": groups, "model": model, "info": info, "pairs": rows, "held_out_partition": oof}
