/**
 * Developing stories, cleaned up for the Collector. threads.ts follows news reports of one event over days, by rules;
 * on its own it shows the same event as several stories (the PM's visit under four headlines) and routine news that
 * merely repeats (the day's gold rate, the weather forecast). Here:
 *
 *   1. Routine repeats are dropped by rules (prices, forecasts, event listings, schedules).
 *   2. An AI pass reads every story's headlines and joins the stories that are one real-world event, and keeps only
 *      those that actually developed (something new happened after the first report), with a plain title.
 *   3. Near-identical headlines are folded into one step ("+4 similar reports"), so the timeline shows change.
 *   4. A second AI pass picks, per story, the steps where something changed (announced, inaugurated, protest, arrest),
 *      each with one line on what changed, and says where the story stands now.
 *
 * Without a model the rules' result is kept (minus the routine repeats and folded duplicates). Numbers in the AI's
 * text are checked against the headlines (aibrief.aiJson); results are reused until the stories change.
 */
import { z } from "zod";
import { aiJson } from "@/lib/collector/aibrief";
import { when } from "@/lib/collector/analysis";
import { threads, tokens, type Thread, type ThreadScope, type ThreadStep } from "@/lib/collector/threads";

export interface Milestone { t: string; label: string; what: string; title: string; publisher: string | null; url: string | null; incident: string | null }
export interface Story extends Thread {
  /** what changed, in order (AI); null when no model answered */
  ai: { now: string; milestones: Milestone[] } | null;
  /** how many of the rules' stories were joined into this one */
  merged: number;
  /** reports folded into another step because they said the same thing */
  folded: number;
}

