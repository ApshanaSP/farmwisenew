/**
 * The news desk (24 Nov 2026): an AI reads every news story once and decides whether it belongs on the Collector's desk.
 * The word rules in newsrel.ts could not: "Why GTA 6 is a big deal" was filed as theft (Grand Theft Auto) and shown, a football
 * draw became a High incident, and a phone thief who left sweets in a parcel sat beside a water cut.
 *
 * For each story: act (the administration has, or may soon have, something to do), know (the Collector should be aware) or skip
 * (not the administration's business, with the reason), its area, the department's category, a plain English headline (a Tamil
 * report's own machine translation is often wrong), one or two sentences on what happened, and why it matters to the
 * administration. Numbers are checked against the report; a line that fails the check is left out, the verdict stays.
 * Since 27 Nov 2026 also the report's kind (an incident, or a forecast, government work, an ending, a roundup, an opinion,
 * other): a news-only incident whose every report the desk reads as not an incident leaves the build (derive.applyDesk),
 * in place of the word rules (reporttype.ts), which now decide only for what the desk has not read.
 *
 *   - Judged once per headline and kept on disk (data/aws-cache/newsdesk.json), so the same news never changes its answer and
 *     costs nothing the second time. A new report of a story already judged takes the story's verdict.
 *   - In the background only (scheduler.ts every minute, and when a page asks for a window not judged yet), one small batch at a
 *     time, newest first, paced to stay far below the model's per-minute allowance that Jarvis needs.
 *   - Until a story is judged, or with no model, the rules (newsrel.relevantNews) decide, so a page never waits.
 *   - What was left out is kept with its reason and can be read in "See more" (Left out), so a wrong call can be seen.
 */
import { z } from "zod";
import { RowDataPacket } from "mysql2";
import { aiStatus, generateJson } from "@/lib/ai/gateway";
import intelPool, { ops } from "@/lib/collector/db";
import { categories } from "@/lib/collector/nlp";
import { isNewsMedia } from "@/lib/collector/newsmedia";
import { bumpDataEpoch } from "@/lib/collector/epoch";
import { numbersHold } from "@/lib/collector/numbers";
import { REPORT_KINDS } from "@/lib/collector/reporttype";
import { AREAS, SKIPS, deskBook, deskKey, deskOf, deskOfDocs, isListing, saveDesk, wantedDays, type Verdict } from "@/lib/collector/deskbook";

export * from "@/lib/collector/deskbook";

type Row = Record<string, any>;
async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [r] = await intelPool.query<RowDataPacket[]>(sql, params);
  return r as unknown as T[];
}

interface Desk {
  busy: Promise<number> | null;
  /** no calls before this time (a failure backs off) */
  restUntil: number;
  fails: number;
  calls: { day: string; n: number };
  lastSweep: number;
  /** what the last look for unjudged news found, so a minute's tick costs one small query */
  seen: string;
}
declare global {
  // eslint-disable-next-line no-var
  var __newsDesk: Desk | undefined;
}
const g: Desk = (global.__newsDesk ??= { busy: null, restUntil: 0, fails: 0, calls: { day: "", n: 0 }, lastSweep: 0, seen: "" });

// ------------------------------------------------------------------ the AI --

const Out = z.object({
  items: z.array(z.object({
    n: z.number().describe("the story's number"),
    verdict: z.enum(["act", "know", "skip"]),
    skip_reason: z.string().describe(`only for skip, one of: ${SKIPS.join(", ")}; else empty`),
    area: z.string().describe(`for act and know, one of: ${AREAS.join(", ")}; empty for skip`),
    category: z.string().describe("for act and know, the category code that fits best, or empty"),
    real_event: z.boolean().describe("true when something happened in Chennai that the police, a hospital or a civic department would record: a theft, fraud or private case too, even when the verdict is skip"),
    // 27 Nov 2026: decides whether a news-only incident stays in the counts (derive.ts), in place of the word rules (every field required: Groq)
    kind: z.enum(REPORT_KINDS).describe("what the report is, by what happened: incident, alert, government_action, resolution, roundup, opinion or other (see kind)"),
    head: z.string().describe("the news as one plain English headline, at most 16 words"),
    gist: z.string().describe("what happened, 1 or 2 sentences, at most 40 words; empty for skip, or when only a headline is given"),
    why: z.string().describe("for act and know: why it matters to the administration, at most 20 words; empty for skip")
  }))
});
type OutT = z.infer<typeof Out>;

