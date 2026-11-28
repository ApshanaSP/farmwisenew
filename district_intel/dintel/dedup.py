"""Within-source duplicate groups, scored against the repo's ground truth.

`run` is what the build calls. Grievances and police use the learned method (dedupml.py: pair features, a
sign-constrained logistic regression and average-linkage clustering) when it can be trained on the truth files or
loaded from output/models/dedup_model.json, and only when its held-out B-cubed F1 is at least the rule's. Otherwise,
and always for PWD works (no labels exist for them), the rule below: union-find over pairs with the same category key,
within a time window and a distance (a KD-tree keeps it linear in practice). The rule also gives the baseline figures.
"""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from . import dedupml
from .util import UnionFind, epoch_hours, log, to_xy


def _window_pairs(df: pd.DataFrame, key: str, hours: float, radius_m: float, differ: str | None = None) -> list[tuple[str, str]]:
    """Pairs with the same key, within `hours` and `radius_m`; with `differ`, only pairs whose values in that column
    differ (police: the channel). Vectorised per key (the per-pair Python test was most of the step's time)."""
    pairs = []
    for _, grp in df.groupby(key):
        if len(grp) < 2:
            continue
        g = grp.sort_values("reported_at")
        t = epoch_hours(g["reported_at"])
        xy = to_xy(g["lat"].to_numpy(), g["lon"].to_numpy())
        ok = ~np.isnan(xy).any(axis=1)
        ids = g["event_id"].to_numpy()
        if ok.sum() >= 2:
            idx = np.where(ok)[0]
            pr = cKDTree(xy[ok]).query_pairs(radius_m, output_type="ndarray")
            if not len(pr):
                continue
            i, j = idx[pr[:, 0]], idx[pr[:, 1]]
            keep = np.abs(t[i] - t[j]) <= hours
            if differ is not None:
                v = g[differ].to_numpy(dtype=object)
                keep &= v[i] != v[j]
            pairs.extend(zip(ids[i[keep]], ids[j[keep]]))
    return pairs


def grievances(ev: pd.DataFrame) -> tuple[dict[str, str], dict]:
    g = ev[ev["source"] == "grievance"].copy()
    g["key"] = g["category_src"] + "|" + g["subcategory_src"] + "|" + g["dept_src"].fillna("")
    uf = UnionFind(g["event_id"])
    pinned = g[g["geo_method"] == "pin"]
    for a, b in _window_pairs(pinned, "key", 72, 150):
        uf.union(a, b)
    # rows without a pin: same street in the same ward within 72 h
    nopin = g[g["geo_method"] != "pin"]
    for _, grp in g.groupby(["key", "ward_no", "_street"]):
        if len(grp) < 2 or grp["_street"].iloc[0] == "" or not grp["event_id"].isin(nopin["event_id"]).any():
            continue
        grp = grp.sort_values("reported_at")
        t = epoch_hours(grp["reported_at"])
        ids = grp["event_id"].to_numpy()
        for i in range(len(grp)):
            for j in range(i + 1, len(grp)):
                if t[j] - t[i] > 72:
                    break
                uf.union(ids[i], ids[j])
    # officers' own decisions: "Rejected: Duplicate of 2026-XXXXXX"
    human = 0
    for eid, dup in zip(g["event_id"], g["_officer_dup_of"]):
        if isinstance(dup, str) and f"GRV-{dup}" in uf.parent:
            uf.union(eid, f"GRV-{dup}")
            human += 1
    groups = _name_groups(uf, g)
    return groups, {"officer_duplicate_decisions_used": human}


def police(ev: pd.DataFrame) -> dict[str, str]:
    p = ev[ev["source"] == "police"].copy()
    p["reported_at"] = p["occurred_at"]
    uf = UnionFind(p["event_id"])
    for a, b in _window_pairs(p, "category_src", 3, 600, differ="channel"):
        uf.union(a, b)
    return _name_groups(uf, p)


