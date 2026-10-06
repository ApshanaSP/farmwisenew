"""Aggregates, baselines, anomalies, hotspots, ward statistics and KPIs.

* Expected daily count per (category x zone): the rate over the previous 28 days, adjusted
  for the weekday and for rain (a rain day and the two after it carry the category's own
  rain factor, learned from the history before the checked days).
* Two checks per series: a one-day spike (Poisson tail) on each of the last 7 days, and a
  slow rise (Poisson CUSUM for a doubling, against a baseline frozen before the last
  14 days; p-value by simulation). All checks together pass one Benjamini-Hochberg
  false-discovery correction, so checking ~500 series a day does not breed false alarms.
* Hotspots: DBSCAN with haversine distance per category; Getis-Ord Gi* on ward counts.
* Metric series: EWMA (span 7) and z-score of the latest value against 28 days.
Everything here is deterministic SQL-style arithmetic; no model writes a number.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm, poisson
from sklearn.cluster import DBSCAN

from .geo import WardIndex
from .refdata import Reference
from .util import IST, log

PERIODS = {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 90}


def daily_counts(events: pd.DataFrame) -> pd.DataFrame:
    e = events[(events["junk_flag"] != 1) & events["source"].isin(["grievance", "police", "pwd", "hospital", "news"])].copy()
    e["date"] = e["reported_at"].dt.tz_convert(IST).dt.date.astype(str)
    return e.groupby(["date", "zone_no", "category_code", "source"], dropna=False).size().rename("count").reset_index()


RAIN_LAG_DAYS = 3            # a rain day and the two after it (complaints lag the rain)
RAIN_PSEUDO = 5.0            # pseudo-reports pulling a category's rain factor towards 1 when rain days are few
ANOMALY_COLUMNS = ["date", "category_code", "zone_no", "observed", "expected", "p_value", "ratio",
                   "kind", "rise_days", "q_value", "rain_adjusted"]


def rain_days(calendar: pd.DataFrame | None) -> set:
    """Dates (tz-naive midnight) that are rain days or up to two days after one."""
    if calendar is None or not len(calendar) or "rain_event" not in calendar:
        return set()
    wet = pd.to_datetime(calendar.loc[calendar["rain_event"] == 1, "date"]).dt.normalize()
    return {d + pd.Timedelta(days=k) for d in wet for k in range(RAIN_LAG_DAYS)}


def _rain_factors(cnt: pd.Series, days: pd.DatetimeIndex, wet: np.ndarray, before: pd.Timestamp) -> dict:
    """Per category: district-wide mean count on rain-affected days / on dry days, shrunk towards 1.
    Learned only from days before `before`, so the checked days do not set their own baseline."""
    out = {}
    hist = days < before
    w = wet[hist]
    if w.sum() < 3 or (~w).sum() < 7:
        return out
    for cat, s in cnt.groupby(level=0):
        d = s.groupby(level=2).sum().reindex(days, fill_value=0).to_numpy(float)[hist]
        f = (d[w].sum() + RAIN_PSEUDO) / (w.sum() * d[~w].mean() + RAIN_PSEUDO)
        out[cat] = float(np.clip(f, 0.5, 10.0))
    return out


def bh_qvalues(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg adjusted p-values (q-values) for one family of checks."""
    p = np.asarray(p, float)
    m = len(p)
    if not m:
        return p
    o = np.argsort(p)
    q = np.minimum.accumulate((p[o] * m / np.arange(1, m + 1))[::-1])[::-1]
    out = np.empty(m)
    out[o] = np.minimum(q, 1.0)
    return out


def cusum(x: np.ndarray, lam: np.ndarray, rho: float) -> np.ndarray:
    """Poisson CUSUM path for a shift from lam to rho * lam (the last axis is time)."""
    step = x * np.log(rho) - lam * (rho - 1)
    s = np.zeros(step.shape[:-1])
    path = np.empty(step.shape, dtype=float)
    for t in range(step.shape[-1]):
        s = np.maximum(0.0, s + step[..., t])
        path[..., t] = s
    return path