const system = () => `You run the news desk of the District Collector of Chennai (Chennai district, Tamil Nadu, India; the Greater Chennai Corporation area). Every
news story comes to you once. Decide whether it belongs on the Collector's desk.

The Collector heads the district administration: disaster management and the monsoon, public safety and law and order with the Greater Chennai Police, revenue and
government land, elections, public health and hospitals, schools and hostels, welfare, labour and child protection, civil supplies, and answers to the Government for
drinking water, drains and lakes, roads, bridges and traffic, metro and bus works, power supply, garbage, air and water pollution, encroachments and public works in the
district (through GCC, Metrowater, TNPDCL, PWD/WRD, CMRL, MTC, TNPCB, HR&CE, the police and the hospitals).

verdict
 act   the administration has, or may soon have, something to do: a civic failure or danger people complain of; flooding or a weather warning for Chennai; an outbreak
       or a hospital short of beds; a death or injury from a road, building, drain, wire, fire or workplace; a strike, protest or road block that affects the public; a
       missing or rescued child, child labour, an attack on a woman or child; a murder, gang violence or communal tension; a court order or notice to the Collector,
       GCC or a department; encroachment or misuse of government land; a disrupted service (water cut, power cut, trains, buses); public anger at an office.
 know  the Collector would mention it to an officer, or be asked about it by the Government, the press or the public; nothing to do now: government decisions, works, schemes and openings in Chennai; official inspections and drives; election
       notices, electoral rolls, a seat falling vacant, the death of an MLA, MP or minister; VIP visits and traffic plans; a large drug or gold seizure; arrests in a
       serious case; crime or health figures for the city; rain outlook and reservoir levels; court rulings on the city.
 skip  not the administration's business.

Always skip, with its reason:
 entertainment  films, television, music, video games, celebrities and their disputes, weddings of the famous
 sport          matches, players, teams, stadium events
 business       companies, launches, orders, investment, data centres, hotels, restaurants, real estate, property deals, jobs, share and gold prices
 party politics parties and leaders speaking about each other, candidates and seat sharing, speculation, statements and condemnations, party functions and protests
                about matters outside Chennai (unless the protest itself disrupts the city)
 petty crime    a theft, phone or chain snatching, burglary, cheating or fraud between private persons, a small arrest, a quarrel, a missing adult with no danger;
                (not petty: a death, a child or a woman as victim of violence, a weapon or a gang, a large drug haul, many victims, a public servant or office)
 elsewhere      it happened in another district, state or country, and does not affect Chennai
 feature        opinion, explainers, history, profiles, photo stories, human interest, trends, studies, advice, anniversaries
 listing        daily prices, horoscopes, cause lists, programme lists, "today's events"
 religion       temple programmes, festivals and worship (unless crowds, safety or government arrangements in Chennai are the news)
 promotion      private events, exhibitions, book fairs, health talks, camps by private bodies, awards, webinars, admissions
 personal       family disputes, personal lives, one person's private legal case

kind: what the report is, whatever the verdict (a petty theft is skip and still an incident; a court order is act and not an incident)
 incident           something happened to people or property: a death, an injury, a crime (a petty theft, a loot or a fraud too), an accident, a fire or
                    explosion, a collapse, flooding or sea water entering homes, an outage or a disrupted service, a civic problem people complain of
                    (garbage, sewage, potholes, an exposed wire), a protest, strike or road block that took place (one only planned or
                    threatened is not one yet), an escape from custody.
                    A report that someone was harmed, abducted or went missing, or that a crime was committed, is an incident even when it ends in a
                    rescue, an arrest or a recovery: "girl kidnapped on her way to school, police rescue her" is an incident, not a resolution.
 alert              only a forecast or a warning: nothing has happened yet (a rain, cyclone or heat alert, an IMD outlook)
 government_action  what a department, the Government or a court decided or did: works (waste cleared, drains desilted), schemes, inspections, drives,
                    tenders, openings, deployments, a court order or notice to a department
 resolution         only the end of an earlier event, with no new harm in this report: a service restored, a road reopened, a sentence passed
 roundup            several separate stories in one report (a "Crime Corner" column, a news bulletin), even when each is an incident, or a status
                    table (lake levels, rainfall figures)
 opinion            statements, speeches, criticism, interviews, features, explainers, studies
 other              promotions, private events, sport, films, business, anything else
Judge by what happened, never by a word in the headline. "Grand Theft Auto" is a video game, not a theft; "cardiac arrest" is a death, not a police arrest; "Alva box" is a
box of halwa, a sweet, left by a phone thief: petty crime; "big deal" is not business; a film's title is not a riot. When a festival is named beside rain, the news is
the rain. The monitor's own labels are often wrong: ignore them when the text says otherwise. When in doubt between know and skip for something the administration,
the police or a civic body in Chennai did or must do, choose know; for everything else in doubt choose skip (a private institute's new lab, a State-level seminar, one
patient's or customer's case, a proposal industry would like, a feature on works already known).

head: who or what, what happened, where, in plain English, at most 16 words: a statement, never a question or a teaser, no hashtags, no outlet's name. Translate a Tamil report from its Tamil
words, not from the machine translation (திரு.வி.க. நகர் = Thiru Vi Ka Nagar; சிங்கப்பெண் = Singappenn, a police force of women). Keep names and numbers exactly as written.
gist and why: only from the text given, plain formal Indian English; every number you write must be in the text. Never invent a cause, place or name.
category: one of ${categories().map((c) => `${c.code} (${c.label})`).join(", ")}.
Answer for every story, in order, by its number.`;

