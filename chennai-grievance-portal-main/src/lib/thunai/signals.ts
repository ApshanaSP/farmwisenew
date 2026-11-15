/**
 * Jarvis's server-side watch: real signals from the data the console's tools read, never from a model.
 *
 *   rise       an unusual rise in daily reports by zone, department, category, or zone and category (detect.ts, the count-aware
 *              negative-binomial threshold with a minimum count, two days running and a cooldown)
 *   overdue    the stock of cases open past their deadline growing against a week before, two days running
 *   rain       a rain gauge's last 24 hours at or above IMD's "heavy" line (64.5 mm; 115.6 mm "very heavy" is high severity), said
 *              for the 24 hours the gauge measured (a reading up to 48 hours old); life-safety only for one of the last 24 hours
 *   reservoir  a reservoir 80 % full or more (90 % is high severity): a line set in this code, not an official trigger
 *   warning    an IMD district warning of orange or red in force
 *   followed   an incident or a zone the Collector asked Jarvis to follow (Level B) changed status, deadline or count
 *   gap        stories carried by several news outlets with no department record yet (the console's news gaps)
 *   studio     one of the Collector's own Data Studio "tell me when" watches crossed its line
 *
 * Each signal is { kind, place, metric, value, expected, n, method, caveat, sources, severity, key } plus a one-line text in English
 * and spoken Tamil built here by code (docs/qa/JARVIS_VOICE.md: places and people, never codes; "linked with", never "caused by").
 * Every figure in a line is in the signal's own `values`, and every line passes the number gate and the label check before it is
 * kept; a line that fails falls back to the same line with no figure. The pure part (buildSignals) is what the proactive replay
 * runs day by day; loadWatchInput reads the store (dynamic imports, so the replay can load this file without a database).
 */
import { DEFAULTS, latestAlarm, methodOf, stockGrowth, type DetectOpts } from "./detect";
import { allowedSet, gateChunk } from "./numbergate";
import { labelIn } from "./speechcheck";
import { CATEGORY_LABELS, CAT_LABEL_TA, plainWho } from "./narrate";
import { DEPT_TA, ZONE_NAMES, ZONE_TA_NAME } from "./lexicon";

export interface Bi { en: string; ta: string }
export type SignalKind = "rise" | "overdue" | "rain" | "reservoir" | "warning" | "followed" | "gap" | "studio";
export type Severity = "high" | "medium" | "low";

/** which data a signal rests on and how fresh it is: the brief's and the card's source chip */
export interface SourceChip { id: string; name: Bi; asOf: string | null; fresh: Bi }

export interface WatchSignal {
  key: string;
  kind: SignalKind;
  /** what "not about this" and "tell me" are remembered against: the kind and the place, not one day's alarm */
  topic: string;
  place: Bi | null;
  metric: string;
  value: number;
  expected: number | null;
  n: number;
  method: string;
  caveat: Bi;
  sources: SourceChip[];
  severity: Severity;
  /** a worse version of the same signal may be told again inside the cooldown */
  level: number;
  /** life safety: may interrupt quiet hours (extremely heavy rain, a red warning) */
  lifeSafety: boolean;
  text: Bi;
  /** every figure the text may say, by name */
  values: Record<string, number>;
  /** for ranking: higher first, inside a severity */
  weight: number;
}

// ------------------------------------------------------------------ input --

export interface CountSeries { dim: "zone" | "dept" | "cat" | "zonecat"; zone: number | null; dept: string | null; cat: string | null; counts: number[] }
export interface Reading { place: string; value: number; t: string; /** the place's 28-day mean, when known (observation_signals.mean28) */ mean28?: number | null }
export interface Snapshot { status?: string | null; open?: boolean | null; due?: string | null; overdue?: boolean | null; openN?: number | null; overdueN?: number | null;
  /** an incident's category and zone, for saying which case it is (never its title) */ cat?: string | null; zone?: number | null }
export interface Follow { id: string; kind: "incident" | "zone"; ref: string; at: string; snap: Snapshot; cat?: string | null; zone?: number | null }
export interface WatchInput {
  /** the store's now (IST wall clock "YYYY-MM-DD HH:MM:SS"); the last count of every series is the 24 hours ending here */
  asOf: string;
  series: CountSeries[];
  /** open past the deadline at the end of each of the last days, oldest first, the last one now */
  overdue: number[] | null;
  rain: Reading[];
  lakes: Reading[];
  /** the reservoir readings are generated test data (a MySQL build's simulated PWD lakes) */
  lakesTest?: boolean;
  warning: { level: number; t: string } | null;
  gaps: { n: number; asOf: string } | null;
  followed: { follow: Follow; now: Snapshot | null }[];
  studio: { dataset: string; total: number }[];
  /** department names from the store's reference (code -> name) */
  depts?: Record<string, string>;
}

// --------------------------------------------------------------- language --

const zoneName = (z: number | null): Bi | null => (z == null || !ZONE_NAMES[z - 1] ? null : { en: ZONE_NAMES[z - 1], ta: ZONE_TA_NAME[z] ?? ZONE_NAMES[z - 1] });
const catLabel = (c: string | null): Bi | null => {
  if (!c) return null;
  const l = CATEGORY_LABELS.find((x) => x.code === c)?.label;
  return l ? { en: l.toLowerCase().replace(/&/g, "and"), ta: CAT_LABEL_TA[c] ?? l } : null;
};
const deptWho = (code: string | null, names: Record<string, string> = {}): Bi | null => {
  if (!code) return null;
  const who = plainWho(code, names[code] ?? null);
  return who ? { en: who.en, ta: DEPT_TA[code] ?? who.ta } : null;
};
/** digits out of a free name said aloud (a dataset called "Wards 2025"): only code's figures are spoken */
const noDigits = (s: string) => s.replace(/\p{Nd}+/gu, " ").replace(/\s+/g, " ").trim();
const whole = (x: number) => Math.round(x);
const IST = (s: string) => Date.parse(`${s.replace(" ", "T")}+05:30`);