def _cusum_p(stat: float, lam: np.ndarray, rho: float, recent: int, rng: np.random.Generator) -> float:
    """P(peak CUSUM in the last `recent` days >= stat) under the baseline, by simulation; more runs when it is rare."""
    hits = runs = 0
    for n_sim in (2_000, 50_000, 50_000, 50_000, 50_000):
        sim = rng.poisson(np.broadcast_to(lam, (n_sim, len(lam))))
        hits += int((cusum(sim, lam, rho)[:, -recent:].max(axis=1) >= stat - 1e-9).sum())
        runs += n_sim
        if hits >= 20:
            break
    return (hits + 1) / (runs + 1)


def anomalies(inc: pd.DataFrame, as_of: pd.Timestamp, days_back: int, fdr: float, min_count: int, window: int,
              calendar: pd.DataFrame | None = None, rise_days: int = 14, rise_factor: float = 2.0) -> tuple[pd.DataFrame, dict]:
    """Unusual incident counts per (category, zone): one-day spikes and slow rises, false-discovery controlled."""
    x = inc[inc["zone_no"].notna()].copy()
    x["date"] = x["first_reported_at"].dt.tz_convert(IST).dt.normalize().dt.tz_localize(None)
    today = as_of.tz_convert(IST).normalize().tz_localize(None)
    cnt = x.groupby(["category_code", "zone_no", "date"]).size().rename("n")
    days = pd.date_range(x["date"].min(), today, freq="D")
    wk = x.groupby(x["date"].dt.dayofweek).size()
    wk = (wk / wk.mean()).reindex(range(7)).fillna(1.0)
    wk_d = days.dayofweek.map(wk).to_numpy(float)
    rd = rain_days(calendar)
    wet = np.array([d in rd for d in days])
    rain_f = _rain_factors(cnt, days, wet, today - pd.Timedelta(days=rise_days - 1))
    recent = np.where(days >= today - pd.Timedelta(days=days_back - 1))[0]
    rng = np.random.default_rng(20261006)
    checks = []
    for (cat, zone), s in cnt.groupby(level=[0, 1]):
        y = s.droplevel([0, 1]).reindex(days, fill_value=0).to_numpy(float)
        rf = rain_f.get(cat, 1.0)
        mult = wk_d * np.where(wet, rf, 1.0)
        rain_adj = wet & (abs(rf - 1) > 0.05)
        # ---- one-day spikes: the rate per unit of expected load over the previous `window` days
        ys, ms = pd.Series(y).shift(1), pd.Series(mult).shift(1)
        exp = (ys.rolling(window, min_periods=14).sum() / ms.rolling(window, min_periods=14).sum()).to_numpy() * mult
        exp_old = ys.rolling(window, min_periods=14).mean().to_numpy() * wk_d     # the rule before rain and many-checks
        for i in recent:
            if np.isnan(exp[i]):
                continue
            n, lam = int(y[i]), max(float(exp[i]), 0.05)
            checks.append({"date": str(days[i].date()), "category_code": cat, "zone_no": int(zone), "observed": n,
                           "expected": round(float(exp[i]), 2), "p_value": float(poisson.sf(n - 1, lam)) if n else 1.0,
                           "ratio": round(n / lam, 1), "kind": "spike", "rise_days": 1, "rain_adjusted": int(rain_adj[i]),
                           "p_old": float(poisson.sf(n - 1, max(float(exp_old[i]), 0.05))) if n else 1.0})
        # ---- slow rise: CUSUM over the last `rise_days` days against a baseline frozen before them
        k0 = len(days) - rise_days
        lo = max(0, k0 - window)
        if k0 - lo < 14 or mult[lo:k0].sum() <= 0:
            continue
        lam0 = np.maximum(y[lo:k0].sum() / mult[lo:k0].sum() * mult[k0:], 0.02)
        path = cusum(y[k0:], lam0, rise_factor)
        stat = float(path[-days_back:].max())
        j_end = len(path) - days_back + int(path[-days_back:].argmax())
        j0 = j_end
        while j0 > 0 and path[j0 - 1] > 0:       # the rise starts where the CUSUM last left zero
            j0 -= 1
        o_sum, e_sum = float(y[k0 + j0:k0 + j_end + 1].sum()), float(lam0[j0:j_end + 1].sum())
        p = _cusum_p(stat, lam0, rise_factor, days_back, rng) if o_sum >= 2 * min_count and o_sum > 1.5 * e_sum else 1.0
        checks.append({"date": str(days[k0 + j_end].date()), "category_code": cat, "zone_no": int(zone), "observed": int(o_sum),
                       "expected": round(e_sum, 2), "p_value": p, "ratio": round(o_sum / max(e_sum, 0.05), 1), "kind": "slow_rise",
                       "rise_days": int(j_end - j0 + 1), "rain_adjusted": int(rain_adj[k0 + j0:k0 + j_end + 1].any())})
    if not checks:
        return pd.DataFrame(columns=ANOMALY_COLUMNS), {"checks": 0}
    allc = pd.DataFrame(checks)
    allc["q_value"] = bh_qvalues(allc["p_value"].to_numpy())
    a = allc[(allc["q_value"] <= fdr) & (allc["observed"] >= min_count)].copy()
    # a series that already shows a one-day spike this week is not repeated as a slow rise
    spiked = set(zip(a.loc[a["kind"] == "spike", "category_code"], a.loc[a["kind"] == "spike", "zone_no"]))
    a = a.loc[np.array([k == "spike" or (c, z) not in spiked for k, c, z in zip(a["kind"], a["category_code"], a["zone_no"])], dtype=bool)]
    for c in ("p_value", "q_value"):
        a[c] = a[c].map(lambda v: float(f"{v:.2e}"))
    a = a[ANOMALY_COLUMNS].sort_values(["date", "ratio"], ascending=[False, False]).reset_index(drop=True)
    sp = allc["kind"] == "spike"
    info = {"checks": int(len(allc)), "spike_checks": int(sp.sum()), "slow_rise_checks": int((~sp).sum()), "false_discovery_rate": fdr,
            "old_rule_alerts": int((sp & (allc["p_old"] < 0.01) & (allc["observed"] >= min_count)).sum()),
            "spikes": int((a["kind"] == "spike").sum()), "slow_rises": int((a["kind"] == "slow_rise").sum()),
            "rain_factors": {k: round(v, 2) for k, v in sorted(rain_f.items()) if abs(v - 1) > 0.05}}
    log.info("anomalies: %d spikes + %d slow rises kept from %d checks (the old rule would have raised %d)",
             info["spikes"], info["slow_rises"], info["checks"], info["old_rule_alerts"])
    return a, info


