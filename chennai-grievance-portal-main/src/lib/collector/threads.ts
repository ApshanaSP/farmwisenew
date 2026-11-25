/**
 * Developing stories: news reports about the same event, followed over several days.
 *
 * The news monitor groups same-day coverage of one article into a story (documents.story_id)
 * and the pipeline links reports to incidents. A continuing event, though, is reported again
 * as it develops (the attack, the arrests, the death, the court case) under new headlines,
 * new stories and sometimes new incidents. This module threads those reports together:
 *
 *   1. Reports in the window, oldest first: district news that is an incident, linked to one,
 *      or carries a civic category, plus dated items from sources the Collector added.
 *   2. Each report joins the open thread it matches best (last update within 4 days, thread
 *      at most 14 days long), or starts a new one. It matches when it shares the story or the
 *      incident, or when its headline is close to the thread's (TF-IDF cosine with the thread
 *      centroid or its nearest member) and they share at least one rare word (a place, a name).
 *      Two different named localities, or none of the thread's own words (the name or place in
 *      most of its reports), keep events apart.
 *   3. A thread is shown when it has two or more different headlines from different stories
 *      or several hours apart, from two outlets or in three or more reports, and it actually developed: a later report
 *      is a new kind of step, or the story ran for more than a day. Each report gets a stage (arrest, death, court,
 *      action...) from its headline, so the thread reads as what happened, in order.
 *
 * Rules only, no language model; every step links to its article or incident.
 */
import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import intelPool, { ops } from "@/lib/collector/db";
import { effectiveSql } from "@/lib/collector/effective";
import { categories } from "@/lib/collector/nlp";
import { orEmpty } from "@/lib/fallback";
import { roughKm } from "@/lib/map/geom";
import { syncEpochKeys } from "@/lib/collector/epoch";
import { deskOf } from "@/lib/collector/deskbook";
import { plainEvents } from "@/lib/collector/idioms";
import { isNewsMedia } from "@/lib/collector/newsmedia";

/** the effective open flag: the pipeline's, with the Collector's and officers' decisions laid on top, as page 1's KPIs (BUG-035) */
const OPEN = effectiveSql(ops("collector_decisions")).open;

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

/** `hours` is the dashboard period; stories are followed over at least 14 and at most 30 days. */
export interface ThreadScope {
  hours: number; /** only stories with a report since then (the period start: daily = today) */ since?: string; zone: number | null; dept: string | null; cat: string | null; taluk: string | null;
  /** a department officer's view: another department's linked incident records are left out (lockedView) */
  lockDept?: string | null;
}

export interface Doc {
  id: string; story: string | null; inc: string | null; itemId: number | null; publisher: string | null; title: string; url: string | null;
  lang: string | null; cat: string | null; dept: string | null; place: string | null; local: boolean; zone: number | null; taluk: string | null;
  sev: string | null; open: boolean | null; t: string; ms: number; w: Map<string, number>; norm: number; tk: string[]; original: string | null;
}

// ------------------------------------------------------------ headlines --

const STOP = new Set(("a an the of in on at to for from by with and or but is are was were be been being as into over after before near about against amid " +
  "chennai city tamil nadu tn govt government police says said say new two three four five one held arrested arrest man woman youth people residents " +
  "day days week weeks today tomorrow yesterday its his her their this that these those will would may can could not no up out off also more than per " +
  "rs crore lakh year years old last first all under via how why what who when where tap know inshorts news").split(/\s+/));
const SYN: Record<string, string> = {
  murdered: "kill", murder: "kill", murders: "kill", killed: "kill", kills: "kill", hacked: "kill", slain: "kill",
  dies: "die", died: "die", death: "die", dead: "die", deaths: "die", succumbs: "die",
  afire: "fire", ablaze: "fire", blaze: "fire", fires: "fire", drowned: "drown", drowns: "drown", drowning: "drown",
  flooded: "flood", flooding: "flood", floods: "flood", inundated: "flood", waterlogged: "waterlog", waterlogging: "waterlog",
  rains: "rain", rainfall: "rain", collapsed: "collapse", collapses: "collapse", "sub-inspector": "si", subinspector: "si",
  husband: "spouse", wife: "spouse", friends: "friend", girls: "girl", boys: "boy", students: "student", workers: "worker", roads: "road", drains: "drain"
};