/** how old a reading is, in words with no figure in them */
export function freshWords(t: string | null, asOf: string): Bi {
  const a = t ? IST(t) : NaN, b = IST(asOf);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { en: "age not known", ta: "எப்போதையது என்று தெரியவில்லை" };
  const h = (b - a) / 3_600_000;
  if (h < 3) return { en: "just now", ta: "இப்போதான்" };
  if (h < 24) return { en: "today", ta: "இன்னைக்கு" };
  if (h < 48) return { en: "yesterday", ta: "நேத்து" };
  if (h < 24 * 14) return { en: "a few days old", ta: "சில நாள் பழையது" };
  return { en: "stale", ta: "ரொம்ப பழையது" };
}

const SRC = {
  incidents: { en: "incident records", ta: "சம்பவப் பதிவுகள்" },
  deadlines: { en: "deadlines on open cases", ta: "நிலுவை கேஸ்களின் கெடு" },
  rain: { en: "IMD rain gauges", ta: "IMD மழைமானிகள்" },
  lakes: { en: "reservoir readings", ta: "நீர்த்தேக்க அளவீடுகள்" },
  warning: { en: "IMD district warning", ta: "IMD மாவட்ட எச்சரிக்கை" },
  news: { en: "news monitor", ta: "செய்தி கண்காணிப்பு" },
  studio: { en: "your Data Studio watches", ta: "உங்க Data Studio கண்காணிப்புகள்" }
} as const;
const chip = (id: keyof typeof SRC, t: string | null, asOf: string): SourceChip => ({ id, name: SRC[id], asOf: t, fresh: freshWords(t, asOf) });

/** The line as kept: it passes the number gate with its own values and has no field label, else the plain line (no figures). */
function keep(line: Bi, plain: Bi, values: Record<string, number>): Bi {
  const allowed = allowedSet(Object.values(values));
  const ok = (s: string) => gateChunk(s, allowed).ok && !labelIn(s);
  return { en: ok(line.en) ? line.en : plain.en, ta: ok(line.ta) ? line.ta : plain.ta };
}

/** "about 5 on a usual day", or "hardly any" when the baseline is under one */
function usual(expected: number): Bi {
  return expected < 0.75 ? { en: "hardly any on a usual day", ta: "வழக்கமா கிட்டத்தட்ட இருக்காது" }
    : { en: `about ${whole(expected)} on a usual day`, ta: `வழக்கமா சுமார் ${whole(expected)}` };
}

// ---------------------------------------------------------------- signals --

/** categories where a rise touches safety: a smaller rise is enough to make it urgent */
const SAFETY = new Set(["FLOOD_WATERLOGGING", "BUILDING_SAFETY", "FIRE_EXPLOSION", "VECTOR_DISEASE", "WATERBODY_INFRA", "FLOOD_RELIEF", "DRAIN_WORKS_SAFETY"]);
const SEV_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const RISE_CAVEAT: Bi = { en: "Unusual for this place and day of the week; it says nothing of why. Most complaint records here are test filings.",
  ta: "இந்த இடத்துக்கும் இந்தக் கிழமைக்கும் இது அசாதாரணம்; ஏன் என்று சொல்லாது. இங்குள்ள பெரும்பாலான புகார்கள் சோதனைப் பதிவுகள்." };

function riseSignal(s: CountSeries, asOf: string, names: Record<string, string>, opts: Partial<DetectOpts>): WatchSignal | null {
  const a = latestAlarm(s.counts, opts);
  if (!a) return null;
  const zone = zoneName(s.zone), cat = catLabel(s.cat), who = s.dim === "dept" ? deptWho(s.dept, names) : null;
  const ratio = a.expected > 0 ? a.value / a.expected : a.value;
  const high = (a.value >= 10 && ratio >= 3) || (!!s.cat && SAFETY.has(s.cat) && ratio >= 2);
  const values = { value: a.value, expected: whole(a.expected), hours: 24, days: 2 };
  const what: Bi = cat ? { en: `${cat.en} reports`, ta: `${cat.ta} புகார்கள்` } : { en: "reports", ta: "புகார்கள்" };
  const where: Bi = zone ? { en: `in ${zone.en}`, ta: `${zone.ta} பகுதியில` } : who ? { en: `for ${who.en}`, ta: `${who.ta} தொடர்பா` } : { en: "across the district", ta: "மாவட்டம் முழுக்க" };
  const u = usual(a.expected);
  const line: Bi = {
    en: `More ${what.en} than usual ${where.en}: ${a.value} in the last 24 hours, against ${u.en}, and above the line two days running.`,
    ta: `${where.ta} ${what.ta} வழக்கத்தை விட அதிகமா வந்திருக்கு: கடந்த 24 மணி நேரத்துல ${a.value}, ${u.ta}; ரெண்டு நாளா இப்படித்தான் இருக்கு.`
  };
  const plain: Bi = { en: `More ${what.en} than usual ${where.en}.`, ta: `${where.ta} ${what.ta} வழக்கத்தை விட அதிகமா வந்திருக்கு.` };
  const id = [s.dim, s.zone ?? "", s.dept ?? "", s.cat ?? ""].join(":");
  return {
    key: `rise:${id}`, kind: "rise", topic: `rise:${id}`, place: zone ?? who ?? null, metric: s.cat ? `reports.${s.cat}` : "reports", value: a.value,
    expected: Math.round(a.expected * 10) / 10, n: a.n, method: methodOf(opts), caveat: RISE_CAVEAT, sources: [chip("incidents", asOf, asOf)],
    severity: high ? "high" : "medium", level: ratio >= 5 ? 4 : ratio >= 3 ? 3 : ratio >= 2 ? 2 : 1, lifeSafety: false,
    text: keep(line, plain, values), values, weight: ratio * Math.log2(1 + a.value)
  };
}

