/**
 * Developing stories, cleaned up for the Collector. threads.ts follows news reports of one event over days, by rules; on its own it
 * shows the same event as several stories and reads steps from words ("cardiac arrest" as an arrest, 24 Nov). Here:
 *
 *   1. Routine repeats are dropped by rules (prices, forecasts, event listings, schedules), and everything the news desk left out
 *      (newsdesk.ts) never enters a thread.
 *   2. An AI pass reads every kept headline of the window (14 to 30 days) and finds the matters on which different things happened,
 *      with all their reports. Word matching could not: it missed the fishermen's strike and the sanitation workers' pay, and joined a
 *      couple found dead to a garbage smell. It reads the WHOLE window, once per build, so a story seen in today's view keeps its
 *      beginning from last week (a day's view used to start the Kolathur story at the by-election talk, without the MLA's death).
 *   3. Near-identical headlines are folded into one step.
 *   4. For each story an AI writes ONE timeline: each event once, in order, with every outlet that reported it. Reports that say the
 *      same thing again are attached to their event, never listed again; speculation and reactions are not events; reports of another
 *      event are put out. Then one line on where it stands.
 *   5. Everything it wrote is checked by code: an event points at real reports; each report is in one event; a label (Arrested,
 *      Died, Court...) must be what the event's own reports say, read through idioms.plainEvents; a figure must be in the reports; two
 *      events that say the same thing are one.
 *
 * Without a model the rules' own short timeline is shown in the same form. Results are kept until a story's reports change.
 */
import fs from "fs";
import path from "path";
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import intelPool from "@/lib/collector/db";
import { aiStatus } from "@/lib/ai/gateway";
import { aiJson } from "@/lib/collector/aibrief";
import { when } from "@/lib/collector/analysis";
import { numbersHold } from "@/lib/collector/numbers";
import { STAGES, allThreads, newsUnits, stageOf, threadOf, tokens, type Thread, type ThreadScope, type ThreadStep, type Unit } from "@/lib/collector/threads";
import { deskOf, headOf } from "@/lib/collector/deskbook";
import { plainEvents } from "@/lib/collector/idioms";
import { syncEpoch } from "@/lib/collector/epoch";
import { keepStories, type StoryDay } from "@/lib/collector/daynews";
import { dayKey, istClock } from "@/lib/period/day";

export interface EventSource { publisher: string; url: string | null; t: string; title: string }
/** one thing that happened, once, with everyone who reported it */
export interface Milestone {
  t: string; label: string; what: string;
  /** the first report of it */
  title: string; publisher: string | null; url: string | null; incident: string | null;
  /** every outlet that reported this event, the first to do so first */
  sources: EventSource[];
  /** how many reports carried it */
  reports: number;
}
export type StoryStatus = "ongoing" | "waiting" | "settled";
export interface Story extends Thread {
  /** the timeline: each event once, in order; written by AI, or by the rules when no model answered */
  events: Milestone[];
  /** where it stands (AI); null when no model answered */
  ai: { now: string; status: StoryStatus } | null;
  /** how many of the rules' stories were joined into this one */
  merged: number;
  /** reports folded into another step because they said the same thing */
  folded: number;
  /** the AI's order: the most important to the Collector first */
  rank: number;
}

/** News that repeats by nature: it is published again every day, it does not develop. */
const ROUTINE = new RegExp([
  "\\b(gold|silver)\\s+(price|rate)", "\\bpetrol\\b", "\\bdiesel\\b", "fuel price", "weather (forecast|update|news)", "forecast (for|&) today",
  "today'?s (weather|price|rate)", "rasi ?palan", "horoscope", "panchang", "\\bchennai events?\\b", "events? in chennai", "tickets? (go |went )?on sale",
  "vegetable (prices?|rates?)", "power (cut|shutdown)", "shutdown areas", "\\bevent \\d{1,2}[/.]\\d{1,2}", "things to do", "this weekend", "rain (alert|update)",
  "(heavy|moderate) rain (likely|expected|possible|in \\d+ districts|for \\d+ districts)", "chance of (heavy |moderate |light )?rain", "rains? (is |are )?(likely|expected|forecast|set to|to return|to continue|will)",
  "rain (warning|alert|update|forecast)", "(heavy|widespread|moderate) rain\\b.*\\b(tomorrow|today|till|until|districts|next \\d+)", "service timing", "schedule change", "timings? (change|revised)", "cases? (are )?(being heard|listed)", "which cases",
  "தங்கம் விலை", "பெட்ரோல்", "டீசல்", "மின்தடை", "வானிலை அறிக்கை"
].join("|"), "i");

export const routine = (t: Thread) => {
  const steps = t.days.flatMap((d) => d.steps);
  return ROUTINE.test(t.title) || steps.filter((s) => ROUTINE.test(s.title) || ROUTINE.test(s.original ?? "")).length >= steps.length / 2;
};