def hotspots(inc: pd.DataFrame, as_of: pd.Timestamp, eps_m: float, min_samples: int, days: int = 90) -> tuple[pd.DataFrame, pd.Series]:
    x = inc[(inc["first_reported_at"] >= as_of - pd.Timedelta(days=days)) & inc["lat"].notna() & (inc["has_official_record"] == 1)]
    rows, assign = [], pd.Series(index=inc["incident_id"], dtype=object)
    for cat, grp in x.groupby("category_code"):
        if len(grp) < min_samples:
            continue
        X = np.radians(grp[["lat", "lon"]].to_numpy(float))
        lab = DBSCAN(eps=eps_m / 6_371_000, min_samples=min_samples, metric="haversine", algorithm="ball_tree").fit_predict(X)
        for k in set(lab) - {-1}:
            m = grp[lab == k]
            hid = f"HOT-{cat}-{k:03d}"
            recent = m["first_reported_at"] >= as_of - pd.Timedelta(days=30)
            rows.append({"hotspot_id": hid, "category_code": cat, "incidents": len(m), "incidents_30d": int(recent.sum()),
                         "open": int(m["is_open"].sum()), "lat": round(m["lat"].mean(), 6), "lon": round(m["lon"].mean(), 6),
                         "wards": "|".join(str(int(w)) for w in sorted(m["ward_no"].dropna().unique())),
                         "first_seen": m["first_reported_at"].min(), "last_seen": m["first_reported_at"].max(),
                         "top_place": m["place_text"].mode().iloc[0] if m["place_text"].notna().any() else None})
            assign.loc[m["incident_id"]] = hid
    h = pd.DataFrame(rows)
    log.info("hotspots: %d clusters across %d categories", len(h), h["category_code"].nunique() if len(h) else 0)
    return h, assign