function overdueSignal(stock: number[], asOf: string): WatchSignal | null {
  const g = stockGrowth(stock, { lag: 7, min: 5, share: 0.2 });
  if (!g || !g.persisted) return null;
  const share = g.before > 0 ? g.growth / g.before : 1;
  const high = g.growth >= 20 && share >= 0.5;
  const values = { value: g.value, before: g.before };
  const line: Bi = {
    en: `Cases past their deadline are piling up: ${g.value} now, up from ${g.before} a week ago.`,
    ta: `கெடு தாண்டிய கேஸ்கள் கூடிட்டே போகுது: இப்போ ${g.value}, போன வாரம் இதே நேரம் ${g.before}.`
  };
  const plain: Bi = { en: "Cases past their deadline are piling up against last week.", ta: "கெடு தாண்டிய கேஸ்கள் போன வாரத்தை விட கூடிட்டே போகுது." };
  return {
    key: "overdue:district", kind: "overdue", topic: "overdue:district", place: null, metric: "open_past_deadline", value: g.value, expected: g.before, n: stock.length,
    method: "Open past the deadline at the end of each day (open now as the console counts it, or closed after that day; reported and due by then); today against a week ago, grown by at least 5 and a fifth, two days running",
    caveat: { en: "Earlier days are rebuilt from closing times, so they are close to, not exactly, what the console showed then.", ta: "முந்தைய நாட்கள் முடிவு நேரங்களிலிருந்து கணக்கிட்டவை; அன்று கன்சோல் காட்டியதுக்கு நெருக்கமானவை, சரியாக அதே அல்ல." },
    sources: [chip("deadlines", asOf, asOf)], severity: high ? "high" : "medium", level: share >= 1 ? 3 : share >= 0.5 ? 2 : 1, lifeSafety: false,
    text: keep(line, plain, values), values, weight: share * 10
  };
}

/** IMD's rainfall words: heavy 64.5-115.5 mm, very heavy 115.6-204.4 mm, extremely heavy 204.5 mm and more in 24 hours */
function rainSignal(rain: Reading[], asOf: string): WatchSignal | null {
  const fresh = rain.filter((r) => Number.isFinite(r.value) && IST(asOf) - IST(r.t) <= 48 * 3_600_000);
  const heavy = fresh.filter((r) => r.value >= 64.5).sort((a, b) => b.value - a.value);
  if (!heavy.length) return null;
  const top = heavy[0];
  const mm = whole(top.value);
  const word: Bi = top.value >= 204.5 ? { en: "Extremely heavy", ta: "அதி தீவிர கனமழை" } : top.value >= 115.6 ? { en: "Very heavy", ta: "மிகக் கனமழை" } : { en: "Heavy", ta: "கனமழை" };
  const values = { value: mm, hours: 24, stations: heavy.length };
  const place = noDigits(top.place);
  const others = heavy.length > 1 ? { en: ` ${heavy.length} gauges are at heavy rain or more.`, ta: ` ${heavy.length} மழைமானிகள்ல கனமழை அல்லது அதுக்கு மேல.` } : { en: "", ta: "" };
  // a gauge's 24 hours end when it was read: "the last 24 hours" only for a reading of the last few hours, else the day they ended (review)
  const age = (IST(asOf) - IST(top.t)) / 3_600_000;
  const daysBack = Math.round((Date.parse(asOf.slice(0, 10)) - Date.parse(top.t.slice(0, 10))) / 86_400_000);
  const window: Bi = age < 3 ? { en: "in the last 24 hours", ta: "கடந்த 24 மணி நேரத்துல" }
    : daysBack <= 0 ? { en: "in the 24 hours to earlier today", ta: "இன்னைக்கு முடிஞ்ச 24 மணி நேரத்துல" }
      : daysBack === 1 ? { en: "in the 24 hours to yesterday", ta: "நேத்து வரைக்குமான 24 மணி நேரத்துல" }
        : { en: "in the 24 hours to the day before yesterday", ta: "முந்தாநேத்து வரைக்குமான 24 மணி நேரத்துல" };
  const line: Bi = {
    en: `${word.en} rain at ${place}: ${mm} millimetres ${window.en}.${others.en}`,
    ta: `${place} நிலையத்துல ${word.ta}: ${window.ta} ${mm} மில்லிமீட்டர்.${others.ta}`
  };
  const plain: Bi = { en: `${word.en} rain at ${place}.`, ta: `${place} நிலையத்துல ${word.ta}.` };
  return {
    key: `rain:${place.toLowerCase()}`, kind: "rain", topic: "rain:district", place: { en: place, ta: place }, metric: "rainfall_24h_mm", value: mm, expected: 64.5, n: fresh.length,
    method: "Latest 24-hour reading per gauge against IMD's heavy (64.5 mm), very heavy (115.6 mm) and extremely heavy (204.5 mm) lines",
    caveat: { en: "One gauge's reading; rain is patchy, and the gauge positions are approximate.", ta: "ஒரு மழைமானியின் அளவு; மழை இடத்துக்கு இடம் மாறும்." },
    sources: [chip("rain", top.t, asOf)], severity: top.value >= 115.6 ? "high" : "medium", level: top.value >= 204.5 ? 3 : top.value >= 115.6 ? 2 : 1,
    // only a reading of the last 24 hours may interrupt quiet hours: an older one is told, never forced through
    lifeSafety: top.value >= 204.5 && age <= 24, text: keep(line, plain, values), values, weight: top.value / 10
  };
}

