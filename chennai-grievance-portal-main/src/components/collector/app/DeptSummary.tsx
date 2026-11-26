"use client";

/**
 * The department pop-up: what one department received, what is open and late, how it did in the last 7 days and the last 12 weeks, its most
 * important open cases, the news about its work and what it owes (deptsummary.ts). Opened by a click on a department anywhere; it follows
 * the console's period, zone, taluk and category, and says so. Nothing on the page is filtered until "Show only this department" is pressed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/lib/i18n/lang";
import type { DeptSummary } from "@/lib/collector/deptsummary";
import type { Seg } from "@/lib/collector/glance";
import { spanWords } from "@/lib/collector/deptwords";
import { labelLower } from "@/lib/period/day";
import { I, type IconName } from "./icons";
import { Empty, SEV_HEX, StChip, deptIcon, fmtDate, rel } from "./lib";
import { HBarsList, Legend, PairChart, SplitBar } from "./MiniCharts";
import { OfficerCard, type Story } from "./Overview";
import type { Console } from "./CollectorApp";

const num = (v: number) => v.toLocaleString("en-IN");
const SERIES: [string, string] = ["Reported", "Resolved"];

/**
 * A sentence with its names apart: the sentence is written in both languages, each name is left to the site's translator. The figures stand
 * out, except an hour ("12 AM") and what is in brackets (the period before), so the eye lands on today's numbers.
 */
export function Sentence({ s }: { s: Seg[] }) {
  return <>{s.map((x, k) => (typeof x === "string"
    ? <span key={k} data-no-i18n="">{x.split(/(\([^)]*\)|\d+(?:[.,]\d+)*%?(?![\d.,]*\d)(?! ?(?:[AP]M|மணி)))/).map((p, j) => (j % 2 && p[0] !== "(" ? <b key={j}>{p}</b> : p))}</span>
    : <em key={k} className="seg-nm">{x.nm}</em>))}</>;
}

/** Keep the keyboard inside the open window, start it on the close button, and give it back to what opened the window. */
function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current?.closest<HTMLElement>("[role=dialog]");
    if (!box) return;
    const was = document.activeElement as HTMLElement | null;
    box.querySelector<HTMLElement>(".xbtn")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = [...box.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null || x instanceof SVGElement);
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1], on = document.activeElement;
      if (e.shiftKey && (on === first || !box.contains(on))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (on === last || !box.contains(on))) { e.preventDefault(); first.focus(); }
    };
    box.addEventListener("keydown", onKey);
    return () => { box.removeEventListener("keydown", onKey); if (was?.isConnected) was.focus({ preventScroll: true }); };
  }, [ref]);
}

function Card({ title, sub, children, wide, legend }: { title: string; sub: string; children: ReactNode; wide?: boolean; legend?: boolean }) {
  return (
    <section className={`ds-card${wide ? " wide" : ""}`}>
      <header><span><h4>{title}</h4><small>{sub}</small></span>{legend && <Legend names={SERIES} />}</header>
      {children}
    </section>
  );
}

function Figure({ label, v, sub, prev, good, tone, onClick, title }: {
  label: string; v: ReactNode; sub?: string | null; prev?: number | null; good?: "up" | "down" | null; tone?: "sev" | "high" | "ok"; onClick?: () => void; title: string;
}) {
  const d = typeof v === "number" && prev != null ? v - prev : null;
  const cls = !d || !good ? "" : (good === "up") === d > 0 ? " good" : " bad";
  const inner = <>
    <small>{label}</small>
    <b className={tone ?? ""}>{typeof v === "number" ? num(v) : v}</b>
    {d != null && <em className={`ds-d${cls}`}>{d === 0 ? "No change" : <><I n={d > 0 ? "up" : "down"} />{`${num(Math.abs(d))} ${d > 0 ? "more" : "fewer"}`}</>}</em>}
    {sub && <span className="ds-s">{sub}</span>}
  </>;
  return onClick ? <button className="ds-fig" onClick={onClick} title={title}>{inner}</button> : <div className="ds-fig" title={title}>{inner}</div>;
}