export interface DeskStory {
  /** every headline of the story: the verdict is kept under each */
  titles: string[];
  title: string; titleEn: string | null; lang: string | null; t: string; outlets: string[]; text: string; tag: string; inRecords: boolean;
}

const factsOf = (s: DeskStory, n: number) => [`N${n} | ${s.t.slice(0, 16)} | ${s.outlets.slice(0, 4).join(", ")}${s.outlets.length > 4 ? ` and ${s.outlets.length - 4} more` : ""} | monitor's label: ${s.tag}`,
  `  Headline: ${s.title.slice(0, 220)}`,
  s.titleEn && s.titleEn !== s.title ? `  Machine translation: ${s.titleEn.slice(0, 220)}` : "",
  ...[...new Set(s.titles)].filter((t) => t !== s.title && t !== s.titleEn).slice(0, 2).map((t) => `  Also reported as: ${t.slice(0, 180)}`),
  s.text ? `  Text: ${s.text.slice(0, 520)}` : "  (headline only)"].filter(Boolean).join("\n");

const BATCH = 12;

/** Judges one batch. Exported for the live probe. */
export async function judge(batch: DeskStory[]): Promise<Map<number, Verdict>> {
  const facts = batch.map((s, k) => factsOf(s, k + 1));
  const r = await generateJson<OutT>({ role: "fast", name: "news-desk", schema: Out, temperature: 0, maxOutputTokens: 4500, user: "news-desk", background: true, timeoutMs: 60_000,
    system: system(), prompt: facts.join("\n") });
  const out = new Map<number, Verdict>();
  const cats = new Set(categories().map((c) => c.code));
  for (const x of r.object.items) {
    const k = Math.round(x.n) - 1;
    if (!batch[k] || out.has(k)) continue;
    const f = facts[k];
    // a line with a figure the report does not give is left out; the verdict stays
    const ok = (t: string, max: number) => { const v = t.replace(/\s+/g, " ").trim(); return v && v.length <= max && numbersHold(v, f) ? v : ""; };
    const area = AREAS.find((a) => a.toLowerCase() === x.area.trim().toLowerCase()) ?? "";
    const skip = SKIPS.find((a) => a === x.skip_reason.trim().toLowerCase()) ?? "";
    out.set(k, { v: x.verdict, area: x.verdict === "skip" ? "" : area, skip: x.verdict === "skip" ? skip || "other" : "", head: ok(x.head, 200),
      gist: x.verdict === "skip" || !batch[k].text ? "" : ok(x.gist, 420), why: x.verdict === "skip" ? "" : ok(x.why, 240),
      cat: cats.has(x.category.trim()) && x.category.trim() !== "OTHER" ? x.category.trim() : "", real: x.real_event,
      // an answer outside the list leaves the kind unset: the rules decide for that story, as for one not read
      ...(REPORT_KINDS.includes(x.kind) ? { kind: x.kind } : {}), of: deskKey(batch[k].title), at: Date.now(), by: r.info.model });
  }
  return out;
}

// ------------------------------------------------------- what is not judged --

const ROUNDUP = /latest news today|news today live|live updates|top news|news highlights|#gallery/i;

/** A body that is only the headline again says nothing more. */
function bodyText(d: Row): string {
  const t = String(d.lead ?? "").replace(/\s+/g, " ").trim();
  return t.length > 60 && t.slice(0, 60).toLowerCase() !== String(d.title ?? "").slice(0, 60).toLowerCase() ? t : t.length > String(d.title ?? "").length + 80 ? t : "";
}

