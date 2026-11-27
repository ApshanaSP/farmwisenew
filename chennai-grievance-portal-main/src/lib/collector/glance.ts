/**
 * "Today at a glance": the Collector's key points at the top of the Briefing, composed by code from the figures the dashboard shows
 * (26 Nov 2026: the owner asked for a simple, personal overview: what is happening, what needs you, what to do next). No model writes a
 * figure here. The caller passes the tiles' own numbers (Overview `kpi`, `snapshot`, `tasks`) and the Briefing's lists for the SAME
 * filters, so every figure equals its tile, and every point carries the thing it opens (a list, a case, a story).
 *
 * Filters: every point is for the filters it is given. What has no zone, department or category (a weather warning, the air, the
 * reservoirs) is left out under a filter and is never worded as the filtered view's. A view with nothing in it
 * says so; it never falls back to the district's points.
 *
 * Each sentence is made in English and in Tamil. Names (a zone, a department, a headline) are their own pieces (`nm`), so the site's
 * translator can put them in Tamil one by one while the sentence around them is written here. Pure: no database, no clock.
 */

import { dayWords, periodIn, type Period } from "@/lib/period/day";

export type Seg = string | { nm: string; raw?: true };
/** a name inside a sentence: a place, a department, a kind of incident, a headline */
export const nm = (v: unknown): { nm: string } => ({ nm: String(v ?? "").trim() });
/** a name already in Tamil as published (a Tamil headline): shown as it is, never handed to the site's translator */
export const raw = (v: unknown): { nm: string; raw: true } => ({ nm: String(v ?? "").trim(), raw: true });
const fmt = (v: number) => v.toLocaleString("en-IN");
type Val = string | number | { nm: string } | Seg[];
/** a sentence with names kept apart: say`Most from: ${nm(zone)} ${12}` */
export function say(t: TemplateStringsArray, ...v: Val[]): Seg[] {
  const out: Seg[] = [];
  const put = (s: Seg) => {
    const last = out[out.length - 1];
    if (typeof s === "string" && typeof last === "string") out[out.length - 1] = last + s;
    else if (s !== "") out.push(s);
  };
  t.forEach((x, k) => {
    put(x);
    if (k >= v.length) return;
    const a = v[k];
    if (Array.isArray(a)) a.forEach(put);
    else put(typeof a === "number" ? fmt(a) : a);
  });
  return out;
}
export const plain = (s: Seg[]): string => s.map((x) => (typeof x === "string" ? x : x.nm)).join("");

// ------------------------------------------------------------------- what it is given --

export interface GlanceScope { zone: string | null; taluk: string | null; dept: string | null; cat: string | null; /** all of them in words ("Adyar · Police") */ words: string }
export interface GlanceCase {
  id: string; title: string; type: string; sev: string; zone: string | null; loc: string | null; dept: string | null; deptName: string | null; dead: number;
  /** the pipeline's checked next step for this case, or null */ next?: string | null; /** an instruction was already sent */ acted?: boolean
}
export interface GlanceIn {
  scope: GlanceScope;
  /** the console's period and time (its words come from lib/period/day.ts) */
  period: Period; now: string;
  /** the tiles: reported, ongoing (still open), urgent (severe or high among them), severe, severe_open, resolved */
  cur: Record<string, number>; prev: Record<string, number>;
  overdue: number; deaths: number; injured: number;
  /** My tasks */ awaiting: number;
  /** "Severe, not yet checked", any date; null when it was not read */ unchecked: number | null;
  kinds: { cat: string; label: string; n: number; prev: number }[];
  zones: { zone: number; name: string; n: number; prev: number }[];
  depts: { code: string; name: string; n: number; overdue: number }[];
  /** open cases, the most serious first */ cases: GlanceCase[];
  /** the period's incident with the most deaths */ fatal: { id: string; title: string; dead: number } | null;
  /** the strongest news story of the view: its headline (English; `ta` the Tamil headline as published, when a report is in Tamil), outlets,
   * whether the news desk says it needs action */
  news: { title: string; ta?: string | null; outlets: number; act: boolean; key: string; incident: string | null } | null;
  /** a story that really developed */ story: { id: string; title: string; events: number } | null;
  /** stories whose outlets disagree, in this view */ differ: { n: number; title: string; field: string } | null;
  /** incidents only in the news, with no department record */ newsOnly: { n: number; /** the department most of them belong to, and how many */ deptName: string | null; deptN: number } | null;
  /** an unusual rise in this view and period */ rise: { cat: string; label: string; zone: number | null; zoneName: string | null; n: number; /** null when `n` is only the view's share of the rise */ times: number | null; date: string } | null;
  /** district-wide facts: only read when no filter but the period is on */
  warning: { title: string; /** how the sources compare (alerts.ts) */ agreement: string; /** an official warning of rain, a storm or a flood */ rain: boolean } | null;
  env: { rainMm: number | null; aqi: number | null; lakesPct: number | null } | null;
}