def gi_star(values: pd.Series, adj: dict[int, set[int]]) -> pd.Series:
    """Getis-Ord Gi* z-score per ward with binary contiguity (self included)."""
    wards = values.index.tolist()
    x = values.to_numpy(float)
    n = len(x)
    xbar, s = x.mean(), np.sqrt((x ** 2).mean() - x.mean() ** 2)
    pos = {w: i for i, w in enumerate(wards)}
    z = np.zeros(n)
    for i, w in enumerate(wards):
        nb = [pos[j] for j in adj.get(w, set()) if j in pos] + [i]
        wsum = len(nb)
        num = x[nb].sum() - xbar * wsum
        den = s * np.sqrt((n * wsum - wsum ** 2) / (n - 1)) if s > 0 else 1
        z[i] = num / den if den else 0
    return pd.Series(z.round(2), index=wards)


def ward_stats(wards: WardIndex, events: pd.DataFrame, inc: pd.DataFrame, ward_taluk: dict, adj: dict, as_of: pd.Timestamp) -> pd.DataFrame:
    rows = []
    fl = events[(events["category_family"] == "FLOOD") & events["ward_no"].notna()].groupby("ward_no").size()
    inc30 = inc[(inc["first_reported_at"] >= as_of - pd.Timedelta(days=30)) & inc["ward_no"].notna()]
    c30 = inc30.groupby("ward_no").size()
    opn = inc[(inc["is_open"] == 1) & inc["ward_no"].notna()].groupby("ward_no").size()
    brc = inc[(inc["is_open"] == 1) & (inc["sla_breached"] == 1) & inc["ward_no"].notna()].groupby("ward_no").size()
    for w in wards.wards:
        rows.append({"ward_no": w.ward_no, "zone_no": w.zone_no, "zone_name": w.zone_name,
                     "taluk_code": ward_taluk.get(w.ward_no, (None, 0))[0], "taluk_vote_share": ward_taluk.get(w.ward_no, (None, 0))[1],
                     "area_km2": round(w.area_km2, 3), "centroid_lat": round(w.centroid[0], 6), "centroid_lon": round(w.centroid[1], 6),
                     "adjacent_wards": "|".join(str(a) for a in sorted(adj.get(w.ward_no, set()))),
                     "flood_reports": int(fl.get(w.ward_no, 0)), "incidents_30d": int(c30.get(w.ward_no, 0)),
                     "open_incidents": int(opn.get(w.ward_no, 0)), "open_past_deadline": int(brc.get(w.ward_no, 0))})
    ws = pd.DataFrame(rows).set_index("ward_no")
    dens = ws["flood_reports"] / ws["area_km2"].clip(lower=0.3)
    ws["low_lying_index"] = (dens.rank(pct=True)).round(3)
    ws["gi_star_z_30d"] = gi_star(ws["incidents_30d"], adj)
    ws["hot_ward"] = (ws["gi_star_z_30d"] > norm.ppf(0.975)).astype(int)
    return ws.reset_index()


