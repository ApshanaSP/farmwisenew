"""Reference masters: departments, categories, crosswalks, taluks, ward -> taluk, status scale."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
import yaml

from .util import REF_DIR, Settings, load_ref, clean_str, log

# reference/ward_taluk.csv: the official ward -> revenue taluk, built by scripts/build_ward_taluk.py from TNGIS revenue
# village polygons and the Chennai Collectorate's taluk list (no generated police or PWD data)
WARD_TALUK_FILE = "ward_taluk.csv"
WARD_TALUK_META = "ward_taluk.meta.json"
WARD_TALUK_COLUMNS = ["ward_no", "zone_no", "taluk_code", "share", "method", "source_url", "checked_on", "other_taluks", "split"]

SEVERITIES = ["Severe", "High", "Medium", "Low"]
SEV_RANK = {s: i for i, s in enumerate(SEVERITIES)}


def severity_level(score: float) -> str:
    if score >= 70:
        return "Severe"
    if score >= 50:
        return "High"
    if score >= 30:
        return "Medium"
    return "Low"


@dataclass
class Reference:
    settings: Settings
    departments: pd.DataFrame = field(init=False)
    categories: pd.DataFrame = field(init=False)
    cat: dict[str, dict] = field(init=False)
    cmap: dict[str, Any] = field(init=False)
    status: dict[str, Any] = field(init=False)
    taluks: pd.DataFrame = field(init=False)
    ward_taluk: pd.DataFrame = field(init=False)
    facilities_cfg: dict[str, Any] = field(init=False)
    publishers_cfg: dict[str, Any] = field(init=False)

    def __post_init__(self) -> None:
        deps = load_ref("departments.yaml")
        self.departments = pd.DataFrame(deps)
        self.dept_by_source_name = {n: d["code"] for d in deps for n in d.get("source_names", [])}
        cats = load_ref("categories.yaml")
        self.cat = {c["code"]: c for c in cats}
        self.categories = pd.DataFrame([{
            "category_code": c["code"], "label": c["label"], "family": c["family"], "lead_dept": c["lead"],
            "support_depts": "|".join(c.get("support") or []), "base_severity": c["base_severity"],
            "rain_sensitive": int(bool(c.get("rain_sensitive"))), "sla_severe_h": c["sla_h"][0], "sla_high_h": c["sla_h"][1],
            "sla_medium_h": c["sla_h"][2], "sla_low_h": c["sla_h"][3], "link_window_h": c["link_window_h"],
            "link_radius_m": c["link_radius_m"], "playbook": "|".join(c.get("playbook") or []),
            "sla_basis": c.get("sla_basis", "resolution"),
        } for c in cats])
        self.cmap = load_ref("category_map.yaml")
        self._sub_regex = [(re.compile(r["pattern"]), r["code"]) for r in self.cmap["grievance"]["subtype_regex"]]
        self._hosp_regex = [(re.compile(r["pattern"]), r["code"]) for r in self.cmap["hospital_alert"]]
        self.status = load_ref("status_map.yaml")
        self.facilities_cfg = load_ref("facilities.yaml")
        self.publishers_cfg = load_ref("publishers.yaml")
        self._build_taluks()
        self._build_ward_taluk()

    # ----------------------------------------------------------------- taluks --
    def _build_taluks(self) -> None:
        rows = load_ref("taluks.yaml")
        pol = json.loads(self.settings.src("police", "taluks_config").read_text(encoding="utf-8"))
        pol_c = {t["code"]: t["centroid"] for t in pol["taluks"]}
        news_cfg = yaml.safe_load(self.settings.src("news", "config").read_text(encoding="utf-8"))
        news_t = {t["name"]: t for t in news_cfg["gazetteer"]["taluks"]}
        # a point inside each taluk's part of the GCC wards, from the official village overlay (the police config's
        # centroids belong to a generated dataset); the old sources only when the overlay has not been built
        meta_p = REF_DIR / WARD_TALUK_META
        label = json.loads(meta_p.read_text(encoding="utf-8")).get("taluks", {}) if meta_p.exists() else {}
        out = []
        for r in rows:
            c = pol_c.get(r.get("police") or "")
            n = news_t.get(r["name"], {})
            lat = c["lat"] if c else n.get("latitude")
            lon = c["lng"] if c else n.get("longitude")
            if r["code"] in label:
                lat, lon = label[r["code"]]["label_lat"], label[r["code"]]["label_lon"]
            if r["code"] == "TLK-TBM":
                lat, lon = 12.9249, 80.1000
            aliases = sorted({r["name"], *(n.get("aliases_en") or [])})
            out.append({"taluk_code": r["code"], "name": r["name"], "name_ta": r.get("name_ta"), "police_code": r.get("police"),
                        "pwd_code": r.get("pwd"), "in_district": int(bool(r["in_district"])), "lat": lat, "lon": lon,
                        "aliases": "|".join(aliases), "note": r.get("note")})
        self.taluks = pd.DataFrame(out)
        self.taluk_by_police = {r.police_code: r.taluk_code for r in self.taluks.itertuples() if r.police_code}
        self.taluk_by_pwd = {r.pwd_code: r.taluk_code for r in self.taluks.itertuples() if r.pwd_code}
        self.taluk_by_name = {}
        for r in self.taluks.itertuples():
            for a in str(r.aliases).split("|"):
                self.taluk_by_name[a.lower()] = r.taluk_code

    # ---------------------------------------------------------- ward -> taluk --
    def _build_ward_taluk(self) -> None:
        """The official ward -> taluk table (one row per GCC ward). Empty when the file is missing: the pipeline then
        leaves taluks unset rather than fall back to the generated police/PWD vote."""
        p = REF_DIR / WARD_TALUK_FILE
        if not p.exists():
            log.warning("reference: %s missing; run scripts/build_ward_taluk.py", WARD_TALUK_FILE)
            self.ward_taluk = pd.DataFrame(columns=WARD_TALUK_COLUMNS)
            return
        wt = pd.read_csv(p, encoding="utf-8", dtype={"other_taluks": str})
        wt["ward_no"] = wt["ward_no"].astype(int)
        known = set(self.taluks.loc[self.taluks["in_district"] == 1, "taluk_code"])
        bad = sorted(set(wt["taluk_code"].dropna()) - known)
        if bad or wt["ward_no"].duplicated().any():
            raise ValueError(f"{WARD_TALUK_FILE}: unknown taluk codes {bad} or repeated wards")
        wt["other_taluks"] = wt["other_taluks"].fillna("")
        # the table was built from one ward polygon file: if that file has changed since, the old ward numbers would be applied
        # silently to new shapes, so the mismatch is logged and recorded (self.ward_taluk_stale) for the build's metrics
        self.ward_taluk_stale = False
        meta_p = REF_DIR / WARD_TALUK_META
        try:
            want = json.loads(meta_p.read_text(encoding="utf-8")).get("ward_geometry_sha256") if meta_p.exists() else None
            if want:
                import hashlib
                have = hashlib.sha256(self.settings.src("wards_geojson").read_bytes()).hexdigest()
                if have != want:
                    self.ward_taluk_stale = True
                    log.warning("reference: %s was built from another ward polygon file; re-run scripts/build_ward_taluk.py", WARD_TALUK_FILE)
        except Exception as e:  # noqa: BLE001 - a missing ward file is reported by the loaders that need it
            log.warning("reference: could not check the ward polygons behind %s: %s", WARD_TALUK_FILE, e)
        self.ward_taluk = wt

    # -------------------------------------------------------------- category --
    def grievance_category(self, ctype: str, sub: str) -> tuple[str, str]:
        sub_map = self.cmap["grievance"]["subtype"]
        if sub in sub_map:
            return sub_map[sub], "crosswalk:subtype"
        for rx, code in self._sub_regex:
            if rx.search(sub or ""):
                return code, "crosswalk:subtype_regex"
        code = self.cmap["grievance"]["type"].get(ctype, "OTHER")
        return code, "crosswalk:type"

    def hospital_category(self, alert: str) -> str:
        for rx, code in self._hosp_regex:
            if rx.search(alert or ""):
                return code
        return "HEALTH_SERVICES"

    def family(self, code: str) -> str:
        return self.cat.get(code, self.cat["OTHER"])["family"]

    def sla_hours(self, code: str, severity: str) -> float:
        c = self.cat.get(code, self.cat["OTHER"])
        return float(c["sla_h"][SEV_RANK.get(severity, 3)])

    def dept_code(self, name: Any) -> str | None:
        return self.dept_by_source_name.get(clean_str(name))

    # ------------------------------------------------------------ publishers --
    def publisher_tier(self, domain: str) -> tuple[str, float, str | None]:
        cfg = self.publishers_cfg
        d = (domain or "").lower()
        for dom, name in cfg["established"].items():
            if d == dom or d.endswith("." + dom):
                return "established", cfg["tiers"]["established"]["reliability"], name
        if any(p in d for p in cfg["social_patterns"]):
            return "social", cfg["tiers"]["social"]["reliability"], None
        if any(p in d for p in cfg["aggregator_patterns"]):
            return "aggregator", cfg["tiers"]["aggregator"]["reliability"], None
        return "regional", cfg["tiers"]["regional"]["reliability"], None

    # ---------------------------------------------------------------- status --
    def std_status(self, source: str, value: Any) -> str | None:
        return self.status.get(source, {}).get(clean_str(value))

    @property
    def stage_order(self) -> dict[str, int]:
        return {s: i for i, s in enumerate(self.status["stages"])}
