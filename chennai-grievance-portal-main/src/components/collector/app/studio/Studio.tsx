"use client";

/**
 * Page 5 of the Collector console: the Data Studio. Add a department's file, a link or a sample; seven agents read,
 * clean, place, design, link and explain it while the page shows each step; the result is a live dashboard with an AI
 * analyst beside it. Datasets and the board of pinned panels are listed on the left.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SampleInfo } from "@/lib/studio/samples";
import type { DatasetCard, PanelData, Pin, Role, RunEvent } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { api, runStream } from "./client";
import Pipeline, { emptyRun, type RunState } from "./Pipeline";
import Hero from "./Hero";
import Dataset from "./Dataset";
import "./studio.css";

const StudioChart = dynamic(() => import("./StudioChart"), { ssr: false, loading: () => <div className="ds-skel" /> });
const StudioMap = dynamic(() => import("./StudioMap"), { ssr: false, loading: () => <div className="ds-skel" /> });

type Mode = { k: "home" } | { k: "run" } | { k: "dataset"; id: string } | { k: "board" };
interface ListResp { datasets: DatasetCard[]; board: { pin: Pin; panel: PanelData; dataset: { id: string; name: string } }[]; samples: SampleInfo[]; ai: { available: boolean; providers: string[]; problem: string | null } }

const ACCEPT = ".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json";
const KEY = "diq-studio-sel";

export default function Studio({ c }: { c: Console }) {
  const [list, setList] = useState<ListResp | null>(null);
  const [mode, setMode] = useState<Mode>({ k: "home" });
  const [run, setRun] = useState<RunState | null>(null);
  const [drag, setDrag] = useState(false);
  const [link, setLink] = useState("");
  const fileIn = useRef<HTMLInputElement>(null);
  const lastStart = useRef<(() => void) | null>(null);
  // the console object is rebuilt on every render of the shell: read it through a ref, so loading runs once
  const cRef = useRef(c);
  cRef.current = c;

  const load = useCallback(async () => {
    try {
      const r = await api<ListResp>("/api/collector/studio");
      setList(r);
      return r;
    } catch (e: any) {
      cRef.current.toast(e.message, "alert");
      return null;
    }
  }, []);

  // first visit: open the dataset last looked at, else the newest, else the welcome
  useEffect(() => {
    load().then((r) => {
      if (!r) return;
      let saved: string | null = null;
      try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
      const pick = r.datasets.find((d) => d.id === saved)?.id ?? r.datasets[0]?.id;
      if (saved === "board" && r.board.length) setMode({ k: "board" });
      else if (pick) setMode({ k: "dataset", id: pick });
    });
  }, [load]);
  useEffect(() => {
    try { if (mode.k === "dataset") localStorage.setItem(KEY, mode.id); else if (mode.k === "board") localStorage.setItem(KEY, "board"); } catch { /* not saved */ }
  }, [mode]);

  // ---------------------------------------------------------------- runs --
  // Events are released at a readable pace (an agent that finishes in 5 ms still gets its moment on screen).
  const queue = useRef<RunEvent[]>([]);
  const pump = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logId = useRef(0);
  // a note belongs to the agent that last reported (it may already have finished when its notes arrive)
  const lastStep = useRef<keyof RunState["steps"] | null>(null);
  const apply = useCallback((e: RunEvent) => {
    if (e.t === "step") lastStep.current = e.step;
    const owner = lastStep.current;
    setRun((r) => {
      if (!r) return r;
      if (e.t === "step") {
        const steps = { ...r.steps, [e.step]: { state: e.state === "skip" ? "done" : e.state, detail: e.detail, by: e.by, model: e.model ?? null, ms: e.ms } };
        return { ...r, steps };
      }
      if (e.t === "log") {
        return { ...r, logs: [...r.logs, { id: ++logId.current, text: e.text, step: owner }].slice(-80) };
      }
      if (e.t === "error") {
        const steps = { ...r.steps };
        for (const k of Object.keys(steps) as (keyof RunState["steps"])[]) if (steps[k].state === "run") steps[k] = { ...steps[k], state: "error" };
        return { ...r, steps, error: e.message };
      }
      return { ...r, id: e.id, doneAt: Date.now() };
    });
    if (e.t === "done") {
      load().then(() => setTimeout(() => setMode({ k: "dataset", id: e.id }), 1100));
    }
  }, [load]);
  const drain = useCallback(() => {
    if (pump.current) return;
    const next = () => {
      const e = queue.current.shift();
      if (!e) { pump.current = null; return; }
      apply(e);
      const gap = e.t === "step" ? (e.state === "run" ? 420 : 300) : e.t === "log" ? 110 : 0;
      pump.current = setTimeout(next, gap);
    };
    next();
  }, [apply]);

  const start = useCallback((title: string, kind: RunState["kind"], path: string, init: RequestInit) => {
    const exec = () => {
      queue.current = [];
      lastStep.current = null;
      if (pump.current) { clearTimeout(pump.current); pump.current = null; }
      setRun(emptyRun(title, kind));
      setMode({ k: "run" });
      runStream(path, init, (e) => { queue.current.push(e); drain(); })
        .catch((err) => { queue.current.push({ t: "error", message: err.message }); drain(); });
    };
    lastStart.current = exec;
    exec();
  }, [drain]);

  const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const addFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { c.toast("The file is larger than 15 MB.", "alert"); return; }
    const fd = new FormData();
    fd.append("file", f);
    start(f.name, "file", "/api/collector/studio", { method: "POST", body: fd });
  };
  const addLink = () => {
    const u = link.trim();
    let url: URL;
    try { url = new URL(u); } catch { c.toast("Paste a full link that starts with http:// or https://", "alert"); return; }
    if (!/^https?:$/.test(url.protocol)) { c.toast("Only http and https links can be read.", "alert"); return; }
    setLink("");
    start(`${url.hostname}${url.pathname.length > 1 ? url.pathname.slice(0, 40) : ""}`, "link", "/api/collector/studio", json({ url: u }));
  };
  const addSample = (key: string) => start(list?.samples.find((x) => x.key === key)?.file ?? "Sample", "sample", "/api/collector/studio", json({ sample: key }));
  const remap = (id: string, name: string) => (changes: { key: string; role: Role; label?: string }[]) =>
    start(name, "remap", `/api/collector/studio/${id}`, json({ columns: changes }, "PATCH"));
  const refresh = (id: string, name: string) => () => start(name, "refresh", `/api/collector/studio/${id}`, json({ action: "refresh" }));

  const busy = mode.k === "run" && !!run && !run.doneAt && !run.error;
  const datasets = list?.datasets ?? [];
  const current = mode.k === "dataset" ? datasets.find((d) => d.id === mode.id) : null;

  return (
    <div className={`ds${drag ? " dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) addFile(e.dataTransfer.files?.[0]); }}>
      <aside className="ds-rail">
        <section className="ds-add card">
          <header className="ds-add-h"><span className="ds-spark-ic"><I n="spark" /></span><b>Add data</b>
            <small className={list?.ai.available ? "ok" : ""} title={list?.ai.available ? `AI: ${list.ai.providers.join(", ")}` : "No AI model configured: the rules read the files"}>
              <i />{list ? (list.ai.available ? "AI ready" : "Rules only") : "…"}</small></header>
          <button className={`ds-drop${drag ? " over" : ""}`} onClick={() => fileIn.current?.click()} disabled={busy} aria-label="Choose a file to add">
            <span className="ds-drop-ic"><I n="download" /></span>
            <b>{drag ? "Drop to analyse" : "Drop a file or browse"}</b>
            <small>Excel · CSV · JSON · up to 15 MB</small>
          </button>
          <input ref={fileIn} type="file" accept={ACCEPT} hidden onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
          <form className="ds-linkf" onSubmit={(e) => { e.preventDefault(); addLink(); }}>
            <I n="ext" />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link: CSV, Excel, JSON, Google Sheet" aria-label="Link to a data file" disabled={busy} />
            <button disabled={busy || link.trim().length < 10} aria-label="Read the link"><I n="right" /></button>
          </form>
          {!!list?.samples.length && (
            <div className="ds-samples">
              <small>Samples</small>
              {list.samples.map((s) => (
                <button key={s.key} onClick={() => addSample(s.key)} disabled={busy} title={s.blurb}>
                  <span className={`ds-sample-ic ${s.icon}`}><I n={s.icon} /></span><span>{s.title}</span><em>{s.format}</em>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="ds-lib card">
          <header><b>Your data</b><span className="cnt-b">{datasets.length}</span></header>
          <div className="ds-lib-l">
            <button className={`ds-li board${mode.k === "board" ? " on" : ""}`} onClick={() => setMode({ k: "board" })}>
              <span className="ds-li-ic"><I n="bookmark" /></span>
              <span className="ds-li-b"><b>Studio board</b><small>{list?.board.length ? `${list.board.length} pinned ${list.board.length === 1 ? "chart" : "charts"}` : "Pin charts from any dataset"}</small></span>
            </button>
            {run && mode.k !== "run" && (run.doneAt == null && !run.error) && (
              <button className="ds-li running" onClick={() => setMode({ k: "run" })}>
                <span className="ds-li-ic"><span className="ds-spin sm" /></span><span className="ds-li-b"><b>{run.title}</b><small>Agents at work…</small></span>
              </button>
            )}
            {datasets.map((d, i) => (
              <button key={d.id} className={`ds-li${mode.k === "dataset" && mode.id === d.id ? " on" : ""}`} onClick={() => setMode({ k: "dataset", id: d.id })} style={{ ["--i" as string]: i }}>
                <span className={`ds-li-ic k-${d.kind}`}><I n={d.kind === "link" ? "ext" : d.kind === "sample" ? "spark" : "table"} /></span>
                <span className="ds-li-b">
                  <b>{d.name}</b>
                  <small>{d.rows.toLocaleString("en-IN")} rows · health {d.health}{d.department ? ` · ${d.department}` : ""}</small>
                </span>
                {d.link && d.link !== "none" && <span className={`ds-li-link s-${d.link}`} title={`${d.link} link with district incidents`}><I n="compare" /></span>}
              </button>
            ))}
            {list && !datasets.length && <p className="ds-muted pad">Nothing added yet. Drop a file above or try a sample.</p>}
          </div>
        </section>
      </aside>

      {mode.k === "run" && run ? (
        <section className="ds-span card ds-run-wrap">
          <Pipeline run={run} onBack={() => setMode(run.id ? { k: "dataset", id: run.id } : current ? { k: "dataset", id: current.id } : datasets[0] ? { k: "dataset", id: datasets[0].id } : { k: "home" })}
            onRetry={lastStart.current ?? undefined} />
        </section>
      ) : mode.k === "dataset" ? (
        <Dataset key={mode.id} id={mode.id} c={c}
          onRemap={remap(mode.id, current?.name ?? "Dataset")} onRefresh={refresh(mode.id, current?.name ?? "Dataset")}
          onDeleted={() => { load().then((r) => setMode(r?.datasets[0] ? { k: "dataset", id: r.datasets[0].id } : { k: "home" })); }}
          onPinned={() => load()} />
      ) : mode.k === "board" ? (
        <Board list={list} c={c} onOpen={(id) => setMode({ k: "dataset", id })} onChanged={() => load()} />
      ) : (
        <section className="ds-span card ds-hero-wrap"><Hero samples={list?.samples ?? []} onSample={addSample} busy={busy} /></section>
      )}
      {drag && <div className="ds-dropveil"><div><I n="download" /><b>Drop to analyse</b><small>Seven agents will read, clean, map and explain it</small></div></div>}
    </div>
  );
}

function Board({ list, c, onOpen, onChanged }: { list: ListResp | null; c: Console; onOpen: (id: string) => void; onChanged: () => void }) {
  const items = list?.board ?? [];
  const unpin = async (datasetId: string, pinId: string) => {
    try { await api(`/api/collector/studio/${datasetId}`, { json: { action: "unpin", planId: pinId } }); onChanged(); } catch (e: any) { c.toast(e.message, "alert"); }
  };
  return (
    <section className="ds-span card ds-board">
      <header className="ds-board-h">
        <span className="ds-ws-ic k-board"><I n="bookmark" /></span>
        <div><h2>Studio board</h2><small>Charts pinned from any dataset, recomputed from the latest rows every time you open the board.</small></div>
      </header>
      {!items.length ? (
        <div className="ds-empty big"><I n="bookmark" /><b>Nothing pinned yet</b>Open a dataset and press the bookmark on any chart, or pin an answer from the AI analyst.</div>
      ) : (
        <div className="ds-board-g">
          {items.map(({ pin, panel, dataset }, i) => (
            <article key={pin.id} className={`ds-panel${panel.chart === "map" ? " is-map" : ""}`} style={{ ["--i" as string]: i }}>
              <header>
                <div className="ds-p-t"><h4>{panel.title}</h4><small><button className="ds-lnk" onClick={() => onOpen(dataset.id)}>{dataset.name}</button> · {panel.subtitle}</small></div>
                <div className="ds-p-acts"><button onClick={() => unpin(dataset.id, pin.id)} title="Unpin" aria-label="Unpin"><I n="x" /></button></div>
              </header>
              <div className="ds-p-b">
                {panel.kpi ? <div className="ds-board-k"><b>{panel.kpi.value.toLocaleString("en-IN")}</b><small>{panel.kpi.sub}</small></div>
                  : panel.chart === "map" ? <StudioMap geo={c.geo} panel={panel} focusZone={null} />
                    : panel.values.length ? <StudioChart panel={panel} height="100%" /> : <div className="ds-nodata">No values right now.</div>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
