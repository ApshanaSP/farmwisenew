"use client";

/**
 * The Insights tab's own parts: the AI summary (the verdict as a plain headline, up to three short lines, and the
 * questions for the department folded away) and the insight cards (a plain label, the headline, its evidence drawn as
 * a labelled chart, the fact in one sentence and what it helps with). Every card opens the rows behind it, and the
 * summary and every card can be pinned to a dashboard (the Pin button is handed in by the dataset page).
 * The pieces a dashboard tile draws the same way (the labels, the bars, the trend) are exported for TileGrid.
 */
import { useState, type ReactNode } from "react";
import { HELPS } from "@/lib/studio/helps";
import type { Brief, BriefItem, InsightLabel, Plan } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";

export const LABEL_IC: Record<InsightLabel, IconName> = {
  Backlog: "tasks", Delay: "clock", Turnaround: "timer", "Service gap": "target", "Bright spot": "thumbUp", Hotspot: "pin", Rising: "up", Falling: "down",
  "Local pattern": "layers", Concentration: "donut", Magnitude: "barH", Anomaly: "alert", Linked: "compare", Growth: "line", Pattern: "pulse", "Data gap": "info",
  Ranking: "barH", Capacity: "drop", Change: "compare", Drivers: "flow", "Unusual change": "alert", "Change point": "line", "Steady share": "donut", Seasonality: "cal",
  Correlation: "compare", "Target gap": "target", "Outlier peer": "scan", Freshness: "clock"
};

/** The finding's kind in the words a Collector would use (the engine's own names stay in the data). */
export const PLAIN: Record<InsightLabel, string> = {
  Delay: "Long waits", "Outlier peer": "Stands out", "Service gap": "Falling behind", Backlog: "Piling up", Hotspot: "Hotspot", Linked: "Linked to incidents",
  Anomaly: "Odd values", "Data gap": "Missing data", Freshness: "Old data", Concentration: "Concentrated", Ranking: "Ranking", Magnitude: "Size", Seasonality: "Seasonal",
  Rising: "Rising", Falling: "Falling", Capacity: "Capacity", Change: "Change", Correlation: "Moves together", "Target gap": "Short of target", Turnaround: "Speed",
  "Bright spot": "Doing well", "Local pattern": "Local pattern", Growth: "Growth", Drivers: "What drives it", "Unusual change": "Unusual jump",
  "Change point": "Turning point", "Steady share": "Steady share", Pattern: "Pattern"
};
export const plainLabel = (l: InsightLabel) => PLAIN[l] ?? l;

/** The label chip, and "Urgent" only for a finding to act on now (the other priorities are not shown: they confused). */
export function LabelChip({ label, priority }: { label: InsightLabel; priority?: BriefItem["priority"] | null }) {
  return (
    <>
      <span className="ds-ilabel" title={label !== plainLabel(label) ? `Found as: ${label}` : undefined}><I n={LABEL_IC[label] ?? "bulb"} />{plainLabel(label)}</span>
      {priority === "act" && <span className="ds-prio p-act">Urgent</span>}
    </>
  );
}