/**
 * A reservoir is news when it fills, not while it stays full: raised at 80 % or more only when it stands at least 5 points above
 * its own 28-day mean (high at 90 % or more). With no 28-day mean known, the level alone decides (and the caveat says so).
 */
function reservoirSignal(lakes: Reading[], asOf: string, test: boolean): WatchSignal | null {
  const rise = (r: Reading) => (r.mean28 == null || !Number.isFinite(r.mean28) ? null : r.value - r.mean28);
  const fresh = lakes.filter((r) => Number.isFinite(r.value) && IST(asOf) - IST(r.t) <= 72 * 3_600_000 && r.value >= 80 && r.value <= 130 && (rise(r) == null || (rise(r) as number) >= 5))
    .sort((a, b) => b.value - a.value);
  if (!fresh.length) return null;
  const top = fresh[0];
  const pct = whole(top.value), up = rise(top);
  const place = noDigits(top.place);
  const values: Record<string, number> = { value: pct, lakes: fresh.length, line: 80, ...(up != null ? { mean: whole(top.mean28 as number) } : {}) };
  const since: Bi = up != null ? { en: `, up from about ${whole(top.mean28 as number)} percent over the past month`, ta: `; கடந்த மாதம் சுமார் ${whole(top.mean28 as number)} சதவீதம்` } : { en: "", ta: "" };
  const line: Bi = { en: `${place} is filling: ${pct} percent full${since.en}.${fresh.length > 1 ? ` ${fresh.length} reservoirs are at 80 percent or more and rising.` : ""}`,
    ta: `${place} நிரம்பிட்டு வருது: இப்போ ${pct} சதவீதம்${since.ta}.${fresh.length > 1 ? ` ${fresh.length} நீர்த்தேக்கங்கள் 80 சதவீதத்துக்கு மேல, கூடிட்டே இருக்கு.` : ""}` };
  const plain: Bi = { en: `${place} is filling up.`, ta: `${place} நிரம்பிட்டு வருது.` };
  const caveat: Bi = test ? { en: "These reservoir readings are generated test data. Storage alone; releases are decided by the water resources department.", ta: "இந்த நீர்த்தேக்க அளவுகள் சோதனைத் தரவு. சேமிப்பு அளவு மட்டும்; நீர் திறப்பை நீர்வளத் துறை முடிவு செய்யும்." }
    : up == null ? { en: "No 28-day mean was available, so this is the level alone. Releases are decided by the water resources department.", ta: "28 நாள் சராசரி கிடைக்கல, அதனால அளவு மட்டும். நீர் திறப்பை நீர்வளத் துறை முடிவு செய்யும்." }
      : { en: "Storage alone; releases are decided by the water resources department.", ta: "சேமிப்பு அளவு மட்டும்; நீர் திறப்பை நீர்வளத் துறை முடிவு செய்யும்." };
  return {
    key: `reservoir:${place.toLowerCase()}`, kind: "reservoir", topic: "reservoir:district", place: { en: place, ta: place }, metric: "lake_pct_full", value: pct, expected: up != null ? Math.round((top.mean28 as number) * 10) / 10 : 80, n: lakes.length,
    method: "Latest storage reading per reservoir, raised at 80 % full or more when it stands 5 points or more above its 28-day mean; 90 % or more is high (lines set in this code, not an official trigger)",
    caveat, sources: [chip("lakes", top.t, asOf)], severity: top.value >= 90 ? "high" : "medium", level: top.value >= 95 ? 3 : top.value >= 90 ? 2 : 1, lifeSafety: false,
    text: keep(line, plain, values), values, weight: top.value / 10
  };
}

function warningSignal(w: { level: number; t: string } | null, asOf: string): WatchSignal | null {
  if (!w || w.level < 2 || IST(asOf) - IST(w.t) > 36 * 3_600_000) return null;
  const red = w.level >= 3;
  const line: Bi = red ? { en: "IMD has a red warning in force for the district.", ta: "மாவட்டத்துக்கு IMD சிவப்பு எச்சரிக்கை அமலில் இருக்கு." }
    : { en: "IMD has an orange warning in force for the district.", ta: "மாவட்டத்துக்கு IMD ஆரஞ்சு எச்சரிக்கை அமலில் இருக்கு." };
  return {
    key: `warning:${w.t.slice(0, 10)}`, kind: "warning", topic: "warning:district", place: null, metric: "imd_warning_level", value: w.level, expected: null, n: 1,
    method: "IMD's district warning level in force (0 green, 1 yellow, 2 orange, 3 red)", caveat: { en: "IMD's words, not this console's forecast.", ta: "IMD சொன்னது; இந்தக் கன்சோலின் கணிப்பு அல்ல." },
    sources: [chip("warning", w.t, asOf)], severity: "high", level: w.level, lifeSafety: red, text: line, values: {}, weight: w.level * 5
  };
}