def pwd(ev: pd.DataFrame) -> dict[str, str]:
    w = ev[ev["source"] == "pwd"].copy()
    uf = UnionFind(w["event_id"])
    for a, b in _window_pairs(w, "category_src", 48, 200):
        uf.union(a, b)
    return _name_groups(uf, w)


def _name_groups(uf: UnionFind, df: pd.DataFrame) -> dict[str, str]:
    t = dict(zip(df["event_id"], df["reported_at"]))
    out = {}
    for root, members in uf.groups().items():
        first = min(members, key=lambda m: (t.get(m), m))
        for m in members:
            out[m] = first
    return out


def bcubed(pred: dict, truth: dict) -> dict:
    items = list(truth)
    pc, tc = defaultdict(set), defaultdict(set)
    for i in items:
        pc[pred[i]].add(i)
        tc[truth[i]].add(i)
    P = sum(len(pc[pred[i]] & tc[truth[i]]) / len(pc[pred[i]]) for i in items) / len(items)
    R = sum(len(pc[pred[i]] & tc[truth[i]]) / len(tc[truth[i]]) for i in items) / len(items)
    return {"precision": round(P, 4), "recall": round(R, 4), "f1": round(2 * P * R / (P + R), 4), "n": len(items)}


def evaluate(ev: pd.DataFrame, g_groups: dict, p_groups: dict, settings) -> dict:
    out = {}
    truth, ptruth = truths(ev, settings)
    if truth:
        out["grievance_dedup"] = bcubed({e: g_groups[e] for e in truth}, truth)
    if ptruth:
        out["police_dedup"] = bcubed({e: p_groups[e] for e in ptruth}, ptruth)
    return out


def truths(ev: pd.DataFrame, settings) -> tuple[dict, dict]:
    """event_id -> true group for the generators' own records (planted overlay records have no entry). Grievances:
    the generator's DUP groups; a hotspot burst's complaints are separate complaints, so they and every other
    complaint are their own group. Police: true_event_id. A missing truth file gives an empty map."""
    truth, ptruth = {}, {}
    try:
        tr = pd.read_csv(settings.src("grievances", "duplicate_truth"), encoding="utf-8-sig")
        tmap = {f"GRV-{c}": grp for c, grp in zip(tr["Complaint No"], tr["Truth Group"]) if str(grp).startswith("DUP")}
        base = ev[(ev["source"] == "grievance") & (ev["is_overlay"] == 0)]["event_id"]
        truth = {e: tmap.get(e, e) for e in base}
    except (OSError, KeyError, ValueError) as exc:
        log.warning("dedup: no grievance duplicate truth (%s)", exc)
    try:
        gt = pd.read_csv(settings.src("police", "ground_truth"), encoding="utf-8-sig")
        pmap = {"POL-" + str(r).replace("POL-", ""): t for r, t in zip(gt["report_id"], gt["true_event_id"])}
        pbase = ev[(ev["source"] == "police") & (ev["is_overlay"] == 0)]["event_id"]
        ptruth = {e: pmap[e] for e in pbase if e in pmap}
    except (OSError, KeyError, ValueError) as exc:
        log.warning("dedup: no police ground truth (%s)", exc)
    return truth, ptruth


def _pwd_rows(ev: pd.DataFrame, groups: dict) -> pd.DataFrame:
    """Why each PWD record joined its group (the rule's own pairs: same category, within 48 h and 200 m)."""
    w = ev[ev["source"] == "pwd"]
    pairs = [(a, b) for a, b in _window_pairs(w, "category_src", 48, 200) if groups.get(a) == groups.get(b)]
    if not pairs:
        return pd.DataFrame(columns=dedupml.PAIR_COLUMNS)
    pos = w.set_index("event_id")
    xy = to_xy(pos["lat"].to_numpy(), pos["lon"].to_numpy())
    ix = {e: i for i, e in enumerate(pos.index)}
    t = epoch_hours(pos["reported_at"])
    seen, rows = set(), []
    for a, b in sorted(pairs):
        if a in seen and b in seen:
            continue
        seen.update((a, b))
        d = float(np.hypot(*(xy[ix[a]] - xy[ix[b]])))
        h = float(abs(t[ix[a]] - t[ix[b]]))
        why = f"same category, {d:.0f} m apart, {dedupml._gap(h)}"
        rows.append((a, b, "pwd", "pwd", np.nan, "duplicate", json.dumps({"why": why, "method": "rule", "dist_m": round(d), "dt_h": round(h, 2)})))
    return pd.DataFrame(rows, columns=dedupml.PAIR_COLUMNS)


