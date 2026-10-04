"use client";

import { useEffect, useState } from "react";
import type { Insights } from "@/lib/collector/insights";
import type { Overview as OverviewData } from "@/lib/collector/intel";
import { I, type IconName } from "./icons";
import { SEV_HEX, deptIcon, fmtDate, fmtShort, fmtTime, rel, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import { canSpeak, speak, stopSpeaking } from "./assistant/speech";
import { download } from "./Insights";
import { STAGE_COL } from "./Stories";
import { feedName } from "./Overlays";

type Book = Insights["book"];
type Lang = "en" | "ta";

const STATUS = { normal: "Normal", watchful: "Watchful", alert: "Alert" } as const;
const longDate = (s: string) => new Date(s.replace(" ", "T")).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** One incident as the brief tells it, from the critical list (open severe) or the attention list (needs the Collector). */
interface Lead { id: string; title: string; sev: string; place: string; dept: string | null; status: string; t: string | null; summary: string;
  reasons: string[]; next: string | null; owner: string | null; evidence: string | null; dead: number; overdue: boolean }

function leads(ins: Insights): Lead[] {
  const out: Lead[] = [];
  const seen = new Set<string>();
  for (const i of ins.book.critical as Row[]) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push({ id: i.id, title: i.title || i.type, sev: i.sev, place: [i.loc, i.zone_name].filter(Boolean).join(", ") || "Chennai", dept: i.dept_name ?? i.dept ?? null,
      status: i.status, t: i.t ?? null, summary: i.why?.summary ?? "", reasons: i.why?.attention?.length ? i.why.attention : i.why?.facts ?? [], next: i.why?.next ?? null,
      owner: null, evidence: null, dead: Number(i.dead ?? 0), overdue: Number(i.breached) === 1 });
  }
  for (const a of ins.briefing.attention as Row[]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ id: a.id, title: a.title, sev: a.sev, place: a.zone ?? "Chennai", dept: a.dept ?? null, status: a.status, t: null, summary: a.why?.summary ?? "",
      reasons: a.why?.attention ?? [], next: a.next?.text ?? null, owner: a.next?.owner ?? null, evidence: a.evidence ?? null, dead: 0, overdue: !!a.overdue });
  }
  return out.slice(0, 6);
}

/**
 * Page 2: the District Intelligence Brief. One composed document on one screen: the masthead, the executive situation
 * with its signals, the ranked critical incidents, what is only in the news, developing stories, the actions waiting on
 * the Collector, pattern signals and pressure, the news that matters, department follow-up and the sources behind it.
 * Every line comes from the store or the pipeline's checked AI notes; nothing here computes a new figure.
 */
