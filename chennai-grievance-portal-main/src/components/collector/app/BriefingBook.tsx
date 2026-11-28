"use client";

import { useLang } from "@/lib/i18n/lang";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Insights } from "@/lib/collector/insights";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import { composeGlance, glanceNumbers, type Glance, type GlanceIn, type GlanceOpen, type GlancePoint, type Seg } from "@/lib/collector/glance";
import { checkOpening } from "@/lib/collector/opening";
import { PERIODS, dayStart, labelLower, type Period } from "@/lib/period/day";
import { BRIEF_VIEW_V, capView, trimDept, trimGap, trimThread, type FrozenBook, type FrozenDept, type FrozenGap, type FrozenThread, type SavedBrief } from "@/lib/collector/workspacesnap";
import { I, type IconName } from "./icons";
import { SEV_HEX, deptIcon, fmtDate, fmtShort, ms, rel, useFit, type Row } from "./lib";
import { STORY_STATUS, stepColour } from "./Stories";
import { differView } from "./Conflicts";
import { Sentence } from "./DeptSummary";
import { Legend } from "./MiniCharts";
import { combine, type Story } from "./Overview";
import type { Console } from "./CollectorApp";
import { greeting } from "./Shell";
import { mdToHtml } from "@/lib/markdown";
import { canSpeak, speak, stopSpeaking } from "./assistant/speech";

type Book = NonNullable<Insights["book"]>;
type Lang = "en" | "ta";
/** what the page reads of the Briefing part (an Insights answers it; so does a saved copy's) */
type BookIns = Pick<Insights, "now" | "gaps"> & { book: Insights["book"]; briefing: Pick<Insights["briefing"], "emerging"> };

const STATUS = { normal: "Normal", watchful: "Watchful", alert: "Alert" } as const;
const num = (v: number) => v.toLocaleString("en-IN");

/**
 * Everything the page draws, from the live data or from a saved workspace's copy (lib/collector/workspacesnap.ts). 28 Nov (the owner: a
 * saved workspace reopened its Briefing "in a different format"): both are drawn by the same cards below, so a saved version looks exactly
 * like the live page did when it was saved.
 */
interface Model {
  /** a saved copy: when its data was read and when it was saved (null: the live page) */
  saved: { asOf: string; savedAt: string | null } | null;
  now: string; period: Period; periodLabel: string; scopeName: string; whole: boolean;
  status: FrozenBook["status"]; warned: string | null;
  g: Glance; ai: { en: string; ta: string | null } | null;
  days: FrozenBook["days"]; oldest: FrozenBook["oldest"];
  departments: FrozenDept[];
  /** null while the stories load (live) or when none were loaded (saved); `pending`: the AI is still joining them (live only) */
  stories: { threads: FrozenThread[]; pending?: boolean } | null;
  gaps: FrozenGap[];
  open: (o: GlanceOpen) => void;
}

/**
 * Page 2, read top to bottom in half a minute. Across the top, "Today at a glance": one sentence, the figures (each its tile's), what is
 * happening, what needs the Collector, what to do next; composed by code for the filters in force (glance.ts). Under it: each department in
 * one line (a click opens its summary), stories that really developed, and what is only in the news.
 * 26 Nov, evening (the owner: the three cards under the glance were "very small, congested, not easily visible"): squeezed into the 126 px left
 * under the glance they cut rows in half. The page now scrolls: the glance stays as it was, and the three cards under it are full size,
 * in larger type, with how many more each holds at its foot. Until the page is scrolled, a cue at the bottom says they are there.
 * `saved` (28 Nov): a saved workspace's Briefing, drawn from its copy only (the live data is not read).
 */
export function BriefingBook({ ins, d, c, saved }: { ins?: Insights | null; d?: OverviewData; c: Console; saved?: SavedBrief | null }) {
  if (saved?.kind === "view") return <SavedBook view={saved.view} asOf={saved.asOf} c={c} />;
  if (saved?.kind === "text") return <SavedText s={saved} c={c} />;
  return ins?.book ? <LiveBook ins={ins} d={d} c={c} /> : null;
}