// ------------------------------------------------------------- folding --

const jaccard = (a: Set<string>, b: Set<string>) => {
  let x = 0;
  for (const k of a) if (b.has(k)) x++;
  return x / Math.max(1, a.size + b.size - x);
};

type Folded = ThreadStep & { similar: number };

/** Steps in time order, each headline once; a headline saying what an earlier one said (same stage) folds into it. */
export function fold(steps: ThreadStep[]): { steps: Folded[]; folded: number } {
  const out: (Folded & { tk: Set<string> })[] = [];
  let folded = 0;
  for (const s of [...steps].sort((a, b) => a.t.localeCompare(b.t))) {
    const tk = new Set(tokens(s.title));
    const same = out.find((o) => o.title.toLowerCase() === s.title.toLowerCase() ||
      (o.stage === s.stage && tk.size >= 3 && jaccard(o.tk, tk) >= 0.6));
    if (same) {
      folded++;
      same.similar++;
      for (const p of [s.publisher, ...s.also]) if (p && p !== same.publisher && !same.also.includes(p)) same.also.push(p);
      same.also_src = [...(same.also_src ?? []), ...(s.publisher ? [{ publisher: s.publisher, url: s.url, t: s.t, title: s.title }] : []), ...(s.also_src ?? [])];
      same.incident ??= s.incident;
      continue;
    }
    out.push({ ...s, also: [...s.also], also_src: [...(s.also_src ?? [])], similar: 0, tk });
  }
  return { steps: out.map(({ tk: _tk, ...s }) => s), folded };
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const flat = (s: Pick<Thread, "days">) => s.days.flatMap((d) => d.steps) as Folded[];

/** Every outlet behind these steps, each once, the earliest report of each. */
function sourcesOf(steps: Folded[]): EventSource[] {
  const all = steps.flatMap((s) => [...(s.publisher ? [{ publisher: s.publisher, url: s.url, t: s.t, title: s.title }] : []), ...(s.also_src ?? []),
    ...s.also.filter((p) => !(s.also_src ?? []).some((x) => x.publisher === p)).map((p) => ({ publisher: p, url: null, t: s.t, title: s.title }))]);
  const out = new Map<string, EventSource>();
  for (const x of all.sort((a, b) => a.t.localeCompare(b.t) || Number(!a.url) - Number(!b.url))) {
    const had = out.get(x.publisher);
    if (!had) out.set(x.publisher, x);
    else if (!had.url && x.url) had.url = x.url;
  }
  return [...out.values()];
}
const msOf = (t: string) => Date.parse(t.replace(" ", "T") + "+05:30");
/**
 * When an event was first reported: the earliest report, unless it stands alone long before the rest. An outlet's page sometimes carries
 * yesterday's date (a death on the 19th dated the 18th): with four outlets or more, the time is where at least half of them report it.
 */
export function firstReported(times: string[]): string {
  const t = [...times].sort();
  if (t.length < 4) return t[0];
  const start = t.findIndex((x) => t.filter((y) => msOf(y) >= msOf(x) && msOf(y) - msOf(x) <= 8 * 3600_000).length >= t.length / 2);
  return start > 0 && msOf(t[start]) - msOf(t[0]) > 12 * 3600_000 ? t[start] : t[0];
}
const eventOf = (steps: Folded[], label: string, what: string): Milestone => {
  const all = sourcesOf(steps);
  const at = firstReported(all.length ? all.map((x) => x.t) : steps.map((s) => s.t));
  const sources = [...all.filter((x) => x.t >= at), ...all.filter((x) => x.t < at)];
  const first = [...steps].sort((a, b) => Number(a.t < at) - Number(b.t < at) || a.t.localeCompare(b.t))[0];
  return { t: at, label, what, title: first.title, publisher: sources[0]?.publisher ?? first.publisher, url: sources[0]?.url ?? first.url,
    incident: steps.find((s) => s.incident)?.incident ?? null, sources, reports: steps.reduce((a, s) => a + 1 + s.similar, 0) };
};

/**
 * The timeline by rules, shown until the AI's: the first report, then each step of a new kind, at most one of a kind; the latest report
 * last when it says something else.
 */
export function ruleEvents(steps: Folded[]): Milestone[] {
  const out: { s: Folded; tk: Set<string>; stage: string }[] = [];
  steps.forEach((s, k) => {
    const tk = new Set(tokens(s.title));
    const stage = stageOf(s.original ? `${s.title} ${s.original}` : s.title);
    const last = k === steps.length - 1;
    const said = out.some((o) => jaccard(o.tk, tk) >= 0.45);
    // a step of a new kind is an event even when its headline tells the first one again ("contractor arrested after wall collapse kills two")
    if (k === 0 || (stage !== "Update" && !out.some((o) => o.stage === stage)) || (last && !said && out.length < 5 && s.t.slice(0, 10) !== out[out.length - 1].s.t.slice(0, 10)))
      out.push({ s, tk, stage });
  });
  return out.slice(0, 6).map((o) => eventOf([o.s], o.stage === "Update" ? "Report" : o.stage, o.s.title));
}

/** One story from one or more of the rules' stories. */
function merge(ts: Thread[], title: string | null): Story {
  const all = ts.flatMap((t) => t.days.flatMap((d) => d.steps));
  const { steps, folded } = fold(all);
  // a copy: the threads' own steps are shared with the rules' stories built alongside
  const days: Thread["days"] = [];
  for (const s of steps) {
    const day = s.t.slice(0, 10);
    const g = days[days.length - 1];
    if (g && g.day === day) g.steps.push(s);
    else days.push({ day, steps: [s] });
  }
  const stages: Thread["stages"] = [];
  for (const s of steps.slice(1)) if (s.stage !== "Update" && s.stage !== "First report" && !stages.some((x) => x.stage === s.stage)) stages.push({ stage: s.stage, t: s.t });
  const big = [...ts].sort((a, b) => b.reports - a.reports)[0];
  const first = steps[0]?.t ?? big.first, last = steps[steps.length - 1]?.t ?? big.last;
  const latestInc = [...ts].sort((a, b) => b.last.localeCompare(a.last)).find((t) => t.sev);
  return {
    ...big,
    id: ts.map((t) => t.id).sort()[0],
    title: title ?? big.title,
    place: big.place ?? ts.find((t) => t.place)?.place ?? null,
    zones: uniq(ts.flatMap((t) => t.zones)), depts: uniq(ts.flatMap((t) => t.depts)), taluks: uniq(ts.flatMap((t) => t.taluks)),
    incidents: uniq(ts.flatMap((t) => t.incidents)),
    sev: latestInc?.sev ?? null, open: latestInc ? latestInc.open : null,
    first, last, hours: Math.round((Date.parse(last.replace(" ", "T")) - Date.parse(first.replace(" ", "T"))) / 3.6e6),
    reports: ts.reduce((a, t) => a + t.reports, 0), outlets: uniq(ts.flatMap((t) => t.outlets)), added: ts.reduce((a, t) => a + t.added, 0),
    stages, days, latest: steps[steps.length - 1] ?? big.latest,
    events: ruleEvents(steps), ai: null, merged: ts.length, folded, rank: 99
  };
}

// --------------------------------------------------------------- the AI --

const PickSchema = z.object({
  stories: z.array(z.object({
    title: z.string().describe("a plain headline for the whole story, at most 12 words"),
    reports: z.array(z.number()).describe("the number of every report about this story, also those days apart")
  })).describe("at most 20 stories, the most important to the Collector first")
});
const PICK_SYSTEM = `You keep the "stories still developing" list for the District Collector of Chennai. Below is every news report of the last days that the news
desk kept, oldest first: its number, date, area of work and headline. Find the stories that DEVELOPED.
A story is one real-world matter: a named person's death, one crime, one accident, one strike or protest, one project or service, one court case, one outbreak, one
seizure, one government decision. It developed when at least two DIFFERENT things happened on it at different times: an accident then arrests; a strike called then talks
then called off; a death then a complaint then the seat vacant; a pay cut then a petition then a court notice; a water shortage then a road block then supply restored;
works begun then finished; a closure then a reopening.
For each story list every report that belongs to it, wherever in the list it stands, including the first one and follow-ups under other names.
Not a story: the same announcement told by several outlets or repeated for days; a forecast, a service notice or a schedule; works or a drive that only go on; a tally
updated; comments, demands and reactions with nothing done; two events that only look alike (two accidents, two arrests, two drives in different places, two spells of
rain). Never join such look-alikes. A report may be in one story only. If a story has only one real step, leave it out.
title: the story as it stands, with the names in the headlines. No markdown.`;

const LineSchema = z.object({
  title: z.string().describe("the story as it stands, a plain headline of at most 12 words"),
  now: z.string().describe("one sentence, at most 25 words: where the story stands now"),
  status: z.enum(["ongoing", "waiting", "settled"]).describe("ongoing: still moving; waiting: a decision, report, result or date is awaited; settled: it is over"),
  events: z.array(z.object({
    first: z.number().describe("the S number of the earliest report of this event"),
    also: z.array(z.number()).describe("the S numbers of every other report that says the same event happened"),
    label: z.string().describe("1 to 3 words naming what happened: Died, Complaint filed, Funeral, Seat vacant, Arrested, Strike called off, Works begun"),
    what: z.string().describe("what happened, one plain sentence, at most 18 words")
  })).describe("1 to 6 events, oldest first, each a different thing that happened"),
  unrelated: z.array(z.number()).describe("the S numbers of reports that are about another event, not this story")
});
type LineT = z.infer<typeof LineSchema>;
const LINE_SYSTEM = `You write the timeline of ONE news story for the District Collector of Chennai, who will read it once and must not be misled. You get
the story's reports, oldest first (S numbers), each with its outlets and, when known, the first lines of the article.
An event is one thing that happened in the world, told once. First list in your mind what actually happened, in order; then give each
event its earliest report (first) and every other report of that same event (also).
- The same thing said again by another outlet, in other words, in Tamil, or a day later is the SAME event: put it in "also". Never two
  events that say the same.
- Not events, whoever does them: a condolence, tribute, visit or homage paid, praise, welcome, "hailed"; a question or speculation ("Will Stalin contest?"), a comment, condolence, reaction, criticism, demand, profile, video or
  explainer. Leave those reports out of every event, unless they changed what happens next (a complaint filed with the police, an order,
  a date fixed).
- Write what happened, never who reported it: not "outlets report", "a Tamil daily asks", "news says".
- An event is something a report told when it was new. What a report only recalls as background (admitted to hospital months ago, an earlier
  case, a history of demands) is not an event: its date would be wrong.
- What one announcement tells together is one event: a seizure and the arrests made in it, an inspection and the orders given at it.
- A fuller account of the same event (a suspension, then why they were suspended) is the same event: one entry, with the fuller facts.
- An official step is always its own event: a declaration, order, notice, court ruling, date fixed, case registered, service restored.
- Every event is about the story's own person, case, place or project. Another case under the same law, another accident, arrest or protest
  elsewhere only looks alike: its reports go in "unrelated".
- Read words by their meaning: "cardiac arrest" and "heart attack" are how a person died, never a police arrest or an attack; a meeting
  "held" is nobody held; "sit-in" is a protest; "civic body" is the Corporation. Use Arrested only when the police took a person.
- label: 1 to 3 words for what happened in that event, so that the labels alone read as the story: Admitted, Died, Complaint filed, Funeral,
  Seat vacant. Never First report, Update, Announced (unless something was announced) or News.
- what: past tense, at most 18 words: who did what, where. Names, places and figures only as the reports give them. No markdown.
now: where it stands, from the latest reports: what is settled and what is awaited. Do not speculate.
If nothing happened after the first event, give that one event only.`;

const CAP = 40;
/**
 * At most CAP steps of a story for the AI, so that no day and no kind of step is left out: the first and the last, the first of each kind
 * on each day, each day's last, then evenly spaced. (Taking the named steps from the start filled the list with one day's death reports,
 * and the seat declared vacant four days later was never read, 24 Nov.)
 */
export function sample<T extends { stage: string; t: string; title: string; original?: string | null }>(steps: T[]): number[] {
  if (steps.length <= CAP) return steps.map((_, k) => k);
  const pick = new Set<number>([0, steps.length - 1]);
  const add = (k: number) => { if (pick.size < CAP) pick.add(k); };
  const kinds = new Set<string>(), lastOf = new Map<string, number>();
  const want: number[] = [];
  steps.forEach((s, k) => {
    const day = s.t.slice(0, 10), key = `${day}|${stageOf(s.original ? `${s.title} ${s.original}` : s.title)}`;
    if (!kinds.has(key)) { kinds.add(key); want.push(k); }
    lastOf.set(day, k);
  });
  want.forEach(add);
  [...lastOf.values()].forEach(add);
  for (let k = 0; pick.size < CAP && k < 4 * CAP; k++) add(Math.round((k * (steps.length - 1)) / (4 * CAP - 1)));
  return [...pick].sort((a, b) => a - b);
}

/** The labels that would mislead if wrong (a person arrested, a person dead) and what the event's reports must say for them to stand. */
const CLAIMS: [RegExp, string][] = [
  [/\b(arrest\w*|held|detain\w*|custody|nabbed|remand\w*)\b/i, "Arrest"],
  [/\b(died?|dies|dead|deaths?|killed|passed away)\b/i, "Death"]
];
/** The label, if what it claims is in the event's own reports; else what the reports themselves say it is. */
export function soundLabel(label: string, reports: string): string {
  const l = label.replace(/\s+/g, " ").trim().slice(0, 26);
  const t = plainEvents(reports);
  for (const [re, stage] of CLAIMS) {
    if (!re.test(l)) continue;
    const want = STAGES.find(([k]) => k === stage)![1];
    if (!want.test(t)) { const s = stageOf(reports); return s === "Update" ? "Reported" : s; }
  }
  return !l || /^(update|news|first report)$/i.test(l) ? "Reported" : l;
}

const DIED = /\b(died?|dies|death|passed away)\b/i;
const clip = (t: string) => (t.length <= 130 ? t : `${t.slice(0, 127).replace(/[\s,;:.-]+\S*$/, "")}…`);

/** The AI's timeline checked against the story's own reports (pure: tested). Null when nothing sound is left. */
export function checkedEvents(o: Pick<LineT, "events" | "unrelated">, steps: (Pick<ThreadStep, "title" | "original" | "t"> & Partial<Folded>)[], shown: number[], excerpt: (k: number) => string = () => ""): { k: number[]; label: string; what: string }[] {
  // a figure is sound when the story's own reports give it: the age and the days in hospital are in one headline, the cremation in another
  const whole = shown.map((k) => [when(steps[k].t), steps[k].title, steps[k].original ?? "", excerpt(k)].join(" ")).join(" | ");
  const ok = new Set(shown), used = new Set<number>(), off = new Set(o.unrelated.map((x) => Math.round(x) - 1));
  const out: { k: number[]; label: string; what: string; tk: Set<string>; own: boolean }[] = [];
  for (const e of o.events) {
    // each report is in one event only, and an event stands on at least one report of its own; a report printed before the event's first
    // one cannot be of it (a petition about a patient's health, filed under his death the next day)
    const lead = Math.round(e.first) - 1, from = ok.has(lead) && !off.has(lead) && !used.has(lead) ? steps[lead].t : "";
    const ks = uniq([e.first, ...e.also].map((x) => Math.round(x) - 1)).filter((k) => ok.has(k) && !off.has(k) && !used.has(k) && steps[k].t >= from);
    if (!ks.length || !e.what.trim()) continue;
    ks.forEach((k) => used.add(k));
    ks.sort((a, b) => steps[a].t.localeCompare(steps[b].t));
    const said = ks.map((k) => [steps[k].title, steps[k].original ?? "", excerpt(k)].join(" ")).join(" \n ");
    // a figure no report gives: the report's own headline is shown instead
    const own = numbersHold(e.what, whole);
    const what = own ? e.what.replace(/\s+/g, " ").trim() : clip(headOf(steps[ks[0]].original ?? steps[ks[0]].title) || steps[ks[0]].title);
    const tk = new Set(tokens(what));
    const root = (l: string) => l.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter((w) => w.length > 3).map((w) => w.replace(/(ed|ing|s)$/, ""));
    const alike = (x: { label: string; tk: Set<string> }) => { const j = jaccard(x.tk, tk), r = root(x.label); return j >= 0.55 || (j >= 0.25 && root(e.label).some((w) => r.includes(w))); };
    const label = soundLabel(e.label, said);
    // one person dies once: two "Died" entries within three days, with no second victim in the words, are one
    const again = (x: { label: string; k: number[] }) => DIED.test(x.label) && DIED.test(label) && Math.abs(msOf(steps[x.k[0]].t) - msOf(steps[ks[0]].t)) <= 72 * 3600_000
      && !/\b(another|second|third|more|also|toll|rises?|too)\b/i.test(e.what);
    const twin = out.find((x) => alike(x) || again(x));
    if (twin) {
      twin.k.push(...ks);
      // the AI's own sentence over a report's headline
      if (!twin.own && own) Object.assign(twin, { what, tk, own, label });
      continue;
    }
    out.push({ k: ks, label, what, tk, own });
  }
  return out.map(({ tk: _tk, own: _own, ...x }) => x).sort((a, b) => steps[a.k[0]].t.localeCompare(steps[b.k[0]].t));
}

async function excerpts(ids: string[]): Promise<Map<string, string>> {
  const want = uniq(ids.filter((x) => !x.startsWith("item-")));
  const out = new Map<string, string>();
  for (let k = 0; k < want.length; k += 400) {
    const [r] = await intelPool.query<RowDataPacket[]>(`SELECT doc_id AS id, title, SUBSTR(COALESCE(NULLIF(body, ''), summary, ''), 1, 420) AS x FROM documents WHERE doc_id IN (?)`, [want.slice(k, k + 400)]);
    for (const d of r as { id: string; title: string; x: string }[]) {
      const t = String(d.x ?? "").replace(/\s+/g, " ").trim();
      // a body that only repeats the headline adds nothing
      if (t.length > 70 && t.slice(0, 50).toLowerCase() !== String(d.title).slice(0, 50).toLowerCase()) out.set(String(d.id), t.slice(0, 230));
    }
  }
  return out;
}

/** Writes one story's timeline. False when it did not develop after all. */
async function timeline(s: Story, text: Map<string, string>, user: string): Promise<boolean | null> {
  const steps = flat(s);
  const shown = sample(steps);
  const ex = (k: number) => (steps[k].doc ? text.get(steps[k].doc!) ?? "" : "");
  const facts = [`STORY: ${s.title} (${when(s.first)} to ${when(s.last)}, ${s.reports} reports, ${s.outlets.length} outlets)`,
    ...shown.map((j) => {
      const st = steps[j];
      const who = [st.publisher ?? "news", ...st.also].slice(0, 4).join(", ");
      return `S${j + 1} | ${when(st.t)} | ${who}${st.similar ? ` (+${st.similar} saying the same)` : ""} | ${st.title}${st.original ? ` | ${st.original.slice(0, 120)}` : ""}${ex(j) ? `\n     ${ex(j)}` : ""}`;
    })].join("\n");
  const r = await aiJson({ kind: "story-line6", system: LINE_SYSTEM, facts, schema: LineSchema, user, maxOutputTokens: 1800, temperature: 0, timeoutMs: 75_000,
    // figures are checked event by event, against the event's own reports
    text: () => "", ok: (o) => o.events.length >= 1 });
  if (!r) return null;
  const ev = checkedEvents(r.o, steps, shown, ex);
  if (ev.length < 2) return false;
  s.events = ev.map((e) => eventOf(e.k.map((k) => steps[k]), e.label, e.what)).sort((a, b) => a.t.localeCompare(b.t));
  const all = steps.map((x, k) => `${x.title} ${ex(k)}`).join(" ");
  const title = r.o.title.replace(/\s+/g, " ").trim();
  if (title.length > 12 && title.length < 140 && numbersHold(title, all)) s.title = title;
  s.ai = { now: numbersHold(r.o.now, all) ? r.o.now.replace(/\s+/g, " ").trim() : ev[ev.length - 1].what, status: r.o.status };
  const off = new Set(r.o.unrelated.map((x) => Math.round(x) - 1).filter((k) => shown.includes(k)));
  if (off.size) {
    // reports of another event leave the story, and its span and counts with them
    const keep = steps.filter((_, k) => !off.has(k));
    if (keep.length) {
      s.days = keep.reduce<Thread["days"]>((a, x) => { const d = x.t.slice(0, 10), g = a[a.length - 1]; if (g && g.day === d) g.steps.push(x); else a.push({ day: d, steps: [x] }); return a; }, []);
      s.first = keep[0].t; s.last = keep[keep.length - 1].t; s.latest = keep[keep.length - 1];
      s.reports = keep.reduce((a, x) => a + 1 + x.similar, 0);
      s.outlets = sourcesOf(keep).map((x) => x.publisher);
      s.hours = Math.round((Date.parse(s.last.replace(" ", "T")) - Date.parse(s.first.replace(" ", "T"))) / 3.6e6);
    }
  }
  return true;
}

const V = 12;
/** stories the AI writes a timeline for (the list shows no more than it can explain) */
const EXPLAIN = 24;
/** reports the AI reads to find the stories: the newest of the window */
const READ = 900;

export interface Stories { days: number; total: number; threads: Story[]; /** a model joined and explained them */ ai: boolean; /** the model is still at work: ask again shortly */ pending: boolean }
interface Whole { at: number; list: Story[]; ai: boolean }
declare global {
  // eslint-disable-next-line no-var
  var __stories2: Map<string, Whole> | undefined;
  // eslint-disable-next-line no-var
  var __storyJobs2: Map<string, Promise<Whole | null>> | undefined;
  // eslint-disable-next-line no-var
  var __storyFails: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __storyLast: { days: number; w: Whole } | null | undefined;
}

/** The last list a model made, for a restart or an hour without one. Unit tests and probes keep it in memory only. */
const LAST_FILE = process.env.STORIES_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "stories-last.json"));
const LAST_HOURS = 36;
function lastList(): { days: number; w: Whole } | null {
  if (global.__storyLast === undefined) {
    try { const j = LAST_FILE ? JSON.parse(fs.readFileSync(LAST_FILE, "utf8")) : null; global.__storyLast = j?.v === V ? { days: j.days, w: { at: j.at, list: j.list, ai: true } } : null; }
    catch { global.__storyLast = null; }
  }
  return global.__storyLast ?? null;
}
function keepLast(days: number, w: Whole): void {
  global.__storyLast = { days, w };
  if (!LAST_FILE) return;
  try { fs.mkdirSync(path.dirname(LAST_FILE), { recursive: true }); fs.writeFileSync(LAST_FILE, JSON.stringify({ v: V, days, at: w.at, list: w.list })); } catch { /* read-only disk: memory only */ }
}