function followedSignal(f: Follow, now: Snapshot | null, asOf: string): WatchSignal | null {
  if (!now) return null;
  const was = f.snap;
  if (f.kind === "incident") {
    const cat = catLabel(f.cat ?? null), zone = zoneName(f.zone ?? null);
    const what: Bi = { en: `The ${cat ? `${cat.en} ` : ""}case you follow${zone ? ` in ${zone.en}` : ""}`, ta: `நீங்க கவனிக்கிற ${zone ? `${zone.ta} பகுதி ` : ""}${cat ? `${cat.ta} ` : ""}கேஸ்` };
    let change: Bi | null = null, sev: Severity = "medium", tag = "";
    if (was.open !== false && now.open === false) { change = { en: "is now closed", ta: "இப்போ முடிஞ்சிருக்கு" }; tag = "closed"; }
    else if (was.open === false && now.open === true) { change = { en: "has been opened again", ta: "மறுபடியும் திறந்திருக்காங்க" }; tag = "reopened"; sev = "high"; }
    else if (!was.overdue && now.overdue) { change = { en: "has gone past its deadline", ta: "கெடு தாண்டிருச்சு" }; tag = "overdue"; sev = "high"; }
    else if ((was.due ?? null) !== (now.due ?? null) && was.due && now.due) { change = { en: "has a new deadline", ta: "புது கெடு வச்சிருக்காங்க" }; tag = "due"; }
    else if ((was.status ?? null) !== (now.status ?? null) && now.status) { change = { en: "has moved to a new stage", ta: "அடுத்த கட்டத்துக்குப் போயிருக்கு" }; tag = "status"; }
    if (!change) return null;
    return {
      key: `followed:incident:${f.ref}:${tag}`, kind: "followed", topic: `followed:${f.id}`, place: zone, metric: "incident_status", value: 0, expected: null, n: 1,
      method: "The incident's status, deadline and open flag now, against the last time you were told", caveat: { en: "As the console's records show it.", ta: "கன்சோல் பதிவுகளின்படி." },
      sources: [chip("incidents", asOf, asOf)], severity: sev, level: sev === "high" ? 2 : 1, lifeSafety: false, text: { en: `${what.en} ${change.en}.`, ta: `${what.ta} ${change.ta}.` },
      values: {}, weight: sev === "high" ? 8 : 4
    };
  }
  const zone = zoneName(f.zone ?? Number(f.ref));
  const before = was.openN ?? null, after = now.openN ?? null, lateB = was.overdueN ?? null, lateA = now.overdueN ?? null;
  const moved = (a: number | null, b: number | null) => a != null && b != null && Math.abs(b - a) >= Math.max(3, Math.ceil(0.1 * a));
  if (!zone || (!moved(before, after) && !moved(lateB, lateA))) return null;
  const late = moved(lateB, lateA);
  const [from, to] = late ? [lateB as number, lateA as number] : [before as number, after as number];
  const values = { from, to };
  const noun: Bi = late ? { en: "cases past their deadline", ta: "கெடு தாண்டிய கேஸ்கள்" } : { en: "open cases", ta: "நிலுவை கேஸ்கள்" };
  const line: Bi = { en: `${zone.en}, which you follow: ${noun.en} went from ${from} to ${to}.`, ta: `நீங்க கவனிக்கிற ${zone.ta} பகுதியில ${noun.ta} ${from}-லிருந்து ${to} ஆகியிருக்கு.` };
  const plain: Bi = { en: `${zone.en}, which you follow, has changed since you were last told.`, ta: `நீங்க கவனிக்கிற ${zone.ta} பகுதியில மாற்றம் இருக்கு.` };
  return {
    key: `followed:zone:${f.ref}:${late ? "late" : "open"}:${to}`, kind: "followed", topic: `followed:${f.id}`, place: zone, metric: late ? "open_past_deadline" : "open", value: to, expected: from, n: 1,
    method: "The zone's open and past-deadline counts now, against the last time you were told; a change of at least 3 and a tenth is raised",
    caveat: { en: "Counts move every day; this says how much, not why.", ta: "எண்ணிக்கை தினமும் மாறும்; எவ்வளவு என்று மட்டும் சொல்கிறது." },
    sources: [chip("incidents", asOf, asOf)], severity: late && to > from ? "high" : "medium", level: 1, lifeSafety: false, text: keep(line, plain, values), values, weight: 5
  };
}

function gapSignal(g: { n: number; asOf: string } | null, asOf: string): WatchSignal | null {
  if (!g || g.n < 1) return null;
  const values = { value: g.n };
  const line: Bi = { en: `${g.n} ${g.n === 1 ? "story is" : "stories are"} in several newspapers with no department record yet.`, ta: `${g.n} செய்திகள் பல பத்திரிகைகள்ல வந்திருக்கு, ஆனா துறைப் பதிவு இன்னும் இல்லை.` };
  const plain: Bi = { en: "Some stories are in several newspapers with no department record yet.", ta: "சில செய்திகள் பல பத்திரிகைகள்ல வந்திருக்கு, ஆனா துறைப் பதிவு இன்னும் இல்லை." };
  return {
    key: `gap:${g.n}`, kind: "gap", topic: "gap:district", place: null, metric: "news_gaps", value: g.n, expected: null, n: g.n,
    method: "Incidents seen only in the news, in at least two outlets, over the last 7 days (the console's news gaps)",
    caveat: { en: "News reports, not verified records.", ta: "செய்திகள் மட்டுமே; சரிபார்க்கப்பட்ட பதிவுகள் அல்ல." },
    sources: [chip("news", g.asOf, asOf)], severity: "medium", level: g.n >= 5 ? 2 : 1, lifeSafety: false, text: keep(line, plain, values), values, weight: 2 + g.n / 10
  };
}

