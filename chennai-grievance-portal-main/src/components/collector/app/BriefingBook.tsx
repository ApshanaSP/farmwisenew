"use client";

import { useLang } from "@/lib/i18n/lang";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Insights } from "@/lib/collector/insights";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import { composeGlance, glanceNumbers, plain, type Glance, type GlanceIn, type GlanceOpen, type GlancePoint, type Seg } from "@/lib/collector/glance";
import { checkOpening } from "@/lib/collector/opening";
import { PERIODS, dayStart, labelLower } from "@/lib/period/day";
import { I, type IconName } from "./icons";
import { SEV_HEX, deptIcon, fmtDate, ms, rel, useFit, type Row } from "./lib";
import { STORY_STATUS, stepColour } from "./Stories";
import { differView } from "./Conflicts";
import { Sentence } from "./DeptSummary";
import { Legend } from "./MiniCharts";
import { combine, type Story } from "./Overview";
import type { Console } from "./CollectorApp";
import { greeting } from "./Shell";
import { canSpeak, speak, stopSpeaking } from "./assistant/speech";

type Book = NonNullable<Insights["book"]>;
type Lang = "en" | "ta";

const STATUS = { normal: "Normal", watchful: "Watchful", alert: "Alert" } as const;
const num = (v: number) => v.toLocaleString("en-IN");

/**
 * Page 2, read top to bottom in half a minute. Across the top, "Today at a glance": one sentence, the figures (each its tile's), what is
 * happening, what needs the Collector, what to do next; composed by code for the filters in force (glance.ts). Under it: each department in
 * one line (a click opens its summary), stories that really developed, and what is only in the news.
 */
