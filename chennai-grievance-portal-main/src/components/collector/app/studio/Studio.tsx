"use client";

/**
 * Page 5 of the Collector console: the Data Studio, in three tabs across the top. Dashboards: the Collector's own named
 * dashboards, as many as wanted, each a grid of tiles that can be dragged and resized. Datasets: add a department's
 * file, a link or a sample (seven agents read, clean, place, design, link and explain it while the page shows each
 * step), then read its summary, insights and charts and pin any of them to a dashboard. Live connectors: the sites kept
 * up to date on their own. "+ Add data" is always at the top right; questions about a dataset go to Jarvis.
 */
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardSummary } from "@/lib/studio/dashtypes";
import type { SampleInfo } from "@/lib/studio/samples";
import type { DatasetCard, Outcome, OutcomeAction, Role, RunEvent } from "@/lib/studio/types";
import type { Console } from "../CollectorApp";
import { I } from "../icons";
import { api, runStream } from "./client";
import Pipeline, { emptyRun, type RunState } from "./Pipeline";
import Hero from "./Hero";
import Dataset from "./Dataset";
import Connect, { type ConnectRequest } from "./Connect";
import { OutcomeView, Picker } from "./Outcome";
import Connectors from "./Connectors";
import Dashboards from "./Dashboards";
import "./studio.css";
import "./studio-command.css";
import "./studio-dash.css";
import "./studio-boards.css";

/** the three tabs across the top of the Studio */
export type StudioView = "dashboards" | "datasets" | "connectors";
type Mode = { k: "home" } | { k: "run" } | { k: "dataset"; id: string };
interface ListResp { connectors?: { count: number; attention: number }; datasets: DatasetCard[]; hidden?: { id: string; name: string }[]; dashboards?: DashboardSummary[]; samples: SampleInfo[]; ai: { available: boolean; providers: string[]; problem: string | null } }

const ACCEPT = ".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json,.geojson,.kml,.kmz,.xml,.zip,.pdf,.docx,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp";
/**
 * A dataset asked for from elsewhere: the search palette and the Briefing book write it before opening the Studio, which
 * takes it once (and removes it). Before the Studio kept SEEN it also wrote its own last dataset here, so a value left
 * by an older page is read as asked for once, which opens that same dataset.
 */
const KEY = "diq-studio-sel";
/** the dataset last open in the Studio (its own memory, never a request) */
const SEEN = "diq-studio-seen";
/** the tab last chosen; the top bar's "My dashboards" sets it to "dashboards" (and sends "diq:studio-view") */
const TAB_KEY = "diq-studio-tab";
/** the dashboard last open */
const DASH_KEY = "diq-studio-dash";
const VIEWS: StudioView[] = ["dashboards", "datasets", "connectors"];
const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not kept in this browser */ } };
const drop = (k: string) => { try { localStorage.removeItem(k); } catch { /* not kept in this browser */ } };
const isView = (v: unknown): v is StudioView => typeof v === "string" && (VIEWS as string[]).includes(v);
/** the dashboards in the Studio's list (an older server sent bare ids: those are left out) */
const dashesOf = (r: ListResp | null): DashboardSummary[] =>
  (r?.dashboards ?? []).filter((d): d is DashboardSummary => !!d && typeof d === "object" && typeof (d as DashboardSummary).id === "string");