// -------------------------------------------------------------------- what it makes --

export type ListTarget = { status?: string; sev?: string; sort?: string; dir?: number; scope?: string; cat?: string; dept?: string };
export type GlanceOpen =
  | { k: "list"; preset: ListTarget; title: string } | { k: "inc"; id: string } | { k: "act"; id: string } | { k: "zone"; zone: number }
  | { k: "dept"; code: string } | { k: "news"; key: string } | { k: "story"; id: string } | { k: "differ" } | { k: "gaps" } | { k: "rain" }
  | { k: "page"; page: "environment" } | { k: "rise"; cat: string; zone: number | null; date: string };
export type Tone = "sev" | "high" | "info" | "ok" | "ai";
export interface GlancePoint { key: string; icon: string; tone: Tone; en: Seg[]; ta: Seg[]; open: GlanceOpen; /** what a click does, a fixed label */ act: string }
export interface GlanceFigure { key: "reported" | "open" | "overdue" | "severe" | "resolved"; label: string; v: number; prev: number | null; good: "up" | "down" | null; sub: string | null; open: GlanceOpen }
export interface Glance {
  empty: boolean;
  situation: { en: Seg[]; ta: Seg[] };
  figures: GlanceFigure[];
  happening: GlancePoint[]; needs: GlancePoint[]; next: GlancePoint[];
}

// ------------------------------------------------------------------- words --

/** "reported today" / "in the last 7 days": the period after a verb, in both languages (the words of lib/period/day.ts for Daily). */
export function periodWords(period: Period, now: string): { en: string; ta: string } {
  return { en: periodIn(period, now), ta: period === "daily" ? dayWords(now).ta.inWords : `கடந்த ${{ weekly: 7, monthly: 30, quarterly: 90 }[period]} நாட்களில்` };
}
/** What the period is set against: "yesterday by this time", "the previous week". */
export function prevWords(period: Period, now: string): { en: string; ta: string } {
  if (period === "daily") return { en: dayWords(now).en.prev, ta: `${dayWords(now).ta.prev} இருந்ததை` };
  const w = { weekly: ["week", "வாரத்தை"], monthly: ["month", "மாதத்தை"], quarterly: ["quarter", "காலாண்டை"] }[period];
  return { en: `the previous ${w[0]}`, ta: `முந்தைய ${w[1]}` };
}
const change = (now: number, before: number, prev: { en: string; ta: string }): { en: string; ta: string } => {
  const d = now - before;
  return d === 0 ? { en: `the same as ${prev.en}`, ta: "மாற்றமில்லை" }
    : { en: `${fmt(Math.abs(d))} ${d > 0 ? "more" : "fewer"} than ${prev.en}`, ta: `${prev.ta} விட ${fmt(Math.abs(d))} ${d > 0 ? "அதிகம்" : "குறைவு"}` };
};
/** "(was 15)": the same kind or area in the period before */
const moved = (n: number, before: number): { en: string; ta: string } =>
  n === before ? { en: "(same as before)", ta: "(முன்பும் அதே)" } : before === 0 ? { en: "(none before)", ta: "(முன்பு இல்லை)" }
    : { en: `(was ${fmt(before)})`, ta: `(முன்பு ${fmt(before)})` };