function LiveBook({ ins, d, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const b = ins.book!;
  const live = sameView(d, c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => glanceInput(ins, b, live, c), [ins, b, live, c.stories, c.conflicts, c.period, c.zone, c.dept, c.cat, c.taluk, c.scopeName]);
  const g = useMemo(() => composeGlance(f), [f]);
  const ai = useMemo(() => aiSentence(c, ins, g, f), [c.dayBrief, ins, g, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const m: Model = {
    saved: null, now: ins.now, period: c.period, periodLabel: c.periodLabel, scopeName: c.scopeName, whole: b.today.whole,
    status: b.status, warned: warnedOf(b), g, ai, days: b.today.days, oldest: b.citizens.oldest, departments: b.departments,
    stories: c.stories ? { threads: c.stories.threads, pending: c.stories.pending } : null, gaps: ins.gaps as FrozenGap[],
    open: (o) => openPoint(o, c, () => differOf(b, c)[0] ?? null, (key) => live?.allNews?.find((x) => x.id === key) ?? null)
  };
  return <Book m={m} c={c} />;
}

function SavedBook({ view: v, asOf, c }: { view: FrozenBook; asOf: string | null; c: Console }) {
  const m: Model = {
    saved: { asOf: asOf ?? v.now, savedAt: c.saved?.savedAt ?? null }, now: v.now, period: v.period, periodLabel: v.periodLabel, scopeName: v.scopeName,
    whole: v.whole, status: v.status, warned: v.warned, g: v.glance, ai: v.ai, days: v.days, oldest: v.oldest, departments: v.departments,
    stories: v.stories, gaps: v.gaps,
    open: (o) => openPoint(o, c, () => v.differ, (key) => (v.news && v.news.id === key ? v.news : null))
  };
  return <Book m={m} c={c} />;
}

function Book({ m, c }: { m: Model; c: Console }) {
  const box = useRef<HTMLElement>(null);
  const below = useBelow(box);
  // the cue takes the page to its end, where the last cards clear Jarvis and the chatbot (dock.css)
  const down = () => {
    const sc = box.current?.closest<HTMLElement>("#view");
    sc?.scrollTo({ top: sc.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <section className={`bb bb2${m.saved ? " bb-saved" : ""}`} ref={box}>
      <Today m={m} c={c} />
      <div className="bb2-row">
        <Departments m={m} c={c} />
        {/* the Collector's own datasets are on the Environment page now (pinned from the Data Studio), not here */}
        <Developing m={m} c={c} />
        <NewsOnly m={m} c={c} />
      </div>
      {below && <button className="bb2-down" onClick={down} title="Scroll down to the departments, the developing stories and what is only in the news">
        <I n="chevd" />Departments, stories and news below</button>}
    </section>
  );
}

/**
 * True while the page can scroll and is still at its top (the three cards are mostly below the fold); false on phones (the whole window
 * scrolls there). 28 Nov: every page scrolls inside the console (#view, dock.css), so it is #view that is watched.
 */
function useBelow(box: React.RefObject<HTMLElement | null>) {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = box.current;
    const sc = el?.closest<HTMLElement>("#view");
    if (!el || !sc) return;
    const f = () => setBelow(!!el.closest(".dic.fit") && sc.scrollHeight - sc.clientHeight > 60 && sc.scrollTop < 24);
    f();
    sc.addEventListener("scroll", f, { passive: true });
    const ro = new ResizeObserver(f);
    ro.observe(sc);
    ro.observe(el);
    for (const k of Array.from(el.children)) ro.observe(k);
    return () => { sc.removeEventListener("scroll", f); ro.disconnect(); };
  }, [box]);
  return below;
}

// ----------------------------------------------------------------------------------------------------- building blocks --

function Head({ ic, title, n, note, more, children }:
  { ic: IconName; title: string; n?: number; note?: string; more?: () => void; children?: React.ReactNode }) {
  return (
    <header className="bb-h">
      <I n={ic} />
      <h3>{title}</h3>
      {n != null && <span className="bb-n">{num(n)}</span>}
      {note && <span className="bb-note">{note}</span>}
      {children}
      {more && <button className="bb-more" onClick={more}>See all<I n="chevr" /></button>}
    </header>
  );
}

const Calm = ({ children }: { children: React.ReactNode }) => <p className="bb-calm"><I n="checkc" />{children}</p>;

// ------------------------------------------------------------------------------------------------- today at a glance --

const RANK_ACT = (s: { desk?: { v?: string } | null; outletNames: string[]; t: string }) => (s.desk?.v === "act" ? 1000 : 0) + s.outletNames.length;

/** The Overview's data when it is for exactly the filters on screen (while it reloads, the Briefing's own figures are used). */
export function sameView(d: OverviewData | undefined, c: Pick<Console, "period" | "zone" | "dept" | "cat" | "taluk">): OverviewData | null {
  return d && d.period === c.period && (d.zone ?? null) === c.zone && (d.dept ?? null) === c.dept && (d.cat ?? null) === c.cat && (d.taluk ?? null) === c.taluk ? d : null;
}

/** The period's first day on the calendar ("YYYY-MM-DD"), for what is dated by day (an unusual rise). */
const firstDay = (period: Console["period"], now: string) =>
  period === "daily" ? dayStart(now).slice(0, 10) : new Date(ms(now) + 330 * 60_000 - PERIODS[period].hours * 3600_000).toISOString().slice(0, 10);

/** What the glance is made from: the tiles as the Overview shows them, the Briefing's lists, and the news and stories of these filters. */
export function glanceInput(ins: BookIns, b: Book, live: OverviewData | null, c: Console): GlanceIn {
  const t = b.today, whole = t.whole;
  const k = live ? live.kpi : t.kpi;
  const acted = new Set((live?.severity.rows ?? []).filter((r) => r.acted).map((r) => String(r.id)));
  const snap = live?.snapshot as { overdue?: number; critical?: number } | undefined;
  // news: the whole district's stories carry no zone or department, so under a filter only news linked to an incident of the view
  const story = whole && live?.allNews ? [...live.allNews].sort((x, y) => RANK_ACT(y) - RANK_ACT(x) || String(y.t).localeCompare(String(x.t)))[0] : null;
  const linked = !whole && live ? [...live.news].sort((x, y) => (y.outletNames?.length ?? 0) - (x.outletNames?.length ?? 0))[0] : null;
  const thread = c.stories?.threads.find((s) => s.ai?.status !== "settled") ?? null;
  const differ = differOf(b, c);
  const rise = ins.briefing.emerging.find((e) => String(e.date) >= firstDay(c.period, ins.now)) ?? null;
  // the department most of the news-only incidents belong to, with its own count
  const byDept = new Map<string, number>();
  for (const x of ins.gaps as Row[]) if (x.dept_name) byDept.set(String(x.dept_name), (byDept.get(String(x.dept_name)) ?? 0) + 1);
  const gap = [...byDept.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
  const al = b.alerts?.banner ? b.alerts : null;
  const env = live?.bottom;
  const L = env?.lakes;
  return {
    scope: { zone: c.zoneName, taluk: c.taluk ? c.talukName(c.taluk) : null, dept: c.deptName, cat: c.catLabel, words: c.scopeName },
    period: c.period, now: ins.now,
    cur: k.cur as Record<string, number>, prev: k.prev as Record<string, number>,
    overdue: snap?.overdue ?? t.overdue, deaths: t.deaths, injured: t.injured, awaiting: live ? live.tasks.count : t.awaiting,
    unchecked: snap?.critical ?? t.unchecked, kinds: t.kinds, zones: t.zones, depts: b.departments.map((x) => ({ code: x.code, name: x.name, n: x.n, overdue: x.overdue })),
    cases: t.cases.map((x) => ({ ...x, acted: acted.has(x.id) })), fatal: t.fatal,
    // the Tamil headline as published goes with the English one: the Tamil sentence names the story by it (glance.ts)
    news: story ? { title: story.title, ta: story.original ?? null, outlets: story.outletNames.length, act: story.desk?.v === "act", key: story.id, incident: story.incident }
      : linked ? { title: String(linked.news_title ?? linked.title ?? linked.type), ta: linked.news_ta ? String(linked.news_ta) : null, outlets: linked.outletNames?.length ?? 0, act: false, key: String(linked.id), incident: String(linked.id) } : null,
    story: thread ? { id: thread.id, title: thread.title, events: thread.events.length } : null,
    differ: differ.length ? { n: differ.length, title: differ[0].title, field: differ[0].items[0]?.field ?? "Details" } : null,
    newsOnly: ins.gaps.length ? { n: ins.gaps.length, deptName: gap?.[0] ?? null, deptN: gap?.[1] ?? 0 } : null,
    // under a department or a taluk the count is the view's own share of the rise, so "times the usual" (the whole zone's) is not said of it
    rise: rise ? { cat: String(rise.cat), label: String(rise.label), zone: rise.zone == null ? null : Number(rise.zone), zoneName: rise.zone_name ?? null, n: Number(rise.observed),
      times: c.dept || c.taluk ? null : Number(rise.ratio), date: String(rise.date) } : null,
    warning: whole && al ? { title: al.banner!.title.split(" · ").slice(0, 2).join(" · "), agreement: al.agreement,
      rain: al.officialLevel > 0 && ["heavy_rain", "cyclone", "thunderstorm", "flood"].includes(String(al.hazard)) } : null,
    env: whole && env ? { rainMm: env.rain.stations.length ? combine(env.rain.stations, (x) => x.slice(0, 10)).now ?? null : null, aqi: env.aqi.stations.length ? combine(env.aqi.stations).now ?? null : null,
      lakesPct: L?.total ? L.total.series[L.total.series.length - 1] ?? null : L?.stations.length ? combine(L.stations).now ?? null : null } : null
  };
}

/** The stories whose outlets disagree that belong to the view: the period's, or, under a filter, only those linked to its incidents. */
function differOf(b: Book, c: Console) {
  if (!b.today.whole && !c.conflicts?.scope) return [];
  return differView(c.conflicts).inside.filter((s) => s.items.some((x) => x.kind === "conflict"));
}

/** A district warning under a filter: named as the district's, never as the view's. */
const warnedOf = (b: Book) => (!b.today.whole && b.alerts?.banner ? b.alerts.banner.title.split(" · ").slice(0, 2).join(" · ") : null);

/**
 * The AI's one-line headline of the same view, only when every figure and every "more" or "fewer" in it is one the glance itself states
 * (opening.ts): otherwise the sentence the code wrote, which is always current.
 */
function aiSentence(c: Console, ins: BookIns, g: Glance, f: GlanceIn): { en: string; ta: string | null } | null {
  const b = c.dayBrief?.brief;
  if (!b?.headline || g.empty) return null;
  return checkOpening({ asOf: ins.now, en: b.headline, ta: b.headlineTa }, { now: ins.now, hours: PERIODS[c.period].hours,
    facts: { reported: f.cur.reported ?? 0, prev: f.prev.reported ?? null, severe: f.cur.severe ?? 0, prevSevere: f.prev.severe ?? null, open: f.cur.ongoing ?? 0, overdue: f.overdue,
      newsOnly: f.newsOnly?.n ?? 0, deaths: f.deaths, injured: f.injured, awaiting: f.awaiting }, extra: glanceNumbers(g) }).opening;
}

/**
 * The page as it is now, for a saved workspace (28 Nov): the key points as composed, the AI headline as checked, and the cards' lists,
 * kept small enough to store (workspacesnap.ts capView). Null when the Briefing has no book (it could not be built).
 */
export function freezeBook(ins: BookIns, d: OverviewData | undefined, c: Console): FrozenBook | null {
  const b = ins.book;
  if (!b) return null;
  const live = sameView(d, c);
  const f = glanceInput(ins, b, live, c);
  const g = composeGlance(f);
  const key = f.news?.key ?? null;
  const o = b.citizens.oldest;
  return capView({
    v: BRIEF_VIEW_V, now: ins.now, period: c.period, periodLabel: c.periodLabel, scopeName: c.scopeName, whole: b.today.whole,
    status: { level: b.status.level, reasons: [...b.status.reasons] }, warned: warnedOf(b), glance: g, ai: aiSentence(c, ins, g, f),
    days: b.today.days.map((x) => ({ day: x.day, reported: x.reported, resolved: x.resolved })),
    oldest: o ? { id: o.id, title: o.title, t: o.t } : null,
    departments: b.departments.map(trimDept),
    stories: c.stories ? { threads: c.stories.threads.map(trimThread) } : null,
    gaps: (ins.gaps as Row[]).map(trimGap),
    news: key ? live?.allNews?.find((x) => x.id === key) ?? null : null,
    differ: differOf(b, c)[0] ?? null
  });
}

/** "Today at a glance": the Collector's key points for the filters in force. */
function Today({ m, c }: { m: Model; c: Console }) {
  const [uiLang] = useLang();
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { setLang(uiLang === "ta" ? "ta" : "en"); }, [uiLang]);
  const ta = lang === "ta";
  const { g, ai } = m;
  const aiText = ai ? (ta ? ai.ta : ai.en) : null;

  const box = useRef<HTMLDivElement>(null);
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    // what is on screen, so the names are read as the translator wrote them
    const said = [...(box.current?.querySelectorAll<HTMLElement>("[data-say]") ?? [])].map((x) => x.textContent ?? "").filter(Boolean).join(" ");
    setTalking(speak(said, ta ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  const pick = (l: Lang) => { stopSpeaking(); setTalking(false); setLang(l); };

  const level = m.status.level, why = m.status.reasons;
  const name = m.period === "daily" ? "Today at a glance" : `${PERIODS[m.period].label} at a glance`;
  return (
    <section className="bb-card bb-brief gl" ref={box}>
      <Head ic="scroll" title={name}>
        <span className={`gl-scope${m.whole ? "" : " on"}`}><I n={m.whole ? "map" : "sliders"} />{m.whole ? "Whole district" : m.scopeName}</span>
        {m.saved && <SavedChip asOf={m.saved.asOf} savedAt={m.saved.savedAt} />}
        {/* (also Jarvis's "back to live": controls10 presses this page's button.lnk) */}
        {m.saved && c.backToLive && <button className="lnk gl-live" onClick={c.backToLive} title="Leave the saved workspace and show the live dashboard">Back to live dashboard</button>}
        <span className={`bb-status lv-${level}`} title={m.whole ? "District status, by fixed rules: deaths, severe incidents, and warnings from IMD, NDMA SACHET and the news" : "Status of this view, by fixed rules: its deaths and severe incidents"} data-tip={why.join(" · ") || undefined}>
          <i /><b>{STATUS[level]}</b>{why.length > 0 && <span>{why.join(" · ")}</span>}
        </span>
        {/* a warning is the whole district's: under a filter it is named as such, never as the view's */}
        {m.warned && <button className="gl-wide" onClick={() => c.openRain?.()} title="Open Rain & flooding"><I n="cloud" /><b>District-wide</b><span>{m.warned}</span></button>}
        <span className="bb-tools">
          <span className="bb-lang" role="group" aria-label="Language">
            <button className={ta ? "" : "on"} aria-pressed={!ta} onClick={() => pick("en")}>EN</button>
            <button className={ta ? "on" : ""} aria-pressed={ta} onClick={() => pick("ta")}>தமிழ்</button>
          </span>
          {voice && <button className={`bb-btn${talking ? " talking" : ""}`} onClick={listen} title={talking ? "Stop" : "Read the key points aloud"} aria-pressed={talking}>
            {talking ? <span className="bb-bars" aria-hidden="true"><i /><i /><i /><i /></span> : <I n="volume" />}{talking ? "Stop" : "Listen"}</button>}
        </span>
      </Head>
      <p className="gl-say" lang={ta ? "ta" : "en"}>
        <span className="gl-hi" data-say="">{`${greeting(m.now)}, Collector`}</span>
        {aiText ? <><span data-no-i18n="" data-say="">{aiText}</span><em className="gl-ai" title="Worded by AI from this view's records; every figure checked against the ones below"><I n="ai" />AI</em></> : <span data-say=""><Sentence s={ta ? g.situation.ta : g.situation.en} /></span>}
      </p>
      <div className="gl-grid">
        <div className="gl-nums">
          {g.figures.map((x) => <Fig key={x.key} x={x} open={m.open} />)}
          <Week days={m.days} now={m.now} />
        </div>
        <Group title="What is happening" icon="pulse" points={g.happening} ta={ta} open={m.open}
          none={g.empty ? "Nothing was reported or resolved in this view." : "Nothing stands out in this view."} />
        <Group title="What needs you" icon="alert" points={g.needs} ta={ta} open={m.open} none="Nothing waits for you in this view.">
          {g.needs.length < 4 && m.oldest && (
            <button className="bb-fact" onClick={() => c.openInc(m.oldest!.id)} title="Open the oldest open complaint of this period">
              <I n="clock" /><b>Oldest open complaint</b><span>{rel(m.oldest.t, m.now)}</span><span className="ttl">{m.oldest.title}</span><I n="chevr" />
            </button>
          )}
        </Group>
        <Group title="What to do next" icon="tasks" points={g.next} ta={ta} open={m.open} none="No step is needed from you in this view." />
      </div>
    </section>
  );
}

/** A saved copy says so, and when its data was read; the way back to the live page is beside it (and in the top bar). */
function SavedChip({ asOf, savedAt }: { asOf: string; savedAt: string | null }) {
  return (
    <span className="gl-saved" title={`A saved copy: its figures are those of ${fmtShort(asOf)}${savedAt ? `, saved ${fmtShort(savedAt)}` : ""}. New data does not change it.`}>
      <I n="clock" /><b>Saved copy</b><span>data as of</span><time data-no-i18n="">{fmtShort(asOf)}</time>
    </span>
  );
}

/** What a click on a figure or a point does: the list, the case, the story or the page its figure comes from (each opens with today's records). */
function openPoint(o: GlanceOpen, c: Console, differ: () => ReturnType<typeof differOf>[number] | null, news: (key: string) => Story | null) {
  switch (o.k) {
    case "list": return c.openList(o.preset, o.title);
    case "inc": return c.openInc(o.id);
    case "act": return c.openAction(o.id);
    case "zone": return c.setZone(o.zone);
    case "dept": return c.openDept(o.code);
    case "story": return c.openStories(o.id);
    case "differ": { const s = differ(); return s ? c.openConflict(s) : undefined; }
    case "gaps": return c.openGaps();
    case "rain": return c.openRain?.();
    case "page": return c.setPage(o.page);
    case "rise": return c.openPattern({ kind: "spike", cat: o.cat, zone: o.zone, date: o.date });
    case "news": { const s = news(o.key); return s ? c.openStory(s) : c.openInc(o.key); }
  }
}

function Fig({ x, open }: { x: Glance["figures"][number]; open: (o: GlanceOpen) => void }) {
  const d = x.prev == null ? null : x.v - x.prev;
  const cls = !d || !x.good ? "" : (x.good === "up") === d > 0 ? " good" : " bad";
  return (
    <button className="gl-f" data-k={x.key} onClick={() => open(x.open)} title="Open the list">
      <span className="gl-fl"><b>{x.label}</b>{x.sub && <small>{x.sub}</small>}</span>
      <strong>{num(x.v)}</strong>
      <em className={`gl-d${cls}`} title={x.prev == null ? undefined : `${num(x.v)} now, ${num(x.prev)} in the period before`}>
        {d == null ? null : d === 0 ? "=" : <><I n={d > 0 ? "up" : "down"} />{num(Math.abs(d))}</>}
      </em>
    </button>
  );
}

/** The last 7 days at the size of a word: reported beside resolved, for the same zone, department and category. */
export function Week({ days, now }: { days: Book["today"]["days"]; now: string }) {
  const max = Math.max(1, ...days.flatMap((x) => [x.reported, x.resolved]));
  const h = (v: number) => `${Math.max(v ? 6 : 0, (v / max) * 100).toFixed(0)}%`;
  const today = now.slice(0, 10);
  return (
    <div className="gl-wk" role="img" aria-label={days.map((x) => `${fmtDate(`${x.day} 00:00:00`)}: ${x.reported} reported, ${x.resolved} resolved`).join("; ")}>
      <header><span>Last 7 days</span><Legend names={["reported", "resolved"]} /></header>
      <div>
        {days.map((x) => (
          <span key={x.day} className={x.day === today ? "now" : ""} title={`${fmtDate(`${x.day} 00:00:00`)}: ${num(x.reported)} reported, ${num(x.resolved)} resolved${x.day === today ? ", so far" : ""}`}>
            <i className="a" style={{ height: h(x.reported) }} /><i className="b" style={{ height: h(x.resolved) }} />
            <small data-no-i18n="">{Number(x.day.slice(8))}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A key point's sentence (DeptSummary's Sentence), with a name already in Tamil as published (a Tamil headline: glance.ts `raw`) marked
 * translate="no", so the site's translator leaves it as the outlet wrote it.
 */
function GlanceSentence({ s }: { s: Seg[] }) {
  const out: React.ReactNode[] = [];
  let run: Seg[] = [];
  s.forEach((x, k) => {
    if (typeof x === "string" || !x.raw) { run.push(x); return; }
    if (run.length) out.push(<Sentence key={`r${k}`} s={run} />);
    run = [];
    out.push(<em key={k} className="seg-nm" lang="ta" translate="no">{x.nm}</em>);
  });
  if (run.length) out.push(<Sentence key="end" s={run} />);
  return <>{out}</>;
}

/** (exported 28 Nov: the officer console's briefing draws its key points with these, so both consoles' briefings look and work alike) */
export function Group({ title, icon, points, ta, open, none, children }: { title: string; icon: IconName; points: GlancePoint[]; ta: boolean; open: (o: GlanceOpen) => void; none: string; children?: React.ReactNode }) {
  return (
    <div className="gl-g">
      <h4 data-say=""><I n={icon} />{title}</h4>
      {points.length || children ? (
        <ul lang={ta ? "ta" : "en"}>
          {points.map((p) => (
            <li key={p.key}>
              <button className={`gl-p tn-${p.tone}`} onClick={() => open(p.open)} title={p.act}>
                <span className="gl-i"><I n={p.icon as IconName} /></span>
                <span className="gl-t" data-say=""><GlanceSentence s={(ta ? p.ta : p.en) as Seg[]} /></span>
                <I n="chevr" />
              </button>
            </li>
          ))}
          {children ? <li>{children}</li> : null}
        </ul>
      ) : <Calm>{none}</Calm>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ by department --

/** Each department in one line: what it received, what is late, deaths and severe. A click opens its summary (DeptSummary.tsx). */
function Departments({ m, c }: { m: Model; c: Console }) {
  const rows = m.departments;
  const [ref, hidden] = useFit<HTMLUListElement>(rows.map((x) => `${x.code}:${x.n}:${x.dead}:${x.severe}:${x.overdue}`).join());
  return (
    <section className="bb-card bb-depts">
      <Head ic="gov" title="Departments" n={rows.length || undefined} note={`what each received · ${labelLower(m.periodLabel)}`} more={rows.length ? () => c.openDepts() : undefined} />
      {rows.length ? (
        <>
          <ul ref={ref} className="bb-fit bb-dl">
            {rows.map((x) => (
              <li key={x.code} data-code={x.code}>
                <button className="dp-row" onClick={() => c.openDept(x.code)} title="Open the department's summary">
                  <span className="bb-dic"><I n={deptIcon(x.code)} /></span>
                  <span className="dp-main">
                    <span className="dp-n">{x.name}</span>
                    <span className="dp-tags">
                      {x.dead > 0 && <em className="dead">{`${num(x.dead)} dead`}</em>}
                      {x.severe > 0 && <em className="sev">{`${num(x.severe)} severe`}</em>}
                      {x.overdue > 0 && <em className="late">{`${num(x.overdue)} late`}</em>}
                      {!x.dead && !x.severe && !x.overdue && <em className="calm">{`${num(x.open)} open`}</em>}
                    </span>
                  </span>
                  <b className="dp-k" title={`${num(x.n)} reports in the period, ${num(x.open)} still open`}>{num(x.n)}<small>reports</small></b>
                  <I n="chevr" />
                </button>
              </li>
            ))}
          </ul>
          <More n={hidden} what={["department", "departments"]} onClick={() => c.openDepts()} />
        </>
      ) : <div className="bb-fit"><Calm>No department received a report in this period.</Calm></div>}
    </section>
  );
}

/** The foot of a list whose last rows did not fit: how many more, and one click to all of them. */
function More({ n, what, onClick }: { n: number; what: [string, string]; onClick: () => void }) {
  if (n <= 0) return null;
  return <button className="bb-foot" onClick={onClick}>{`${num(n)} more ${n === 1 ? what[0] : what[1]}`}<I n="chevr" /></button>;
}

// ------------------------------------------------------------------------------------------------------- the news --

/**
 * Stories that really developed (storyai.ts): each told as one short timeline, every event once, oldest first. The card shows how it began
 * and its last two events; the rest open in the story. Until the AI has read them the rules' own events are shown.
 */
function Developing({ m, c }: { m: Model; c: Console }) {
  const data = m.stories;
  const threads = data?.threads ?? [];
  const [ref, hidden] = useFit<HTMLUListElement>(threads.map((t) => `${t.id}:${t.events.length}`).join());
  return (
    <section className="bb-card grow bb-dev">
      <Head ic="pulse" title="Stories still developing" n={data ? threads.length : undefined} note={data?.pending ? "AI is reading…" : undefined}
        more={threads.length ? () => c.openStories(null) : undefined} />
      {!data ? (
        <div className="bb-fit">{m.saved ? <Calm>The stories had not loaded when this version was saved.</Calm>
          : <p className="dp-brief wait" style={{ margin: "2px 14px" }}><I n="ai" />Joining reports about the same event…</p>}</div>
      ) : threads.length ? (
        <ul ref={ref} className="bb-fit">
          {threads.map((s) => {
            // what developed: the story's last two steps (the earlier ones open with the story), so two stories fit the card whole
            const ev = s.events;
            const shown = ev.slice(-2);
            const earlier = ev.length - shown.length;
            return (
              <li key={s.id}>
                <button className="bb-story sl" onClick={() => c.openStories(s.id)} title={s.ai?.now ?? "Open the story's timeline"}>
                  <span className="sl-h"><b>{s.title}</b>{s.ai && <span className={`sl-st ${s.ai.status}`}>{STORY_STATUS[s.ai.status]}</span>}</span>
                  <span className="sl-line">
                    {shown.map((x, k) => (
                      <span key={k} className={`sl-ev${k === shown.length - 1 ? " last" : ""}`} style={{ "--c": stepColour(x.label) } as React.CSSProperties}
                        title={`${fmtDate(x.t)}: ${x.what}`}>
                        <time>{fmtDate(x.t)}</time><i /><span><em>{x.label}</em>{x.what}</span>
                      </span>
                    ))}
                  </span>
                  <small>{earlier > 0 ? `latest ${shown.length} of ${ev.length} events` : `${ev.length} ${ev.length === 1 ? "event" : "events"}`} · {s.outlets.slice(0, 2).join(", ")}{s.outlets.length > 2 ? ` +${s.outlets.length - 2}` : ""} · updated {rel(s.last, m.now)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <div className="bb-fit"><Calm>No story developed further in this period.</Calm></div>}
      {data && <More n={hidden} what={["story", "stories"]} onClick={() => c.openStories(null)} />}
    </section>
  );
}

function NewsOnly({ m, c }: { m: Model; c: Console }) {
  const rows = m.gaps;
  const [ref, hidden] = useFit<HTMLUListElement>(rows.map((g) => g.id).join());
  return (
    <section className="bb-card grow bb-gaps">
      <Head ic="news" title="Only in the news" n={rows.length} note="no department record" more={rows.length ? () => c.openGaps() : undefined} />
      {rows.length ? (
        <ul ref={ref} className="bb-fit">
          {rows.map((g) => (
            <li key={g.id}>
              <button className="bb-item" onClick={() => c.openInc(g.id)} title="Open the incident and its news reports">
                <i style={{ background: SEV_HEX[g.sev ?? ""] ?? "var(--text-4)" }} />
                <b>{g.title || g.type}</b>
                <small>{[g.zone_name ?? "Chennai", g.dept_name ? `for ${g.dept_name}` : null, g.t ? rel(g.t, m.now) : null].filter(Boolean).join(" · ")}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="bb-fit"><Calm>{m.whole ? "Every incident in the news has a department record." : "Nothing in this view is only in the news."}</Calm></div>}
      <More n={hidden} what={["incident", "incidents"]} onClick={() => c.openGaps()} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------- a version saved before 28 Nov --

/**
 * A version that kept only the written briefing (saved before 28 Nov, or from a chat answer's "Save as workspace", which has no page to copy):
 * shown on the Briefing page's own card, said to be in the written format, rather than as the old Briefing page. Its figures cannot be redrawn
 * as key points (the data of that moment was not kept).
 */
function SavedText({ s, c }: { s: Extract<SavedBrief, { kind: "text" }>; c: Console }) {
  const html = useMemo(() => mdToHtml(s.md), [s.md]);
  return (
    <section className="bb bb2 bb-saved">
      <section className="bb-card bb-brief gl gl-text">
        <Head ic="scroll" title="Saved briefing">
          {s.asOf && <SavedChip asOf={s.asOf} savedAt={c.saved?.savedAt ?? s.issuedAt} />}
          {c.backToLive && <button className="lnk gl-live" onClick={c.backToLive} title="Leave the saved workspace and show the live dashboard">Back to live dashboard</button>}
          <span className="bb-note">This version kept only the written briefing. Versions saved from Workspaces in the Menu reopen with the key points, as the live page shows them.</span>
        </Head>
        <div className="gl-md md" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </section>
  );
}