export function BriefingBook({ ins, d, c }: { ins: Insights; d?: OverviewData; c: Console }) {
  const b = ins.book;
  const [lang, setLang] = useState<Lang>("en");
  const story = b.glance.ai ?? b.glance.opening;
  const lead = (lang === "ta" && story?.ta) || story?.en || ins.briefing.headline.join(" ");
  const L = leads(ins);
  const t = b.glance.tiles;
  const st = ins.briefing.stats;
  const threads = d?.stories?.threads ?? [];

  return (
    <section className="xb">
      <Mast b={b} c={c} ins={ins} d={d} lang={lang} setLang={setLang} text={lead} tamil={Boolean(story?.ta)} />

      <div className="xb-a">
        <section className="xb-sit">
          <div className="xb-eyebrow"><span>Executive situation</span>{b.glance.ai && <em>AI-written from checked facts · {b.glance.ai.writtenFor ?? "today"}</em>}</div>
          <p className="xb-lead" lang={lang === "ta" && story?.ta ? "ta" : "en"}>{lead}</p>
          {b.status.warning && <p className="xb-warn"><I n="cloud" /><b>IMD warning</b>{b.status.warning.text}</p>}
          <div className="xb-signals" role="list">
            <Signal tone="sev" v={t.severe} l="Severe" sub="reported" onClick={() => c.openList({ sev: "Severe" }, "Severe events")} />
            <Signal tone="sev" v={t.deaths} l="Deaths" sub="reported" />
            <Signal tone="high" v={st.overdue} l="Overdue" sub="past deadline" onClick={() => c.openList({ status: "overdue", sort: "sev", dir: 1 }, "Open and past deadline")} />
            <Signal tone="violet" v={ins.gaps.length} l="News only" sub="no dept record" onClick={() => c.openGaps()} />
            <Signal tone="signal" v={d?.stories?.total ?? threads.length} l="Developing" sub="stories" onClick={() => c.openStories(null)} />
            <Signal tone="med" v={t.awaiting} l="Awaiting you" sub="to verify" onClick={() => c.openList({ status: "awaiting", scope: "all", sort: "sev", dir: 1 }, "Closed work for you to check")} />
          </div>
        </section>

        <section className="xb-sec xb-crit">
          <Head ic="alert" title="Critical incidents" note="ranked by the console's priority" count={L.length} />
          <ol className="xb-list">
            {L.length ? L.map((x, k) => <LeadRow key={x.id} x={x} k={k} c={c} now={ins.now} />)
              : <Calm>No severe incident is open and nothing needs the Collector right now.</Calm>}
          </ol>
        </section>
      </div>

      <div className="xb-b">
        <section className="xb-sec xb-gaps">
          <Head ic="news" title="Intelligence gaps" note="reported externally · missing internally" count={ins.gaps.length} more={ins.gaps.length > 0 ? () => c.openGaps() : undefined} />
          <div className="xb-scroll">
            {ins.gaps.length ? (ins.gaps as Row[]).slice(0, 6).map((g) => (
              <button key={g.id} className="xb-gap" onClick={() => c.openInc(g.id)} title="Open the incident and its news evidence">
                <span className="xb-gtag">News only</span>
                <b>{g.title || g.type}</b>
                <small>{[g.zone_name ?? "Chennai", g.dept_name ? `belongs to ${g.dept_name}` : null, g.t ? `first reported ${rel(g.t, ins.now)}` : null].filter(Boolean).join(" · ")}</small>
              </button>
            )) : <Calm>Every news-reported incident has a department record.</Calm>}
          </div>
        </section>

        <section className="xb-sec xb-dev">
          <Head ic="pulse" title="Developing stories" note="the same event, reported again" count={d?.stories?.total} more={threads.length ? () => c.openStories(null) : undefined} />
          <div className="xb-scroll">
            {threads.length ? threads.slice(0, 5).map((s) => (
              <button key={s.id} className="xb-thread" onClick={() => c.openStories(s.id)} title="Open the story's timeline">
                <span className="xb-th-h"><i style={{ background: s.sev ? SEV_HEX[s.sev] : "var(--text-3)" }} /><b>{s.title}</b></span>
                <span className="xb-track">
                  {(s.stages.length > 4 ? [...s.stages.slice(0, 3), s.stages[s.stages.length - 1]] : s.stages).map((g) => (
                    <span key={g.stage} style={{ "--sc": STAGE_COL[g.stage] ?? "var(--accent)" } as React.CSSProperties}><em>{fmtDate(g.t)}</em>{g.stage}</span>
                  ))}
                </span>
                <small>{s.reports} reports · {s.outlets.length} outlet{s.outlets.length === 1 ? "" : "s"}{s.place ? ` · ${s.place}` : ""} · latest {rel(s.last, ins.now)}</small>
              </button>
            )) : <Calm>No event has been reported more than once in this period.</Calm>}
          </div>
        </section>
      </div>

      <aside className="xb-c">
        <section className="xb-sec xb-now">
          <Head ic="target" title="Needs attention now" />
          <div className="xb-acts">
            <Act verb="Verify" tone="med" n={t.awaiting} what="completions waiting for your check" onClick={() => c.openList({ status: "awaiting", scope: "all", sort: "sev", dir: 1 }, "Closed work for you to check")} />
            <Act verb="Overdue" tone="high" n={st.overdue} what="open incidents past their deadline" onClick={() => c.openList({ status: "overdue", sort: "sev", dir: 1 }, "Open and past deadline")} />
            <Act verb="Review" tone="violet" n={ins.gaps.length} what="news reports with no department record" onClick={() => c.openGaps()} />
            <Act verb="Follow up" tone="accent" n={ins.patterns.emerging.length} what="unusual spikes in reports" onClick={ins.patterns.emerging[0] ? () => {
              const e = ins.patterns.emerging[0] as Row;
              c.openPattern({ kind: "spike", cat: e.cat, zone: e.zone != null ? Number(e.zone) : null, date: e.date });
            } : undefined} />
          </div>
        </section>

        <section className="xb-sec xb-sig">
          <Head ic="spark" title="Pattern signals" note="where pressure is building" />
          <div className="xb-scroll">
            {(ins.patterns.emerging as Row[]).slice(0, 3).map((e, k) => (
              <button key={`s${k}`} className="xb-signal" onClick={() => c.openPattern({ kind: "spike", cat: e.cat, zone: e.zone != null ? Number(e.zone) : null, date: e.date })}>
                <span className="xb-kind spike">Spike</span>
                <b>{e.label} · {e.zone_name ?? "District"}</b>
                <em>{Math.round(Number(e.ratio))}×</em>
              </button>
            ))}
            {(ins.patterns.hotspots as Row[]).slice(0, 3).map((h) => (
              <button key={h.id} className="xb-signal" onClick={() => c.openPattern({ kind: "hotspot", id: h.id })}>
                <span className="xb-kind hot">Hotspot</span>
                <b>{h.label} · {h.top_place}</b>
                <em>{h.incidents_30d}<small>/30d</small></em>
              </button>
            ))}
            {b.where.length > 0 && <Pressure where={b.where} c={c} />}
            {!ins.patterns.emerging.length && !ins.patterns.hotspots.length && !b.where.length && <Calm>No unusual pattern in this period.</Calm>}
          </div>
        </section>

        <section className="xb-sec xb-news">
          <Head ic="news" title="News that matters" note={b.newsAi ? "picked by AI · 36 h" : "last 36 h"} />
          <div className="xb-scroll">
            {b.news.length ? (b.news as Row[]).slice(0, 5).map((x) => (
              <a key={x.id} className="xb-story" href={x.url} target="_blank" rel="noreferrer">
                <b>{x.line ?? x.title}</b>
                <small>{[x.publisher, Number(x.outlets) > 1 ? `${x.outlets} outlets` : null, x.noRecord ? "no department record" : null].filter(Boolean).join(" · ")}</small>
              </a>
            )) : <Calm>No major Chennai story in the last 36 hours.</Calm>}
          </div>
        </section>
      </aside>

      <section className="xb-dept">
        <Head ic="gov" title="Department follow-up" note="open work by department, most serious first" />
        <DeptTable ins={ins} c={c} />
      </section>

      <Evidence d={d} c={c} ins={ins} />
    </section>
  );
}