/** "Headline | Outlet" and "Headline - India Today": keep the headline. */
export function cleanTitle(t: string) {
  let s = String(t ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/\s*\|\s*Tap to know more.*$/i, "");
  for (let k = 0; k < 2; k++) {
    const m = s.match(/^(.{25,}?)\s+[|–-]\s+([^|–-]{2,32})$/);
    if (m && !/\d/.test(m[2])) s = m[1].trim();
  }
  return s;
}

export function tokens(s: string) {
  const out: string[] = [];
  for (let w of s.toLowerCase().replace(/[‘’'`"“”]/g, "").split(/[^a-z0-9஀-௿-]+/)) {
    w = w.replace(/^-+|-+$/g, "");
    if (!w || w.length < 2 || /^\d+$/.test(w)) continue;
    if (/[஀-௿]/.test(w)) {
      // Tamil words take case endings: compare their first five letters
      const cp = [...w];
      if (cp.length >= 4) out.push("ta:" + cp.slice(0, 5).join(""));
      continue;
    }
    if (w.length < 3 && w !== "si") continue;
    if (STOP.has(w)) continue;
    w = SYN[w] ?? w;
    if (w.length > 4) w = w.replace(/(ing|ed|es|s)$/, "");
    if (STOP.has(w)) continue; // "Chennai's" -> "chennai"
    out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------- stages --

/**
 * What kind of step a headline reports, by rules (used until the AI has written the story's timeline, and to check its labels). Read
 * through plainEvents() first: "dies of cardiac arrest" is a death, "meeting held" is nobody held, "civic body" is not a body
 * (24 Nov: the Kolathur MLA's death was shown as an arrest).
 */
const PERSON = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|man|men|woman|women|youths?|couple|duo|trio|gang|students?|teachers?|drivers?|officials?|officers?|accused|suspects?|members?|persons?|people|doctors?|techies?|aides?|son|husband|wife|father|mother|brother|migrants?|workers?|boys?|girls?|rowd(?:y|ies)|functionar(?:y|ies)|leaders?)";
export const STAGES: [string, RegExp][] = [
  ["Arrest", new RegExp(`\\b(arrest(?:s|ed|ing)?|nabbed|nabs|detain(?:s|ed)|detention|remanded|(?:police|judicial) custody|taken into custody|surrender(?:s|ed))\\b|\\bheld\\s+(?:for|over|in connection|with|after|under)\\b|\\b${PERSON}\\s+held\\b|கைது|சிறையில் அடை`, "i")],
  ["Death", /\b(dies|died|dead|deaths?|killed|kills|murdered|drown(?:s|ed)|succumb\w*|pass(?:es|ed) away|no more|bod(?:y|ies)\s+(?:of|found|recovered|retrieved|fished))\b|பலி|உயிரிழ|சடலம்|மரண|காலமான|மறைவு|மறைந்த|இறந்த/i],
  ["Court", /\b(court|hc|bail|sentenc\w*|convict\w*|plea|pil|verdict|acquit\w*|petition)\b|நீதிமன்ற|ஐகோர்ட்|நீதிபதி|ஜாமீன்|ஜாமின்/i],
  ["Probe", /\b(probe|inquiry|enquiry|investigat\w*|cb-?cid|cbi|questioned|summon\w*|post-?mortem)\b|விசாரணை/i],
  ["Protest", /\b(protest\w*|agitation|strike|road roko|blockade|demonstrat\w*)\b|போராட்ட|மறியல்|ஆர்ப்பாட்ட|வேலை ?நிறுத்த/i],
  ["Action", /\b(sealed|seals|removed|removes|demolish\w*|evict\w*|deployed|restor(?:ed|es)|cleared|clears|vaccinat\w*|desilt\w*|repaired|suspended|fined|penalt\w*|crackdown|rescu\w*|seized|booked)\b|அகற்ற|சீல்|மீட்/i],
  ["Warning", /\b(alert|warns?|warning|advisory)\b|எச்சரிக்கை/i],
  ["Completed", /\b(completed|completes|reopen\w*|resum\w*|called off|withdrawn|ends)\b|நிறைவு|திறப்பு|வாபஸ்/i]
];
/** the Special Investigation Team, only as its capitals ("sit" is also a verb) */
const SIT = /\bSIT\b/;
export const stageOf = (title: string): string => {
  const t = plainEvents(title);
  return STAGES.find(([k, re]) => re.test(t) || (k === "Probe" && SIT.test(t)))?.[0] ?? "Update";
};

// ------------------------------------------------------------ geography --

declare global {
  // eslint-disable-next-line no-var
  var __threadWards: Row[] | undefined;
  // eslint-disable-next-line no-var
  var __threadCache: Record<string, { at: number; threads: Thread[] }> | undefined;
  // eslint-disable-next-line no-var
  var __unitCache: Record<string, { at: number; units: Unit[] }> | undefined;
}
async function wards() {
  global.__threadWards ??= await q(`SELECT ward_no, zone_no, taluk_code, centroid_lat AS lat, centroid_lon AS lon FROM ref_wards`);
  return global.__threadWards;
}
function nearestWard(ws: Row[], lat: number, lon: number) {
  let best: Row | null = null, bd = Infinity;
  for (const w of ws) {
    const d = roughKm(lat, lon, Number(w.lat), Number(w.lon));
    if (d < bd) { bd = d; best = w; }
  }
  return bd <= 2 ? best : null;
}

// --------------------------------------------------------------- threads --

export interface ThreadStep {
  /** the article's id (documents.doc_id), or "item-<id>" for one from an added source */ doc?: string;
  t: string; title: string; /** the headline as published, when it is not English */ original: string | null; publisher: string | null; url: string | null; lang: string | null; stage: string;
  incident: string | null; itemId: number | null; added: boolean; also: string[];
  /** the other outlets that carried this headline, each with its own time and link */
  also_src?: { publisher: string; url: string | null; t: string; title: string }[];
}
export interface Thread {
  id: string; title: string; place: string | null; cat: string | null; catLabel: string | null; zones: number[]; depts: string[]; taluks: string[];
  incidents: string[]; sev: string | null; open: boolean | null; first: string; last: string; hours: number; reports: number; outlets: string[];
  added: number; stages: { stage: string; t: string }[]; days: { day: string; steps: ThreadStep[] }[]; latest: ThreadStep;
  /** each linked incident record, last linked last, with the department that holds it (for lockedView) */
  records: { id: string; dept: string | null; zone: number | null; taluk: string | null; sev: string | null; open: boolean | null }[];
  /** the zones and taluks of reports linked to no incident: the articles' own places */
  placed: { zones: number[]; taluks: string[] };
  /** the overview sends this count instead of every day's reports (the Stories view loads those itself) */
  updates?: number;
}

/** Bump when the threading rules change, so a cached result is not reused. */
const RULES = 15;

const SCHEDULE = /power (cut|shutdown)|shutdown areas|மின்தடை|மின் தடை|எந்தெந்த வழக்க/i;

/** A feed the site reads itself ("The Hindu - Chennai (RSS)") is the outlet it belongs to, so one outlet is never counted as two. */
const FEED_OF: [RegExp, string][] = [[/thehindu\.com/i, "The Hindu"], [/timesofindia/i, "The Times of India"], [/dtnext\.in/i, "DT Next"], [/newindianexpress\.com/i, "The New Indian Express"],
  [/hindustantimes\.com/i, "Hindustan Times"], [/deccanchronicle\.com/i, "Deccan Chronicle"], [/dailythanthi\.com/i, "Daily Thanthi"], [/dinamalar\.com/i, "Dinamalar"], [/dinamani\.com/i, "Dinamani"],
  [/hindutamil\.in/i, "Hindu Tamil Thisai"], [/ndtv\.com/i, "NDTV"], [/indianexpress\.com/i, "The Indian Express"]];
export function outletOf(name: string | null, url: string | null): string | null {
  const known = FEED_OF.find(([re]) => re.test(String(url ?? "")));
  return known ? known[1] : name?.replace(/\s*[-–]\s*Chennai\b.*$/i, "").replace(/\s*\((?:live|rss)\)\s*$/i, "").trim() || name;
}

async function load(now: string, days: number): Promise<Doc[]> {
  const [news, added, ws] = await Promise.all([
    q(`SELECT d.doc_id AS id, d.story_id AS story, d.linked_incident_id AS inc, d.publisher, d.publisher_domain AS dom, d.publisher_tier AS tier,
              d.title, d.title_en, d.url, d.lang, d.category_code AS cat, d.is_incident AS isinc, d.report_type AS rtype,
              d.department AS ddept, d.place_text AS place, d.geo_level, d.lat, d.lon, i.zone_no AS izone, i.taluk_code AS italuk, i.lead_dept AS idept,
              i.severity_level AS sev, ${OPEN} AS open, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t
       FROM documents d LEFT JOIN incidents i ON i.incident_id = d.linked_incident_id
       WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.published_at > (? - INTERVAL ? DAY) AND d.published_at <= ?
       ORDER BY d.published_at`, [now, days, now]),
    q(`SELECT i.item_id, s.name AS publisher, s.url AS feed, i.title, i.url, i.lang, i.category_code AS cat, i.dept_code AS ddept, i.place, i.lat, i.lon,
              i.zone_no AS izone, i.taluk_code AS italuk, DATE_FORMAT(COALESCE(i.published_at, i.fetched_at), '%Y-%m-%d %H:%i:%s') AS t
       FROM ${ops("source_items")} i JOIN ${ops("sources")} s ON s.source_id = i.source_id
       WHERE s.kind IN ('rss', 'html', 'json') AND i.published_at IS NOT NULL
         AND COALESCE(i.published_at, i.fetched_at) > (? - INTERVAL ? DAY)
         AND COALESCE(i.published_at, i.fetched_at) <= ? + INTERVAL 1 DAY`, [now, days, now]).catch(orEmpty("threads:159")),
    wards()
  ]);
  const cats = new Map(categories().map((c) => [c.code, c.lead]));
  const docs: Doc[] = [];
  const seen = new Set<string>();
  const push = (r: Row, id: string, itemId: number | null) => {
    // Tamil reports are read through their English headline, so they thread with the English ones
    const title = cleanTitle(r.lang && r.lang !== "en" && r.title_en ? r.title_en : r.title);
    if (!title || SCHEDULE.test(title) || !r.t) return;
    const key = `${(r.publisher ?? "").toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const local = !!r.place && (r.geo_level ? !["district", "taluk"].includes(r.geo_level) : true) && String(r.place).toLowerCase() !== "chennai";
    let zone = r.izone == null ? null : Number(r.izone), taluk: string | null = r.italuk ?? null;
    if (zone == null && local && r.lat != null) {
      const w = nearestWard(ws, Number(r.lat), Number(r.lon));
      if (w) { zone = Number(w.zone_no); taluk = taluk ?? w.taluk_code ?? null; }
    }
    const cat = r.cat && r.cat !== "OTHER" ? r.cat : null;
    docs.push({
      id, story: r.story ?? null, inc: r.inc ?? null, itemId, publisher: r.publisher ?? null, title, url: r.url ?? null, lang: r.lang ?? null,
      cat, dept: r.idept ?? r.ddept ?? (cat ? cats.get(cat) ?? null : null), place: r.place ?? null, local, zone, taluk,
      sev: r.sev ?? null, open: r.open == null ? null : Number(r.open) === 1, t: r.t, ms: Date.parse(r.t.replace(" ", "T") + "+05:30"),
      w: new Map(), norm: 1, tk: [], original: title !== cleanTitle(r.title) ? cleanTitle(r.title) : null
    });
  };
  for (const r of news) {
    // recognised news media only, as everywhere on the console
    if (!isNewsMedia(r.publisher, r.dom, r.tier)) continue;
    // the news desk's verdict (newsdesk.ts); an article it has not read yet follows the old rule: an incident, or a labelled category
    const v = deskOf(r.title, r.title_en);
    if (v ? v.v === "skip" : !(Number(r.isinc) === 1 || r.inc || ["incident", "crime", "civic_complaint", "court"].includes(String(r.rtype ?? "")) || (r.cat && r.cat !== "OTHER"))) continue;
    push(v?.cat ? { ...r, cat: v.cat } : r, String(r.id), null);
  }
  for (const r of added) {
    const v = deskOf(r.title);
    // a news feed's item the desk has not read, or left out, is in no story; another added source's item is
    if (v?.v === "skip" || (!v && isNewsMedia(null, r.feed))) continue;
    push({ ...r, publisher: outletOf(r.publisher, r.feed), ...(v?.cat ? { cat: v.cat } : {}) }, `item-${r.item_id}`, Number(r.item_id));
  }
  docs.sort((a, b) => a.ms - b.ms);
  return docs;
}

function cluster(docs: Doc[]) {
  const df = new Map<string, number>();
  for (const d of docs) {
    // headline words only: the monitor's place tags are sometimes wrong, and a place that matters is in the headline
    d.tk = [...new Set(tokens(d.title))];
    for (const k of d.tk) df.set(k, (df.get(k) ?? 0) + 1);
  }
  const N = Math.max(1, docs.length);
  for (const d of docs) {
    d.w = new Map(d.tk.map((k) => [k, Math.log(1 + N / (df.get(k) ?? 1))]));
    d.norm = Math.hypot(...d.w.values()) || 1;
  }
  const rare = (k: string) => (df.get(k) ?? 0) <= 8;
  interface T { ix: number; m: Doc[]; c: Map<string, number>; count: Map<string, number>; stories: Set<string>; incs: Set<string>; locs: Set<string>; first: number; last: number }
  const all: T[] = [];
  // Only threads still in reach are compared (last report within 4 days, at most 14 days long: reports come in time
  // order, so a thread out of reach never comes back), and of those only the ones sharing a headline word, the story
  // or the incident (a thread sharing none of them can never match). Same result as comparing with every thread, in
  // a fraction of the time: a month of news took seconds.
  let live: T[] = [];
  const byWord = new Map<string, Set<T>>();
  for (const d of docs) {
    let best: T | null = null, bestScore = 0;
    if (live.some((t) => d.ms - t.last > 4 * 864e5 || d.ms - t.first > 14 * 864e5)) {
      const gone = live.filter((t) => d.ms - t.last > 4 * 864e5 || d.ms - t.first > 14 * 864e5);
      live = live.filter((t) => !gone.includes(t));
      for (const t of gone) for (const k of t.c.keys()) byWord.get(k)?.delete(t);
    }
    const near = new Set<T>();
    for (const k of d.w.keys()) for (const t of byWord.get(k) ?? []) near.add(t);
    for (const t of live) if ((d.story && t.stories.has(d.story)) || (d.inc && t.incs.has(d.inc))) near.add(t);
    // in the order the threads were started, as before
    for (const t of [...near].sort((a, b) => a.ix - b.ix)) {
      if ((d.story && t.stories.has(d.story)) || (d.inc && t.incs.has(d.inc))) { best = t; bestScore = 9; break; }
      // a different named locality is a different event
      if (d.local && d.place && t.locs.size && !t.locs.has(d.place.toLowerCase())) continue;
      let dot = 0;
      const shared: string[] = [];
      for (const [k, v] of d.w) if (t.c.has(k)) { dot += v * t.c.get(k)!; shared.push(k); }
      let cn = 0; // summed in the same order as before, so borderline scores come out exactly the same
      for (const v of t.c.values()) cn += v * v;
      const cos = dot / (d.norm * Math.sqrt(cn) || 1);
      let pair = 0;
      for (const m of t.m) {
        let x = 0;
        for (const [k, v] of d.w) if (m.w.has(k)) x += v * v;
        pair = Math.max(pair, x / (d.norm * m.norm));
      }
      const anchors = shared.filter(rare);
      // The thread's own words: in most of its reports and mostly used there (a company, a person, a place).
      // A report that carries none of them is another event that reads alike (two firms' similar announcements).
      const own = t.m.length >= 2 ? [...t.count.entries()].filter(([k, n]) => n >= 0.8 * t.m.length && n / (df.get(k) ?? 1) >= 0.6).map(([k]) => k) : [];
      const stranger = own.length > 0 && !own.some((k) => d.w.has(k));
      const ok = pair >= 0.9 || (!stranger && (pair >= 0.6 || (cos >= 0.3 && anchors.length >= 1 && shared.length >= 2) || (pair >= 0.42 && anchors.length >= 2)));
      const sc = Math.max(cos, pair);
      if (ok && sc > bestScore) { best = t; bestScore = sc; }
    }
    if (!best) {
      best = { ix: all.length, m: [], c: new Map(), count: new Map(), stories: new Set(), incs: new Set(), locs: new Set(), first: d.ms, last: d.ms };
      all.push(best);
      live.push(best);
    }
    best.m.push(d);
    best.last = Math.max(best.last, d.ms);
    for (const [k, v] of d.w) {
      const was = best.c.get(k) ?? 0;
      best.c.set(k, was + v);
      best.count.set(k, (best.count.get(k) ?? 0) + 1);
      (byWord.get(k) ?? byWord.set(k, new Set()).get(k)!).add(best);
    }
    if (d.story) best.stories.add(d.story);
    if (d.inc) best.incs.add(d.inc);
    if (d.local && d.place) best.locs.add(d.place.toLowerCase());
  }
  return all.map((t) => t.m);
}

const mode = <T,>(xs: T[]) => {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** Did these reports develop, by the rules? (see the top of the file, 3) */
function build(m: Doc[], catLabel: Map<string, string>): Thread | null {
  const titles = new Set(m.map((d) => d.title.toLowerCase()));
  const units = new Set(m.map((d) => d.story ?? d.id));
  const hours = (m[m.length - 1].ms - m[0].ms) / 3.6e6;
  const outlets = new Set(m.map((d) => d.publisher).filter(Boolean));
  // two headlines from one outlet are often two different stories: ask for a second outlet or a third report
  if (titles.size < 2 || (units.size < 2 && hours < 6) || (outlets.size < 2 && m.length < 3)) return null;
  const t = threadOf(m, catLabel);
  // Developing means something happened after the first report: a later report is a new kind of step (a protest after
  // a collapse, a court case after a launch, an arrest after a murder), or the story kept being reported for more than
  // a day. The same event written up by several outlets within hours is coverage, not development, and is not shown.
  const steps = t.days.flatMap((d) => d.steps);
  const own = stageOf(steps[0].original ? `${steps[0].title} ${steps[0].original}` : steps[0].title);
  const moved = steps.slice(1).some((s) => s.stage !== "Update" && s.stage !== own);
  return moved || (hours >= 24 && t.days.length >= 2) ? t : null;
}

/** One thread of these reports (oldest first), whatever the rules think of them: the AI chose them (storyai.ts), or the rules did (build). */
export function threadOf(m: Doc[], catLabel: Map<string, string>): Thread {
  const hours = (m[m.length - 1].ms - m[0].ms) / 3.6e6;
  // the headline closest to the others, English preferred, names the thread
  const score = (d: Doc) => m.reduce((a, o) => {
    if (o === d) return a;
    let x = 0;
    for (const [k, v] of d.w) if (o.w.has(k)) x += v * v;
    return a + x / (d.norm * o.norm);
  }, 0) + (d.lang === "en" ? 0.6 : 0);
  const head = [...m].sort((a, b) => score(b) - score(a))[0];
  // one step per headline; the same headline from other outlets is folded in
  const steps: ThreadStep[] = [];
  const byTitle = new Map<string, ThreadStep>();
  for (const d of m) {
    const k = d.title.toLowerCase();
    const prev = byTitle.get(k);
    if (prev) {
      if (d.publisher && d.publisher !== prev.publisher && !prev.also.includes(d.publisher)) prev.also.push(d.publisher);
      if (d.publisher) (prev.also_src ??= []).push({ publisher: d.publisher, url: d.url, t: d.t, title: d.title });
      continue;
    }
    const st: ThreadStep = { doc: d.id, t: d.t, title: d.title, original: d.original, publisher: d.publisher, url: d.url, lang: d.lang, stage: stageOf(d.original ? `${d.title} ${d.original}` : d.title),
      incident: d.inc, itemId: d.itemId, added: d.itemId != null, also: [] };
    byTitle.set(k, st);
    steps.push(st);
  }
  const own = steps[0].stage;
  steps[0].stage = "First report";
  const days: Thread["days"] = [];
  for (const s of steps) {
    const day = s.t.slice(0, 10);
    const g = days[days.length - 1];
    if (g && g.day === day) g.steps.push(s);
    else days.push({ day, steps: [s] });
  }
  const stages: Thread["stages"] = [];
  // what the first report already was (an arrest reported as an arrest) is not a later stage
  for (const s of steps) if (s.stage !== "Update" && s.stage !== own && !stages.some((x) => x.stage === s.stage)) stages.push({ stage: s.stage, t: s.t });
  const cat = mode(m.map((d) => d.cat).filter(Boolean) as string[]);
  const lastInc = [...m].reverse().find((d) => d.sev);
  const records = new Map<string, Thread["records"][number]>();
  for (const d of m) if (d.inc) { records.delete(d.inc); records.set(d.inc, { id: d.inc, dept: d.dept, zone: d.zone, taluk: d.taluk, sev: d.sev, open: d.open }); }
  const free = m.filter((d) => !d.inc);
  return {
    id: "THR-" + crypto.createHash("sha1").update(m[0].id).digest("hex").slice(0, 10),
    // the monitor's place tag, when a headline names it (tags are sometimes wrong)
    title: head.title, place: mode(m.filter((d) => d.local && m.some((o) => o.title.toLowerCase().includes(String(d.place).toLowerCase()))).map((d) => d.place as string)),
    cat, catLabel: cat ? catLabel.get(cat) ?? cat : null,
    zones: [...new Set(m.map((d) => d.zone).filter((z): z is number => z != null))],
    depts: [...new Set(m.map((d) => d.dept).filter(Boolean) as string[])],
    taluks: [...new Set(m.map((d) => d.taluk).filter(Boolean) as string[])],
    incidents: [...new Set(m.map((d) => d.inc).filter(Boolean) as string[])],
    sev: lastInc?.sev ?? null, open: lastInc ? lastInc.open : null,
    first: m[0].t, last: m[m.length - 1].t, hours: Math.round(hours), reports: m.length,
    outlets: [...new Set(m.map((d) => d.publisher).filter(Boolean) as string[])], added: m.filter((d) => d.itemId != null).length,
    stages, days, latest: steps[steps.length - 1], records: [...records.values()],
    placed: { zones: [...new Set(free.map((d) => d.zone).filter((z): z is number => z != null))], taluks: [...new Set(free.map((d) => d.taluk).filter(Boolean) as string[])] }
  };
}

/**
 * A thread as a department officer sees it. The news is public, so a story about their department is shown; but a thread kept because
 * any of its reports is theirs carried every linked incident's id, the severity and open state of the last one, and its zone, whatever
 * department holds it (reviewerF-06). Here only the officer's own department's records are linked; the zones and taluks are theirs and
 * the articles' own places.
 */
export function lockedView(t: Thread, dept: string): Thread {
  const own = t.records.filter((r) => r.dept === dept);
  const ids = new Set(own.map((r) => r.id));
  const last = [...own].reverse().find((r) => r.sev);
  const step = (x: ThreadStep): ThreadStep => (x.incident && !ids.has(x.incident) ? { ...x, incident: null } : x);
  return {
    ...t, incidents: t.incidents.filter((id) => ids.has(id)), sev: last?.sev ?? null, open: last ? last.open : null, records: own,
    zones: [...new Set([...t.placed.zones, ...own.map((r) => r.zone).filter((z): z is number => z != null)])],
    taluks: [...new Set([...t.placed.taluks, ...own.map((r) => r.taluk).filter(Boolean) as string[]])],
    days: t.days.map((d) => ({ ...d, steps: d.steps.map(step) })), latest: step(t.latest)
  };
}

/** One report of the news, with every report that only says it again (the same article's copies, or nearly the same headline within two days). */
export interface Unit { docs: Doc[]; t: string; title: string; original: string | null; tk: Set<string>; stage: string }
export function unitsOf(docs: Doc[]): Unit[] {
  const out: Unit[] = [];
  const byStory = new Map<string, Unit>();
  for (const d of docs) {
    const tk = new Set(tokens(d.title));
    const stage = stageOf(d.original ? `${d.title} ${d.original}` : d.title);
    // another kind of step is another report, however alike the words ("contractor arrested after wall collapse kills two"); the monitor's
    // own story can hold both (a petition about a patient and his death)
    let u = d.story ? byStory.get(`${d.story}|${stage}`) : undefined;
    if (!u) {
      for (let k = out.length - 1; k >= 0 && !u; k--) {
        if (d.ms - out[k].docs[0].ms > 2 * 864e5) break;
        if (out[k].stage !== stage) continue;
        let x = 0;
        for (const w of tk) if (out[k].tk.has(w)) x++;
        if (tk.size >= 3 && x / Math.max(1, tk.size + out[k].tk.size - x) >= 0.6) u = out[k];
      }
    }
    if (u) u.docs.push(d);
    else out.push(u = { docs: [d], t: d.t, title: d.title, original: d.original, tk, stage });
    if (d.story) byStory.set(`${d.story}|${stage}`, u);
  }
  return out;
}

/** Every kept report of the window, oldest first, repeats folded: what the AI reads to find the stories that developed. */
export async function newsUnits(hours: number, now: string): Promise<{ days: number; units: Unit[]; catLabel: Map<string, string> }> {
  const days = Math.min(30, Math.max(14, Math.round(hours / 24)));
  const key = `${RULES}|${await buildStamp()}|${days}`;
  syncEpochKeys(global.__unitCache, unitCacheToken);
  const catLabel = new Map(categories().map((c) => [c.code, c.label]));
  const had = global.__unitCache?.[key];
  if (had && Date.now() - had.at < 10 * 60_000) return { days, units: had.units, catLabel };
  const units = unitsOf(await load(now, days));
  const keep = Object.fromEntries(Object.entries(global.__unitCache ?? {}).filter(([k]) => k.split("|")[1] === key.split("|")[1]));
  global.__unitCache = { ...keep, [key]: { at: Date.now(), units } };
  return { days, units, catLabel };
}
const unitCacheToken = {};

/** The pipeline build the stories were threaded from: they only change when a new build is published. */
async function buildStamp(): Promise<string> {
  const [r] = await q(`SELECT v FROM _export_meta WHERE k = 'exported_at'`).catch(orEmpty("threads:340"));
  return String(r?.v ?? "");
}

const threadCacheToken = {};
/** Every thread of the window, whatever the scope: the AI joins and explains all of them once (storyai.ts), then each scope takes its own. */
export async function allThreads(hours: number, now: string): Promise<{ days: number; threads: Thread[] }> {
  const days = Math.min(30, Math.max(14, Math.round(hours / 24)));
  // Keyed on the build, not on "now" (which moves every 30 s): threading a month of news takes seconds, so it runs
  // once per build and period length, and at most every 10 minutes for items from added sources.
  const key = `${RULES}|${await buildStamp()}|${days}`;
  syncEpochKeys(global.__threadCache, threadCacheToken); // a decision empties it: a story whose cases are closed says so at once (RC-35)
  let all = global.__threadCache?.[key] && Date.now() - global.__threadCache[key].at < 10 * 60_000 ? global.__threadCache[key].threads : null;
  if (!all) {
    const catLabel = new Map(categories().map((c) => [c.code, c.label]));
    all = cluster(await load(now, days)).map((m) => build(m, catLabel)).filter((t): t is Thread => !!t);
    // latest day first; within a day, the stories that have developed furthest
    all.sort((a, b) => b.last.slice(0, 10).localeCompare(a.last.slice(0, 10)) || b.stages.length - a.stages.length || b.days.length - a.days.length ||
      b.reports - a.reports || b.last.localeCompare(a.last));
    // one entry per period length (14 or 30 days); entries of older builds are dropped
    const keep = Object.fromEntries(Object.entries(global.__threadCache ?? {}).filter(([k]) => k.split("|")[1] === key.split("|")[1]));
    global.__threadCache = { ...keep, [key]: { at: Date.now(), threads: all } };
  }
  return { days, threads: all };
}

/** Developing stories in the scope, most recently updated first. */
export async function threads(s: ThreadScope, now: string) {
  const { days, threads: all } = await allThreads(s.hours, now);
  const lock = s.lockDept;
  const shown = (lock ? all.map((t) => lockedView(t, lock)) : all).filter((t) => (!s.since || t.last >= s.since) &&
    (!s.zone || t.zones.includes(s.zone)) && (!s.dept || t.depts.includes(s.dept)) && (!s.cat || t.cat === s.cat) && (!s.taluk || t.taluks.includes(s.taluk)));
  return { days, total: shown.length, threads: shown.slice(0, 40) };
}
export type Threads = Awaited<ReturnType<typeof threads>>;
