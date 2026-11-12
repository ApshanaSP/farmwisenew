// QA pass 4: what the content grader needs to know, worked out from the pinned tables. No app code is imported.
// It sits on the oracle in pinned.mjs (incidents, with the Collector's decisions and the department routings from the seeded durable rows laid on top)
// and adds: the zone, body and category names, windows of time as a person says them, one row's real facts from its members, events and documents,
// and every figure of DEFS for any set of filters.
import fs from "node:fs";
import path from "node:path";
import { DEFS, loadOracle, PIN_TABLES } from "./pinned.mjs";
import { APP_ROOT, fmtWall, loadTable, wallMs } from "./load.mjs";

const HOUR = 3600_000, DAY = 24 * HOUR;
const table = (name) => loadTable(name, PIN_TABLES).objects();

/** Tamil names of the zones, written by hand from the corporation's own list, each with the spellings people write. */
export const ZONE_TA = {
  1: ["திருவொற்றியூர்"], 2: ["மணலி"], 3: ["மாதவரம்"], 4: ["தண்டையார்பேட்டை"], 5: ["ராயபுரம்", "இராயபுரம்"], 6: ["திரு.வி.க நகர்", "திருவிக நகர்", "திரு வி க நகர்"],
  7: ["அம்பத்தூர்"], 8: ["அண்ணா நகர்"], 9: ["தேனாம்பேட்டை"], 10: ["கோடம்பாக்கம்"], 11: ["வளசரவாக்கம்"], 12: ["ஆலந்தூர்"], 13: ["அடையாறு", "அடையார்"], 14: ["பெருங்குடி"], 15: ["சோழிங்கநல்லூர்"]
};

/** The console's own windows (src/lib/reference/metrics.ts: "24 hours, 7, 30 or 90 days"). */
export const CONSOLE_HOURS = { daily: 24, weekly: 168, monthly: 720, quarterly: 2160 };

export class Truth {
  constructor(o = loadOracle()) {
    this.o = o;
    this.now = o.nowMs;
    this.zones = table("ref_zones").map((z) => ({ n: Number(z.zone_no), name: String(z.zone_name) }));
    this.depts = table("ref_departments").map((d) => ({ code: String(d.code), name: String(d.name), org: d.org ?? null, head: d.head ?? null }));
    this.cats = table("ref_categories").map((c) => ({ code: String(c.category_code), label: String(c.label), lead: c.lead_dept ?? null }));
    this._rawById = null; this._members = null; this._docs = null;
  }

  zoneNo(name) { if (name == null) return null; const q = String(name).toLowerCase(); return this.zones.find((z) => z.name.toLowerCase() === q)?.n ?? null; }
  zoneName(n) { return this.zones.find((z) => z.n === Number(n))?.name ?? null; }
  deptName(code) { return this.depts.find((d) => d.code === code)?.name ?? null; }
  /** the row as the console has it after decisions and hooks, or null */
  row(id) { return this.o.row(String(id)); }
  /** the row as the pipeline built it, null when no such id exists at all */
  rawRow(id) { return this.o.rawRow(String(id)); }
  /** columns the oracle's rows leave out (sla hours, status, title) */
  rawColumns(id) {
    this._rawById ??= new Map(table("incidents").map((r) => [String(r.incident_id), r]));
    return this._rawById.get(String(id)) ?? null;
  }
  /** an incident's members: its reports from every source, with the events behind them */
  members(id) {
    if (!this._members) { this._members = new Map(); for (const m of table("incident_members")) { const k = String(m.incident_id); if (!this._members.has(k)) this._members.set(k, []); this._members.get(k).push(m); } }
    return this._members.get(String(id)) ?? [];
  }
  /** citizen complaints behind an incident, counted from its members */
  complaintsOf(id) { return this.members(id).filter((m) => m.source === "grievance").length; }
  /** the news documents linked to an incident */
  documents(id) {
    if (!this._docs) { this._docs = new Map(); for (const d of table("documents")) { if (!d.linked_incident_id) continue; const k = String(d.linked_incident_id); if (!this._docs.has(k)) this._docs.set(k, []); this._docs.get(k).push({ doc_id: d.doc_id, title: d.title, published_at: d.published_at }); } }
    return this._docs.get(String(id)) ?? [];
  }

