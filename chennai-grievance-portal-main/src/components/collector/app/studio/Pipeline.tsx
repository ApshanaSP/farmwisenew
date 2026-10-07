"use client";

/**
 * The seven agents at work on a file or a link. Each agent has its own colour; a glowing packet travels the rail to
 * the agent at work, each lights up, says what it found and how long it took, and the reasoning streams in the
 * console beside a card on what the current agent does. A run ends ready (the dashboard opens), failed (why, and try
 * again) or stopped by the Relevance gate (why, the evidence, and "Use anyway").
 */
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { STEPS, type StepKey } from "@/lib/studio/types";
import { I, type IconName } from "../icons";

export type NodeState = "wait" | "run" | "done" | "error";
export interface RunState {
  title: string;
  kind: "file" | "link" | "sample" | "remap" | "refresh" | "choose" | "force";
  steps: Record<StepKey, { state: NodeState; detail: string; by?: "ai" | "rules" | "code"; model?: string | null; ms?: number }>;
  logs: { id: number; text: string; step: StepKey | null }[];
  startedAt: number;
  doneAt: number | null;
  error: string | null;
  id: string | null;
  /** the Relevance gate stopped the run */
  blocked: { id: string; why: string; signals: string[] } | null;
}

export const AGENT_ICON: Record<StepKey, IconName> = { read: "doc", understand: "spark", clean: "shield", place: "pin", design: "grid", link: "compare", story: "bulb" };
/** each agent's colour, used for its orb, its notes in the console and the packet passing through it */
const HUE: Record<StepKey, string> = { read: "#38BDF8", understand: "#A78BFA", clean: "#F59E0B", place: "#2DD4BF", design: "#F472B6", link: "#818CF8", story: "#34D399" };
const ABOUT: Record<StepKey, { what: string; how: string }> = {
  read: { what: "Connects to the source and finds the data in it.", how: "Downloads the file, or opens the page in a real browser when it builds itself with JavaScript or needs a sign-in. Every table, linked file, feed and the data the page loads are scored; the best is used, the others stay a click away." },
  understand: { what: "An AI model decides what every column means.", how: "It sees the headers, column statistics and ten sample rows with personal details masked, and says whether the data is Chennai's. Its answer is checked against the values before use." },
  clean: { what: "Checks the data before anything is counted.", how: "Removes duplicates, empty and total rows; merges spellings of one place or status; flags impossible dates and outliers. Every change is listed." },
  place: { what: "Puts every row on the district map.", how: "Matches localities (English and Tamil), ward numbers, zones, taluks and coordinates to Chennai's 200 wards and 15 zones; a Tamil Nadu table keeps Chennai's rows." },
  design: { what: "Designs the dashboard for this data.", how: "Picks headline cards and the charts that answer where, when, what kind and how much." },
  link: { what: "Connects the data to what the district already records.", how: "Compares it zone by zone and week by week with six months of incidents from complaints, police, PWD, hospitals and the news." },
  story: { what: "Finds what the Collector should act on.", how: "Computes every angle the columns allow (backlogs, waits, turnaround, units falling behind, hotspots, rising types, local clusters, links); an AI model picks what matters and writes the brief. A number it did not get from the rows is dropped." }
};

export function emptyRun(title: string, kind: RunState["kind"]): RunState {
  const steps = Object.fromEntries(STEPS.map((s) => [s.key, { state: "wait" as NodeState, detail: s.doing }])) as RunState["steps"];
  return { title, kind, steps, logs: [], startedAt: Date.now(), doneAt: null, error: null, id: null, blocked: null };
}

const KIND_TEXT: Record<RunState["kind"], string> = { file: "Uploaded file", link: "From a link", sample: "Sample data", remap: "Re-reading with your corrections", refresh: "Fetched again", choose: "Reading another table", force: "Added anyway" };
const ease = [0.22, 1, 0.36, 1] as const;