export function DeptSummaryBody({ code, c }: { code: string; c: Console }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const [lang] = useLang();
  const [got, setGot] = useState<{ key: string; d: DeptSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const p = new URLSearchParams({ code, period: c.period });
  if (c.zone) p.set("zone", String(c.zone));
  if (c.taluk) p.set("taluk", c.taluk);
  if (c.cat) p.set("cat", c.cat);
  const key = p.toString();
  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/collector/dept?${key}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.figures) throw new Error(j?.error ?? "The department's summary could not be loaded.");
        if (live) setGot({ key, d: j });
      })
      .catch((e) => live && setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "The department's summary could not be loaded. Check the connection."));
    return () => { live = false; };
  }, [key, c.reloadKey, retry]);
  const d = got?.key === key ? got.d : null;

  return (
    <div ref={ref} className="ds">
      {error ? <div role="alert" className="ds-wait"><Empty>{error}</Empty><button className="btn" onClick={() => setRetry((n) => n + 1)}>Try again</button></div>
        : !d ? <div className="ds-wait" role="status" aria-label="Loading the department's summary"><span className="kp-sk short" /><span className="kp-sk" /><span className="kp-sk" /><span className="ds-sk" /><span className="ds-sk" /></div>
          : <Summary d={d} c={c} ta={lang === "ta"} />}
    </div>
  );
}

