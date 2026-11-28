"""Incident priority: severity plus weighted signals, with a bounded adjustment learned from the Collector's decisions.

priority = severity_score                         impact: how serious the event is (severity.py, 0-100)
         + sum(weight_k * signal_k)               urgency and exposure: the named signals below, District IQ defaults
         + learned adjustment (at most +-10)      the Collector's own past decisions on similar cases

This is the impact-plus-urgency idea of ITIL incident management (urgency: how quickly it must be resolved; impact:
how far the damage reaches), as in the UK Cabinet Office's Technical incident management guidance
(https://digital-handbook.cabinetoffice.gov.uk/docs/software/technical-incident-management-guidance.html, read
2026-11-28), written as points instead of a matrix so every term can be shown. The signals and their weights:

  deadline    open more than twice past its deadline +20, past it +10, close to it (75 % of the time used) +5
  check       Severe or High, open and not verified by an officer +8; in the news with no department record +5
  spread      several sources 5 x log2(sources); citizen complaints 3 x log2(1 + complaints) when more than one;
              3 or more new reports in 24 h +8; 2 or more news outlets +5
  people      vulnerable people named +5
  context     linked to a rain day +5; 3 or more similar incidents here in 90 days +5

Every Collector decision is saved by the website with the incident's facts at that moment
(audit_log.before_value.score). Once enough decisions count (config: priority_learning), the weights are refitted:

    P(decision says "should rank higher") = sigmoid(b0 + s * priority / 100)

by maximum a posteriori with a Gaussian prior centred on the hand-set weights, so a few decisions move them a
little and many decisions move them more. Severity keeps weight 1 (it sets the scale). The learned weights are
used only when, in leave-one-out tests, they rank the Collector's decisions at least as well as the hand-set ones,
and then only as an adjustment on top of the hand-set points: each signal may move by at most its own hand-set
weight, and the whole adjustment by at most LEARN_CAP points, shown to the Collector as one line ("Your past
decisions on similar cases: +6, mostly for: linked to a rain event"). Nothing here stores who decided.
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
                   "growing": 8.0, "vulnerable": 5.0, "multi_outlet": 5.0, "media_only": 5.0, "rain": 5.0, "recurring": 5.0,
                   "sla_near": 5.0}
SIGNALS = list(DEFAULT_WEIGHTS)
# what each signal is, in the Collector's words, and which part of the formula it belongs to
LABELS = {"multi_source": "Reported by several sources", "complaints": "Citizen complaints", "sla_over_2x": "Open more than twice past its deadline",
          "sla_over": "Past its deadline", "sla_near": "Close to its deadline (three quarters of the time used)",
          "unverified_serious": "Severe or High and not yet verified by an officer", "growing": "3 or more new reports in 24 hours",
          "vulnerable": "Vulnerable people or places named", "multi_outlet": "Covered by 2 or more news outlets",
          "media_only": "In the news but in no department's records", "rain": "Linked to a rain event",
          "recurring": "3 or more similar incidents here in 90 days"}
GROUP = {"sla_over_2x": "deadline", "sla_over": "deadline", "sla_near": "deadline", "unverified_serious": "check", "media_only": "check",
         "multi_source": "spread", "complaints": "spread", "growing": "spread", "multi_outlet": "spread", "vulnerable": "people",
         "rain": "context", "recurring": "context"}
NEAR = 0.75                  # share of the deadline used from which an open incident is "close to its deadline"
LEARN_CAP = 10.0             # the learned adjustment never moves a priority by more than this many points
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


def _near(r: dict) -> bool:
    """Open, not yet past its deadline but three quarters of the time used; a response deadline only until the first
    response (after it, the response time is fixed and nothing is coming due)."""
    over = _n(r.get("sla_ratio"))
    waiting = r.get("sla_basis") != "response" or not _n(r.get("verified"))
    return bool(_n(r.get("is_open"))) and NEAR <= over <= 1 and waiting


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
        elif _near(r):
            x["sla_near"] = 1.0
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
        elif _near(r):
            why.append(f"{what} close to the {_n(r.get('sla_hours')):.0f} h target")
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


def _num(df: pd.DataFrame, c: str, default: float = 0.0) -> np.ndarray:
    if c not in df.columns:
        return np.full(len(df), default)
    return pd.to_numeric(df[c], errors="coerce").fillna(default).to_numpy(float)


def frame_signals(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """(severity scores, signal matrix in SIGNALS order) of a whole frame at once: the rules of features()."""
    n = len(df)
    sev = _num(df, "severity_score")
    sc, cc = _num(df, "source_count", 1), _num(df, "citizen_complaints")
    opn = _num(df, "is_open") != 0
    over = _num(df, "sla_ratio")
    ver = _num(df, "verified") != 0
    lvl = df["severity_level"].to_numpy(object) if "severity_level" in df else np.full(n, None, object)
    basis = df["sla_basis"].to_numpy(object) if "sla_basis" in df else np.full(n, None, object)
    vul = df["vulnerable"].to_numpy(object) if "vulnerable" in df else np.full(n, None, object)
    serious = np.isin(lvl, ["Severe", "High"])
    X = np.zeros((n, len(SIGNALS)))
    col = {k: i for i, k in enumerate(SIGNALS)}
    with np.errstate(divide="ignore", invalid="ignore"):
        X[:, col["multi_source"]] = np.where(sc > 1, np.log2(np.where(sc > 1, sc, 1)), 0)
        X[:, col["complaints"]] = np.where(cc > 1, np.log2(1 + np.where(cc > 1, cc, 0)), 0)
    X[:, col["sla_over_2x"]] = opn & (over > 2)
    X[:, col["sla_over"]] = opn & (over > 1) & (over <= 2)
    X[:, col["sla_near"]] = opn & (over >= NEAR) & (over <= 1) & ((basis != "response") | ~ver)
    X[:, col["unverified_serious"]] = opn & ~ver & serious
    X[:, col["growing"]] = opn & (_num(df, "growth_24h") >= 3)
    X[:, col["vulnerable"]] = np.array([isinstance(v, str) and bool(v) for v in vul], bool)
    X[:, col["multi_outlet"]] = _num(df, "outlet_count") >= 2
    X[:, col["media_only"]] = _num(df, "media_only") != 0
    X[:, col["rain"]] = _num(df, "rain_coupled") != 0
    X[:, col["recurring"]] = _num(df, "recurrence_90d") >= 3
    return sev, X


def matrix(rows: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """(severity scores, signal matrix in SIGNALS order)."""
    if not rows:
        return np.zeros(0), np.zeros((0, len(SIGNALS)))
    return frame_signals(pd.DataFrame(list(rows)))


def score(sev: np.ndarray, X: np.ndarray, weights: dict[str, float]) -> np.ndarray:
    return (sev + X @ np.array([weights[k] for k in SIGNALS])).round(1)


def frame_reasons(df: pd.DataFrame) -> list[str]:
    """reasons() of every row; the same text, assembled from columns (tests/test_scoring.py checks they agree)."""
    n = len(df)
    obj = lambda c: df[c].to_numpy(object) if c in df else np.full(n, None, object)  # noqa: E731
    sev, lvl, basis, vul = _num(df, "severity_score"), obj("severity_level"), obj("sla_basis"), obj("vulnerable")
    lab = df["category_label"].map(lambda v: str(v).lower()).to_numpy(object) if "category_label" in df else np.full(n, "none", object)
    sc, cc, hrs = _num(df, "source_count", 1), _num(df, "citizen_complaints"), _num(df, "sla_hours")
    opn, over, ver = _num(df, "is_open") != 0, _num(df, "sla_ratio"), _num(df, "verified") != 0
    gr, outl, mo = _num(df, "growth_24h"), _num(df, "outlet_count"), _num(df, "media_only") != 0
    rain, rec = _num(df, "rain_coupled") != 0, _num(df, "recurrence_90d")
    near = opn & (over >= NEAR) & (over <= 1) & ((basis != "response") | ~ver)
    out = []
    for i in range(n):
        why = [f"{lvl[i]} {lab[i]} ({sev[i]:.0f})"]
        if sc[i] > 1:
            why.append(f"reported by {int(sc[i])} sources")
        if cc[i] > 1:
            why.append(f"{int(cc[i])} citizen complaints")
        if opn[i]:
            what = "response" if basis[i] == "response" else "resolution"
            if over[i] > 2:
                why.append(f"{what} over twice the {hrs[i]:.0f} h target")
            elif over[i] > 1:
                why.append(f"{what} past the {hrs[i]:.0f} h target")
            elif near[i]:
                why.append(f"{what} close to the {hrs[i]:.0f} h target")
            if not ver[i] and lvl[i] in ("Severe", "High"):
                why.append("not yet verified by an officer")
            if gr[i] >= 3:
                why.append(f"{int(gr[i])} new reports in 24 h")
        if isinstance(vul[i], str) and vul[i]:
            why.append(f"affects {vul[i].replace('|', ', ').replace('_', ' ')}")
        if outl[i] >= 2:
            why.append(f"covered by {int(outl[i])} news outlets")
        if mo[i]:
            why.append("in the news but not in any department's records")
        if rain[i]:
            why.append("linked to a rain event")
        if rec[i] >= 3:
            why.append(f"{int(rec[i])} similar incidents here in 90 days")
        out.append("; ".join(why))
    return out


def learned_adjustment(X: np.ndarray, learned: dict[str, float] | None) -> tuple[np.ndarray, np.ndarray]:
    """(total adjustment per incident, per-signal adjustment matrix). Each signal moves by at most its own hand-set
    weight; the total by at most LEARN_CAP points."""
    n = X.shape[0]
    if not learned:
        return np.zeros(n), np.zeros_like(X)
    w0 = np.array([DEFAULT_WEIGHTS[k] for k in SIGNALS])
    delta = np.clip(np.array([learned.get(k, DEFAULT_WEIGHTS[k]) for k in SIGNALS]) - w0, -w0, w0)
    per = X * delta
    return np.clip(per.sum(axis=1), -LEARN_CAP, LEARN_CAP), per


def _words(k: str, i: int, c: dict) -> str:
    """Signal k of row i in the Collector's words, with the incident's own numbers (c: FACTS columns as arrays)."""
    if k in ("sla_over_2x", "sla_over", "sla_near"):
        what = "response " if c["sla_basis"][i] == "response" else ""
        h = f"{c['sla_hours'][i]:.0f} h {what}deadline"
        return {"sla_over_2x": f"Open more than twice past its {h}", "sla_over": f"Past its {h}",
                "sla_near": f"Close to its {h} (three quarters of the time used)"}[k]
    if k == "multi_source":
        return f"Reported by {int(c['source_count'][i])} sources"
    if k == "complaints":
        return f"{int(c['citizen_complaints'][i])} citizen complaints"
    if k == "growing":
        return f"{int(c['growth_24h'][i])} new reports in 24 hours"
    if k == "multi_outlet":
        return f"Covered by {int(c['outlet_count'][i])} news outlets"
    if k == "vulnerable":
        return f"Affects {str(c['vulnerable'][i]).replace('|', ', ').replace('_', ' ')}"
    if k == "recurring":
        return f"{int(c['recurrence_90d'][i])} similar incidents here in 90 days"
    return LABELS[k]


def terms(df: pd.DataFrame, learned: dict[str, float] | None = None) -> list[list[list]]:
    """Every incident's priority as [key, words, points] terms that add up to its priority score: the severity first,
    then each signal that applies, then the learned adjustment (when there is one)."""
    n = len(df)
    sev, X = frame_signals(df)
    w0 = np.array([DEFAULT_WEIGHTS[k] for k in SIGNALS])
    C = X * w0
    adj, per = learned_adjustment(X, learned)
    c = {k: _num(df, k, 1 if k == "source_count" else 0) for k in ("sla_hours", "source_count", "citizen_complaints", "growth_24h",
                                                                    "outlet_count", "recurrence_90d")}
    for k in ("sla_basis", "vulnerable", "severity_level"):
        c[k] = df[k].to_numpy(object) if k in df else np.full(n, None, object)
    ri, cj = np.nonzero(C)
    at = np.searchsorted(ri, np.arange(n + 1))
    out = []
    for i in range(n):
        lv = c["severity_level"][i]
        t = [["severity", f"Severity ({lv})" if isinstance(lv, str) and lv else "Severity", round(float(sev[i]), 1)]]
        for j in cj[at[i]:at[i + 1]]:
            t.append([SIGNALS[j], _words(SIGNALS[j], i, c), round(float(C[i, j]), 1)])
        if adj[i]:
            top = [LABELS[SIGNALS[j]].lower() for j in np.argsort(-np.abs(per[i]))[:2] if per[i, j]]
            sign = "+" if adj[i] > 0 else "-"
            words = (f"Your past decisions on similar cases: {sign}{abs(adj[i]):.0f}"
                     f"{', mostly for: ' + '; '.join(top) if top else ''}")
            t.append(["learned", words, round(float(adj[i]), 1)])
        out.append(t)
    return out


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
        # held out with the formula that is APPLIED: the hand-set score plus the bounded adjustment (apply() below), not the
        # full fitted weights, so the test judges what the console will actually rank by
        wf = fit(sev[~te], X[~te], y[~te], prior_sd)
        adj, _ = learned_adjustment(X[te], wf)
        loo[te] = score(sev[te], X[te], DEFAULT_WEIGHTS) + adj
    auc_learned, auc_default = _auc(loo, y), _auc(score(sev, X, DEFAULT_WEIGHTS), y)
    use = auc_learned is not None and (auc_default is None or auc_learned >= auc_default)
    info.update({"status": "learned" if use else "kept_default", "auc_learned_held_out": auc_learned, "auc_default": auc_default,
                 "fitted_weights": w, "weights": w if use else dict(DEFAULT_WEIGHTS),
                 "biggest_changes": {k: round(w[k] - DEFAULT_WEIGHTS[k], 2) for k in
                                     sorted(SIGNALS, key=lambda k: -abs(w[k] - DEFAULT_WEIGHTS[k]))[:4]}})
    return (w if use else dict(DEFAULT_WEIGHTS)), info


def apply(inc: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, dict]:
    """Re-score every incident with this build's learned adjustment (when the learned weights are used). The hand-set
    points stay; the adjustment is bounded (learned_adjustment) and added to the priority and to score_why."""
    w, info = learn(inc, cfg)
    if info["status"] == "learned":
        sev, X = frame_signals(inc)
        adj, _ = learned_adjustment(X, w)
        inc = inc.copy()
        inc["priority_score"] = (score(sev, X, DEFAULT_WEIGHTS) + adj).round(1)
        info["adjustment"] = {"cap_points": LEARN_CAP, "incidents_moved": int((adj != 0).sum()),
                              "largest_up": round(float(adj.max()), 1) if len(adj) else 0.0,
                              "largest_down": round(float(adj.min()), 1) if len(adj) else 0.0}
        if "score_why" in inc:
            pri = terms(inc, w)
            why = []
            for s, p in zip(inc["score_why"], pri):
                try:
                    d = json.loads(s) if isinstance(s, str) else {}
                except ValueError:
                    d = {}
                d["pri"] = p
                why.append(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
            inc["score_why"] = why
    log.info("priority learning: %s (%d of %d decisions count; source %s)", info["status"], info.get("counted", 0),
             info.get("decisions", 0), info.get("source"))
    return inc, info