export default function Pipeline({ run, onBack, onRetry, onForce, onDiscard }: {
  run: RunState; onBack: () => void; onRetry?: () => void; onForce?: (id: string) => void; onDiscard?: (id: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const live = !run.doneAt && !run.error && !run.blocked;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [live]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [run.logs.length]);

  const done = STEPS.filter((s) => run.steps[s.key].state === "done").length;
  const runningIdx = STEPS.findIndex((s) => run.steps[s.key].state === "run");
  const running = runningIdx >= 0 ? STEPS[runningIdx] : null;
  const pct = run.doneAt ? 100 : Math.round(((done + (running ? 0.5 : 0)) / STEPS.length) * 100);
  const secs = (((run.doneAt ?? now) - run.startedAt) / 1000).toFixed(1);
  const current = running ?? STEPS.find((s) => run.steps[s.key].state === "wait") ?? STEPS[STEPS.length - 1];
  const aiUsed = STEPS.filter((s) => run.steps[s.key].by === "ai").length;
  // where the packet is: the agent at work, else the last one done
  const at = runningIdx >= 0 ? runningIdx : Math.max(0, done - 1);
  const state = run.error ? "err" : run.blocked ? "gate" : run.doneAt ? "fin" : "live";
  const R = 21, C = 2 * Math.PI * R;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`ds-run s-${state}`} style={{ ["--hue" as string]: HUE[current.key] }}>
        <header className="ds-run-h">
          <motion.span className="ds-run-ic" initial={{ scale: 0.6, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: 0.6, ease }}>
            <I n={run.kind === "link" || run.kind === "refresh" ? "ext" : "table"} />
          </motion.span>
          <div className="ds-run-t">
            <b>{run.title}</b>
            <small>{KIND_TEXT[run.kind]} · <span className="ds-tnum">{secs}s</span>{aiUsed ? ` · ${aiUsed} AI ${aiUsed === 1 ? "agent" : "agents"}` : ""}</small>
          </div>
          <div className="ds-run-dial" aria-live="polite" aria-label={`${pct}% done`}>
            <svg viewBox="0 0 50 50"><circle cx="25" cy="25" r={R} className="bg" /><motion.circle cx="25" cy="25" r={R} className="fg" strokeDasharray={C} animate={{ strokeDashoffset: C * (1 - pct / 100) }} transition={{ duration: 0.6, ease }} /></svg>
            <b>{pct}<i>%</i></b>
          </div>
          <button className="ds-ghost" onClick={onBack}><I n="x" />{live ? "Hide" : "Close"}</button>
        </header>

        <div className="ds-trackw">
        <div className="ds-prail" aria-hidden="true">
          <motion.i className="ds-prail-fill" animate={{ width: `${(run.doneAt ? 1 : at / (STEPS.length - 1)) * 100}%` }} transition={{ duration: 0.7, ease }} />
          {live && <motion.span className="ds-ppacket" animate={{ left: `${(at / (STEPS.length - 1)) * 100}%` }} transition={{ type: "spring", stiffness: 70, damping: 16 }} />}
        </div>
        <ol className="ds-track">
          {STEPS.map((s, k) => {
            const n = run.steps[s.key];
            const nodeState = run.blocked && n.state === "run" ? "gate" : n.state;
            return (
              <motion.li key={s.key} className={`ds-node ${nodeState}`} style={{ ["--h" as string]: HUE[s.key] }}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06, duration: 0.5, ease }}>
                <div className="ds-orb">
                  {n.state === "run" && !run.blocked && <><span className="ds-halo" /><span className="ds-mote m1" /><span className="ds-mote m2" /></>}
                  <AnimatePresence mode="wait" initial={false}>
                    {n.state === "done" ? (
                      <motion.svg key="tick" className="ds-tick" viewBox="0 0 24 24" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
                        <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.08 }} />
                      </motion.svg>
                    ) : (
                      <motion.span key="ic" className="ds-orb-ic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}><I n={nodeState === "gate" ? "alert" : AGENT_ICON[s.key]} /></motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <b>{s.agent}</b>
                <small title={n.detail}>{n.detail}</small>
                <span className="ds-node-m">
                  {n.by === "ai" && <em className="ds-ai" title={n.model ?? undefined}><I n="spark" />AI{n.model ? ` · ${n.model.split("/").pop()?.replace(/-latest$/, "")}` : ""}</em>}
                  {n.by === "rules" && <em className="ds-rules">Rules</em>}
                  {n.ms != null && n.state === "done" && <time>{n.ms < 1000 ? `${n.ms} ms` : `${(n.ms / 1000).toFixed(1)} s`}</time>}
                </span>
              </motion.li>
            );
          })}
        </ol>
        </div>

        <div className="ds-run-b">
          <section className="ds-console" aria-label="What the agents are doing">
            <header><span className="ds-dot" />Live reasoning<small>{run.logs.length} notes</small></header>
            <ol ref={logRef}>
              <AnimatePresence initial={false}>
                {run.logs.map((l) => (
                  <motion.li key={l.id} initial={{ opacity: 0, x: -10, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.35, ease }}
                    style={{ ["--h" as string]: l.step ? HUE[l.step] : "#94A3B8" }}>
                    <span className="ds-lstep">{l.step ? STEPS.find((s) => s.key === l.step)?.agent : "Studio"}</span><span>{l.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {live && <li className="ds-caret" style={{ ["--h" as string]: HUE[current.key] }}><span className="ds-lstep">{current.agent}</span><span>{run.steps[current.key].detail}<i /></span></li>}
            </ol>
          </section>
          <section className="ds-now">
            <AnimatePresence mode="wait">
              {run.blocked ? (
                <motion.div key="gate" className="ds-gate" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease }}>
                  <span className="ds-gate-ic"><I n="shield" /></span>
                  <small>Relevance check</small>
                  <b>This does not look like Chennai district data</b>
                  <p>{run.blocked.why}</p>
                  <ul>{run.blocked.signals.map((s, i) => <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>{s}</motion.li>)}</ul>
                  <div>
                    {onForce && <button className="ds-btn" onClick={() => onForce(run.blocked!.id)}><I n="right" />Use anyway</button>}
                    {onDiscard && <button className="ds-ghost" onClick={() => onDiscard(run.blocked!.id)}><I n="trash" />Discard</button>}
                  </div>
                </motion.div>
              ) : run.error ? (
                <motion.div key="err" className="ds-run-err" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }}>
                  <I n="alert" />
                  <b>That did not work</b>
                  <p>{run.error}</p>
                  <div>{onRetry && <button className="ds-btn" onClick={onRetry}><I n="refresh" />Try again</button>}<button className="ds-ghost" onClick={onBack}>Back</button></div>
                </motion.div>
              ) : run.doneAt ? (
                <motion.div key="ok" className="ds-run-ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                  <div className="ds-burst"><I n="checkc" /></div>
                  <b>Ready</b>
                  <p>Connected, cleaned, mapped, linked and explained in {secs} seconds. Opening the dashboard…</p>
                </motion.div>
              ) : (
                <motion.div key={current.key} className="ds-now-c" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.4, ease }}
                  style={{ ["--h" as string]: HUE[current.key] }}>
                  <span className="ds-now-ic"><I n={AGENT_ICON[current.key]} /></span>
                  <small>Now working · {current.agent} <em>{STEPS.findIndex((s) => s.key === current.key) + 1}/{STEPS.length}</em></small>
                  <b>{ABOUT[current.key].what}</b>
                  <p>{ABOUT[current.key].how}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}