function Summary({ d, c, ta }: { d: DeptSummary; c: Console; ta: boolean }) {
  const f = d.figures, per = c.periodLabel, low = labelLower(per);
  const filters = [d.where].filter(Boolean).join(", ");
  const on = c.dept === d.code;
  const list = (preset: Parameters<Console["openList"]>[0], title: string) => () => c.openList({ dept: d.code, ...preset }, `${d.name}: ${title}`);
  const med = spanWords(f.medianMinutes), avg = spanWords(f.avgMinutes);
  const openAny = d.ages.reduce((s, x) => s + x.n, 0);
  const day = (x: string) => fmtDate(`${x} 00:00:00`);
  const wd = (x: string) => new Date(`${x}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
  const today = d.now.slice(0, 10);
  return (
    <>
      <div className="ds-top">
        <span className="ds-ic"><I n={deptIcon(d.code)} /></span>
        <div className="ds-id">
          <h3>{d.name}</h3>
          <p>
            {d.org && <span>{d.org}</span>}
            <span className="ds-chip"><I n="clock" /><em>{per}</em></span>
            <span className={`ds-chip${filters ? " on" : ""}`}><I n="pin" /><em>{filters || "Whole district"}</em></span>
          </p>
          <div className="ds-sum">{d.summary[ta ? "ta" : "en"].map((s, k) => <p key={k}><Sentence s={s} /></p>)}</div>
        </div>
        <div className="ds-who">
          {d.contacts.length ? d.contacts.slice(0, 2).map((o, k) => <OfficerCard key={o.contact_id ?? k} o={o} label={k ? "Also responsible" : "Department head"} />)
            : <div className="officer"><span className="avatar"><I n="user" /></span><span style={{ minWidth: 0 }}><small className="olabel">Department head</small><b>{d.head ?? "Not listed"}</b>
              <small className="desig">No phone or e-mail in the official contacts</small></span></div>}
        </div>
      </div>
      <div className="ds-bar">
        {on ? <button className="btn plain" onClick={() => c.setDept(null)}><I n="x" />Show all departments on the page</button>
          : <button className="btn" onClick={() => c.setDept(d.code)}><I n="sliders" />Show only this department on the page</button>}
        <button className="btn plain bb-all" onClick={list({ sort: "sev", dir: 1 }, "reported")} disabled={!f.reported}><I n="table" />{`See all ${num(f.reported)} reports`}</button>
        <small>{`Figures: ${low}, compared with the period before. Same rules as the Overview.`}</small>
      </div>

      <div className="ds-figs">
        <Figure label="Reported" v={f.reported} prev={f.prevReported} sub={f.deaths ? `${num(f.deaths)} dead` : null} onClick={list({ sort: "sev", dir: 1 }, "reported")} title={`${num(f.reported)} now, ${num(f.prevReported)} in the period before`} />
        <Figure label="Still open" v={f.open} prev={f.prevOpen} good="down" sub={f.urgent ? `${num(f.urgent)} severe or high` : null} onClick={list({ status: "open", sort: "sev", dir: 1 }, "still open")} title="Reported in the period and not yet resolved" />
        <Figure label="Past deadline" v={f.overdue} sub="still open" tone={f.overdue ? "high" : undefined} onClick={list({ status: "overdue", sort: "sev", dir: 1 }, "open and past deadline")} title="Open and past the resolution deadline" />
        <Figure label="Severe" v={f.severe} prev={f.prevSevere} good="down" tone={f.severe ? "sev" : undefined} sub={f.severe ? `${num(f.severeOpen)} still open` : null} onClick={list({ sev: "Severe" }, "severe")} title="Rated Severe, open or closed" />
        <Figure label="Resolved" v={f.resolved} prev={f.prevResolved} good="up" tone="ok" onClick={list({ status: "Resolved" }, "resolved")} title="Closed as resolved in the period, by closing time" />
        <Figure label="Time to close" v={med ? <span>{med.v}</span> : "—"} sub={avg ? `average ${avg.v}` : "none closed"} title="From the first report to closing, cases resolved in the period: the middle value (half were faster), and the average" />
        <Figure label="Citizen complaints" v={f.complaints} sub={f.openComplaints ? `${num(f.openComplaints)} on open cases` : null} onClick={list({ sort: "c", complaints: "1" }, "with a citizen complaint")} title="Complaints citizens filed on what was reported in the period" />
        <Figure label="For your check" v={f.awaiting} sub="My tasks" tone={f.awaiting ? "high" : undefined} onClick={list({ status: "awaiting" }, "awaiting your verification")} title="Finished severe work, and reports officers sent you, not yet verified" />
      </div>

      <div className="ds-grid">
        <Card title="Last 7 days" sub="Reported and resolved each day; today so far" wide legend>
          <PairChart kind="columns" caption="cases a day" names={SERIES} data={d.days.map((x) => ({ key: x.day, label: `${wd(x.day)} ${Number(x.day.slice(8))}`, tip: `${day(x.day)}${x.day === today ? ", so far" : ""}`, a: x.reported, b: x.resolved }))} />
        </Card>
        <Card title="How serious" sub={`Reported, ${low}, by severity`}>
          <HBarsList empty="Nothing reported in this period." rows={d.severity.map((s) => ({ key: s.sev, label: s.sev, v: s.n, sub: s.n ? `${num(s.open)} open` : undefined, color: SEV_HEX[s.sev],
            onClick: list({ sev: s.sev }, s.sev.toLowerCase()), title: `${s.sev}: ${num(s.n)} reported, ${num(s.open)} still open` }))} />
        </Card>
        <Card title="Open cases by age" sub={`All ${num(openAny)} open cases of any date, days since the first report`}>
          <HBarsList empty="No case is open." rows={d.ages.map((x) => ({ key: x.key, label: x.label, v: x.n, title: `${x.label}: ${num(x.n)} open cases` }))} />
        </Card>
        <Card title="Top kinds of incident" sub={`Reported, ${low}; the period before beside it`}>
          <HBarsList empty="Nothing reported in this period." rows={d.kinds.map((x) => ({ key: x.cat, label: x.label, v: x.n, sub: `was ${num(x.prev)}`, onClick: list({ cat: x.cat, sort: "sev", dir: 1 }, x.label),
            title: `${x.label}: ${num(x.n)} reported, ${num(x.prev)} in the period before, ${num(x.open)} still open` }))} />
        </Card>
        <Card title={d.areaKind === "ward" ? "Top wards" : "Top zones"} sub={`Reported, ${low}; still open beside it`}>
          <HBarsList empty="No report with a known place in this period." rows={d.areas.map((x) => ({ key: String(x.key), label: x.name, v: x.n, sub: `${num(x.open)} open`, title: `${x.name}: ${num(x.n)} reported, ${num(x.open)} still open` }))} />
        </Card>
        <Card title="Deadlines" sub={`Closed in time or late, and what is open now, ${low}`}>
          <SplitBar title="Resolved" empty="No case was resolved in this period." parts={[{ key: "in", name: "In time", v: d.deadline.onTime, tone: "ok" }, { key: "late", name: "Late", v: d.deadline.late, tone: "late" }, { key: "none", name: "No deadline on record", v: d.deadline.none, tone: "none" }]} />
          <SplitBar title="Still open" empty="No case of this period is open." onPart={(k) => (k === "past" ? list({ status: "overdue", sort: "sev", dir: 1 }, "open and past deadline") : list({ status: "open", sort: "sev", dir: 1 }, "still open"))()}
            parts={[{ key: "ok", name: "Within deadline", v: d.deadline.openIn, tone: "ok" }, { key: "past", name: "Past deadline", v: d.deadline.openPast, tone: "late" }]} />
        </Card>
        <Card title="Last 12 weeks" sub="Reported and resolved each whole week, Monday to Sunday" wide legend>
          <PairChart kind="lines" caption="cases a week" every={2} names={SERIES} data={d.weeks.map((x) => ({ key: x.day, label: day(x.day), tip: `Week from ${day(x.day)}`, a: x.reported, b: x.resolved }))} />
        </Card>
      </div>

      <div className="ds-cols">
        <Section icon="alert" title="Most important open cases" n={f.open} empty="No case of this period is open.">
          {d.cases.map((x) => (
            <button key={x.id} className="ds-row" onClick={() => c.openInc(x.id)} title="Open the case">
              <i style={{ background: SEV_HEX[x.sev] }} />
              <span><b>{x.title}</b><small>{[x.zone, x.why, rel(x.t, d.now)].filter(Boolean).join(" · ")}</small></span>
              <StChip s={x.status} />
            </button>
          ))}
        </Section>
        <Section icon="news" title="In the news" n={d.newsTotal} empty="No news about this department's work in this period.">
          {d.news.map((x) => (
            <button key={x.id} className="ds-row" onClick={() => c.openStory(x as unknown as Story)} title="Read the story">
              <i style={{ background: x.desk?.v === "act" ? "var(--high)" : "var(--text-4)" }} />
              <span><b>{x.title}</b><small>{[x.outletNames.slice(0, 2).join(", ") || "News", x.loc, rel(x.t, d.now)].filter(Boolean).join(" · ")}</small></span>
              <I n="chevr" />
            </button>
          ))}
        </Section>
        <Section icon="tasks" title="Follow-ups and tasks due" n={d.followUpsTotal + d.tasks.length} empty="Nothing is due: no reply awaited and no step on its list.">
          {d.followUps.map((x) => {
            const inner = <><i style={{ background: x.late ? "var(--high)" : "var(--accent)" }} /><span><b>{x.text}</b><small>{[x.title, x.due ? `${x.late ? "was due" : "due"} ${day(x.due)}` : null, "you asked"].filter(Boolean).join(" · ")}</small></span></>;
            return x.incident ? <button key={`f${x.id}`} className="ds-row" onClick={() => c.openInc(x.incident!)} title="Open the case">{inner}<I n="chevr" /></button> : <div key={`f${x.id}`} className="ds-row">{inner}</div>;
          })}
          {d.tasks.map((x, k) => (
            <button key={`t${k}`} className="ds-row" onClick={() => c.openInc(x.id)} title="Open the case">
              <i style={{ background: x.late ? "var(--high)" : "var(--accent)" }} />
              <span><b>{x.text}</b><small>{[x.title, x.owner, `${x.late ? "was due" : "due"} ${fmtDate(x.due)}`].filter(Boolean).join(" · ")}</small></span>
              <I n="chevr" />
            </button>
          ))}
        </Section>
      </div>
    </>
  );
}

function Section({ icon, title, n, empty, children }: { icon: IconName; title: string; n: number; empty: string; children: ReactNode[] | ReactNode }) {
  const has = Array.isArray(children) ? children.flat().length > 0 : !!children;
  return (
    <section className="ds-card ds-list">
      <header><span><h4><I n={icon} />{title}</h4></span>{n > 0 && <span className="bb-n">{num(n)}</span>}</header>
      {has ? children : <Empty>{empty}</Empty>}
    </section>
  );
}