function studioSignal(st: { dataset: string; total: number }, asOf: string): WatchSignal | null {
  if (st.total < 1) return null;
  const name = noDigits(st.dataset) || "a dataset";
  return {
    key: `studio:${name.toLowerCase()}:${st.total}`, kind: "studio", topic: `studio:${name.toLowerCase()}`, place: null, metric: "studio_watch", value: st.total, expected: null, n: st.total,
    method: "Your own Data Studio rule, checked on the dataset's current rows", caveat: { en: "Your rule and your data.", ta: "உங்க விதி, உங்க தரவு." },
    sources: [chip("studio", asOf, asOf)], severity: "medium", level: 1, lifeSafety: false,
    text: { en: `A Data Studio watch you set has crossed its line in ${name}.`, ta: `நீங்க வச்ச Data Studio கண்காணிப்பு ${name}-ல எல்லையைத் தாண்டியிருக்கு.` }, values: {}, weight: 3
  };
}

export interface BuildOpts { detect?: Partial<DetectOpts>; /** at most this many rises (the strongest), so a bad day is not a feed */ maxRises?: number }

/**
 * Every signal the input raises, strongest first: severity, then weight. A rise already raised by a broader series (the zone, or
 * the category district-wide) is kept only for the narrower zone-and-category one when that one alarms too, so one event is one line.
 */
export function buildSignals(input: WatchInput, o: BuildOpts = {}): WatchSignal[] {
  const opts = { ...DEFAULTS, ...(o.detect ?? {}) };
  const out: WatchSignal[] = [];
  const rises = input.series.map((s) => riseSignal(s, input.asOf, input.depts ?? {}, opts)).filter((x): x is WatchSignal => !!x);
  // one event, one line: a zone-and-category rise covers its zone's and its category's own
  const narrow = rises.filter((r) => r.key.startsWith("rise:zonecat:"));
  const covered = (r: WatchSignal) => {
    const [, dim, zone, , cat] = r.key.split(":");
    if (dim === "zone") return narrow.some((x) => x.key.split(":")[2] === zone);
    if (dim === "cat") return narrow.some((x) => x.key.split(":")[4] === cat);
    return false;
  };
  out.push(...rises.filter((r) => !covered(r)).sort(rank).slice(0, o.maxRises ?? 6));
  if (input.overdue) { const s = overdueSignal(input.overdue, input.asOf); if (s) out.push(s); }
  for (const s of [rainSignal(input.rain, input.asOf), reservoirSignal(input.lakes, input.asOf, !!input.lakesTest), warningSignal(input.warning, input.asOf), gapSignal(input.gaps, input.asOf)]) if (s) out.push(s);
  for (const f of input.followed) { const s = followedSignal(f.follow, f.now, input.asOf); if (s) out.push(s); }
  for (const st of input.studio) { const s = studioSignal(st, input.asOf); if (s) out.push(s); }
  return out.sort(rank);
}

function rank(a: WatchSignal, b: WatchSignal) { return SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.weight - a.weight || a.key.localeCompare(b.key); }

/** Every figure a signal's text may say: what the brief and the number gate allow for it. */
export const signalFigures = (s: WatchSignal): number[] => Object.values(s.values);

// ------------------------------------------------------------- the store --

const DAY = 86_400_000;
const wall = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");

/**
 * The watch's input from the store, as the console's tools read it: daily report counts for the last `days` days by zone,
 * department, category and zone-and-category (zone-and-category pairs with too few reports to judge are left out), the past-deadline
 * stock at each day's end, the latest rain and reservoir readings and IMD warning (queries.ts, the environment tool's own reads),
 * the news gaps (the news_gaps tool's count), the Collector's followed incidents and zones, and their Data Studio watches. Read-only.
 */