// 26 Nov: the model picks the stories again whenever a report joins, and could leave out one the Collector had seen an hour before: the day's
// own stories stay until the day rolls over (daynews.ts keepStories), kept on disk for a restart
declare global {
  // eslint-disable-next-line no-var
  var __storyDay: StoryDay<Story> | null | undefined;
}
const DAY_FILE = process.env.STORIES_DAY_FILE || (process.env.VITEST ? null : path.join(process.cwd(), "data", "aws-cache", "stories-day.json"));
function dayStories(): StoryDay<Story> | undefined {
  if (global.__storyDay === undefined) {
    try { const j = DAY_FILE ? JSON.parse(fs.readFileSync(DAY_FILE, "utf8")) : null; global.__storyDay = j?.v === V ? { day: j.day, items: new Map((j.items as Story[]).map((s) => [s.id, s])) } : null; }
    catch { global.__storyDay = null; }
  }
  return global.__storyDay ?? undefined;
}
/** a story's reports, the same in two builds: their addresses, else their ids */
const reportsIn = (s: Story): string[] => flat(s).flatMap((x) => [x.url, x.doc].filter((v): v is string => !!v));
function withDay(w: Whole, now: string): Story[] {
  // (only for the day it is: a probe of another day reads the list as it is)
  if (!process.env.VITEST && dayKey(now) !== dayKey(istClock())) return w.list;
  const k = keepStories(dayStories(), w.list, reportsIn, now, w.ai);
  global.__storyDay = k.bag;
  if (k.changed && DAY_FILE) try { fs.mkdirSync(path.dirname(DAY_FILE), { recursive: true }); fs.writeFileSync(DAY_FILE, JSON.stringify({ v: V, day: k.bag.day, items: [...k.bag.items.values()] })); } catch { /* read-only disk: memory only */ }
  return k.list;
}

