// The proactive replay (docs/jarvis/ULTIMATE_JARVIS.md section 6): replays the history the local data store holds, day by day,
// through Jarvis's watch (src/lib/thunai/signals.ts buildSignals, the same code the watch route runs) and the interjection policy
// (src/lib/thunai/watch.ts planWatch), and writes eval/holdout3/results/proactive-replay.json:
//   - the span of history found, and the days replayed (each needs five weeks of history before it for a full baseline);
//   - alerts per day, by kind and severity;
//   - for each alert, a human-readable rule's verdict ("count >= 2x baseline and >= 5" for a rise), so the share a person checking
//     by that rule would call real can be reported (kinds whose own rule is the yardstick are marked "by construction");
//   - interjections per demo hour by the policy: an hour from 11:00 on each replayed day, the watch asked every minute, the
//     Collector idle the whole hour (the most interruptions the policy can allow), with and without the brief at power-on.
// No model, no network: it reads the cached tables of the local store (data/aws-cache/*.json.gz, the DATA_BACKEND=aws build).
//   node scripts/proactive-replay.cjs
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const jiti = require("jiti")(__filename, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { buildSignals, seriesFromRows } = jiti(path.join(root, "src", "lib", "thunai", "signals.ts"));
const { planWatch, emptyWatch, withSeen, withSpoken } = jiti(path.join(root, "src", "lib", "thunai", "watch.ts"));
const { plainRule, DEFAULTS } = jiti(path.join(root, "src", "lib", "thunai", "detect.ts"));

const CACHE = path.join(root, "data", "aws-cache");
const OUT = path.join(root, "eval", "holdout3", "results", "proactive-replay.json");

/** the newest cached copy of a table: { columns: [[name, kind]], rows: [[...]] } */
function table(name) {
  const files = fs.readdirSync(CACHE).filter((f) => f.startsWith(`${name}-`) && f.endsWith(".json.gz"))
    .map((f) => ({ f, t: fs.statSync(path.join(CACHE, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no cached ${name} table in data/aws-cache`);
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE, files[0].f))));
  const col = Object.fromEntries(snap.columns.map((c, i) => [c[0], i]));
  return { rows: snap.rows, col, file: files[0].f };
}

const DAY = 86_400_000;
const ist = (s) => Date.parse(`${String(s).replace(" ", "T")}+05:30`);
const dayOf = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

const inc = table("incidents"), obs = table("observations");
const I = inc.col, O = obs.col;

// ---- the span of history
const first = inc.rows.reduce((m, r) => (r[I.first_reported_at] && r[I.first_reported_at] < m ? r[I.first_reported_at] : m), "9999");
const last = inc.rows.reduce((m, r) => (r[I.first_reported_at] && r[I.first_reported_at] > m ? r[I.first_reported_at] : m), "0000");
const origin = ist(`${first.slice(0, 10)} 00:00:00`);
const nDays = Math.round((ist(`${last.slice(0, 10)} 00:00:00`) - origin) / DAY) + 1;
const dateOf = (d) => dayOf(origin + d * DAY + 12 * 3_600_000);
const endOf = (d) => `${dateOf(d)} 23:59:59`;

// ---- daily counts per series over the whole span (calendar days in Chennai: the 24 hours ending at each day's 23:59:59)
const daily = new Map(); // "b|zone|cat|dept" -> n
for (const r of inc.rows) {
  const t = r[I.first_reported_at];
  if (!t) continue;
  const b = Math.floor((ist(t) - origin) / DAY);
  if (b < 0 || b >= nDays) continue;
  const k = `${b}|${r[I.zone_no] ?? ""}|${r[I.category_code] ?? ""}|${r[I.lead_dept] ?? ""}`;
  daily.set(k, (daily.get(k) ?? 0) + 1);
}
const byDay = Array.from({ length: nDays }, () => []);
for (const [k, n] of daily) {
  const [b, zone, cat, dept] = k.split("|");
  byDay[Number(b)].push({ b: Number(b), zone: zone === "" ? null : Number(zone), cat: cat || null, dept: dept || null, n });
}

// ---- the past-deadline stock at each day's end, from report, deadline and closing times (as the live watch rebuilds it, with the
// pipeline's open flag where the live watch uses the console's)
const stock = Array.from({ length: nDays }, (_, d) => {
  const t = endOf(d);
  let n = 0;
  for (const r of inc.rows) {
    const due = r[I.sla_due_at], f = r[I.first_reported_at], c = r[I.closed_at];
    // open now (the pipeline's flag: the replay has no console decisions) or closed after that day
    if (due && f && f <= t && due < t && ((!c && Number(r[I.is_open]) === 1) || (c && c > t))) n += 1;
  }
  return n;
});

// ---- readings: latest per place at or before the as-of time
function readings(metric) {
  const by = new Map();
  for (const r of obs.rows) {
    if (r[O.metric] !== metric || r[O.value] == null) continue;
    const place = String(r[O.place_name] ?? r[O.place_id]);
    if (!by.has(place)) by.set(place, []);
    by.get(place).push({ t: String(r[O.observed_at]), value: Number(r[O.value]), syn: Number(r[O.is_synthetic]) === 1 });
  }
  for (const v of by.values()) v.sort((a, b) => (a.t < b.t ? -1 : 1));
  return by;
}
const rainBy = readings("rainfall_24h_mm"), lakeBy = readings("lake_pct_full"), warnBy = readings("imd_warning_level");
const latestAt = (by, asOf, withMean = false) => {
  const out = [];
  for (const [place, list] of by) {
    let hit = null, k = -1;
    for (let i = 0; i < list.length; i++) { if (list[i].t <= asOf) { hit = list[i]; k = i; } else break; }
    if (!hit) continue;
    // the 28 days before the reading, as observation_signals.mean28 describes them for the live watch
    let mean28 = null;
    if (withMean) {
      const lo = ist(hit.t) - 28 * DAY, xs = [];
      for (let i = k - 1; i >= 0 && ist(list[i].t) >= lo; i--) xs.push(list[i].value);
      mean28 = xs.length >= 7 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    }
    out.push({ place, value: hit.value, t: hit.t, mean28 });
  }
  return out;
};
const syntheticShare = (by) => { let s = 0, n = 0; for (const v of by.values()) for (const x of v) { n += 1; if (x.syn) s += 1; } return { rows: n, synthetic: s }; };

// ---- news gaps: news-only incidents in two or more outlets, reported in the 7 days to the as-of time, not lapsed
const gapsAt = (asOf) => {
  const lo = ist(asOf) - 7 * DAY;
  let n = 0;
  for (const r of inc.rows) {
    const f = r[I.first_reported_at];
    if (!f || Number(r[I.media_only]) !== 1 || Number(r[I.outlet_count] ?? 0) < 2 || r[I.status_std] === "Lapsed") continue;
    const t = ist(f);
    if (t > lo && f <= asOf) n += 1;
  }
  return n;
};

// ---- a person's rule for each kind, the yardstick the alerts are judged by
function verdict(s) {
  switch (s.kind) {
    case "rise": { const r = plainRule(s.value, s.expected ?? 0); const loose = plainRule(s.value, s.expected ?? 0, 1.5, 5); return { rule: r.rule, real: r.real, looseRule: loose.rule, looseReal: loose.real, byConstruction: false }; }
    case "overdue": return { rule: "past-deadline count >= 1.2x a week before and >= 5 more", real: s.value >= 1.2 * s.expected && s.value - s.expected >= 5, byConstruction: true };
    case "rain": return { rule: "24-hour rain >= 64.5 mm (IMD heavy)", real: s.value >= 64, byConstruction: true };
    case "reservoir": return { rule: "storage >= 80 % full and >= 5 points over its 28-day mean", real: s.value >= 80 && (s.expected == null || s.value - s.expected >= 4.5), byConstruction: true };
    case "warning": return { rule: "IMD warning level >= 2 (orange)", real: s.value >= 2, byConstruction: true };
    case "gap": return { rule: ">= 1 story in >= 2 outlets with no department record", real: s.value >= 1, byConstruction: true };
    default: return { rule: "none", real: null, byConstruction: true };
  }
}

// ---- the demo hour: 11:00 to 12:00 in Chennai, the watch asked every minute, the Collector idle
function demoHour(date, signals, withBrief) {
  const start = Date.parse(`${date}T11:00:00+05:30`);
  let w = emptyWatch();
  if (withBrief) w = withSeen(w, signals.slice(0, 4).map((s) => ({ key: s.key, level: s.level })), start, true);
  const said = [];
  for (let m = 1; m <= 60; m++) {
    const now = start + m * 60_000;
    const p = planWatch(signals, { now, collectorSpeaking: false, turnInFlight: false, lastUserSpeech: null, quiet: false, watch: w });
    if (p.interject) { said.push({ minute: m, key: p.interject.key }); w = withSpoken(w, p.interject.key, p.interject.level, now); }
  }
  return said;
}

// ---- replay
const FIRST_JUDGED = 35; // five weeks of history before a day, so its baseline is whole
const days = [];
let prevKeys = new Set();
const t0 = Date.now();
for (let d = FIRST_JUDGED; d < nDays; d++) {
  const asOf = endOf(d);
  const lo = Math.max(0, d - 55);
  const rows = [];
  for (let b = lo; b <= d; b++) for (const r of byDay[b]) rows.push({ ...r, b: b - lo });
  const series = seriesFromRows(rows, d - lo + 1);
  const input = { asOf, series, overdue: d >= 8 ? stock.slice(d - 8, d + 1) : null, rain: latestAt(rainBy, asOf), lakes: latestAt(lakeBy, asOf, true), lakesTest: syntheticShare(lakeBy).synthetic > 0,
    warning: (() => { const w = latestAt(warnBy, asOf).sort((a, b) => (a.t < b.t ? 1 : -1))[0]; return w ? { level: w.value, t: w.t } : null; })(),
    gaps: { n: gapsAt(asOf), asOf }, followed: [], studio: [] };
  const signals = buildSignals(input);
  const alerts = signals.map((s) => ({ key: s.key, kind: s.kind, severity: s.severity, value: s.value, expected: s.expected, new: !prevKeys.has(s.key), ...verdict(s) }));
  prevKeys = new Set(signals.map((s) => s.key));
  const date = dateOf(d);
  days.push({ date, alerts, interjections: { withBrief: demoHour(date, signals, true).length, noBrief: demoHour(date, signals, false).length } });
}

// ---- totals
const all = days.flatMap((x) => x.alerts);
const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const judged = (xs) => { const j = xs.filter((a) => a.real != null); return { n: j.length, real: j.filter((a) => a.real).length, share: pct(j.filter((a) => a.real).length, j.length) }; };
const perDay = days.map((x) => x.alerts.length), newPerDay = days.map((x) => x.alerts.filter((a) => a.new).length);
const rises = all.filter((a) => a.kind === "rise");
const ib = days.map((x) => x.interjections.withBrief), inb = days.map((x) => x.interjections.noBrief);
const out = {
  generatedAt: new Date().toISOString(),
  note: "Replay of the local store's cached history through src/lib/thunai/signals.ts and watch.ts. No model, no network. Alerts a day are the watch's signals at each day's end; 'new' are keys not raised the day before. The share 'real' is by a person's rule, not ground truth.",
  store: { incidents: inc.file, observations: obs.file, incidentRows: inc.rows.length },
  span: { from: first, to: last, days: nDays },
  replayed: { from: days[0]?.date ?? null, to: days.at(-1)?.date ?? null, days: days.length, firstJudgedAfterDays: FIRST_JUDGED },
  readings: { rain: syntheticShare(rainBy), lakes: syntheticShare(lakeBy), warnings: syntheticShare(warnBy),
    rainFrom: [...rainBy.values()].flat().map((x) => x.t).sort()[0] ?? null },
  detector: { ...DEFAULTS, method: "negative-binomial threshold, improved-Farrington idea (Noufaily 2013), detect.ts" },
  totals: {
    alerts: all.length,
    alertsPerDay: { mean: mean(perDay), median: median(perDay), max: Math.max(0, ...perDay), daysWithNone: perDay.filter((n) => n === 0).length },
    newAlertsPerDay: { mean: mean(newPerDay), median: median(newPerDay), max: Math.max(0, ...newPerDay) },
    byKind: count(all, (a) => a.kind),
    bySeverity: count(all, (a) => a.severity),
    ruleReal: { all: judged(all), rises: judged(rises), risesLooseRule: { rule: "count >= 1.5x baseline and >= 5", n: rises.length, real: rises.filter((a) => a.looseReal).length, share: pct(rises.filter((a) => a.looseReal).length, rises.length) },
      newRises: judged(rises.filter((a) => a.new)), byConstructionKinds: [...new Set(all.filter((a) => a.byConstruction).map((a) => a.kind))] },
    interjectionsPerDemoHour: {
      model: "11:00-12:00 Chennai time on each replayed day, the watch asked every minute, the Collector idle all hour (the most the policy allows)",
      withBriefAtPowerOn: { mean: mean(ib), median: median(ib), max: Math.max(0, ...ib), hoursWithNone: ib.filter((n) => n === 0).length },
      withoutBrief: { mean: mean(inb), median: median(inb), max: Math.max(0, ...inb), hoursWithNone: inb.filter((n) => n === 0).length }
    }
  },
  ms: Date.now() - t0,
  days
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ span: out.span, replayed: out.replayed, totals: out.totals, ms: out.ms }, null, 1));