  // ---- windows of time. A window is { key, lo, hi, what }: first_reported_at in (lo, hi] on the store's wall clock --
  rolling(hours, offset = 0) { const h = hours * HOUR; return { key: `${hours}h${offset ? `-${offset}` : ""}`, lo: this.now - h * (offset + 1), hi: this.now - h * offset, what: `${hours} hours back from now${offset ? `, ${offset} period(s) earlier` : ""}` }; }
  ofConsole(period) { return this.rolling(CONSOLE_HOURS[period]); }
  get whole() { return { key: "all", lo: -Infinity, hi: this.now, what: "the whole record" }; }
  _day(off) { const d = Math.floor(this.now / DAY) - off; return { lo: d * DAY - 1000, hi: (d + 1) * DAY - 1000 }; } // (lo, hi] on seconds, a day's own 00:00:00 to 23:59:59
  _weekStart() { const d = new Date(this.now); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow); }
  _month(off) { const d = new Date(this.now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - off, 1); }
  _cal(key, lo, hi, what) { return { key, lo: lo - 1000, hi: Math.min(hi, this.now), what }; }
  /**
   * The windows a phrase can fairly mean. The console's own rolling window is first (its glossary defines "today" as the last 24 hours); the calendar reading is
   * accepted too. A row and a total must fit one and the same window. null: the phrase names no single window.
   */
  windowsFor(phrase) {
    if (phrase == null) return null;
    const p = String(phrase).toLowerCase().trim();
    const dayStart = (off) => (Math.floor(this.now / DAY) - off) * DAY;
    switch (p) {
      case "today": return [this.rolling(24), this._cal("cal-today", dayStart(0), this.now, "calendar today")];
      case "yesterday": return [this.rolling(24, 1), this._cal("cal-yesterday", dayStart(1), dayStart(0) - 1000, "calendar yesterday")];
      case "this week": return [this.rolling(168), this._cal("cal-week", this._weekStart(), this.now, "this calendar week")];
      case "last 7 days": return [this.rolling(168)];
      case "last week": return [this.rolling(168, 1), this._cal("cal-lastweek", this._weekStart() - 7 * DAY, this._weekStart() - 1000, "last calendar week")];
      case "this month": return [this.rolling(720), this._cal("cal-month", this._month(0), this.now, "this calendar month")];
      case "last month": return [this.rolling(720, 1), this._cal("cal-lastmonth", this._month(1), this._month(0) - 1000, "last calendar month")];
      case "this quarter": { const d = new Date(this.now); const q = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1); return [this.rolling(2160), this._cal("cal-quarter", q, this.now, "this calendar quarter")]; }
      case "last three months": return [this.rolling(2160), this._cal("cal-3months", this._month(3), this._month(0) - 1000, "the last three calendar months")];
      case "this year": { const d = new Date(this.now); return [this._cal("cal-year", Date.UTC(d.getUTCFullYear(), 0, 1), this.now, "this calendar year")]; }
      default: return null;
    }
  }
  /**
   * A phrase that sets two or more windows against each other: earliest first, the last one is now. Each reading is a list of windows.
   */
  seriesFor(phrase) {
    if (phrase == null) return null;
    const p = String(phrase).toLowerCase().trim();
    if (p === "this month against last month") return [[this.rolling(720, 1), this.rolling(720)], [this._cal("cal-lastmonth", this._month(1), this._month(0) - 1000, "last calendar month"), this._cal("cal-month", this._month(0), this.now, "this calendar month")]];
    if (p === "this week compared with last week") return [[this.rolling(168, 1), this.rolling(168)], [this._cal("cal-lastweek", this._weekStart() - 7 * DAY, this._weekStart() - 1000, "last calendar week"), this._cal("cal-week", this._weekStart(), this.now, "this calendar week")]];
    if (p === "last three months") return [[this.rolling(720, 2), this.rolling(720, 1), this.rolling(720)], [0, 1, 2].map((k) => { const m = 3 - k; return this._cal(`cal-m${k}`, this._month(m), this._month(m - 1) - 1000, `calendar month -${m}`); })];
    return null;
  }

  // ---- rows and figures --
  /** Does a real row pass one filter? Fields: zone (number or "none"), dept, cat, sev, status ("open" | "closed") */
  matches(r, f) {
    if (f.zone != null && r.zone !== Number(f.zone)) return false;
    if (f.dept != null && r.dept !== f.dept) return false;
    if (f.cat != null && r.cat !== f.cat) return false;
    if (f.sev != null && r.sev !== f.sev) return false;
    if (f.status === "open" && !r.open) return false;
    if (f.status === "closed" && r.open) return false;
    return true;
  }
  inWindow(r, w) { return !w || (r.t != null && r.t > w.lo && r.t <= w.hi); }
  rows(f = {}, w = this.whole) { return this.o.effective.filter((r) => this.inWindow(r, w) && this.matches(r, f)); }
  count(f = {}, w = this.whole) { return this.rows(f, w).length; }
  /** Every figure in the glossary for these filters and this window, by name. */
  figures(f = {}, w = this.whole) {
    const rows = this.rows(f, w);
    return Object.fromEntries(Object.keys(DEFS).map((k) => [k, this.o.apply(k, rows).value]));
  }
  /** The console's severity panel over a window (open, not routed, one per group, under its most severe level). */
  severityPanel(f = {}, w = this.whole) {
    const by = new Map();
    for (const r of this.rows({ ...f, sev: null }, w)) {
      if (!(r.open && !r.routed)) continue;
      const cur = by.get(r.group);
      if (!cur || ["Severe", "High", "Medium", "Low"].indexOf(r.sev) < ["Severe", "High", "Medium", "Low"].indexOf(cur.sev)) by.set(r.group, r);
    }
    const out = { Severe: 0, High: 0, Medium: 0, Low: 0 };
    for (const r of by.values()) out[r.sev] = (out[r.sev] ?? 0) + 1;
    return out;
  }
  /** The pipeline's unusual rises, as the anomalies table holds them; for one zone when one is given. */
  anomalies(zone = null) { return table("anomalies").filter((r) => zone == null || Number(r.zone_no) === Number(zone)).map((r) => ({ date: r.date, cat: r.category_code, zone: Number(r.zone_no), observed: Number(r.observed), ratio: Number(r.ratio), kind: r.kind, rise_days: Number(r.rise_days) })); }
  /** The conditions line: the latest reading of each place, averaged, one decimal. As read at the console's now. */
  conditions() {
    if (this._cond) return this._cond;
    const latest = new Map();
    for (const r of table("observations")) {
      if (!["rainfall_24h_mm", "aqi", "lake_pct_full"].includes(r.metric)) continue;
      const at = wallMs(r.observed_at);
      if (at == null || at > this.now) continue;
      const k = `${r.metric}|${r.place_id}`, cur = latest.get(k);
      if (!cur || at > cur.at) latest.set(k, { at, metric: r.metric, v: Number(r.value) });
    }
    const avg = (m) => { const l = [...latest.values()].filter((x) => x.metric === m && Number.isFinite(x.v)); return l.length ? Math.round((l.reduce((a, x) => a + x.v, 0) / l.length) * 10) / 10 : null; };
    const aqi = avg("aqi");
    return (this._cond = { rain: avg("rainfall_24h_mm"), aqi: aqi == null ? null : Math.round(aqi), lakes: this.lakesFull() ?? avg("lake_pct_full") });
  }
  /**
   * The reservoirs: the store's lake rows are simulated, and the console's build replaces them with what CMWSSB publishes each morning (lib/collector/derive.ts), which it keeps
   * in data/aws-cache/cmwssb-lakes.json. The mean of the stations on the last day at or before now, one decimal. null when the file is not there.
   */
  lakesFull() {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "aws-cache", "cmwssb-lakes.json"), "utf8"));
      const today = fmtWall(this.now).slice(0, 10);
      const day = Object.keys(j.days ?? {}).filter((d) => d <= today).sort().pop();
      const rows = day ? j.days[day].rows ?? [] : [];
      return rows.length ? Math.round((rows.reduce((a, r) => a + Number(r.pct), 0) / rows.length) * 10) / 10 : null;
    } catch { return null; }
  }
  fmt(ms) { return ms === -Infinity ? "the start" : fmtWall(ms); }
}

export { wallMs };