/** The stories of the last `days` days no verdict is kept for, newest first. */
export async function unjudged(days: number, now: string, limit = 400): Promise<DeskStory[]> {
  const [docs, items] = await Promise.all([
    q(`SELECT d.doc_id, d.story_id, d.title, d.title_en, d.lang, d.publisher, d.publisher_domain, d.publisher_tier, d.category_code, d.report_type, d.linked_incident_id,
              SUBSTR(COALESCE(NULLIF(d.body, ''), d.summary, ''), 1, 700) AS lead, DATE_FORMAT(d.published_at, '%Y-%m-%d %H:%i:%s') AS t
       FROM documents d WHERE d.source_kind = 'news' AND d.is_district = 1 AND d.title IS NOT NULL AND d.publisher_tier IN ('established', 'regional', 'official')
         AND d.published_at > (? - INTERVAL ? DAY) AND d.published_at <= ? ORDER BY d.published_at DESC LIMIT 6000`, [now, days, now]),
    // the live lane's feeds (every 10 minutes): their items have only keyword labels
    q(`SELECT i.title, i.lang, s.name AS publisher, s.url AS feed, SUBSTR(COALESCE(i.body, ''), 1, 500) AS lead, i.category_code, DATE_FORMAT(COALESCE(i.published_at, i.fetched_at), '%Y-%m-%d %H:%i:%s') AS t
       FROM ${ops("source_items")} i JOIN ${ops("sources")} s ON s.source_id = i.source_id
       WHERE s.kind = 'rss' AND COALESCE(i.published_at, i.fetched_at) > (? - INTERVAL 2 DAY) ORDER BY 6 DESC LIMIT 400`, [now]).catch(() => [] as Row[])
  ]);
  const c = deskBook();
  const by = new Map<string, Row[]>();
  for (const d of docs) {
    if (!isNewsMedia(d.publisher, d.publisher_domain, d.publisher_tier) || ROUNDUP.test(String(d.title)) || isListing(d.title, d.title_en)) continue;
    const k = String(d.story_id ?? d.doc_id);
    (by.get(k) ?? by.set(k, []).get(k)!).push(d);
  }
  const out: DeskStory[] = [];
  const queued = new Set<string>();
  for (const all of by.values()) {
    const known = deskOfDocs(all as { title: unknown; title_en: unknown }[]);
    let g = all;
    if (known && known.v !== "skip") {
      // a later report of a story kept for the Collector takes its verdict
      for (const d of g) for (const t of [d.title, d.title_en]) if (t && !c.has(deskKey(t))) c.set(deskKey(t), known);
      continue;
    }
    if (known) {
      // a story left out can become one for the Collector (a theft whose victim dies): its later reports are read on their own
      g = all.filter((d) => !deskOf(d.title, d.title_en));
      if (!g.length) continue;
    }
    const lead = [...g].sort((a, b) => Number(b.lang === "en") - Number(a.lang === "en") || bodyText(b).length - bodyText(a).length)[0];
    const titles = [...new Set(g.flatMap((d) => [d.title, d.title_en]).filter(Boolean).map(String))];
    if (titles.some((t) => queued.has(deskKey(t)))) continue;
    titles.forEach((t) => queued.add(deskKey(t)));
    out.push({ titles, title: String(lead.title), titleEn: lead.lang !== "en" && lead.title_en ? String(lead.title_en) : null, lang: lead.lang ?? null, t: String(g[0].t),
      outlets: [...new Set(g.map((d) => String(d.publisher ?? "")).filter(Boolean))], text: bodyText(lead),
      tag: [lead.report_type, lead.category_code].filter(Boolean).join(" / ") || "none", inRecords: g.some((d) => d.linked_incident_id) });
    if (out.length >= limit) break;
  }
  for (const i of items) {
    const k = deskKey(i.title);
    if (!isNewsMedia(null, i.feed) || !k || c.has(k) || queued.has(k) || isListing(i.title) || out.length >= limit) continue;
    queued.add(k);
    out.push({ titles: [String(i.title)], title: String(i.title), titleEn: null, lang: i.lang ?? null, t: String(i.t), outlets: [String(i.publisher ?? "News")], text: bodyText(i),
      tag: String(i.category_code ?? "none"), inRecords: false });
  }
  return out.sort((a, b) => b.t.localeCompare(a.t));
}

// ------------------------------------------------------------------- sweeps --

/** Between two batches: about 5,000 tokens each, far below the per-minute allowance the Collector's own questions share. */
const GAP_MS = Number(process.env.NEWS_DESK_GAP_MS) || 9_000;
const DAILY_CALLS = Number(process.env.NEWS_DESK_MAX_CALLS) || 220;
const istDay = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const deskOff = () => process.env.NEWS_DESK === "off" || !aiStatus().available;