/** News that repeats by nature: it is published again every day, it does not develop. */
const ROUTINE = new RegExp([
  "\\b(gold|silver)\\s+(price|rate)", "\\bpetrol\\b", "\\bdiesel\\b", "fuel price", "weather (forecast|update)", "forecast (for|&) today",
  "today'?s (weather|price|rate)", "rasi ?palan", "horoscope", "panchang", "\\bchennai events?\\b", "events? in chennai", "tickets? (go |went )?on sale",
  "vegetable prices?", "power (cut|shutdown)", "shutdown areas", "\\bevent \\d{1,2}[/.]\\d{1,2}", "things to do", "this weekend",
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

/** Steps in time order, each headline once; a headline saying what an earlier one said (same stage) folds into it. */
export function fold(steps: ThreadStep[]): { steps: (ThreadStep & { similar: number })[]; folded: number } {
  const out: (ThreadStep & { similar: number; tk: Set<string> })[] = [];
  let folded = 0;
  for (const s of [...steps].sort((a, b) => a.t.localeCompare(b.t))) {
    const tk = new Set(tokens(s.title));
    const same = out.find((o) => o.title.toLowerCase() === s.title.toLowerCase() ||
      (o.stage === s.stage && tk.size >= 3 && jaccard(o.tk, tk) >= 0.6));
    if (same) {
      folded++;
      same.similar++;
      for (const p of [s.publisher, ...s.also]) if (p && p !== same.publisher && !same.also.includes(p)) same.also.push(p);
      same.incident ??= s.incident;
      continue;
    }
    out.push({ ...s, also: [...s.also], similar: 0, tk });
  }
  return { steps: out.map(({ tk: _tk, ...s }) => s), folded };
}

/** One story from one or more of the rules' stories. */
function merge(ts: Thread[], title: string | null): Story {
  const all = ts.flatMap((t) => t.days.flatMap((d) => d.steps));
  const { steps, folded } = fold(all);
  // a copy: the threads' own steps are shared with the rules' stories built alongside
  if (steps[0]) steps[0] = { ...steps[0], stage: "First report" };
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
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
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
    ai: null, merged: ts.length, folded
  };
}

// --------------------------------------------------------------- the AI --

const GroupSchema = z.object({
  stories: z.array(z.object({
    threads: z.array(z.number()).describe("the T numbers of every thread about this one real-world event"),
    title: z.string().describe("a plain headline for the whole story, at most 14 words"),
    keep: z.boolean().describe("true only if the story developed: something new happened after the first report"),
    why: z.string().describe("at most 12 words")
  })).describe("every thread exactly once")
});
const GROUP_SYSTEM = `You curate the "stories still developing" list for the District Collector of Chennai. Each thread is a set of news
reports a program grouped by rules; the program often splits ONE real-world event into several threads (the same visit, project
or crime under different headlines), and it also picks up routine news that only repeats.
Group the threads: put every thread number in exactly one story; threads about the same real-world event (same visit, project,
crime, accident, protest or decision) go in one story, together with its preparations, security and traffic arrangements,
follow-ups and reactions. Join threads only when they are clearly the same event: the same named person, project or incident.
Two different crimes, accidents or court cases are never one story, even with the same kind of accused or the same state.
keep: true only if the story really developed after the first report: a new step happened (announced then inaugurated, an
attack then arrests, a collapse then a probe, a protest then talks, a warning then flooding). False for news that only repeats
the same thing, daily prices, rain forecasts and warnings with no damage reported, schedules, event listings, features,
sport and business announcements,
election results and party politics, and events that happened outside Chennai district.
title: one plain headline for the whole story as it stands, using only names and numbers in the headlines.`;

const StepsSchema = z.object({
  stories: z.array(z.object({
    story: z.number(),
    now: z.string().describe("one sentence: where the story stands now"),
    milestones: z.array(z.object({
      step: z.number().describe("the S number of the report where this happened"),
      label: z.string().describe("1 to 3 words: what kind of step (Announced, Inaugurated, Arrest, Protest, Probe, Death, Court, Action, Warning, Resumed...)"),
      what: z.string().describe("what changed at this step, at most 20 words")
    })).describe("2 to 6 steps in time order, the first is the first report")
  }))
});
const STEPS_SYSTEM = `For each news story below, pick the reports where something changed, so the District Collector of Chennai can follow
the story as one timeline: the first report, then each new development (not reports that repeat an earlier one). 2 to 6 steps
per story, in time order. For each: the S number, a short label, and what changed in at most 20 words. Then one sentence on where
the story stands now. Use only names, places and numbers in the headlines; no markdown.`;

const CAP = 26;
/** At most CAP steps of a story for the AI: the first, the last, every step with a named stage, then evenly spaced. */
function sample<T extends { stage: string }>(steps: T[]): number[] {
  if (steps.length <= CAP) return steps.map((_, k) => k);
  const pick = new Set<number>([0, steps.length - 1]);
  steps.forEach((s, k) => { if (s.stage !== "Update" && pick.size < CAP - 6) pick.add(k); });
  for (let k = 0; pick.size < CAP && k < CAP; k++) pick.add(Math.round((k * (steps.length - 1)) / (CAP - 1)));
  return [...pick].sort((a, b) => a - b);
}

async function milestones(stories: Story[], user: string) {
  const flat = (s: Story) => s.days.flatMap((d) => d.steps) as (ThreadStep & { similar?: number })[];
  // a few stories per call, so each call stays small (free-tier models have per-minute token allowances)
  const chunks: Story[][] = [];
  for (let k = 0; k < stories.length; k += 5) chunks.push(stories.slice(k, k + 5));
  await Promise.all(chunks.map(async (chunk) => {
    const picks = chunk.map((s) => sample(flat(s)));
    const facts = chunk.map((s, k) => [`STORY ${k + 1}: ${s.title} (${when(s.first)} to ${when(s.last)}, ${s.reports} reports)`,
      ...picks[k].map((j) => { const st = flat(s)[j]; return `  S${j + 1} | ${when(st.t)} | ${st.publisher ?? "news"} | ${st.title}${st.similar ? ` (+${st.similar} similar)` : ""}`; })
    ].join("\n")).join("\n\n");
    const r = await aiJson({ kind: "story-steps1", system: STEPS_SYSTEM, facts, schema: StepsSchema, user, maxOutputTokens: 1800,
      text: (o) => o.stories.flatMap((x) => [x.now, ...x.milestones.map((m) => m.what)]).join(" ") });
    if (!r) return;
    for (const x of r.o.stories) {
      const s = chunk[x.story - 1];
      if (!s) continue;
      const steps = flat(s);
      const ms = x.milestones.map((m) => ({ m, st: steps[m.step - 1] })).filter((y) => y.st && picks[x.story - 1].includes(y.m.step - 1))
        .sort((a, b) => a.st.t.localeCompare(b.st.t))
        .filter((y, k, all) => all.findIndex((z) => z.st === y.st) === k)
        .map(({ m, st }) => ({ t: st.t, label: m.label.trim().slice(0, 24), what: m.what.trim(), title: st.title, publisher: st.publisher, url: st.url, incident: st.incident }));
      if (ms.length) s.ai = { now: x.now.trim(), milestones: ms };
    }
  }));
}

const V = 4;

export interface Stories { days: number; total: number; threads: Story[]; /** a model joined and explained them */ ai: boolean }
declare global {
  // eslint-disable-next-line no-var
  var __stories: Map<string, { at: number; v: Stories }> | undefined;
  // eslint-disable-next-line no-var
  var __storyJobs: Map<string, Promise<Stories | null>> | undefined;
}

/** The developing stories of the scope, joined, cleaned and explained. `ai` says whether a model did the joining. */
export async function stories(scope: ThreadScope, now: string, user: string): Promise<Stories> {
  const base = await threads(scope, now);
  // bump V when the prompts or rules here change, so a remembered result is not reused
  const key = `${V}|${base.threads.map((t) => `${t.id}:${t.reports}`).join(",")}`;
  const memo = (global.__stories ??= new Map()).get(key);
  if (memo && Date.now() - memo.at < 30 * 60_000) return memo.v;

  const cand = base.threads.filter((t) => !routine(t));
  // The model's joining runs in the background: a page waits at most WAIT_MS for it (a remembered write-up comes back at
  // once), else gets the rules' stories now and the model's on its next load. New data used to hold the Overview 14 s.
  const jobs = (global.__storyJobs ??= new Map());
  if (!jobs.has(key)) jobs.set(key, withAi(base, cand, key, user).catch((e) => {
    console.warn(`[stories] ${(e as Error).message.slice(0, 200)}`);
    return null;
  }).finally(() => jobs.delete(key)));
  const quick = await Promise.race([jobs.get(key)!, new Promise<null>((r) => setTimeout(() => r(null), WAIT_MS))]);
  return quick ?? finish(base, cand.map((t) => merge([t], null)), false, key);
}

const WAIT_MS = 1500;

async function withAi(base: Awaited<ReturnType<typeof threads>>, cand: Awaited<ReturnType<typeof threads>>["threads"], key: string, user: string): Promise<Stories | null> {
  const facts = cand.map((t, k) => {
    const steps = t.days.flatMap((d) => d.steps);
    const pick = [...new Set([0, Math.floor(steps.length / 3), Math.floor((2 * steps.length) / 3), steps.length - 1])].filter((j) => steps[j]);
    return `T${k + 1} | ${when(t.first)} to ${when(t.last)} | ${t.reports} reports, ${t.outlets.length} outlets | ${t.title}\n` +
      pick.map((j) => `    ${when(steps[j].t)}: ${steps[j].title}`).join("\n");
  }).join("\n");
  const grouped = cand.length ? await aiJson({ kind: "story-groups4", system: GROUP_SYSTEM, temperature: 0, facts, schema: GroupSchema, user, maxOutputTokens: 1600,
    text: (o) => o.stories.map((s) => s.title).join(" "),
    ok: (o) => o.stories.some((s) => s.threads.length > 0) }) : null;

  if (!grouped) return null;
  const used = new Set<number>();
  let out: Story[] = [];
  for (const g of grouped.o.stories) {
    const ix = [...new Set(g.threads)].map((x) => x - 1).filter((x) => cand[x] && !used.has(x));
    ix.forEach((x) => used.add(x));
    if (!ix.length || !g.keep) continue;
    out.push(merge(ix.map((x) => cand[x]), g.title.trim() || null));
  }
  // a thread the model left out keeps the rules' verdict only when it has a named new step
  cand.forEach((t, x) => { if (!used.has(x) && t.stages.length) out.push(merge([t], null)); });
  await milestones(out, user);
  // a story with only one step after all did not develop
  out = out.filter((s) => !s.ai || s.ai.milestones.length >= 2);
  return finish(base, out, true, key);
}

/** Sorted, and remembered when a model joined them. */
function finish(base: { days: number }, out: Story[], ai: boolean, key: string): Stories {
  out.sort((a, b) => b.last.slice(0, 10).localeCompare(a.last.slice(0, 10)) || (b.ai?.milestones.length ?? b.stages.length) - (a.ai?.milestones.length ?? a.stages.length) ||
    b.reports - a.reports);
  const v: Stories = { days: base.days, total: out.length, threads: out, ai };
  const memo = (global.__stories ??= new Map());
  if (ai) memo.set(key, { at: Date.now(), v });
  while (memo.size > 20) memo.delete(memo.keys().next().value!);
  return v;
}