export default function Studio({ c }: { c: Console }) {
  const [list, setList] = useState<ListResp | null>(null);
  const [mode, setMode] = useState<Mode>({ k: "home" });
  // the tab: the one last chosen, else (once the list is in) Dashboards when there is one, else Datasets; null until then
  const [view, setViewRaw] = useState<StudioView | null>(() => { const v = get(TAB_KEY); return isView(v) ? v : null; });
  const setView = useCallback((v: StudioView) => { setViewRaw(v); put(TAB_KEY, v); }, []);
  const [dashSel, setDashSel] = useState<string | null>(() => get(DASH_KEY));
  useEffect(() => { if (dashSel) put(DASH_KEY, dashSel); }, [dashSel]);
  const [run, setRun] = useState<RunState | null>(null);
  const [drag, setDrag] = useState(false);
  const [link, setLink] = useState("");
  const [connecting, setConnecting] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  // "+ Add data": the add card is brought into view, highlighted, and its link box focused
  const addCard = useRef<HTMLElement>(null);
  const [flash, setFlash] = useState(0);
  const lastStart = useRef<(() => void) | null>(null);
  // datasets chosen in the picker, added one after another (each with its own run)
  const pickQueue = useRef<{ token: string; ids: string[]; title: string }[]>([]);
  // the console object is rebuilt on every render of the shell: read it through a ref, so loading runs once
  const cRef = useRef(c);
  cRef.current = c;

  // the list could not be read: said in place of an endless skeleton, with "Try again"
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<ListResp>("/api/collector/studio");
      setList(r);
      setFailed(null);
      return r;
    } catch (e: any) {
      cRef.current.toast(e.message, "alert");
      setFailed(e.message);
      return null;
    }
  }, []);

  // first visit: the tab last chosen (else Dashboards when there is one) and, in Datasets, the dataset last looked at,
  // else the newest, else the welcome. A dataset asked for from elsewhere (the search palette) opens Datasets on it,
  // even when it is the one last looked at.
  useEffect(() => {
    load().then((r) => {
      if (!r) { setViewRaw((v) => v ?? "datasets"); return; }
      const want = get(KEY);
      drop(KEY);
      const asked = !!want && r.datasets.some((d) => d.id === want);
      const last = get(SEEN);
      const pick = (asked ? want : r.datasets.find((d) => d.id === last)?.id) ?? r.datasets[0]?.id;
      if (pick) setMode((m) => (m.k === "home" ? { k: "dataset", id: pick } : m));
      if (asked) setView("datasets");
      else setViewRaw((v) => v ?? (dashesOf(r).length ? "dashboards" : "datasets"));
    });
  }, [load, setView]);
  useEffect(() => {
    if (mode.k === "dataset") put(SEEN, mode.id);
  }, [mode]);
  // the top bar's "My dashboards" (TopMenu.tsx) while the Studio is already open
  useEffect(() => {
    const f = (e: Event) => { const v = (e as CustomEvent<unknown>).detail; if (isView(v)) setView(v); };
    window.addEventListener("diq:studio-view", f);
    return () => window.removeEventListener("diq:studio-view", f);
  }, [setView]);
  // a dataset chosen elsewhere (the search palette, Jarvis's "Open in the Studio") while the Studio is already open
  useEffect(() => {
    const f = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (typeof id !== "string" || !id) return;
      try { localStorage.removeItem(KEY); } catch { /* not saved */ }
      setView("datasets");
      setMode({ k: "dataset", id });
    };
    window.addEventListener("diq:studio-open", f);
    return () => window.removeEventListener("diq:studio-open", f);
  }, [setView]);
  useEffect(() => {
    const el = addCard.current;
    if (!flash || !el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.querySelector<HTMLInputElement>(".ds-fetch input")?.focus({ preventScroll: true });
    el.classList.remove("flash");
    void el.offsetWidth; // restart the highlight
    el.classList.add("flash");
    const t = setTimeout(() => el.classList.remove("flash"), 1400);
    return () => clearTimeout(t);
  }, [flash]);
  const addData = useCallback(() => { setView("datasets"); setFlash((n) => n + 1); }, [setView]);
  /** a dashboard, opened on the Dashboards tab (a toast's "Open", a dataset's "On dashboard") */
  const openDash = useCallback((id: string) => { setDashSel(id); setView("dashboards"); }, [setView]);
  /** a dataset, opened on the Datasets tab (a tile's "Open dataset", a connector) */
  const openDataset = useCallback((id: string) => { setView("datasets"); setMode({ k: "dataset", id }); }, [setView]);

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
      if (e.t === "blocked") {
        const steps = { ...r.steps };
        for (const k of Object.keys(steps) as (keyof RunState["steps"])[]) if (steps[k].state === "run") steps[k] = { ...steps[k], detail: "Stopped: does not look like Chennai district data" };
        return { ...r, steps, blocked: { id: e.id, why: e.why, signals: e.signals } };
      }
      if (e.t === "error") {
        const steps = { ...r.steps };
        for (const k of Object.keys(steps) as (keyof RunState["steps"])[]) if (steps[k].state === "run") steps[k] = { ...steps[k], state: "error" };
        return { ...r, steps, error: e.message };
      }
      if (e.t === "outcome") {
        const steps = { ...r.steps };
        for (const k of Object.keys(steps) as (keyof RunState["steps"])[]) if (steps[k].state === "run") steps[k] = { ...steps[k], state: "done" };
        return { ...r, steps, outcome: e.outcome };
      }
      return { ...r, id: e.id, doneAt: Date.now() };
    });
    if (e.t === "done") {
      const next = pickQueue.current.shift();
      if (next) load().then(() => setTimeout(() => startPick(next.token, next.ids, "each", next.title), 900));
      else load().then(() => setTimeout(() => setMode({ k: "dataset", id: e.id }), 700));
    }
  }, [load]);
  const drain = useCallback(() => {
    if (pump.current) return;
    const next = () => {
      const e = queue.current.shift();
      if (!e) { pump.current = null; return; }
      apply(e);
      const base = e.t === "step" ? (e.state === "run" ? 300 : 200) : e.t === "log" ? 60 : 0;
      // a backlog (the server already finished) is shown quickly: the agents' moments shrink as the queue grows
      const gap = Math.round(base / (1 + queue.current.length / 6));
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
      // a run is watched on the Datasets tab, wherever it was started from (a file dropped on a dashboard)
      setView("datasets");
      runStream(path, init, (e) => { queue.current.push(e); drain(); })
        .catch((err) => { queue.current.push({ t: "error", message: err.message }); drain(); });
    };
    lastStart.current = exec;
    exec();
  }, [drain, setView]);

  const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const addFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { c.toast("The file is larger than 15 MB.", "alert"); return; }
    const fd = new FormData();
    fd.append("file", f);
    start(f.name, "file", "/api/collector/studio", { method: "POST", body: fd });
  };
  const addLink = (req?: ConnectRequest) => {
    const u = (req?.url ?? link).trim();
    let url: URL;
    try { url = new URL(u); } catch { c.toast("Paste a full link that starts with http:// or https://", "alert"); return; }
    if (!/^https?:$/.test(url.protocol)) { c.toast("Only http and https links can be read.", "alert"); return; }
    setLink("");
    setConnecting(false);
    start(req?.name || `${url.hostname}${url.pathname.length > 1 ? url.pathname.slice(0, 40) : ""}`, "link", "/api/collector/studio",
      json({ url: u, name: req?.name ?? null, auth: req?.auth ?? null, every: req?.every ?? null }));
  };
  const force = (id: string) => start(run?.title ?? "Dataset", "force", `/api/collector/studio/${id}`, json({ action: "force" }));
  const discard = async (id: string) => {
    try { await api(`/api/collector/studio/${id}`, { json: { action: "discard" } }); } catch { /* already gone */ }
    setRun(null);
    setMode(datasets[0] ? { k: "dataset", id: datasets[0].id } : { k: "home" });
  };
  const choose = (id: string, name: string) => (candidate: string) => start(name, "choose", `/api/collector/studio/${id}`, json({ action: "choose", candidate }));
  const addSample = (key: string) => start(list?.samples.find((x) => x.key === key)?.file ?? "Sample", "sample", "/api/collector/studio", json({ sample: key }));
  const remap = (id: string, name: string) => (changes: { key: string; role: Role; label?: string }[]) =>
    start(name, "remap", `/api/collector/studio/${id}`, json({ columns: changes }, "PATCH"));
  const refresh = (id: string, name: string) => () => start(name, "refresh", `/api/collector/studio/${id}`, json({ action: "refresh" }));

  const startPick = (token: string, ids: string[], how: "each" | "combine" | "latest" | "all" | "connector", title: string) =>
    start(title, "choose", "/api/collector/studio/pick", json({ token, ids, mode: how }));
  /** the picker's choice: several datasets one after another, or one run (combined, a series) */
  const addPicked = (ids: string[], how: "each" | "combine" | "latest" | "all" | "connector") => {
    const pick = run?.outcome?.pick;
    if (!pick || !ids.length) return;
    const name = (id: string) => pick.cards.find((x) => x.id === id)?.name ?? "Dataset";
    if (how === "each" && ids.length > 1) {
      pickQueue.current = ids.slice(1).map((id, i) => ({ token: pick.token, ids: [id], title: `${name(id)} (${i + 2} of ${ids.length})` }));
      startPick(pick.token, [ids[0]], "each", `${name(ids[0])} (1 of ${ids.length})`);
    } else startPick(pick.token, ids, how, how === "combine" ? `${ids.length} datasets combined` : name(ids[0]));
  };
  const back = () => setMode(current ? { k: "dataset", id: current.id } : datasets[0] ? { k: "dataset", id: datasets[0].id } : { k: "home" });
  /** a button on an outcome screen */
  const onOutcome = (a: OutcomeAction, o: Outcome) => {
    if (a.act === "retry") lastStart.current?.();
    else if (a.act === "useAnyway" && o.pendingId) force(o.pendingId);
    else if (a.act === "open" && o.dupOf) { setRun(null); setMode({ k: "dataset", id: o.dupOf.id }); }
    else if (a.act === "refresh" && o.dupOf) start(o.dupOf.name, "refresh", `/api/collector/studio/${o.dupOf.id}`, json({ action: "refresh" }));
    else if (a.act === "file") fileIn.current?.click();
    else if (a.act === "vault") { setLink(o.url ?? ""); setConnecting(true); }
    else if (a.act === "link") { setLink(a.href ?? ""); back(); }
    // a news feed is followed, not charted: it goes to the Collector's own links with the address filled in, one click from added
    else if (a.act === "news") { setRun(null); back(); c.openSources("add", o.url ?? undefined); }
    else { if (o.pendingId) discard(o.pendingId); else { setRun(null); back(); } }
  };

  const busy = mode.k === "run" && !!run && !run.doneAt && !run.error && !run.blocked && !run.outcome;
  const datasets = list?.datasets ?? [];
  const dashes = useMemo(() => dashesOf(list), [list]);
  // which dashboards each dataset is on
  const onDash = useMemo(() => {
    const m = new Map<string, DashboardSummary[]>();
    for (const d of dashes) for (const x of d.datasets) m.set(x.id, [...(m.get(x.id) ?? []), d]);
    return m;
  }, [dashes]);
  const current = mode.k === "dataset" ? datasets.find((d) => d.id === mode.id) : null;
  // a run still going: listed in the rail when its screen is not open, and as a chip on the tab bar from the other tabs
  const inProgress = !!run && run.doneAt == null && !run.error && !run.blocked && !run.outcome;
  const running = inProgress && mode.k !== "run";
  const attention = list?.connectors?.attention ?? 0;

  return (
    <div className="ds-page"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) addFile(e.dataTransfer.files?.[0]); }}>
      <nav className="ds-top" aria-label="Data Studio">
        <div className="ds-top-tabs" role="tablist" aria-label="Data Studio sections">
          <button type="button" role="tab" aria-selected={view === "dashboards"} className={view === "dashboards" ? "on" : ""} onClick={() => setView("dashboards")}
            title="Your dashboards: the numbers, findings and charts you chose, arranged as you like">
            <I n="grid" /><span>Dashboards</span><em>{list ? dashes.length : "…"}</em></button>
          <button type="button" role="tab" aria-selected={view === "datasets"} className={view === "datasets" ? "on" : ""} onClick={() => setView("datasets")}
            title="Every file, link and sample you added, with its summary, insights and charts">
            <I n="table" /><span>Datasets</span><em>{list ? datasets.length : "…"}</em></button>
          <button type="button" role="tab" aria-selected={view === "connectors"} className={view === "connectors" ? "on" : ""} onClick={() => setView("connectors")}
            title={attention ? `${attention} need a look (late, failing or waiting for review)` : "Sites that publish daily, kept up to date on their own"}>
            <I n="refresh" /><span>Live connectors</span>{list?.connectors?.count ? <em>{list.connectors.count}</em> : null}
            {attention > 0 && <i className="ds-top-bad" aria-label={`${attention} need a look`}><I n="alert" /></i>}</button>
        </div>
        {inProgress && view !== "datasets" && (
          <button type="button" className="ds-top-run" onClick={() => { setView("datasets"); setMode({ k: "run" }); }} title="Watch the agents at work">
            <span className="ds-spin sm" /><span>Reading “{run!.title}”…</span></button>
        )}
        <button type="button" className="ds-btn ds-top-add" onClick={addData} title="Add a file, a link or a sample"><I n="plus" />Add data</button>
      </nav>

      <div className={`ds${drag ? " dragging" : ""}${view !== "datasets" ? " ds-wide" : " ds-v2"}`}>
        {view === "datasets" && (
          <>
            {/* 28 Nov (the owner: the Studio was congested and "Add data" squeezed): one clear row to add data, then the datasets as cards */}
            <section ref={addCard} className="ds-addbar card ds-span">
              <header className="ds-add-h"><span className="ds-spark-ic"><I n="spark" /></span><b>Add data</b><small className="ds-add-sub">A department file, or a link to a page, a file or an API</small>
                <small className={list?.ai.available ? "ok" : ""} title={list?.ai.available ? `AI: ${list.ai.providers.join(", ")}` : "No AI model configured: the rules read the files"}>
                  <i />{list ? (list.ai.available ? "AI ready" : "Rules only") : "…"}</small></header>
              <div className="ds-addbar-g">
                <button className={`ds-drop${drag ? " over" : ""}`} onClick={() => fileIn.current?.click()} disabled={busy} aria-label="Choose a file to add">
                  <span className="ds-drop-ic"><I n="download" /></span>
                  <b>{drag ? "Drop to analyse" : "Upload a file"}</b>
                  <small>Drop it here or click to browse · Excel, CSV, PDF, a photo of a table · up to 15 MB</small>
                </button>
                <input ref={fileIn} type="file" accept={ACCEPT} hidden onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
                <form className="ds-fetch" onSubmit={(e) => { e.preventDefault(); addLink(); }}>
                  <b>Fetch from a link</b>
                  <div className="ds-fetch-row">
                    <span className="ds-fetch-in"><I n="ext" />
                      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link: https://…" aria-label="Link to a data source" disabled={busy} /></span>
                    <button className="ds-fetch-go" disabled={busy || link.trim().length < 10} data-jarvis-never><I n="download" />Fetch</button>
                  </div>
                  <button type="button" className="ds-lnk ds-fetch-more" disabled={busy} onClick={() => setConnecting(true)}><I n="shield" />Needs a sign-in or a schedule?</button>
                </form>
              </div>
              {!!list?.samples.length && !datasets.length && (
                <div className="ds-samples">
                  <small>Or try a sample</small>
                  {list.samples.map((s) => (
                    <button key={s.key} onClick={() => addSample(s.key)} disabled={busy} title={s.blurb} data-jarvis-never>
                      <span className={`ds-sample-ic ${s.icon}`}><I n={s.icon} /></span><span>{s.title}</span><em>{s.format}</em>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {(datasets.length > 0 || running) && (
              <section className="ds-picks card ds-span" aria-label="Your datasets">
                <header><b>Your datasets</b><span className="cnt-b">{datasets.length}</span><small>Click one to open it</small></header>
                <div className="ds-picks-l">
                  {running && (
                    <button className="ds-pick running" onClick={() => setMode({ k: "run" })}>
                      <span className="ds-li-ic"><span className="ds-spin sm" /></span><span className="ds-li-b"><b>{run!.title}</b><small>Reading…</small></span>
                    </button>
                  )}
                  {datasets.map((d) => (
                    <button key={d.id} className={`ds-pick${mode.k === "dataset" && mode.id === d.id ? " on" : ""}`} onClick={() => setMode({ k: "dataset", id: d.id })}>
                      <span className={`ds-li-ic k-${d.kind}`}><I n={d.kind === "link" ? "ext" : d.kind === "sample" ? "spark" : "table"} /></span>
                      <span className="ds-li-b"><b>{d.name}</b><small>{d.rows.toLocaleString("en-IN")} rows{d.department ? ` · ${d.department}` : ""}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {view === null ? (
          <section className="ds-span card"><div className="ds-loading-sk" role="status" aria-live="polite"><span className="ds-sr">Opening the Data Studio…</span>
            <div className="ds-skel sk-head" /><div className="sk-row"><div className="ds-skel" /><div className="ds-skel" /><div className="ds-skel" /></div>
            <div className="sk-row two"><div className="ds-skel" /><div className="ds-skel" /></div></div></section>
        ) : !list && failed && (view === "dashboards" || (view === "datasets" && mode.k === "home")) ? (
          <section className="ds-span card"><div className="ds-empty"><I n="alert" /><b>The Data Studio could not be opened.</b><span>{failed}</span>
            <button type="button" className="ds-btn" onClick={() => void load()}><I n="refresh" />Try again</button></div></section>
        ) : view === "dashboards" ? (
          <Dashboards c={c} dashboards={list ? dashes : null} datasets={datasets.map((d) => ({ id: d.id, name: d.name }))} sel={dashSel} onSel={setDashSel}
            onOpen={openDataset} onChanged={load} onAddData={addData} />
        ) : view === "connectors" ? (
          <Connectors c={c} onOpen={openDataset} onChanged={() => load()} />
        ) : mode.k === "run" && run?.outcome ? (
          <section className="ds-span card ds-run-wrap">
            {run.outcome.kind === "choose" && run.outcome.pick
              ? <Picker pick={run.outcome.pick} onAdd={addPicked} onCancel={() => { setRun(null); back(); }} />
              : <OutcomeView outcome={run.outcome} onAction={onOutcome} onBack={() => { if (run.outcome?.pendingId) discard(run.outcome.pendingId); else { setRun(null); back(); } }} />}
          </section>
        ) : mode.k === "run" && run ? (
          <section className="ds-span card ds-run-wrap">
            <Pipeline run={run} onBack={() => setMode(run.id ? { k: "dataset", id: run.id } : current ? { k: "dataset", id: current.id } : datasets[0] ? { k: "dataset", id: datasets[0].id } : { k: "home" })}
              onRetry={lastStart.current ?? undefined} onForce={force} onDiscard={discard} />
          </section>
        ) : mode.k === "dataset" ? (
          <Dataset key={mode.id} id={mode.id} c={c} dashboards={dashes} onDashes={onDash.get(mode.id) ?? []} onOpenDash={openDash} onDashChanged={() => load()}
            onRemap={remap(mode.id, current?.name ?? "Dataset")} onRefresh={refresh(mode.id, current?.name ?? "Dataset")} onChoose={choose(mode.id, current?.name ?? "Dataset")}
            onDeleted={() => { load().then((r) => setMode(r?.datasets[0] ? { k: "dataset", id: r.datasets[0].id } : { k: "home" })); }}
            // the site's home page, explored for its other datasets (the link engine's picker)
            onFindMore={(u) => { try { addLink({ url: `${new URL(u).origin}/`, name: null, auth: null, every: null }); } catch { /* not a link */ } }} />
        ) : (
          <section className="ds-span card ds-hero-wrap"><Hero samples={list ? list.samples ?? [] : null} onSample={addSample} busy={busy} /></section>
        )}
        <AnimatePresence>{connecting && <Connect initialUrl={link} onClose={() => setConnecting(false)} onConnect={addLink} />}</AnimatePresence>
        {drag && <div className="ds-dropveil"><div><I n="download" /><b>Drop to analyse</b><small>Seven agents will read, clean, map and explain it</small></div></div>}
      </div>
    </div>
  );
}