export function BriefCard({ brief, stale, busy, c, onReanalyse, pin }: { brief: Brief; stale: boolean; busy: boolean; c: Console; onReanalyse: () => void; pin?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [qs, setQs] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { c.toast("Could not copy.", "alert"); }
  };
  const lines = brief.summary.slice(0, 3);
  const open = qs && brief.questions.length > 0;
  return (
    <section className={`ds-brief ds-sum${busy ? " busy" : ""}${open ? " has-q" : ""}`} aria-label="AI summary">
      <div className="ds-brief-l">
        <div className="ds-brief-k">
          <span className="ds-brief-badge"><I n="spark" />{busy ? "Reading the data…" : brief.by === "ai" ? "AI summary" : "Summary"}</span>
          {!busy && brief.by !== "ai" && <small>{stale ? "A quick summary while the AI reads the data" : "Written from the figures (no AI answered)"}</small>}
          <span className="ds-sum-acts">
            {pin}
            <button className="ds-brief-re" onClick={onReanalyse} disabled={busy} data-jarvis-never title="Read the data again with the AI"><I n="refresh" />{busy ? "Reading" : "Re-analyse"}</button>
          </span>
        </div>
        <h3>{brief.verdict}</h3>
        {lines.length > 0 && <ul>{lines.map((s, i) => <li key={i} style={{ ["--i" as string]: i }}>{s}</li>)}</ul>}
        {brief.questions.length > 0 && (
          <button type="button" className="ds-lnk ds-sum-q" onClick={() => setQs((v) => !v)} aria-expanded={open}>
            <I n="chat" />Questions for the department ({brief.questions.length})<I n="chevd" className={open ? "ds-rot" : ""} />
          </button>
        )}
      </div>
      {open && (
        <div className="ds-brief-r">
          <header><I n="chat" /><b>Ask the department</b><button onClick={copy} title="Copy the questions" aria-label="Copy the questions">{copied ? <I n="check" /> : <I n="copy" />}</button></header>
          <ol>{brief.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      )}
    </section>
  );
}

export function InsightGrid({ items, onOpen, pin }: { items: BriefItem[]; onOpen: (plan: Plan, key: string | number | null) => void; pin?: (x: BriefItem) => ReactNode }) {
  return (
    <div className={`ds-igrid${items.length % 2 ? " odd" : ""}`}>
      {items.map((x, i) => <InsightCard key={x.id} x={x} i={i} onOpen={onOpen} pin={pin?.(x)} />)}
    </div>
  );
}

/**
 * One finding: its plain label (and "Urgent" when it is to act on now), the headline, its evidence as a labelled
 * chart (bars with their values, or the weekly line with its first and latest week), the fact in one sentence and
 * what it helps with. Why it matters and the next step are one click away, so the cards line up.
 */
function InsightCard({ x, i, onOpen, pin }: { x: BriefItem; i: number; onOpen: (plan: Plan, key: string | number | null) => void; pin?: ReactNode }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`ds-icard it-${x.tone}${more ? " open" : ""}`} style={{ ["--i" as string]: i }}>
      <header><LabelChip label={x.label} priority={x.priority} /></header>
      <h4 title={x.headline}>{x.headline}</h4>
      <div className="ds-ichart">
        <p className="ds-icap"><b>{x.metric.value}</b><span>{x.metric.caption}</span></p>
        <Evidence bars={x.bars} series={x.series} />
      </div>
      <p className="ds-ifact" title={x.text}>{x.text}</p>
      <p className="ds-ihelps"><I n="target" /><b>Helps:</b> {HELPS[x.label] ?? "Shows what needs attention"}</p>
      {more && (
        <div className="ds-imore">
          <div className="ds-iwhy"><small>Why it matters</small><p>{x.why}</p></div>
          {x.action && <div className="ds-iact"><I n="right" /><p>{x.action}</p></div>}
          {x.owner && <p className="ds-iown" title="A suggested owner: nothing is sent to them"><I n="user" />Suggested owner: {x.owner}</p>}
          {x.confidence && <p className="ds-iconf" title={x.rank ? `Usefulness ${x.rank.usefulness} = impact ${x.rank.impact.toFixed(2)} × evidence ${x.rank.significance.toFixed(2)} × can act ${x.rank.actionability} × new ${x.rank.novelty} × fresh ${x.rank.freshness}` : undefined}><I n="info" />{x.confidence}</p>}
        </div>
      )}
      <footer>
        <button className="ds-lnk" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? "Less" : "Why · next step"}<I n="chevd" className={more ? "ds-rot" : ""} /></button>
        {x.plan && <button className="ds-lnk" onClick={() => onOpen(x.plan!, x.key)}>See the records<I n="chevr" /></button>}
        {pin}
      </footer>
    </article>
  );
}

/** A finding's evidence: its bars (each with its label and value), else its weekly series, else a word that one figure needs no chart. */
export function Evidence({ bars, series }: { bars: BriefItem["bars"]; series: number[] }) {
  if (bars.length > 0) return <EvidenceBars bars={bars} />;
  if (series.length > 2) return <MiniTrend vals={series} />;
  return <p className="ds-inochart">One figure: no chart needed.</p>;
}

export function EvidenceBars({ bars: all }: { bars: BriefItem["bars"] }) {
  const bars = all.slice(0, 5);
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  return (
    <ul className="ds-ibars" aria-label="Evidence">
      {bars.map((b, k) => (
        <li key={k} className={b.hi ? "hi" : ""} title={`${b.label}: ${b.fmt}`}>
          <span>{b.label}</span>
          <i><em style={{ width: `${Math.max(3, (Math.abs(b.value) / max) * 100)}%`, ["--k" as string]: k }} /></i>
          <b>{b.fmt}</b>
        </li>
      ))}
    </ul>
  );
}

/** The weekly line, labelled with its first and latest week so it reads without an axis. */
export function MiniTrend({ vals }: { vals: number[] }) {
  const w = 260, h = 46, max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 10)]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-IN");
  return (
    <div className="ds-itrend-w">
      <svg className="ds-itrend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Weekly, ${vals.length} weeks: from ${n(vals[0])} to ${n(vals[vals.length - 1])}`}>
        <path d={`${d} L${w},${h} L0,${h} Z`} className="a" />
        <path d={d} className="l" pathLength={1} />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" className="d" />
      </svg>
      <div className="ds-itrend-k" aria-hidden="true"><span>First week: <b>{n(vals[0])}</b></span><span>Highest: <b>{n(Math.max(...vals))}</b></span><span>Latest week: <b>{n(vals[vals.length - 1])}</b></span></div>
    </div>
  );
}