/** The scope's own stories out of the whole window's. */
function scoped(list: Story[], s: ThreadScope): Story[] {
  const lastMove = (x: Story) => x.events[x.events.length - 1]?.t ?? x.last;
  return list.filter((t) => (!s.since || t.last >= s.since) && (!s.zone || t.zones.includes(s.zone)) && (!s.dept || t.depts.includes(s.dept)) && (!s.cat || t.cat === s.cat) &&
    (!s.taluk || t.taluks.includes(s.taluk)))
    // a story that is over stays only while its end is news
    .filter((t) => t.ai?.status !== "settled" || !s.since || lastMove(t) >= s.since)
    .sort((a, b) => lastMove(b).slice(0, 10).localeCompare(lastMove(a).slice(0, 10)) || Number(a.ai?.status === "settled") - Number(b.ai?.status === "settled") ||
      a.rank - b.rank || b.events.length - a.events.length || b.reports - a.reports || a.id.localeCompare(b.id));
}

/** The developing stories of the scope, joined, cleaned and explained. `ai` says whether a model did the joining. */
export async function stories(scope: ThreadScope, now: string, user: string): Promise<Stories> {
  // the whole window, whatever the scope; keyed on its different reports, so one more outlet repeating a headline asks for nothing.
  // Bump V when the prompts or rules here change.
  const base = await newsUnits(scope.hours, now);
  const units = base.units.filter((u) => !ROUTINE.test(u.title) && !ROUTINE.test(u.original ?? "")).slice(-READ);
  const key = `${V}|${base.days}|${units.length}|${units.length ? units[0].docs[0].id : ""}|${units.slice(-60).map((u) => u.docs[0].id).join(",")}`;
  const kept = (global.__stories2 ??= new Map());
  syncEpoch(kept); // the stories carry whether each is still open: a decision empties them (RC-35)
  const memo = kept.get(key);
  const done = (w: Whole, pending: boolean): Stories => { const list = scoped(withDay(w, now), scope); return { days: base.days, total: list.length, threads: list, ai: w.ai, pending }; };
  if (memo && Date.now() - memo.at < 30 * 60_000) return done(memo, false);

  // The model's work runs in the background: a page waits at most WAIT_MS for it (remembered write-ups come back at once), else gets the
  // last list it made (or the rules' stories) now and the new one a moment later (`pending`: the page asks again).
  const jobs = (global.__storyJobs2 ??= new Map());
  const fails = (global.__storyFails ??= new Map());
  const resting = (fails.get(key) ?? 0) > Date.now();
  if (!jobs.has(key) && !resting) jobs.set(key, withAi(units, base.catLabel, user).then((w) => {
    if (w) { kept.set(key, w); if (w.list.length || units.length < 40) keepLast(base.days, w); while (kept.size > 8) kept.delete(kept.keys().next().value!); }
    else { fails.set(key, Date.now() + 60_000); while (fails.size > 20) fails.delete(fails.keys().next().value!); }
    return w;
  }).catch((e) => {
    console.warn(`[stories] ${(e as Error).message.slice(0, 200)}`);
    fails.set(key, Date.now() + 60_000);
    return null;
  }).finally(() => jobs.delete(key)));
  const job = jobs.get(key);
  const quick = job ? await Promise.race([job, new Promise<"late">((r) => setTimeout(() => r("late"), WAIT_MS))]) : null;
  if (quick && quick !== "late") return done(quick, false);
  // the list made an hour (or a restart) ago is far closer to the truth than the rules' one
  const last = lastList();
  if (last && Date.now() - last.w.at < LAST_HOURS * 3600_000) return done(last.w, quick === "late" || resting);
  const cand = (await allThreads(scope.hours, now)).threads.filter((t) => !routine(t));
  return done({ at: 0, list: cand.map((t) => merge([t], null)).filter((s) => s.events.length >= 2), ai: false }, quick === "late" || (resting && aiStatus().available));
}