/** A headline short enough for a point, cut at a word. */
export function short(t: string, max = 66): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,;:–-]+$/, "")}…`;
}
const at = (title: string, zone: string | null): Seg[] => (zone && !title.toLowerCase().includes(zone.toLowerCase()) ? [", ", nm(zone)] : []);

// ------------------------------------------------------------------- compose --

const GROUP_MAX = 4;

export function composeGlance(f: GlanceIn): Glance {
  const s = f.scope;
  // only the period is on: the whole district's facts (weather, air, reservoirs) belong to the view
  const whole = !s.zone && !s.taluk && !s.dept && !s.cat;
  const per = periodWords(f.period, f.now), prev = prevWords(f.period, f.now);
  const c = (k: string) => Number(f.cur[k] ?? 0), p = (k: string) => Number(f.prev[k] ?? 0);
  const reported = c("reported"), open = c("ongoing"), sevOpen = c("severe_open");

  // ---- the figures, each the tile it is named after
  const figures: GlanceFigure[] = [
    { key: "reported", label: "Reported", v: reported, prev: p("reported"), good: null, sub: f.deaths ? `${fmt(f.deaths)} dead` : null, open: { k: "list", preset: { sort: "sev", dir: 1 }, title: "Reported incidents" } },
    { key: "open", label: "Still open", v: open, prev: p("ongoing"), good: "down", sub: c("urgent") ? `${fmt(c("urgent"))} severe or high` : null, open: { k: "list", preset: { status: "open", sort: "sev", dir: 1 }, title: "Open incidents" } },
    { key: "overdue", label: "Past deadline", v: f.overdue, prev: null, good: null, sub: "still open", open: { k: "list", preset: { status: "overdue", sort: "sev", dir: 1 }, title: "Open and past deadline" } },
    { key: "severe", label: "Severe", v: c("severe"), prev: p("severe"), good: "down", sub: c("severe") ? `${fmt(sevOpen)} still open` : null, open: { k: "list", preset: { sev: "Severe" }, title: "Severe events" } },
    { key: "resolved", label: "Resolved", v: c("resolved"), prev: p("resolved"), good: "up", sub: null, open: { k: "list", preset: { status: "Resolved" }, title: "Resolved incidents" } }
  ];

  // ---- one sentence
  const empty = reported === 0 && c("resolved") === 0;
  const inEn: Seg[] = whole ? [] : [nm(s.words), ": "];
  const ch = change(reported, p("reported"), prev);
  const lives = f.deaths || f.injured ? {
    en: `; ${[f.deaths ? `${fmt(f.deaths)} ${f.deaths === 1 ? "person" : "people"} died` : null, f.injured ? `${fmt(f.injured)} injured` : null].filter(Boolean).join(", ")}`,
    ta: `; ${[f.deaths ? `உயிரிழப்பு ${fmt(f.deaths)}` : null, f.injured ? `காயம் ${fmt(f.injured)}` : null].filter(Boolean).join(", ")}`
  } : { en: "", ta: "" };
  const situation = reported === 0
    ? { en: say`${inEn}nothing was reported ${per.en}${c("resolved") ? `; ${fmt(c("resolved"))} resolved` : ""}.`, ta: say`${inEn}${per.ta} எதுவும் பதிவாகவில்லை${c("resolved") ? `; ${fmt(c("resolved"))} தீர்க்கப்பட்டன` : ""}.` }
    : { en: say`${inEn}${reported} ${reported === 1 ? "incident was" : "incidents were"} reported ${per.en}, ${ch.en}; ${open} still open, ${c("resolved")} resolved${lives.en}.`,
      ta: say`${inEn}${per.ta} ${reported} நிகழ்வுகள் பதிவாகின (${ch.ta}); ${open} இன்னும் திறந்துள்ளன, ${c("resolved")} தீர்க்கப்பட்டன${lives.ta}.` };
  // the first word is a sentence's own capital ("Nothing was reported today.")
  if (typeof situation.en[0] === "string") situation.en[0] = situation.en[0].charAt(0).toUpperCase() + situation.en[0].slice(1);

  // ---- what is happening
  const kinds = [...f.kinds].filter((k) => k.n > 0).sort((a, b) => b.n - a.n);
  const zones = [...f.zones].filter((z) => z.n > 0).sort((a, b) => b.n - a.n);
  const part = (a: { label: string; n: number; prev: number }) => ({ en: say`${nm(a.label)} ${a.n} ${moved(a.n, a.prev).en}`, ta: say`${nm(a.label)} ${a.n} ${moved(a.n, a.prev).ta}` });
  const two = (a: { label: string; n: number; prev: number }[]) => {
    const x = a.slice(0, 2).map(part);
    return { en: x.length > 1 ? say`${x[0].en}, ${x[1].en}` : x[0].en, ta: x.length > 1 ? say`${x[0].ta}, ${x[1].ta}` : x[0].ta };
  };
  const happening: GlancePoint[] = [];
  if (!s.cat && kinds.length) {
    const k = two(kinds);
    happening.push({ key: "kinds", icon: "chart", tone: "info", en: say`Most reported: ${k.en}.`, ta: say`அதிகம் பதிவானவை: ${k.ta}.`,
      open: { k: "list", preset: { cat: kinds[0].cat, sort: "sev", dir: 1 }, title: kinds[0].label }, act: "Open the list" });
  }
  if (!s.zone && zones.length) {
    const z = two(zones.map((x) => ({ label: x.name, n: x.n, prev: x.prev })));
    happening.push({ key: "zones", icon: "pin", tone: "info", en: say`Most from: ${z.en}.`, ta: say`அதிகம் வந்தவை: ${z.ta}.`,
      open: { k: "zone", zone: zones[0].zone }, act: "Show only this zone" });
  } else if (s.zone && !s.dept && f.depts.length) {
    const d = [...f.depts].sort((a, b) => b.n - a.n).slice(0, 2);
    happening.push({ key: "depts", icon: "gov", tone: "info", en: say`Mostly for: ${nm(d[0].name)} ${d[0].n}${d[1] ? say`, ${nm(d[1].name)} ${d[1].n}` : ""}.`,
      ta: say`அதிகம் பெற்ற துறை: ${nm(d[0].name)} ${d[0].n}${d[1] ? say`, ${nm(d[1].name)} ${d[1].n}` : ""}.`, open: { k: "dept", code: d[0].code }, act: "Open the department's summary" });
  }
  // the worst incident is named with its own toll, so one headline never seems to carry every death
  const worst = f.fatal && f.fatal.dead < f.deaths ? f.fatal.dead : null;
  // not said here when it is the case "What needs you" leads with
  if (f.deaths && f.fatal && f.fatal.id !== f.cases[0]?.id) happening.push({ key: "lives", icon: "alert", tone: "sev",
    en: say`${f.deaths} ${f.deaths === 1 ? "death" : "deaths"} reported${worst ? (worst > 1 ? `; the worst (${fmt(worst)})` : ", among them") : ""}: ${nm(short(f.fatal.title))}.`,
    ta: say`${f.deaths} உயிரிழப்பு${worst ? (worst > 1 ? `; அதிகம் (${fmt(worst)})` : "; அவற்றில்") : ""}: ${nm(short(f.fatal.title))}.`,
    open: { k: "inc", id: f.fatal.id }, act: "Open the case" });
  const weather = whole ? weatherPoint(f) : null;
  if (weather) happening.push(weather);
  // in Tamil, a story with a Tamil report is named by its Tamil headline as published, not by the English one translated back (Tamil
  // letters take two or three characters each: 96 is about as long on screen as 56 English ones)
  if (f.news) happening.push({ key: "news", icon: "news", tone: f.news.act ? "high" : "info",
    en: say`In the news${f.news.act ? " (needs action)" : ""}: ${nm(short(f.news.title, 56))}${f.news.outlets > 1 ? ` (${fmt(f.news.outlets)} outlets)` : ""}.`,
    ta: say`செய்தியில்${f.news.act ? " (நடவடிக்கை தேவை)" : ""}: ${f.news.ta?.trim() ? raw(short(f.news.ta, 96)) : nm(short(f.news.title, 56))}${f.news.outlets > 1 ? ` (${fmt(f.news.outlets)} ஊடகங்கள்)` : ""}.`,
    open: { k: "news", key: f.news.key }, act: "Read the story" });
  if (f.story) happening.push({ key: "story", icon: "pulse", tone: "info",
    en: say`Still developing: ${nm(short(f.story.title))} (${f.story.events} events).`, ta: say`தொடரும் செய்தி: ${nm(short(f.story.title))} (${f.story.events} நிகழ்வுகள்).`,
    open: { k: "story", id: f.story.id }, act: "Open the story" });
  if (f.rise) happening.push({ key: "rise", icon: "line", tone: "high",
    en: say`Unusual rise: ${nm(f.rise.label)}${f.rise.zoneName ? say` in ${nm(f.rise.zoneName)}` : ""}, ${f.rise.n} reports${f.rise.times ? (f.rise.times >= 20 ? ", far above the usual" : `, about ${Math.round(f.rise.times)} times the usual`) : ""}.`,
    ta: say`அசாதாரண உயர்வு: ${nm(f.rise.label)}${f.rise.zoneName ? say`, ${nm(f.rise.zoneName)}` : ""}, ${f.rise.n} பதிவுகள்${f.rise.times ? (f.rise.times >= 20 ? ", வழக்கத்தை விட மிக அதிகம்" : `, வழக்கத்தை விட சுமார் ${Math.round(f.rise.times)} மடங்கு`) : ""}.`,
    open: { k: "rise", cat: f.rise.cat, zone: f.rise.zone, date: f.rise.date }, act: "See what happened" });

  // ---- what needs you
  const needs: GlancePoint[] = [];
  const top = f.cases[0] ?? null;
  if (top) needs.push({ key: "case", icon: "alert", tone: "sev",
    en: say`Most serious open case: ${nm(short(top.title))}${at(top.title, top.zone)}${top.dead ? `, ${fmt(top.dead)} dead` : ""}.`,
    ta: say`மிகத் தீவிரம்: ${nm(short(top.title))}${at(top.title, top.zone)}${top.dead ? `, உயிரிழப்பு ${fmt(top.dead)}` : ""}.`,
    open: { k: "inc", id: top.id }, act: "Open the case" });
  if (f.awaiting) needs.push({ key: "awaiting", icon: "checkc", tone: "ok",
    en: say`${f.awaiting} finished ${f.awaiting === 1 ? "work waits" : "works wait"} for your check in My tasks.`, ta: say`${f.awaiting} முடிந்த பணிகள் உங்கள் சரிபார்ப்புக்கு.`,
    open: { k: "list", preset: { status: "awaiting" }, title: "Awaiting your verification" }, act: "Open the list" });
  if (f.overdue) {
    const d = [...f.depts].filter((x) => x.overdue > 0).sort((a, b) => b.overdue - a.overdue)[0];
    needs.push({ key: "overdue", icon: "clock", tone: "high",
      en: say`${f.overdue} open ${f.overdue === 1 ? "case is" : "cases are"} past deadline${d && !s.dept ? say`, most with ${nm(d.name)} (${d.overdue})` : ""}.`,
      ta: say`${f.overdue} காலக்கெடு தாண்டியவை${d && !s.dept ? say`; அதிகம் ${nm(d.name)} (${d.overdue})` : ""}.`,
      open: { k: "list", preset: { status: "overdue", sort: "sev", dir: 1 }, title: "Open and past deadline" }, act: "Open the list" });
  }
  // any date: said so, for it is the one figure here that is not the period's (the Overview's tile of the same name)
  if (f.unchecked) needs.push({ key: "unchecked", icon: "shield", tone: "sev",
    en: say`${f.unchecked} severe ${f.unchecked === 1 ? "case" : "cases"} of any date not yet checked on the ground.`, ta: say`${f.unchecked} கடுமையானவை (எந்தத் தேதியும்) இன்னும் சரிபார்க்கப்படவில்லை.`,
    open: { k: "list", preset: { status: "critical", scope: "all" }, title: "Severe, not yet checked" }, act: "Open the list" });
  if (f.differ) needs.push({ key: "differ", icon: "compare", tone: "high",
    en: say`News outlets disagree in ${f.differ.n} ${f.differ.n === 1 ? "story" : "stories"}: ${nm(f.differ.field)}, ${nm(short(f.differ.title, 60))}.`,
    ta: say`${f.differ.n} செய்திகளில் ஊடகங்கள் முரண்படுகின்றன: ${nm(f.differ.field)}, ${nm(short(f.differ.title, 60))}.`, open: { k: "differ" }, act: "See what each says" });
  if (f.newsOnly?.n) needs.push({ key: "newsonly", icon: "news", tone: "info",
    en: say`${f.newsOnly.n} ${f.newsOnly.n === 1 ? "incident is" : "incidents are"} only in the news, with no department record.`, ta: say`${f.newsOnly.n} நிகழ்வுகள் செய்தியில் மட்டும்; துறைப் பதிவு இல்லை.`,
    open: { k: "gaps" }, act: "Open the list" });

  // ---- what to do next: who does what, each opening where it is done
  const next: GlancePoint[] = [];
  if (whole && f.warning?.rain) next.push({ key: "prepare", icon: "cloud", tone: "high",
    en: say`Send the before-rain jobs (drains, pumps, relief) to the departments.`, ta: say`மழைக்கு முன் பணிகளைத் துறைகளுக்கு அனுப்புங்கள்.`, open: { k: "rain" }, act: "Open Rain & flooding" });
  const todo = f.cases.find((x) => !x.acted && x.deptName) ?? null;
  if (todo) next.push({ key: "instruct", icon: "send", tone: "sev",
    en: say`Instruct ${nm(todo.deptName)} on the ${nm(todo.type.toLowerCase())} case at ${nm(todo.loc ?? todo.zone ?? "Chennai")}.`,
    ta: say`${nm(todo.deptName)}: ${nm(todo.loc ?? todo.zone ?? "Chennai")} (${nm(todo.type)}) குறித்து அறிவுறுத்துங்கள்.`,
    open: todo.sev === "Severe" ? { k: "act", id: todo.id } : { k: "inc", id: todo.id }, act: todo.sev === "Severe" ? "Take action" : "Open the case" });
  const late = [...f.depts].filter((x) => x.overdue > 0).sort((a, b) => b.overdue - a.overdue)[0];
  if (late) next.push({ key: "clear", icon: "clock", tone: "high",
    en: say`Ask ${nm(late.name)} to close ${late.overdue} overdue ${late.overdue === 1 ? "case" : "cases"}.`, ta: say`${nm(late.name)}: தாமதமான ${late.overdue} நிகழ்வுகளை முடிக்கச் சொல்லுங்கள்.`,
    open: { k: "list", preset: { status: "overdue", dept: late.code, sort: "sev", dir: 1 }, title: `${late.name}: open and past deadline` }, act: "Open the list" });
  if (f.awaiting) next.push({ key: "verify", icon: "checkc", tone: "ok",
    en: say`Verify or send back the ${f.awaiting} finished ${f.awaiting === 1 ? "work" : "works"}.`, ta: say`${f.awaiting} முடிந்த பணிகளைச் சரிபார்க்கவும்.`,
    open: { k: "list", preset: { status: "awaiting" }, title: "Awaiting your verification" }, act: "Open the list" });
  if (f.newsOnly?.n && f.newsOnly.deptName && f.newsOnly.deptN) next.push({ key: "pass", icon: "gov", tone: "info",
    en: say`Ask ${nm(f.newsOnly.deptName)} to record its ${f.newsOnly.deptN} ${f.newsOnly.deptN === 1 ? "incident" : "incidents"} that ${f.newsOnly.deptN === 1 ? "is" : "are"} only in the news.`, ta: say`${nm(f.newsOnly.deptName)}: செய்தியில் மட்டும் உள்ள ${f.newsOnly.deptN} நிகழ்வுகளைப் பதிவு செய்யச் சொல்லுங்கள்.`,
    open: { k: "gaps" }, act: "Open the list" });
  if (f.differ) next.push({ key: "confirm", icon: "compare", tone: "info",
    en: say`Confirm the disputed ${nm(f.differ.field.toLowerCase())} before quoting it.`, ta: say`முரண்படும் ${nm(f.differ.field)} விவரத்தை மேற்கோள் காட்டும் முன் உறுதிப்படுத்துங்கள்.`, open: { k: "differ" }, act: "See what each says" });
  if (f.rise) next.push({ key: "rising", icon: "line", tone: "info",
    en: say`Find why ${nm(f.rise.label)} is rising${f.rise.zoneName ? say` in ${nm(f.rise.zoneName)}` : ""}.`, ta: say`${nm(f.rise.label)}${f.rise.zoneName ? say` (${nm(f.rise.zoneName)})` : ""} ஏன் உயர்கிறது எனக் கண்டறியுங்கள்.`,
    open: { k: "rise", cat: f.rise.cat, zone: f.rise.zone, date: f.rise.date }, act: "See what happened" });

  return { empty, situation, figures, happening: pickHappening(happening), needs: needs.slice(0, GROUP_MAX), next: next.slice(0, GROUP_MAX) };
}

/** At most four. When lives, weather and news all have a point, the kinds and the areas are said in one, so none of those is dropped. */
function pickHappening(all: GlancePoint[]): GlancePoint[] {
  const must = all.filter((x) => ["lives", "weather", "news"].includes(x.key)).length;
  const k = all[0]?.key === "kinds" ? all[0] : null, z = k && all[1]?.key === "zones" ? all[1] : null;
  if (must === 3 && k && z) {
    const join = (a: Seg[], b: Seg[]) => say`${a} ${b}`;
    return [{ ...k, en: join(k.en, z.en), ta: join(k.ta, z.ta) }, ...all.slice(2)].slice(0, GROUP_MAX);
  }
  return all.slice(0, GROUP_MAX);
}

/** The district's weather, air or water, only when it matters: a warning, heavy rain, poor air, or reservoirs low or near full. */
function weatherPoint(f: GlanceIn): GlancePoint | null {
  const says = { agree: ["IMD and the news agree", "IMD, செய்திகள் ஒத்துப்போகின்றன"], news_only: ["in the news only, no official warning", "செய்தியில் மட்டும்; அதிகாரப்பூர்வ எச்சரிக்கை இல்லை"],
    official_only: ["an official warning", "அதிகாரப்பூர்வ எச்சரிக்கை"], disagree: ["the sources differ", "மூலங்கள் முரண்படுகின்றன"] }[f.warning?.agreement ?? ""];
  if (f.warning) return { key: "weather", icon: "cloud", tone: "high", en: say`Weather: ${nm(f.warning.title)}${says ? `; ${says[0]}` : ""}.`, ta: say`வானிலை: ${nm(f.warning.title)}${says ? `; ${says[1]}` : ""}.`,
    open: { k: "rain" }, act: "Open Rain & flooding" };
  const e = f.env;
  if (!e) return null;
  if (e.rainMm != null && e.rainMm >= 15.6) return { key: "weather", icon: "cloud", tone: "high", en: say`Rain: ${e.rainMm} mm in 24 hours (district average).`, ta: say`மழை: 24 மணி நேரத்தில் ${e.rainMm} மி.மீ. (மாவட்ட சராசரி).`,
    open: { k: "page", page: "environment" }, act: "Open Environment" };
  if (e.aqi != null && e.aqi > 200) return { key: "weather", icon: "wind", tone: "high", en: say`Air quality is poor: AQI ${Math.round(e.aqi)} (district average).`, ta: say`காற்றின் தரம் மோசம்: AQI ${Math.round(e.aqi)} (மாவட்ட சராசரி).`,
    open: { k: "page", page: "environment" }, act: "Open Environment" };
  if (e.lakesPct != null && (e.lakesPct < 30 || e.lakesPct >= 92)) return { key: "weather", icon: "drop", tone: "high",
    en: say`Drinking-water reservoirs are ${e.lakesPct}% full${e.lakesPct >= 92 ? ": watch for surplus release" : ": low storage"}.`, ta: say`குடிநீர் நீர்த்தேக்கங்கள் ${e.lakesPct}% நிரம்பியுள்ளன${e.lakesPct >= 92 ? ": உபரி நீர் திறப்பைக் கவனியுங்கள்" : ": இருப்பு குறைவு"}.`,
    open: { k: "page", page: "environment" }, act: "Open Environment" };
  return null;
}

/** Every number a glance states (its figures and its points'): what an AI wording of it may use. */
export function glanceNumbers(g: Glance): number[] {
  const texts = [g.situation.en, ...[...g.happening, ...g.needs, ...g.next].map((x) => x.en)].map(plain).join(" ");
  return [...g.figures.flatMap((x) => [x.v, x.prev ?? x.v]), ...(texts.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, "")))];
}