export async function loadWatchInput(follows: Follow[] = [], days = 56): Promise<WatchInput> {
  const [{ asOf, OPEN_NOW }, { envSignals, warningToday, newsGapTotal, ENV_METRICS }, { refNames }, { ops }, { effectiveSql }] = await Promise.all([
    import("@/lib/collector/intel"), import("@/lib/assistant/queries"), import("@/lib/assistant/scope"), import("@/lib/collector/db"), import("@/lib/collector/effective")]);
  const q = await query();
  const now = await asOf();
  const end = IST(now), start = wall(end - days * DAY);
  const num = (v: unknown) => Number(v ?? 0);

  const rows = await q(
    `SELECT FLOOR(TIMESTAMPDIFF(SECOND, ?, i.first_reported_at) / 86400) AS b, i.zone_no AS zone, i.category_code AS cat, i.lead_dept AS dept, COUNT(*) AS n
     FROM incidents i WHERE i.first_reported_at > ? AND i.first_reported_at <= ? GROUP BY b, i.zone_no, i.category_code, i.lead_dept`, [start, start, now]);
  const series = seriesFromRows(rows.map((r) => ({ b: num(r.b), zone: r.zone == null ? null : num(r.zone), cat: r.cat == null ? null : String(r.cat), dept: r.dept == null ? null : String(r.dept), n: num(r.n) })), days);

  // the past-deadline stock at the end of each of the last 9 days: open now as the console counts it (OPEN_NOW, the Collector's
  // decisions on top) or closed after that day, reported by then and due before then. Today's point is the console's own count.
  const EFF = effectiveSql(ops("collector_decisions"));
  const held = (p: string) => `(${OPEN_NOW} = 1 OR ${EFF.closedAt} > ${p})`;
  const cuts = Array.from({ length: 9 }, (_, k) => wall(end - (8 - k) * DAY));
  const sums = cuts.map((_, k) => `SUM(CASE WHEN i.first_reported_at <= ? AND i.sla_due_at < ? AND ${held("?")} THEN 1 ELSE 0 END) AS d${k}`).join(", ");
  const [od] = await q(`SELECT ${sums} FROM incidents i WHERE i.sla_due_at IS NOT NULL AND i.sla_due_at < ? AND ${held("?")}`,
    [...cuts.flatMap((c) => [c, c, c]), now, cuts[0]]).catch(() => [] as Row[]);
  const overdue = od ? cuts.map((_, k) => num(od[`d${k}`])) : null;

  const [rain, lakes, warning, gapN] = await Promise.all([
    envSignals("rainfall_24h_mm", now).catch(() => []), envSignals("lake_pct_full", now).catch(() => []), warningToday(now).catch(() => null),
    newsGapTotal({ period: "weekly", zone: null, dept: null, cat: null, taluk: null }, now, 2).catch(() => null)]);

  const followed = await followedWithNow(follows, now);

  const names = await refNames().catch(() => null);
  const depts: Record<string, string> = {};
  if (names) for (const [code, d] of names.depts) depts[code] = d.name;

  return {
    asOf: now, series, overdue,
    rain: rain.map((r) => ({ place: r.place, value: r.value, t: r.t })), lakes: lakes.map((r) => ({ place: r.place, value: r.value, t: r.t, mean28: r.mean28 })), lakesTest: ENV_METRICS.lake_pct_full.test,
    warning: warning ? { level: warning.level, t: warning.t } : null, gaps: gapN == null ? null : { n: gapN, asOf: now },
    followed, studio: await studioWatches().catch(() => []), depts
  };
}

type Row = Record<string, unknown>;
/** read-only SQL on the store the console reads (MySQL, or the in-memory build when DATA_BACKEND=aws) */
async function query(): Promise<(sql: string, params?: unknown[]) => Promise<Row[]>> {
  const { default: pool } = await import("@/lib/collector/db");
  return async (sql, params = []) => (await pool.query(sql, params))[0] as unknown as Row[];
}

/**
 * The follows whose change a list of told signal keys holds (a followed signal's key is followed:<kind>:<ref>:...): what the brief told
 * is marked seen with these, as the card's followSeen does, so the same change is not raised again (review, proactive).
 */
export function followsTold(keys: string[], follows: Follow[]): Follow[] {
  const told = keys.filter((k) => k.startsWith("followed:"));
  return told.length ? follows.filter((f) => told.some((k) => k.startsWith(`followed:${f.kind}:${f.ref}:`))) : [];
}

/**
 * The state now of followed incidents and zones, read as the console reads it (the Collector's decisions on top): an incident's
 * status, open flag, deadline and whether it is past it; a zone's open and past-deadline counts. Null for one the store does not hold.
 */
export async function followedNow(follows: Pick<Follow, "kind" | "ref">[], now?: string): Promise<(Snapshot | null)[]> {
  if (!follows.length) return [];
  const [{ ops }, { asOf, OPEN_NOW }, { effectiveSql }, { pastDueSql }] = await Promise.all([
    import("@/lib/collector/db"), import("@/lib/collector/intel"), import("@/lib/collector/effective"), import("@/lib/reference/metrics")]);
  const q = await query();
  const at = now ?? await asOf();
  const num = (v: unknown) => Number(v ?? 0);
  const EFF = effectiveSql(ops("collector_decisions"));
  const late = pastDueSql(at);
  const ids = [...new Set(follows.filter((f) => f.kind === "incident").map((f) => f.ref))].slice(0, 50);
  const inc = new Map<string, Snapshot>();
  if (ids.length) {
    const r = await q(`SELECT i.incident_id AS id, ${EFF.status} AS status, ${OPEN_NOW} AS open, DATE_FORMAT(i.sla_due_at, '%Y-%m-%d %H:%i:%s') AS due, ${late} AS late,
        i.category_code AS cat, i.zone_no AS zone
      FROM incidents i WHERE i.incident_id IN (?)`, [ids]).catch(() => [] as Row[]);
    for (const x of r) inc.set(String(x.id), { status: x.status == null ? null : String(x.status), open: num(x.open) === 1, due: x.due == null ? null : String(x.due),
      overdue: num(x.open) === 1 && num(x.late) === 1, cat: x.cat == null ? null : String(x.cat), zone: x.zone == null ? null : num(x.zone) });
  }
  const zones = new Map<number, Snapshot>();
  for (const z of [...new Set(follows.filter((f) => f.kind === "zone").map((f) => Number(f.ref)))].filter((z) => z >= 1 && z <= 15)) {
    const [r] = await q(`SELECT SUM(${OPEN_NOW}) AS open, SUM(CASE WHEN ${OPEN_NOW} = 1 AND ${late} THEN 1 ELSE 0 END) AS late FROM incidents i WHERE i.zone_no = ?`, [z]).catch(() => [] as Row[]);
    if (r) zones.set(z, { openN: num(r.open), overdueN: num(r.late) });
  }
  return follows.map((f) => (f.kind === "incident" ? inc.get(f.ref) ?? null : zones.get(Number(f.ref)) ?? null));
}