const WAIT_MS = 1500;

/**
 * The reports the AI left out of a story that its own words claim ("T.N. Speaker declares Kolathur constituency vacant" for the Kolathur
 * MLA's death): they share words that are mostly this story's. The timeline step reads them and puts out what is another event.
 */
export function augment(ix: number[], units: Pick<Unit, "tk" | "docs">[], used: Set<number>, df: Map<string, number>): number[] {
  const count = new Map<string, number>();
  for (const x of ix) for (const w of units[x].tk) count.set(w, (count.get(w) ?? 0) + 1);
  const need = Math.max(2, 0.3 * ix.length);
  const own = new Map([...count].filter(([w, n]) => n >= need && n / (df.get(w) ?? n) >= 0.5).map(([w, n]) => [w, n / (df.get(w) ?? n)]));
  if (!own.size) return [];
  const t = ix.map((x) => units[x].docs[0].ms), from = Math.min(...t) - 3 * 864e5, to = Math.max(...t) + 5 * 864e5;
  const out: number[] = [];
  units.forEach((u, k) => {
    if (used.has(k) || u.docs[0].ms < from || u.docs[0].ms > to || out.length >= 14) return;
    const hits = [...u.tk].filter((w) => own.has(w));
    if (hits.length >= 2 || (hits.length === 1 && own.get(hits[0])! >= 0.6 && (count.get(hits[0]) ?? 0) >= Math.max(4, 0.5 * ix.length))) out.push(k);
  });
  return out;
}