function Mast({ b, c, ins, d, lang, setLang, text, tamil }: { b: Book; c: Console; ins: Insights; d?: OverviewData; lang: Lang; setLang: (l: Lang) => void; text: string; tamil: boolean }) {
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    setTalking(speak(text, lang === "ta" ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  const pick = (l: Lang) => { stopSpeaking(); setTalking(false); setLang(l); };
  const feeds = d?.feeds ?? [];
  const live = feeds.filter((f) => f.status === "ok" || f.status === "degraded").length;
  return (
    <header className="xb-mast">
      <div className="xb-title">
        <span className="xb-kicker"><i />District Intelligence Brief</span>
        <h2>{!ins.scope || /^(district-wide|chennai district)$/i.test(ins.scope) ? "Chennai District" : ins.scope}</h2>
        <span className="xb-meta">
          <b>{c.periodLabel}</b><span>{longDate(c.now)}</span><span>as of {fmtTime(ins.now)} IST</span>
          {feeds.length > 0 && <span className={live === feeds.length ? "ok" : "warn"}><i />{live} of {feeds.length} sources live</span>}
        </span>
      </div>
      <div className={`xb-status ${b.status.level}`} title={b.status.reasons.join(", ") || "Nothing unusual"}>
        <span className="xb-dot" />
        <span><small>District status</small><b>{STATUS[b.status.level]}</b></span>
        <em>{b.status.reasons.slice(0, 2).join(" · ") || "Nothing unusual"}</em>
      </div>
      <div className="xb-tools">
        {tamil && <span className="xb-lang" role="group" aria-label="Language"><button className={lang === "en" ? "on" : ""} onClick={() => pick("en")}>EN</button>
          <button className={lang === "ta" ? "on" : ""} onClick={() => pick("ta")}>தமிழ்</button></span>}
        {voice && <button className="xb-btn pri" onClick={listen} title={talking ? "Stop" : "Read the briefing aloud"}><I n={talking ? "stop" : "volume"} />{talking ? "Stop" : "Listen"}</button>}
        <button className="xb-btn" onClick={() => window.print()} title="Print or save as PDF" aria-label="Print"><I n="download" /></button>
        <button className="xb-btn" onClick={() => download(`collector-briefing-${c.period}.md`, bookMarkdown(b, ins, text))} title="Download as text" aria-label="Download as text"><I n="doc" /></button>
        <button className="xb-btn" onClick={() => c.openWorkspace()} title="Save this view" aria-label="Save this view"><I n="bookmark" /></button>
      </div>
    </header>
  );
}

function Head({ ic, title, note, count, more }: { ic: IconName; title: string; note?: string; count?: number; more?: () => void }) {
  return (
    <div className="xb-head">
      <I n={ic} /><h3>{title}</h3>{count != null && <span className="xb-n">{count}</span>}
      {note && <span className="xb-note">{note}</span>}
      {more && <button className="xb-more" onClick={more}>All<I n="chevr" /></button>}
    </div>
  );
}

function Signal({ v, l, sub, tone, onClick }: { v: number; l: string; sub: string; tone: string; onClick?: () => void }) {
  const body = <><b className={v ? "" : "zero"}>{v.toLocaleString("en-IN")}</b><span>{l}<small>{sub}</small></span></>;
  return onClick ? <button role="listitem" className={`xb-sg ${tone}`} onClick={onClick}>{body}</button> : <div role="listitem" className={`xb-sg ${tone}`}>{body}</div>;
}

function LeadRow({ x, k, c, now }: { x: Lead; k: number; c: Console; now: string }) {
  const first = k === 0;
  return (
    <li className={`xb-lead-i${first ? " xb-first" : ""}`} style={{ "--c": SEV_HEX[x.sev] ?? "var(--accent)" } as React.CSSProperties}>
      <span className="xb-rank">{String(k + 1).padStart(2, "0")}</span>
      <div className="xb-li-b">
        <div className="xb-li-h">
          <span className="xb-sev">{x.sev}</span>
          {x.dead > 0 && <span className="xb-tag sev">{x.dead} dead</span>}
          {x.overdue && <span className="xb-tag high">Past deadline</span>}
          <span className="xb-tag">{x.status}</span>
        </div>
        <button className="xb-li-t" onClick={() => c.openInc(x.id)}>{x.title}</button>
        <span className="xb-li-m"><I n="pin" />{x.place}{x.dept && <><I n={deptIcon(null)} />{x.dept}</>}{x.t && <><I n="clock" />{rel(x.t, now)}</>}</span>
        {first && x.summary && <p className="xb-li-s">{x.summary}</p>}
        {x.reasons.length > 0 && (
          <div className="xb-why"><small>Why it matters</small>{x.reasons.slice(0, first ? 4 : 2).map((r) => <span key={r}>{r}</span>)}</div>
        )}
        {first && x.next && <p className="xb-next"><small>Next step</small>{x.next}{x.owner ? <em> · {x.owner}</em> : null}</p>}
      </div>
      <button className="xb-open" onClick={() => c.openInc(x.id)} aria-label={`Open ${x.title}`}><I n="chevr" /></button>
    </li>
  );
}

function Act({ verb, n, what, tone, onClick }: { verb: string; n: number; what: string; tone: string; onClick?: () => void }) {
  return (
    <button className={`xb-act ${tone}${n ? "" : " none"}`} onClick={onClick} disabled={!onClick || !n}>
      <span className="xb-verb">{verb}</span>
      <b>{n.toLocaleString("en-IN")}</b>
      <small>{what}</small>
      <I n="chevr" />
    </button>
  );
}

function Pressure({ where, c }: { where: Book["where"]; c: Console }) {
  const top = where.slice(0, 4);
  const max = Math.max(1, ...top.map((z) => z.n));
  return (
    <div className="xb-press">
      <small>Most reports today, by zone</small>
      {top.map((z) => (
        <button key={z.zone} onClick={() => { c.setZone(z.zone); c.setPage("overview"); }} title={z.kinds.length ? `Mostly ${z.kinds.join(", ")}` : undefined}>
          <span>{z.name}</span>
          <i><u style={{ width: `${(z.n / max) * 100}%` }} />{z.severe > 0 && <u className="sev" style={{ width: `${(z.severe / max) * 100}%` }} />}</i>
          <b>{z.n}</b>
        </button>
      ))}
    </div>
  );
}

function DeptTable({ ins, c }: { ins: Insights; c: Console }) {
  const rows = [...ins.deptActions].filter((d) => d.open > 0)
    .sort((a, b) => b.serious - a.serious || b.overdue - a.overdue || b.open - a.open).slice(0, 6);
  if (!rows.length) return <Calm>No department has open work in this period.</Calm>;
  return (
    <div className="xb-tbl">
      <div className="xb-tr xb-th"><span>Department</span><span>Open</span><span>Serious</span><span>Overdue</span><span>Awaiting</span><span>Top follow-up</span></div>
      {rows.map((d) => {
        const f = d.followUps[0];
        return (
          <div key={d.code} className="xb-tr">
            <button className="xb-dn" onClick={() => c.setDept(d.code)} title={`Show the console for ${d.name}`}><I n={deptIcon(d.code)} /><b>{d.name}</b></button>
            <span className="xb-num">{d.open}</span>
            <span className={`xb-num${d.serious ? " sev" : ""}`}>{d.serious}</span>
            <span className={`xb-num${d.overdue ? " high" : ""}`}>{d.overdue}</span>
            <span className={`xb-num${d.awaiting ? " med" : ""}`}>{d.awaiting}</span>
            {f ? (
              <button className="xb-fu" onClick={() => c.openInc(f.id)}>
                <i style={{ background: SEV_HEX[f.sev] ?? "var(--text-3)" }} /><b>{f.title}</b>
                {f.next?.text && <small>{f.next.text}</small>}
              </button>
            ) : <span className="xb-dim">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function Evidence({ d, c, ins }: { d?: OverviewData; c: Console; ins: Insights }) {
  const feeds = d?.feeds ?? [];
  return (
    <footer className="xb-ev">
      <span className="xb-ev-l"><I n="layers" />Evidence</span>
      {feeds.map((f) => (
        <button key={f.source} className={`xb-feed ${f.status === "ok" ? "ok" : f.status === "degraded" ? "part" : "bad"}`} onClick={() => c.openFeeds()}
          title={`${feedName(f.source)}: ${f.status}${f.newest ? `, newest record ${fmtShort(f.newest)}` : ""}`}>
          <i />{feedName(f.source)}{f.newest && <small>{rel(f.newest, ins.now)}</small>}
        </button>
      ))}
      <span className="xb-ev-r">{ins.briefing.method}</span>
    </footer>
  );
}

const Calm = ({ children }: { children: React.ReactNode }) => <p className="xb-calm"><I n="checkc" />{children}</p>;

/** Rule text when a department has no AI brief: what came in, and the most serious. */
function deptStory(x: Book["departments"][number]): string {
  const kinds = [...new Set(x.items.map((i) => i.type.toLowerCase()))].slice(0, 2);
  const places = [...new Set(x.items.map((i) => i.zone).filter(Boolean))].slice(0, 2);
  const top = x.items[0];
  return `${kinds.length ? `Mostly ${kinds.join(" and ")}` : "New reports"}${places.length ? ` in ${places.join(" and ")}` : ""}.` +
    (top ? ` Most serious: ${top.title}${top.dead ? `, ${top.dead} dead` : ""} (${top.status.toLowerCase()}).` : "");
}

function bookMarkdown(b: Book, ins: Insights, lead: string): string {
  const t = b.glance.tiles;
  return [`# Collector's Briefing, ${ins.scope}`, `_As of ${ins.now} · District status: ${STATUS[b.status.level]}${b.status.reasons.length ? ` (${b.status.reasons.join(", ")})` : ""}_`, "",
    `Reported ${t.reported} · Severe ${t.severe} · Deaths ${t.deaths} · Awaiting you ${t.awaiting}`, "", "## Today in brief", lead, "",
    "## Critical now", ...b.critical.map((i, k) => `${k + 1}. **${i.title}** (${i.zone_name ?? "Chennai"}, ${i.status}). ${i.why.summary}${i.why.next ? ` Next: ${i.why.next}` : ""}`), "",
    "## Departments: what came in today", ...b.departments.map((x) => `- **${x.name}** (${x.n} new${x.severe ? `, ${x.severe} severe` : ""}): ${x.ai?.en ?? deptStory(x)}`), "",
    "## News that matters", ...b.news.map((x) => `- ${x.line ?? x.title} (${x.publisher})${x.why ? `: ${x.why}` : ""}`), "",
    "## Health", ...(b.health.ai ? [b.health.ai.en] : []), "", "## Law & order", ...(b.law.ai ? [b.law.ai.en] : []),
    ...b.law.rising.map((r) => `- Rising: ${r.label}`), ...b.law.falling.map((r) => `- Falling: ${r.label}`), "",
    "## Good news", `- ${b.good.resolved} incidents resolved`, ...b.good.falling.map((f) => `- Fewer: ${f.label}`)].join("\n") + "\n";
}
