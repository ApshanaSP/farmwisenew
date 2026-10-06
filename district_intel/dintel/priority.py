"""Incident priority: severity plus weighted signals, with weights that learn from the Collector's decisions.

priority = severity_score + sum(weight_k * signal_k)

The signals (several sources, citizen complaints, past the deadline, not verified, growing, vulnerable people,
several outlets, news only, rain, recurring) and their starting weights are the hand-set rules the dashboard has
always used. Every Collector decision is saved by the website with the incident's facts at that moment
(audit_log.before_value.score). Once enough decisions count (config: priority_learning), the weights are refitted:

    P(decision says "should rank higher") = sigmoid(b0 + s * priority / 100)

by maximum a posteriori with a Gaussian prior centred on the hand-set weights, so a few decisions move them a
little and many decisions move them more. Severity keeps weight 1 (it sets the scale). The learned weights are
used only when, in leave-one-out tests, they rank the Collector's decisions at least as well as the hand-set ones.
Nothing here stores who decided.
"""
from __future__ import annotations

import gzip
import json
import os
import sqlite3
import urllib.request
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .util import REPO_DIR, log

DEFAULT_WEIGHTS = {"multi_source": 5.0, "complaints": 3.0, "sla_over_2x": 20.0, "sla_over": 10.0, "unverified_serious": 8.0,
                   "growing": 8.0, "vulnerable": 5.0, "multi_outlet": 5.0, "media_only": 5.0, "rain": 5.0, "recurring": 5.0}
SIGNALS = list(DEFAULT_WEIGHTS)
# the incident columns a priority is computed from; the website saves these with every decision
FACTS = ["severity_score", "severity_level", "category_label", "source_count", "citizen_complaints", "is_open", "sla_ratio",
         "sla_basis", "sla_hours", "verified", "growth_24h", "vulnerable", "outlet_count", "media_only", "rain_coupled", "recurrence_90d"]
DURABLE = REPO_DIR / "chennai-grievance-portal-main" / "data" / "aws-cache" / "durable.sqlite"
API_URL = os.environ.get("AWS_API_URL", "https://i6q6oi20lb.execute-api.ap-south-1.amazonaws.com").rstrip("/")


def _n(v: Any, default: float = 0.0) -> float:
    try:
        f = float(v)
        return default if np.isnan(f) else f
    except (TypeError, ValueError):
        return default


def features(r: dict) -> dict[str, float]:
    """The signal values of one incident (0 when a signal does not apply)."""
    x = dict.fromkeys(SIGNALS, 0.0)
    sc, cc = _n(r.get("source_count"), 1), _n(r.get("citizen_complaints"))
    if sc > 1:
        x["multi_source"] = float(np.log2(sc))
    if cc > 1:
        x["complaints"] = float(np.log2(1 + cc))
    if _n(r.get("is_open")):
        over = _n(r.get("sla_ratio"))
        if over > 2:
            x["sla_over_2x"] = 1.0
        elif over > 1:
            x["sla_over"] = 1.0
        if not _n(r.get("verified")) and r.get("severity_level") in ("Severe", "High"):
            x["unverified_serious"] = 1.0
        if _n(r.get("growth_24h")) >= 3:
            x["growing"] = 1.0
    x["vulnerable"] = float(bool(r.get("vulnerable")) and isinstance(r.get("vulnerable"), str))
    x["multi_outlet"] = float(_n(r.get("outlet_count")) >= 2)
    x["media_only"] = float(bool(_n(r.get("media_only"))))
    x["rain"] = float(bool(_n(r.get("rain_coupled"))))
    x["recurring"] = float(_n(r.get("recurrence_90d")) >= 3)
    return x


def reasons(r: dict) -> str:
    """The plain-language reasons, first the severity (the dashboard reads the rest after the first ';')."""
    why = [f"{r['severity_level']} {str(r['category_label']).lower()} ({_n(r['severity_score']):.0f})"]
    if _n(r.get("source_count"), 1) > 1:
        why.append(f"reported by {int(r['source_count'])} sources")
    if _n(r.get("citizen_complaints")) > 1:
        why.append(f"{int(r['citizen_complaints'])} citizen complaints")
    if _n(r.get("is_open")):
        over = _n(r.get("sla_ratio"))
        what = "response" if r.get("sla_basis") == "response" else "resolution"
        if over > 2:
            why.append(f"{what} over twice the {_n(r.get('sla_hours')):.0f} h target")
        elif over > 1:
            why.append(f"{what} past the {_n(r.get('sla_hours')):.0f} h target")
        if not _n(r.get("verified")) and r.get("severity_level") in ("Severe", "High"):
            why.append("not yet verified by an officer")
        if _n(r.get("growth_24h")) >= 3:
            why.append(f"{int(r['growth_24h'])} new reports in 24 h")
    if isinstance(r.get("vulnerable"), str) and r["vulnerable"]:
        why.append(f"affects {r['vulnerable'].replace('|', ', ').replace('_', ' ')}")
    if _n(r.get("outlet_count")) >= 2:
        why.append(f"covered by {int(r['outlet_count'])} news outlets")
    if _n(r.get("media_only")):
        why.append("in the news but not in any department's records")
    if _n(r.get("rain_coupled")):
        why.append("linked to a rain event")
    if _n(r.get("recurrence_90d")) >= 3:
        why.append(f"{int(r['recurrence_90d'])} similar incidents here in 90 days")
    return "; ".join(why)