async function withAi(units: Unit[], catLabel: Map<string, string>, user: string): Promise<Whole | null> {
  if (units.length < 2) return { at: Date.now(), list: [], ai: true };
  const facts = units.map((u, k) => `${k + 1} | ${when(u.t).split(",")[0]} | ${deskOf(u.docs[0].original ?? u.title, u.title)?.area || u.docs[0].cat || "-"} | ${u.title.slice(0, 170)}${u.docs.length > 1 ? ` (${u.docs.length} reports)` : ""}`).join("\n");
  const picked = await aiJson({ kind: "story-pick2", system: PICK_SYSTEM, temperature: 0, facts, schema: PickSchema, user, maxOutputTokens: 5000, timeoutMs: 120_000,
    text: () => "", ok: (o) => o.stories.length > 0 });
  if (!picked) return null;

  const used = new Set<number>();
  const df = new Map<string, number>();
  for (const u of units) for (const w of u.tk) df.set(w, (df.get(w) ?? 0) + 1);
  let list: Story[] = [];
  const groups = picked.o.stories.map((g) => {
    const ix = uniq(g.reports).map((x) => Math.round(x) - 1).filter((x) => units[x] && !used.has(x));
    ix.forEach((x) => used.add(x));
    return { title: g.title, ix };
  });
  for (const g of groups) {
    const ix = g.ix;
    if (!ix.length || (ix.length < 2 && units[ix[0]].docs.length < 2)) continue;
    const more = augment(ix, units, used, df);
    more.forEach((x) => { used.add(x); ix.push(x); });
    const docs = ix.flatMap((x) => units[x].docs).sort((a, b) => a.ms - b.ms);
    list.push({ ...merge([threadOf(docs, catLabel)], numbersHold(g.title, docs.map((d) => d.title).join(" ")) ? g.title.trim() || null : null), rank: list.length });
  }
  list = list.sort((a, b) => b.last.localeCompare(a.last) || b.reports - a.reports).slice(0, EXPLAIN);
  const text = await excerpts(list.flatMap((s) => flat(s).map((x) => x.doc ?? "")).filter(Boolean)).catch(() => new Map<string, string>());
  // three at a time: each is a small call, and the Collector's own questions share the model's per-minute allowance
  const keep = new Set<Story>();
  const queue = [...list];
  await Promise.all([0, 1, 2].map(async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const r = await timeline(s, text, user);
      // no answer: the rules' timeline, when it shows a development
      if (r === true || (r === null && s.events.length >= 2)) keep.add(s);
    }
  }));
  return { at: Date.now(), list: list.filter((s) => keep.has(s)), ai: true };
}