/** Followed items with their state now. */
async function followedWithNow(follows: Follow[], now: string) {
  const snaps = await followedNow(follows, now);
  return follows.map((f, k) => ({ follow: f, now: snaps[k] ?? null }));
}

/** The Collector's own Data Studio watches that have crossed their line (studio/ask.ts checkRule on the dataset's rows). */
async function studioWatches(): Promise<{ dataset: string; total: number }[]> {
  const { datasetIds, getMeta, getRows } = await import("@/lib/studio/store");
  const out: { dataset: string; total: number }[] = [];
  const ids = datasetIds().filter((id) => (getMeta(id)?.rules?.length ?? 0) > 0).slice(0, 20);
  if (!ids.length) return out;
  // the rule checker and its names load only when a watch exists
  const [{ checkRule }, { refs }, { namesOf }] = await Promise.all([import("@/lib/studio/ask"), import("@/lib/studio/refs"), import("@/lib/studio/pipeline")]);
  const names = namesOf(await refs());
  for (const id of ids) {
    const meta = getMeta(id);
    if (!meta) continue;
    const rows = getRows(id);
    const crossed = meta.rules.map((r) => checkRule(r, rows, meta.spec, names)).filter((x) => !x.ok).reduce((a, x) => a + x.total, 0);
    if (crossed) out.push({ dataset: String(meta.name ?? "a dataset"), total: crossed });
  }
  return out;
}

/**
 * Daily counts per series from (bucket, zone, cat, dept, n) rows, `days` buckets with the last one the 24 hours ending at the as-of
 * time. Zone-and-category pairs need at least `minPair` reports over the span to be judged at all (a pair with a handful is noise).
 */
export function seriesFromRows(rows: { b: number; zone: number | null; cat: string | null; dept: string | null; n: number }[], days: number, minPair = 28): CountSeries[] {
  const maps = new Map<string, CountSeries>();
  const add = (dim: CountSeries["dim"], zone: number | null, dept: string | null, cat: string | null, b: number, n: number) => {
    const k = `${dim}|${zone ?? ""}|${dept ?? ""}|${cat ?? ""}`;
    let s = maps.get(k);
    if (!s) { s = { dim, zone, dept, cat, counts: Array(days).fill(0) }; maps.set(k, s); }
    s.counts[b] += n;
  };
  for (const r of rows) {
    const b = Math.min(days - 1, Math.max(0, Math.floor(r.b)));
    if (r.zone != null && r.zone >= 1 && r.zone <= 15) add("zone", r.zone, null, null, b, r.n);
    if (r.dept) add("dept", null, r.dept, null, b, r.n);
    if (r.cat) add("cat", null, null, r.cat, b, r.n);
    if (r.zone != null && r.zone >= 1 && r.zone <= 15 && r.cat) add("zonecat", r.zone, null, r.cat, b, r.n);
  }
  return [...maps.values()].filter((s) => s.dim !== "zonecat" || s.counts.reduce((a, x) => a + x, 0) >= minPair);
}

// ------------------------------------------------------------- per Collector --

const cache = new Map<string, { at: number; p: Promise<WatchInput> }>();
/** The store's part of the input is the same for every Collector for a minute; the follows differ. */
function cachedInput(follows: Follow[]): Promise<WatchInput> {
  const key = JSON.stringify(follows.map((f) => [f.kind, f.ref]));
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > 60_000) cache.delete(k);
  const hit = cache.get(key);
  if (hit) return hit.p;
  const p = loadWatchInput(follows);
  cache.set(key, { at: now, p });
  p.catch(() => cache.delete(key));
  return p;
}

/**
 * The signed-in Collector's signals now, redacted (privacy.ts): the store's input, the Collector's follows, and the watch state
 * from their memory file. Used by the watch and brief routes.
 */
export async function watchFor(user: number): Promise<{ signals: WatchSignal[]; asOf: string; follows: Follow[]; conditions: Conditions }> {
  const [{ readMemory }, { redact }] = await Promise.all([import("./store"), import("./privacy")]);
  const follows = readMemory(user).follows ?? [];
  const input = await cachedInput(follows);
  return { signals: redact(buildSignals(input)), asOf: input.asOf, follows, conditions: redact(conditionsOf(input)) };
}

/** The calm-day reading of rain and reservoirs, for the brief's conditions line: the wettest gauge and the fullest reservoir, fresh ones only. */
export interface Conditions { rainMax: number | null; rainAt: string | null; lakeMax: number | null; lakeAt: string | null; t: string | null }
export function conditionsOf(input: WatchInput): Conditions {
  const fresh = (r: Reading[], h: number) => r.filter((x) => Number.isFinite(x.value) && IST(input.asOf) - IST(x.t) <= h * 3_600_000).sort((a, b) => b.value - a.value);
  const rain = fresh(input.rain, 48)[0] ?? null, lake = fresh(input.lakes, 72).filter((x) => x.value <= 130)[0] ?? null;
  return { rainMax: rain ? Math.round(rain.value) : null, rainAt: rain ? noDigits(rain.place) : null, lakeMax: lake ? Math.round(lake.value) : null, lakeAt: lake ? noDigits(lake.place) : null,
    t: [rain?.t, lake?.t].filter((x): x is string => !!x).sort().pop() ?? null };
}