def matrix(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """(severity scores, signal matrix in SIGNALS order)."""
    sev = np.array([_n(r.get("severity_score")) for r in rows], float)
    X = np.array([[f[k] for k in SIGNALS] for f in map(features, rows)], float).reshape(len(rows), len(SIGNALS))
    return sev, X


def score(sev: np.ndarray, X: np.ndarray, weights: dict[str, float]) -> np.ndarray:
    return (sev + X @ np.array([weights[k] for k in SIGNALS])).round(1)


# ------------------------------------------------------------------ decisions --

def _from_api(key: str) -> list[dict]:
    req = urllib.request.Request(f"{API_URL}/store/load", data=b"{}", method="POST",
                                 headers={"x-refresh-key": key.strip(), "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        m = json.loads(r.read())
    with urllib.request.urlopen(m["rows"], timeout=300) as r:
        return json.loads(gzip.decompress(r.read()))["rows"].get("audit_log", [])


def _from_local() -> list[dict]:
    con = sqlite3.connect(f"file:{DURABLE.as_posix()}?mode=ro", uri=True)
    try:
        cur = con.execute("SELECT * FROM audit_log WHERE action LIKE 'decision:%'")
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        con.close()


def load_decisions() -> tuple[pd.DataFrame, str]:
    """The Collector's decisions with the facts saved at that moment: (incident_id, decision, at, facts).
    From the team API in the hourly job (REFRESH_API_KEY), else the website's local copy of the store.
    DI_DECISIONS_JSON (a file of audit_log rows) is for tests. Who decided is dropped here."""
    rows, origin = [], "none"
    try:
        if os.environ.get("DI_DECISIONS_JSON"):
            rows, origin = json.loads(open(os.environ["DI_DECISIONS_JSON"], encoding="utf-8").read()), "file"
        elif os.environ.get("REFRESH_API_KEY", "").strip():
            rows, origin = _from_api(os.environ["REFRESH_API_KEY"]), "aws"
        elif DURABLE.exists():
            rows, origin = _from_local(), "local"
    except Exception as exc:  # noqa: BLE001 (decisions are optional: the hand-set weights stay)
        log.warning("priority learning: could not read the Collector's decisions (%s)", exc)
        return pd.DataFrame(columns=["incident_id", "decision", "at", "facts"]), f"error: {type(exc).__name__}"
    out = []
    for r in rows:
        act = str(r.get("action") or "")
        if not act.lower().startswith("decision:") or r.get("table_name", "collector_decisions") != "collector_decisions":
            continue
        try:
            before = json.loads(r.get("before_value") or "{}")
        except (TypeError, ValueError):
            before = {}
        snap = before.get("score") if isinstance(before, dict) else None
        out.append({"incident_id": r.get("record_id"), "decision": act.split(":", 1)[1].strip().lower(), "at": r.get("at"),
                    "facts": snap.get("facts") if isinstance(snap, dict) and isinstance(snap.get("facts"), dict) else None})
    return pd.DataFrame(out, columns=["incident_id", "decision", "at", "facts"]), origin


# ------------------------------------------------------------------- learning --

SD_FLOOR = 4.0               # severity points: even a 5-point weight may move a few points when decisions say so
W_CAP = 30.0                 # no signal may be worth more than max(4 x its hand-set weight, 30) severity points


def fit(sev: np.ndarray, X: np.ndarray, y: np.ndarray, prior_sd: float = 0.5) -> dict[str, float]:
    """MAP weights: logistic link on the priority, Gaussian prior around the hand-set weights
    (sd = prior_sd x weight, at least SD_FLOOR points)."""
    w0 = np.array([DEFAULT_WEIGHTS[k] for k in SIGNALS])
    sd = np.maximum(prior_sd * w0, SD_FLOOR)

    def loss(th: np.ndarray) -> tuple[float, np.ndarray]:
        b0, log_s, w = th[0], th[1], th[2:]
        s, pr = np.exp(log_s), sev + X @ w
        eta = b0 + s * pr / 100
        nll = np.sum(np.logaddexp(0, eta) - y * eta)
        r = 1 / (1 + np.exp(-eta)) - y
        val = nll + 0.5 * np.sum(((w - w0) / sd) ** 2) + 0.5 * (b0 / 5) ** 2 + 0.5 * (log_s - np.log(3)) ** 2
        grad = np.r_[r.sum() + b0 / 25, (r * pr).sum() * s / 100 + (log_s - np.log(3)), X.T @ r * s / 100 + (w - w0) / sd ** 2]
        return float(val), grad

    th0 = np.r_[0.0, np.log(3), w0]
    bounds = [(-20, 20), (np.log(0.05), np.log(50))] + [(0.0, max(4 * v, W_CAP)) for v in w0]
    res = minimize(loss, th0, jac=True, method="L-BFGS-B", bounds=bounds)
    return {k: round(float(v), 2) for k, v in zip(SIGNALS, res.x[2:])}


def _auc(s: np.ndarray, y: np.ndarray) -> float | None:
    pos, neg = s[y == 1], s[y == 0]
    if not len(pos) or not len(neg):
        return None
    gt = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return round(float(gt / (len(pos) * len(neg))), 3)


def learn(inc: pd.DataFrame, cfg: dict) -> tuple[dict[str, float], dict]:
    """Weights for this build and a report. Hand-set weights until enough decisions count."""
    raise_, lower = {s.lower() for s in cfg.get("raise", [])}, {s.lower() for s in cfg.get("lower", [])}
    need, each = int(cfg.get("min_decisions", 30)), int(cfg.get("min_each", 5))
    info: dict = {"status": "off", "decisions": 0, "counted": 0, "needed": need, "raise_actions": sorted(raise_),
                  "lower_actions": sorted(lower), "weights": dict(DEFAULT_WEIGHTS), "default_weights": dict(DEFAULT_WEIGHTS)}
    if not cfg.get("enabled", True):
        return dict(DEFAULT_WEIGHTS), info
    d, origin = load_decisions()
    info.update({"source": origin, "decisions": int(len(d)), "by_action": d["decision"].value_counts().to_dict() if len(d) else {}})
    d = d[d["decision"].isin(raise_ | lower)].copy()
    # facts saved with the decision; older decisions (before the snapshot) fall back to the incident in this build
    now = inc.set_index("incident_id")[FACTS] if "incident_id" in inc else inc[FACTS]
    now = now[~now.index.duplicated()]
    facts, snap = [], 0
    for r in d.itertuples():
        if isinstance(r.facts, dict):
            facts.append(r.facts); snap += 1
        elif r.incident_id in now.index:
            facts.append(now.loc[r.incident_id].to_dict())
        else:
            facts.append(None)
    d["f"] = facts
    d = d[d["f"].notna()]
    y = d["decision"].isin(raise_).astype(int).to_numpy()
    info.update({"counted": int(len(d)), "raise": int(y.sum()), "lower": int(len(y) - y.sum()), "with_saved_score": snap})
    if len(d) < need or y.sum() < each or (len(y) - y.sum()) < each:
        info["status"] = "collecting"
        return dict(DEFAULT_WEIGHTS), info
    sev, X = matrix(list(d["f"]))
    prior_sd = float(cfg.get("prior_sd", 0.5))
    w = fit(sev, X, y, prior_sd)
    # leave-one-out (10-fold beyond 100 decisions): rank each decision with weights fitted without it
    n = len(y)
    folds = np.arange(n) if n <= 100 else np.random.default_rng(0).permutation(n) % 10
    loo = np.zeros(n)
    for f in np.unique(folds):
        te = folds == f
        if y[~te].sum() == 0 or y[~te].sum() == (~te).sum():
            loo[te] = score(sev[te], X[te], DEFAULT_WEIGHTS)
            continue
        loo[te] = score(sev[te], X[te], fit(sev[~te], X[~te], y[~te], prior_sd))
    auc_learned, auc_default = _auc(loo, y), _auc(score(sev, X, DEFAULT_WEIGHTS), y)
    use = auc_learned is not None and (auc_default is None or auc_learned >= auc_default)
    info.update({"status": "learned" if use else "kept_default", "auc_learned_held_out": auc_learned, "auc_default": auc_default,
                 "fitted_weights": w, "weights": w if use else dict(DEFAULT_WEIGHTS),
                 "biggest_changes": {k: round(w[k] - DEFAULT_WEIGHTS[k], 2) for k in
                                     sorted(SIGNALS, key=lambda k: -abs(w[k] - DEFAULT_WEIGHTS[k]))[:4]}})
    return (w if use else dict(DEFAULT_WEIGHTS)), info


def apply(inc: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, dict]:
    """Re-score every incident with this build's weights (hand-set or learned)."""
    w, info = learn(inc, cfg)
    if info["status"] == "learned":
        sev, X = matrix(inc[FACTS].to_dict("records"))
        inc = inc.copy()
        inc["priority_score"] = score(sev, X, w)
    log.info("priority learning: %s (%d of %d decisions count; source %s)", info["status"], info.get("counted", 0),
             info.get("decisions", 0), info.get("source"))
    return inc, info