/** Judges what is not judged yet, newest first. Returns how many stories were judged. One sweep at a time. */
export function sweep(days: number, now: string, maxBatches = 12): Promise<number> {
  if (g.busy) return g.busy;
  if (deskOff() || Date.now() < g.restUntil) return Promise.resolve(0);
  g.busy = (async () => {
    let n = 0;
    try {
      const todo = await unjudged(days, now, maxBatches * BATCH);
      for (let k = 0; k < todo.length; k += BATCH) {
        if (g.calls.day !== istDay()) g.calls = { day: istDay(), n: 0 };
        if (g.calls.n >= DAILY_CALLS) { console.warn(`[news-desk] ${DAILY_CALLS} calls made today: the rules decide until tomorrow`); break; }
        if (k) await new Promise((ok) => setTimeout(ok, GAP_MS));
        g.calls.n++;
        const batch = todo.slice(k, k + BATCH);
        const got = await judge(batch);
        for (const [i, v] of got) for (const t of batch[i].titles) deskBook().set(deskKey(t), v);
        n += got.size;
        g.fails = 0;
        if (got.size) saveDesk();
        // the first batch holds the newest news: the console shows it without waiting for the rest
        if (k === 0 && got.size && todo.length > BATCH) await laid();
      }
    } catch (e) {
      g.fails++;
      g.restUntil = Date.now() + Math.min(30, 2 ** g.fails) * 60_000;
      console.warn(`[news-desk] stopped after ${n} stories, next try in ${Math.min(30, 2 ** g.fails)} min: ${(e as Error).message.slice(0, 200)}`);
    }
    if (n) {
      await laid();
      console.log(`[news-desk] ${n} news stories judged (${[...deskBook().values()].filter((v) => v.v === "skip").length} of ${deskBook().size} headlines kept are left out)`);
    }
    return n;
  })().finally(() => { g.busy = null; g.lastSweep = Date.now(); });
  return g.busy;
}

/** New verdicts reach the build being served (translations, incidents that were none) and every cache. */
async function laid(): Promise<void> {
  try {
    const [{ withCurrentBuild }, { applyDesk }] = await Promise.all([import("@/lib/aws/store"), import("@/lib/collector/derive")]);
    if (process.env.DATA_BACKEND === "aws") await withCurrentBuild((db) => applyDesk(db));
  } catch (e) { console.warn(`[news-desk] verdicts not laid over the build: ${(e as Error).message}`); }
  bumpDataEpoch();
}

/** The minute's tick (scheduler.ts): a sweep when there is news no verdict is kept for. Cheap when nothing is new. */
export async function deskTick(): Promise<void> {
  if (deskOff() || g.busy || Date.now() < g.restUntil) return;
  const [m] = await q(`SELECT MAX(fetched_at) AS f, COUNT(*) AS n FROM documents WHERE source_kind = 'news' AND is_district = 1`);
  const [i] = await q(`SELECT MAX(item_id) AS i FROM ${ops("source_items")}`).catch(() => [{ i: 0 }]);
  const stamp = `${m?.f}|${m?.n}|${i?.i}|${wantedDays()}`;
  if (stamp === g.seen && Date.now() - g.lastSweep < 30 * 60_000) return;
  const now = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const n = await sweep(Math.max(9, wantedDays()), now);
  // a full sweep may have left older news: the next tick goes on
  if (n < 12 * BATCH * 0.9) g.seen = stamp;
}

/**
 * Which of these incidents are only news the desk left out: every article of theirs the desk has read is off the Collector's desk (petty
 * theft, a private quarrel). "Only in the news" lists what needs a department record, so they are not in it.
 */
export async function offDeskIncidents(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length || !deskBook().size) return out;
  const by = new Map<string, { n: number; off: number }>();
  for (let k = 0; k < ids.length; k += 400) {
    for (const d of await q(`SELECT linked_incident_id AS inc, title, title_en FROM documents WHERE linked_incident_id IN (?)`, [ids.slice(k, k + 400)]).catch(() => [] as Row[])) {
      const v = deskOf(d.title, d.title_en), x = by.get(String(d.inc)) ?? by.set(String(d.inc), { n: 0, off: 0 }).get(String(d.inc))!;
      if (v) { x.n++; if (v.v === "skip") x.off++; }
    }
  }
  for (const [id, x] of by) if (x.n && x.n === x.off) out.add(id);
  return out;
}

/** For the health page and the live probe. */
export const deskInfo = () => ({ kept: deskBook().size, skipped: [...deskBook().values()].filter((v) => v.v === "skip").length, callsToday: g.calls.n, restUntil: g.restUntil, off: deskOff() });
