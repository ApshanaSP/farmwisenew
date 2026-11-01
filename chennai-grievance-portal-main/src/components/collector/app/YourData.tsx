"use client";
/**
 * Your data, on the dashboard (Environment page): the charts the Collector added from the Data Studio ("Add to
 * dashboard"), recomputed from each dataset's latest rows, and what in those datasets needs action now (read from each
 * dataset's saved brief, no model asked). Folded, it shows the top few; "Show all" opens it over the whole page with
 * every chart, and Esc or "Show fewer" folds it back.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { PanelData, Pin } from "@/lib/studio/types";
import type { Console } from "./CollectorApp";
import { I } from "./icons";
import { api } from "./studio/client";

const StudioChart = dynamic(() => import("./studio/StudioChart"), { ssr: false, loading: () => <div className="yd-ph" /> });
const StudioMap = dynamic(() => import("./studio/StudioMap"), { ssr: false, loading: () => <div className="yd-ph" /> });

interface Board { pin: Pin; panel: PanelData; dataset: { id: string; name: string } }
interface Watch { id: string; name: string; department: string | null; act: number; top: { headline: string; metric: string; caption: string; label: string }[] }

export default function YourData({ c }: { c: Console }) {
  const [board, setBoard] = useState<Board[] | null>(null);
  const [watch, setWatch] = useState<Watch[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ board: Board[] }>("/api/collector/studio").then((r) => live && setBoard(r.board ?? []), () => live && setBoard([]));
    api<{ datasets: Watch[] }>("/api/collector/studio/watch").then((r) => live && setWatch(r.datasets ?? []), () => undefined);
    return () => { live = false; };
  }, [c.reloadKey]);
  useEffect(() => {
    if (!all) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAll(false); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [all]);
  const openStudio = (id?: string) => {
    if (id) try { localStorage.setItem("diq-studio-sel", id); } catch { /* not saved */ }
    c.setPage("studio");
  };
  const remove = async (b: Board) => {
    try { await api(`/api/collector/studio/${b.dataset.id}`, { json: { action: "unpin", planId: b.pin.id } }); setBoard((x) => x?.filter((y) => y.pin.id !== b.pin.id) ?? null); c.toast("Removed from the dashboard."); }
    catch (e) { c.toast((e as Error).message, "alert"); }
  };
  const acts = watch.flatMap((w) => w.top.map((t) => ({ ...t, ds: w })));
  const n = board?.length ?? 0;
  const shown = all ? board ?? [] : (board ?? []).slice(0, acts.length ? 2 : 4);

  return (
    <article className={`card yd${all ? " all" : ""}`} aria-label="Your data on the dashboard">
      <header className="yd-h">
        <span className="yd-ic"><I n="spark" /></span>
        <div className="yd-t"><h3>Your data</h3><small>{n ? `${n} ${n === 1 ? "chart" : "charts"} added from the Data Studio` : "Charts you add from the Data Studio"}</small></div>
        {n > shown.length && !all && <button className="yd-more" onClick={() => setAll(true)}><I n="expand" />Show all {n}</button>}
        {all && <button className="yd-more" onClick={() => setAll(false)}><I n="x" />Show fewer</button>}
        <button className="yd-more ghost" onClick={() => openStudio()} title="Open the Data Studio"><I n="arrowUR" /></button>
      </header>
      <div className="yd-b">
        {acts.length > 0 && (
          <ul className={`yd-acts${all ? " wide" : ""}`} aria-label="Needs action in your datasets">
            {(all ? acts : acts.slice(0, n ? 2 : 3)).map((a, i) => (
              <li key={i}><button onClick={() => openStudio(a.ds.id)} title={`${a.ds.name}: ${a.caption}`}>
                <span className="yd-dot" /><b>{a.headline}</b><small>{a.ds.name}{a.ds.department ? ` · ${a.ds.department}` : ""}</small>
              </button></li>
            ))}
          </ul>
        )}
        {board == null ? <div className="yd-grid"><div className="yd-ph" /><div className="yd-ph" /></div>
          : !n ? (
            <div className="yd-empty">
              <I n="plus" /><b>Nothing added yet</b>
              <span>Open a dataset in the Data Studio and press <em>Add to dashboard</em> on any chart: it appears here, kept up to date.</span>
              <button className="yd-go" onClick={() => openStudio()}><I n="spark" />Open the Data Studio</button>
            </div>
          ) : (
            <div className="yd-grid">
              {shown.map((b, i) => (
                <section key={b.pin.id} className="yd-p" style={{ ["--i" as string]: i }}>
                  <header>
                    <div><h4 title={b.panel.title}>{b.panel.title}</h4><small><button onClick={() => openStudio(b.dataset.id)}>{b.dataset.name}</button></small></div>
                    <button className="yd-x" onClick={() => remove(b)} title="Remove from the dashboard" aria-label="Remove from the dashboard"><I n="x" /></button>
                  </header>
                  <div className="yd-c">
                    {b.panel.kpi ? <div className="yd-k"><b>{b.panel.kpi.value.toLocaleString("en-IN")}</b><small>{b.panel.kpi.sub}</small></div>
                      : b.panel.chart === "map" ? <StudioMap geo={c.geo} panel={b.panel} focusZone={null} />
                        : b.panel.values.length ? <StudioChart panel={b.panel} height="100%" compact={!all} /> : <div className="yd-none">No values right now.</div>}
                  </div>
                </section>
              ))}
            </div>
          )}
      </div>
    </article>
  );
}
