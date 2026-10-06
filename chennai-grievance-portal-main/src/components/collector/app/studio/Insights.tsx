"use client";

/**
 * The Insights tab's own parts: the AI brief (the verdict, the situation in three lines, questions for the department)
 * and the insight cards (each labelled, with its headline number, the computed fact, a small picture of the evidence,
 * why it matters and the next step). Every card opens the rows behind it.
 */
import { useState } from "react";
import type { Brief, BriefItem, InsightLabel, Plan } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I, type IconName } from "../icons";

const LABEL_IC: Record<InsightLabel, IconName> = {
  Backlog: "tasks", Delay: "clock", Turnaround: "timer", "Service gap": "target", "Bright spot": "thumbUp", Hotspot: "pin", Rising: "up", Falling: "down",
  "Local pattern": "layers", Concentration: "donut", Magnitude: "barH", Anomaly: "alert", Linked: "compare", Growth: "line", Pattern: "pulse", "Data gap": "info"
};
const PRIO = { act: "Act now", watch: "Watch", note: "Note" } as const;

export function BriefCard({ brief, stale, busy, c, onReanalyse }: { brief: Brief; stale: boolean; busy: boolean; c: Console; onReanalyse: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { c.toast("Could not copy.", "alert"); }
  };
  const acts = brief.items.filter((x) => x.priority === "act").length, watch = brief.items.filter((x) => x.priority === "watch").length;
  return (
    <section className={`ds-brief${busy ? " busy" : ""}`} aria-label="Brief for the Collector">
      <div className="ds-brief-l">
        <div className="ds-brief-k">
          <span className="ds-brief-badge"><I n="spark" />{busy ? "AI is analysing the data…" : brief.by === "ai" ? "AI brief" : stale ? "Quick brief" : "Brief (rules)"}</span>
          {!busy && <small>{brief.by === "ai" ? `${brief.model?.split("/").pop() ?? "AI"} · every number checked against the rows` : "Written from the computed insights"} · {brief.items.length} of {brief.considered} insights</small>}
          <button className="ds-brief-re" onClick={onReanalyse} disabled={busy} title="Analyse again with the AI"><I n="refresh" />{busy ? "Analysing" : "Re-analyse"}</button>
        </div>
        <h3>{brief.verdict}</h3>
        <ul>{brief.summary.map((s, i) => <li key={i} style={{ ["--i" as string]: i }}>{s}</li>)}</ul>
        <div className="ds-brief-tally">
          {acts > 0 && <span className="p-act"><i />{acts} to act on now</span>}
          {watch > 0 && <span className="p-watch"><i />{watch} to watch</span>}
          {brief.items.length - acts - watch > 0 && <span className="p-note"><i />{brief.items.length - acts - watch} to note</span>}
        </div>
      </div>
      {brief.questions.length > 0 && (
        <div className="ds-brief-r">
          <header><I n="chat" /><b>Ask the department</b><button onClick={copy} title="Copy the questions">{copied ? <I n="check" /> : <I n="copy" />}</button></header>
          <ol>{brief.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      )}
    </section>
  );
}

export function InsightGrid({ items, onOpen }: { items: BriefItem[]; onOpen: (plan: Plan, key: string | number | null) => void }) {
  return (
    <div className="ds-igrid">
      {items.map((x, i) => <InsightCard key={x.id} x={x} i={i} onOpen={onOpen} />)}
    </div>
  );
}

function InsightCard({ x, i, onOpen }: { x: BriefItem; i: number; onOpen: (plan: Plan, key: string | number | null) => void }) {
  const max = Math.max(1, ...x.bars.map((b) => Math.abs(b.value)));
  return (
    <article className={`ds-icard it-${x.tone}`} style={{ ["--i" as string]: i }}>
      <header>
        <span className="ds-ilabel"><I n={LABEL_IC[x.label] ?? "bulb"} />{x.label}</span>
        <span className={`ds-prio p-${x.priority}`}>{PRIO[x.priority]}</span>
      </header>
      <div className="ds-imain">
        <div className="ds-imetric"><b>{x.metric.value}</b><small>{x.metric.caption}</small></div>
        <h4>{x.headline}</h4>
      </div>
      {x.bars.length > 0 ? (
        <ul className="ds-ibars" aria-label="Evidence">
          {x.bars.map((b, k) => (
            <li key={k} className={b.hi ? "hi" : ""} title={`${b.label}: ${b.fmt}`}>
              <span>{b.label}</span>
              <i><em style={{ width: `${Math.max(3, (Math.abs(b.value) / max) * 100)}%`, ["--k" as string]: k }} /></i>
              <b>{b.fmt}</b>
            </li>
          ))}
        </ul>
      ) : x.series.length > 2 ? <MiniTrend vals={x.series} /> : null}
      <p className="ds-ifact">{x.text}</p>
      <div className="ds-iwhy"><small>Why it matters</small><p>{x.why}</p></div>
      {x.action && <div className="ds-iact"><I n="right" /><p>{x.action}</p></div>}
      <footer>
        {x.owner && <span className="ds-iown"><I n="user" />{x.owner}</span>}
        {x.plan && <button className="ds-lnk" onClick={() => onOpen(x.plan!, x.key)}>See the records<I n="chevr" /></button>}
      </footer>
    </article>
  );
}

function MiniTrend({ vals }: { vals: number[] }) {
  const w = 260, h = 46, max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 10)]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <svg className="ds-itrend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Weekly trend">
      <path d={`${d} L${w},${h} L0,${h} Z`} className="a" />
      <path d={d} className="l" pathLength={1} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" className="d" />
    </svg>
  );
}
