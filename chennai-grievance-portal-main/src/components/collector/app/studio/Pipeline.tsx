"use client";

/** The seven agents at work on a file: each lights up as it runs, says what it found, and the reasoning streams below. */
import { useEffect, useRef, useState } from "react";
import { STEPS, type StepKey } from "@/lib/studio/types";
import { I, type IconName } from "../icons";

export type NodeState = "wait" | "run" | "done" | "error";
export interface RunState {
  title: string;
  kind: "file" | "link" | "sample" | "remap" | "refresh";
  steps: Record<StepKey, { state: NodeState; detail: string; by?: "ai" | "rules" | "code"; model?: string | null; ms?: number }>;
  logs: { id: number; text: string; step: StepKey | null }[];
  startedAt: number;
  doneAt: number | null;
  error: string | null;
  id: string | null;
}

export const AGENT_ICON: Record<StepKey, IconName> = { read: "doc", understand: "spark", clean: "shield", place: "pin", design: "grid", link: "compare", story: "scroll" };
const ABOUT: Record<StepKey, { what: string; how: string }> = {
  read: { what: "Opens Excel, CSV or JSON as departments send them.", how: "Finds the real header under title rows, fills merged cells, reads Indian dates and Excel day numbers." },
  understand: { what: "An AI model decides what every column means.", how: "It sees the headers, column statistics and ten sample rows with personal details masked. Its answer is checked against the values before use." },
  clean: { what: "Checks the data before anything is counted.", how: "Removes duplicates, empty and total rows; merges spellings of one place or status; flags impossible dates and outliers. Every change is listed." },
  place: { what: "Puts every row on the district map.", how: "Matches localities (English and Tamil), ward numbers, zones, taluks and coordinates to Chennai's 200 wards and 15 zones." },
  design: { what: "Designs the dashboard for this data.", how: "Picks headline cards and the right chart for each question the columns can answer: where, when, what kind, how much." },
  link: { what: "Connects the file to what the district already records.", how: "Compares it zone by zone and week by week with six months of incidents from complaints, police, PWD, hospitals and the news." },
  story: { what: "Finds what the Collector should act on.", how: "Computes every angle the columns allow (backlogs, waiting times, turnaround, units falling behind, hotspots, rising types, local clusters, links with incidents); an AI model picks the ones that matter and writes the brief. A sentence whose numbers are not computed is dropped." }
};

export function emptyRun(title: string, kind: RunState["kind"]): RunState {
  const steps = Object.fromEntries(STEPS.map((s) => [s.key, { state: "wait" as NodeState, detail: s.doing }])) as RunState["steps"];
  return { title, kind, steps, logs: [], startedAt: Date.now(), doneAt: null, error: null, id: null };
}

export default function Pipeline({ run, onBack, onRetry }: { run: RunState; onBack: () => void; onRetry?: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.doneAt || run.error) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [run.doneAt, run.error]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [run.logs.length]);

  const done = STEPS.filter((s) => run.steps[s.key].state === "done").length;
  const running = STEPS.find((s) => run.steps[s.key].state === "run");
  const pct = run.doneAt ? 100 : Math.round(((done + (running ? 0.5 : 0)) / STEPS.length) * 100);
  const secs = (((run.doneAt ?? (run.error ? now : now)) - run.startedAt) / 1000).toFixed(1);
  const current = running ?? STEPS.find((s) => run.steps[s.key].state === "wait") ?? STEPS[STEPS.length - 1];
  const kindText = { file: "Uploaded file", link: "From a link", sample: "Sample data", remap: "Re-reading with your corrections", refresh: "Fetched again" }[run.kind];
  const aiUsed = STEPS.filter((s) => run.steps[s.key].by === "ai").length;

  return (
    <div className={`ds-run${run.doneAt ? " fin" : ""}${run.error ? " err" : ""}`}>
      <header className="ds-run-h">
        <span className="ds-run-ic"><I n={run.kind === "link" ? "ext" : "table"} /></span>
        <div className="ds-run-t">
          <b>{run.title}</b>
          <small>{kindText} · {secs}s{aiUsed ? ` · ${aiUsed} AI ${aiUsed === 1 ? "agent" : "agents"}` : ""}</small>
        </div>
        <div className="ds-run-pct" aria-live="polite"><b>{pct}</b>%</div>
        <button className="ds-ghost" onClick={onBack}><I n="x" />{run.doneAt || run.error ? "Close" : "Hide"}</button>
      </header>
      <div className="ds-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>

      <ol className="ds-track">
        {STEPS.map((s, k) => {
          const n = run.steps[s.key];
          const next = STEPS[k + 1] ? run.steps[STEPS[k + 1].key].state : null;
          return (
            <li key={s.key} className={`ds-node ${n.state}${next === "run" || (n.state === "done" && next === "done") ? " flow" : ""}`} style={{ ["--i" as string]: k }}>
              <div className="ds-orb">
                <span className="ds-ring" />
                <I n={AGENT_ICON[s.key]} />
                <svg className="ds-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
              </div>
              <b>{s.agent}</b>
              <small title={n.detail}>{n.detail}</small>
              <span className="ds-node-m">
                {n.by === "ai" && <em className="ds-ai" title={n.model ?? undefined}><I n="spark" />AI{n.model ? ` · ${n.model.split("/").pop()?.replace(/-latest$/, "")}` : ""}</em>}
                {n.by === "rules" && <em className="ds-rules">Rules</em>}
                {n.ms != null && n.state === "done" && <time>{n.ms < 1000 ? `${n.ms} ms` : `${(n.ms / 1000).toFixed(1)} s`}</time>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="ds-run-b">
        <section className="ds-console" aria-label="What the agents are doing">
          <header><span className="ds-dot" />Live reasoning<small>{run.logs.length} notes</small></header>
          <ol ref={logRef}>
            {run.logs.map((l) => (
              <li key={l.id}><span className="ds-lstep">{l.step ? STEPS.find((s) => s.key === l.step)?.agent : "Studio"}</span><span>{l.text}</span></li>
            ))}
            {!run.doneAt && !run.error && <li className="ds-caret"><span className="ds-lstep">{current.agent}</span><span>{run.steps[current.key].detail}<i /></span></li>}
          </ol>
        </section>
        <section className="ds-now">
          {run.error ? (
            <div className="ds-run-err">
              <I n="alert" />
              <b>That did not work</b>
              <p>{run.error}</p>
              <div>{onRetry && <button className="ds-btn" onClick={onRetry}><I n="refresh" />Try again</button>}<button className="ds-ghost" onClick={onBack}>Back</button></div>
            </div>
          ) : run.doneAt ? (
            <div className="ds-run-ok">
              <div className="ds-burst"><I n="checkc" /></div>
              <b>Ready</b>
              <p>Cleaned, mapped, linked and explained in {secs} seconds. Opening the dashboard…</p>
            </div>
          ) : (
            <div className="ds-now-c" key={current.key}>
              <span className="ds-now-ic"><I n={AGENT_ICON[current.key]} /></span>
              <small>Now working · {current.agent}</small>
              <b>{ABOUT[current.key].what}</b>
              <p>{ABOUT[current.key].how}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