export function BriefingBook({ ins, d, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const b = ins.book!;
  return (
    <section className="bb bb2">
      <Today ins={ins} b={b} d={d} c={c} />
      <div className="bb2-row">
        <Departments b={b} c={c} />
        {/* the Collector's own datasets are on the Environment page now (pinned from the Data Studio), not here */}
        <Developing ins={ins} c={c} />
        <NewsOnly ins={ins} c={c} />
      </div>
    </section>
  );
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
export function glanceInput(ins: Insights, b: Book, live: OverviewData | null, c: Console): GlanceIn {
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
    news: story ? { title: story.title, outlets: story.outletNames.length, act: story.desk?.v === "act", key: story.id, incident: story.incident }
      : linked ? { title: String(linked.news_title ?? linked.title ?? linked.type), outlets: linked.outletNames?.length ?? 0, act: false, key: String(linked.id), incident: String(linked.id) } : null,
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

/**
 * The AI's one-line headline of the same view, only when every figure and every "more" or "fewer" in it is one the glance itself states
 * (opening.ts): otherwise the sentence the code wrote, which is always current.
 */
function aiSentence(c: Console, ins: Insights, g: Glance, f: GlanceIn): { en: string; ta: string | null } | null {
  const b = c.dayBrief?.brief;
  if (!b?.headline || g.empty) return null;
  return checkOpening({ asOf: ins.now, en: b.headline, ta: b.headlineTa }, { now: ins.now, hours: PERIODS[c.period].hours,
    facts: { reported: f.cur.reported ?? 0, prev: f.prev.reported ?? null, severe: f.cur.severe ?? 0, prevSevere: f.prev.severe ?? null, open: f.cur.ongoing ?? 0, overdue: f.overdue,
      newsOnly: f.newsOnly?.n ?? 0, deaths: f.deaths, injured: f.injured, awaiting: f.awaiting }, extra: glanceNumbers(g) }).opening;
}

/** "Today at a glance": the Collector's key points for the filters in force. */
function Today({ ins, b, d, c }: { ins: Insights; b: Book; d?: OverviewData; c: Console }) {
  const [uiLang] = useLang();
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { setLang(uiLang === "ta" ? "ta" : "en"); }, [uiLang]);
  const ta = lang === "ta";
  const live = sameView(d, c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => glanceInput(ins, b, live, c), [ins, b, live, c.stories, c.conflicts, c.period, c.zone, c.dept, c.cat, c.taluk, c.scopeName]);
  const g = useMemo(() => composeGlance(f), [f]);
  const ai = useMemo(() => aiSentence(c, ins, g, f), [c.dayBrief, ins, g, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useOpen(ins, b, live, c);
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

  const level = b.status.level, why = b.status.reasons;
  const name = c.period === "daily" ? "Today at a glance" : `${PERIODS[c.period].label} at a glance`;
  const warned = !b.today.whole && b.alerts?.banner ? b.alerts.banner.title.split(" · ").slice(0, 2).join(" · ") : null;
  return (
    <section className="bb-card bb-brief gl" ref={box}>
      <Head ic="scroll" title={name}>
        <span className={`gl-scope${b.today.whole ? "" : " on"}`}><I n={b.today.whole ? "map" : "sliders"} />{b.today.whole ? "Whole district" : c.scopeName}</span>
        <span className={`bb-status lv-${level}`} title={b.today.whole ? "District status, by fixed rules: deaths, severe incidents, and warnings from IMD, NDMA SACHET and the news" : "Status of this view, by fixed rules: its deaths and severe incidents"} data-tip={why.join(" · ") || undefined}>
          <i /><b>{STATUS[level]}</b>{why.length > 0 && <span>{why.join(" · ")}</span>}
        </span>
        {/* a warning is the whole district's: under a filter it is named as such, never as the view's */}
        {warned && <button className="gl-wide" onClick={() => c.openRain?.()} title="Open Rain & flooding"><I n="cloud" /><b>District-wide</b><span>{warned}</span></button>}
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
        <span className="gl-hi" data-say="">{`${greeting(ins.now)}, Collector`}</span>
        {aiText ? <><span data-no-i18n="" data-say="">{aiText}</span><em className="gl-ai" title="Worded by AI from this view's records; every figure checked against the ones below"><I n="ai" />AI</em></> : <span data-say=""><Sentence s={ta ? g.situation.ta : g.situation.en} /></span>}
      </p>
      <div className="gl-grid">
        <div className="gl-nums">
          {g.figures.map((x) => <Fig key={x.key} x={x} open={open} />)}
          <Week days={b.today.days} now={ins.now} />
        </div>
        <Group title="What is happening" icon="pulse" points={g.happening} ta={ta} open={open}
          none={g.empty ? "Nothing was reported or resolved in this view." : "Nothing stands out in this view."} />
        <Group title="What needs you" icon="alert" points={g.needs} ta={ta} open={open} none="Nothing waits for you in this view.">
          {g.needs.length < 4 && b.citizens.oldest && (
            <button className="bb-fact" onClick={() => c.openInc(b.citizens.oldest!.id)} title="Open the oldest open complaint of this period">
              <I n="clock" /><b>Oldest open complaint</b><span>{rel(b.citizens.oldest.t, ins.now)}</span><span className="ttl">{b.citizens.oldest.title}</span><I n="chevr" />
            </button>
          )}
        </Group>
        <Group title="What to do next" icon="tasks" points={g.next} ta={ta} open={open} none="No step is needed from you in this view." />
      </div>
    </section>
  );
}

/** What a click on a figure or a point does: the list, the case, the story or the page its figure comes from. */
function useOpen(ins: Insights, b: Book, live: OverviewData | null, c: Console) {
  return (o: GlanceOpen) => {
    switch (o.k) {
      case "list": return c.openList(o.preset, o.title);
      case "inc": return c.openInc(o.id);
      case "act": return c.openAction(o.id);
      case "zone": return c.setZone(o.zone);
      case "dept": return c.openDept(o.code);
      case "story": return c.openStories(o.id);
      case "differ": { const s = differOf(b, c)[0]; return s ? c.openConflict(s) : undefined; }
      case "gaps": return c.openGaps();
      case "rain": return c.openRain?.();
      case "page": return c.setPage(o.page);
      case "rise": return c.openPattern({ kind: "spike", cat: o.cat, zone: o.zone, date: o.date });
      case "news": { const s = live?.allNews?.find((x) => x.id === o.key); return s ? c.openStory(s as Story) : c.openInc(o.key); }
    }
  };
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
function Week({ days, now }: { days: Book["today"]["days"]; now: string }) {
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

function Group({ title, icon, points, ta, open, none, children }: { title: string; icon: IconName; points: GlancePoint[]; ta: boolean; open: (o: GlanceOpen) => void; none: string; children?: React.ReactNode }) {
  return (
    <div className="gl-g">
      <h4 data-say=""><I n={icon} />{title}</h4>
      {points.length || children ? (
        <ul lang={ta ? "ta" : "en"}>
          {points.map((p) => (
            <li key={p.key}>
              <button className={`gl-p tn-${p.tone}`} onClick={() => open(p.open)} title={p.act}>
                <span className="gl-i"><I n={p.icon as IconName} /></span>
                <span className="gl-t" data-say=""><Sentence s={(ta ? p.ta : p.en) as Seg[]} /></span>
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
function Departments({ b, c }: { b: Book; c: Console }) {
  const rows = b.departments;
  return (
    <section className="bb-card bb-depts">
      <Head ic="gov" title="Departments" note={`what each received · ${labelLower(c.periodLabel)}`} more={rows.length ? () => c.openDepts() : undefined} />
      {rows.length ? (
        <ul className="dp-list two">
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
                <b className="dp-k" title={`${num(x.n)} reports in the period, ${num(x.open)} still open`}>{num(x.n)}</b>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="bb-fit"><Calm>No department received a report in this period.</Calm></div>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------- the news --

/**
 * Stories that really developed (storyai.ts): each told as one short timeline, every event once, oldest first. The card shows how it began
 * and its last two events; the rest open in the story. Until the AI has read them the rules' own events are shown.
 */
function Developing({ ins, c }: { ins: Insights; c: Console }) {
  const data = c.stories;
  const threads = data?.threads ?? [];
  const [ref] = useFit<HTMLUListElement>(threads.map((t) => `${t.id}:${t.events.length}`).join());
  return (
    <section className="bb-card grow bb-dev">
      <Head ic="pulse" title="Stories still developing" n={data ? threads.length : undefined} note={data?.pending ? "AI is reading…" : undefined}
        more={threads.length ? () => c.openStories(null) : undefined} />
      {!data ? (
        <div className="bb-fit"><p className="dp-brief wait" style={{ margin: "2px 14px" }}><I n="ai" />Joining reports about the same event…</p></div>
      ) : threads.length ? (
        <ul ref={ref} className="bb-fit">
          {threads.map((s) => {
            const ev = s.events;
            const shown = ev.length > 3 ? [ev[0], ...ev.slice(-2)] : ev;
            const hidden = ev.length - shown.length;
            return (
              <li key={s.id}>
                <button className="bb-story sl" onClick={() => c.openStories(s.id)} title={s.ai?.now ?? "Open the story's timeline"}>
                  <span className="sl-h"><b>{s.title}</b>{s.ai && <span className={`sl-st ${s.ai.status}`}>{STORY_STATUS[s.ai.status]}</span>}</span>
                  <span className="sl-line">
                    {shown.map((m, k) => (
                      <span key={k} className={`sl-ev${k === shown.length - 1 ? " last" : ""}${k === 0 && hidden > 0 ? " gap" : ""}`} style={{ "--c": stepColour(m.label) } as React.CSSProperties}
                        title={`${fmtDate(m.t)}: ${m.what}${k === 0 && hidden > 0 ? ` (${hidden} more before the next)` : ""}`}>
                        <time>{fmtDate(m.t)}</time><i /><span><em>{m.label}</em>{m.what}</span>
                      </span>
                    ))}
                  </span>
                  <small>{ev.length} events · {s.outlets.slice(0, 2).join(", ")}{s.outlets.length > 2 ? ` +${s.outlets.length - 2}` : ""} · updated {rel(s.last, ins.now)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <div className="bb-fit"><Calm>No story developed further in this period.</Calm></div>}
    </section>
  );
}

function NewsOnly({ ins, c }: { ins: Insights; c: Console }) {
  const rows = ins.gaps as Row[];
  const [ref] = useFit<HTMLUListElement>(rows.map((g) => g.id).join());
  return (
    <section className="bb-card grow bb-gaps">
      <Head ic="news" title="Only in the news" n={rows.length} note="no department record" more={rows.length ? () => c.openGaps() : undefined} />
      {rows.length ? (
        <ul ref={ref} className="bb-fit">
          {rows.map((g) => (
            <li key={g.id}>
              <button className="bb-item" onClick={() => c.openInc(g.id)} title="Open the incident and its news reports">
                <i style={{ background: SEV_HEX[g.sev] ?? "var(--text-4)" }} />
                <b>{g.title || g.type}</b>
                <small>{[g.zone_name ?? "Chennai", g.dept_name ? `for ${g.dept_name}` : null, g.t ? rel(g.t, ins.now) : null].filter(Boolean).join(" · ")}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="bb-fit"><Calm>{ins.book?.today.whole ? "Every incident in the news has a department record." : "Nothing in this view is only in the news."}</Calm></div>}
    </section>
  );
}