def observation_signals(obs: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """Latest value per (metric, place) with EWMA, 28-day z-score and a flag."""
    o = obs[(obs["quality"] != "suspect") & obs["value"].notna() & (obs["observed_at"] <= as_of)].copy()
    rows = []
    for (m, pid), s in o.sort_values("observed_at").groupby(["metric", "place_id"]):
        v = s["value"].astype(float)
        last = s.iloc[-1]
        hist = v[s["observed_at"] >= last["observed_at"] - pd.Timedelta(days=28)]
        mu, sd = hist.iloc[:-1].mean() if len(hist) > 1 else np.nan, hist.iloc[:-1].std() if len(hist) > 2 else np.nan
        z = (v.iloc[-1] - mu) / sd if sd and sd > 0 else np.nan
        ew = v.ewm(span=7).mean().iloc[-1]
        slope = np.nan
        if len(v) >= 7:
            y = v.iloc[-7:].to_numpy()
            slope = float(np.polyfit(np.arange(len(y)), y, 1)[0])
        rows.append({"metric": m, "place_id": pid, "place_name": last["place_name"], "lat": last["lat"], "lon": last["lon"],
                     "taluk_code": last["taluk_code"], "observed_at": last["observed_at"], "value": float(v.iloc[-1]),
                     "unit": last["unit"], "ewma7": round(float(ew), 2), "mean28": round(float(mu), 2) if pd.notna(mu) else None,
                     "zscore": round(float(z), 2) if pd.notna(z) else None, "slope_per_day": round(slope, 3) if pd.notna(slope) else None,
                     "n_points": int(len(v)), "detail": last["detail"], "source": last["source"],
                     "anomaly": int(pd.notna(z) and abs(z) >= 3 and len(hist) >= 10)})
    sig = pd.DataFrame(rows)
    if len(sig):
        lake = sig["metric"] == "lake_pct_full"
        sig["days_to_full"] = np.where(lake & (sig["slope_per_day"] > 0.05), ((100 - sig["value"]) / sig["slope_per_day"]).round(0), np.nan)
    return sig


def kpis(inc: pd.DataFrame, events: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """KPI tiles per period and zone (plus district), with the previous period for deltas."""
    rows = []
    g = events[events["source"] == "grievance"]
    for pname, days in PERIODS.items():
        for offset in (0, 1):
            end = as_of - pd.Timedelta(days=days * offset)
            start = end - pd.Timedelta(days=days)
            win = inc[(inc["first_reported_at"] > start) & (inc["first_reported_at"] <= end)]
            closed = inc[(inc["closed_at"] > start) & (inc["closed_at"] <= end)]
            gw = g[(g["reported_at"] > start) & (g["reported_at"] <= end)]
            for zone, part in [(None, None)] + [(z, None) for z in sorted(inc["zone_no"].dropna().unique())]:
                w = win if zone is None else win[win["zone_no"] == zone]
                c = closed if zone is None else closed[closed["zone_no"] == zone]
                gg = gw if zone is None else gw[gw["zone_no"] == zone]
                rows.append({"period": pname, "offset": offset, "zone_no": zone, "window_start": start, "window_end": end,
                             "incidents": len(w), "severe_incidents": int((w["severity_level"] == "Severe").sum()),
                             "high_incidents": int((w["severity_level"] == "High").sum()),
                             "open_incidents": int(w["is_open"].sum()), "resolved": len(c),
                             "complaints_filed": len(gg), "complaints_open": int((~gg["status_std"].isin(["Resolved", "Rejected", "Lapsed"])).sum()),
                             "sla_breached_open": int(((w["is_open"] == 1) & (w["sla_breached"] == 1)).sum()),
                             "median_hours_to_first_action": (lambda h: round(float(h.median()), 1) if h.notna().any() else None)(
                                 w.loc[w["sla_basis"] == "resolution", "hours_to_first_action"]),
                             "multi_source_incidents": int((w["source_count"] > 1).sum()), "media_only": int(w["media_only"].sum())})
    return pd.DataFrame(rows)