def run(ev: pd.DataFrame, settings) -> dict:
    """Within-source duplicate groups for the build. Sets ev["dup_group_id"] (a group is named by its first report) and
    ev["_dup_method"]; returns the metrics and one row per merged report saying why (for link_pairs, decision
    'duplicate'). config.yaml dedup.method: model (default; the rule when the model cannot be trained or loaded, or
    does worse than the rule on held-out labels) or rule."""
    cfg = settings.raw.get("dedup") or {}
    use_model = str(cfg.get("method", "model")) == "model"
    gg, ginfo = grievances(ev)
    pg = police(ev)
    wg = pwd(ev)
    gt, ptr = truths(ev, settings)
    g = ev[ev["source"] == "grievance"]
    must = [(e, f"GRV-{d}") for e, d in zip(g["event_id"], g["_officer_dup_of"]) if isinstance(d, str)] if "_officer_dup_of" in g else []
    saved = dedupml.load_saved() if use_model else {}
    out: dict = {"officer_duplicate_decisions_used": ginfo["officer_duplicate_decisions_used"], "method_config": "model" if use_model else "rule"}
    groups, rows, trained, method_of = {}, [], {}, {}
    for src, truth, rule_groups, m in (("grievance", gt, gg, must), ("police", ptr, pg, [])):
        R = dedupml.run_source(ev, src, cfg.get(src) or {}, truth if use_model else None, m, rule_groups, saved if use_model else None)
        groups.update(R["groups"])
        rows.append(R["pairs"])
        info = R["info"]
        out[f"{src}_method"] = info["method"]
        held = info.pop("held_out", None)
        if held:
            out[f"{src}_held_out"] = held
        if info["method"] == "model" and held:
            out[f"{src}_dedup"] = {**held["model"]["bcubed_all"], "held_out": True}
        elif truth:
            out[f"{src}_dedup"] = bcubed({e: R["groups"].get(e, e) for e in truth}, truth)
        if truth:
            out[f"{src}_dedup_rule"] = bcubed({e: rule_groups.get(e, e) for e in truth}, truth)
        out[f"{src}_info"] = info
        if info.get("model_from") == "trained_this_build" and R["model"] is not None:
            trained[src] = R["model"]
        tag = "within_source_model" if info["method"] == "model" else "within_source_rule"
        method_of.update({e: tag for e in R["groups"]})
    groups.update(wg)
    rows.append(_pwd_rows(ev, wg))
    out["pwd_method"] = "rule"
    if trained:
        dedupml.save({**{k: v for k, v in saved.items() if k in ("grievance", "police")}, **trained})
    ev["dup_group_id"] = ev["event_id"].map(groups).fillna(ev["dup_group_id"]).fillna(ev["event_id"])
    ev["_dup_method"] = ev["event_id"].map(method_of).fillna("within_source_rule")
    pairs = pd.concat([r for r in rows if len(r)], ignore_index=True) if any(len(r) for r in rows) else pd.DataFrame(columns=dedupml.PAIR_COLUMNS)
    out["duplicate_pairs_explained"] = int(len(pairs))
    log.info("dedup: grievance %s, police %s; %s", out.get("grievance_method"), out.get("police_method"),
             {k: v for k, v in out.items() if k.endswith("_dedup") or k.endswith("_dedup_rule")})
    return {"metrics": out, "pairs": pairs}
