"use client";
/**
 * Live traffic, on the Overview's own map (its own view, not inside Rain): what TomTom sees on Chennai's roads now,
 * drawn as traffic moving along each jammed road (slower the worse it is), with the road colours of the flow tiles under
 * it. The panel on the left, worst first:
 *   Act now        very congested stretches, water on the road, accidents, long delays: each with the body that answers
 *                  for it and "Send to …" (an email the Collector reads and approves; sandbox by default)
 *   Keeps coming   trouble spots: a live jam where the district's own traffic reports, accidents and road complaints of
 *                  the last 30 days pile up, joined into one case to send as one
 *   By zone        where the jams are
 *   All live       everything TomTom reports now, closures and works too
 * A spot's card shows its delay, length, place, who answers for it, the reports near it (open them), the news, and Send.
 * Data: /api/traffic (lib/city/traffic.ts), read again every two minutes. The same data answers the chatbot, Jarvis and
 * Ask the Map, so they always agree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I, type IconName } from "../icons";
import type { TrafficCluster, TrafficLevel, TrafficNow, TrafficSpot } from "@/lib/city/traffic";
import type { RainLayer } from "../rehearsal/rainLayer";
import { Grip, useDragPanel } from "../askmap/dragPanel";
import "../rehearsal/rehearsal.css";
import "../rehearsal/rainview.css";
import "./traffic.css";

export const TRAFFIC_API = { now: "/api/traffic", tiles: "/api/rehearsal/traffic/{z}/{x}/{y}", action: "/api/traffic/action" };
const REFRESH_MS = 120_000;

const LEVEL: Record<TrafficLevel, { en: string; c: string; icon: IconName }> = {
  very: { en: "Very congested", c: "#B91C1C", icon: "flow" },
  congested: { en: "Congested", c: "#EA580C", icon: "flow" },
  slow: { en: "Slow", c: "#CA8A04", icon: "flow" },
  flood: { en: "Water on the road", c: "#0284C7", icon: "drop" },
  accident: { en: "Accident / breakdown", c: "#7C3AED", icon: "alert" },
  closed: { en: "Road closed", c: "#334155", icon: "x" },
  works: { en: "Road works", c: "#A16207", icon: "cone" }
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const n0 = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : "—");
const len = (m: number | null) => (m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
const day = (s: string) => { const [y, mo, d] = s.slice(0, 10).split("-"); return `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1]}${y !== String(new Date().getFullYear()) ? ` ${y}` : ""}`; };

type Tab = "act" | "repeat" | "zones" | "all";
type Pick = { kind: "spot" | "cluster"; id: string } | null;

export default function TrafficView({ start, onClose, onLayer, onOpenIncident, toast, escRef, canSend }: {
  start: { seq: number; spot: string | null };
  onClose: () => void;
  onLayer: (l: RainLayer | null) => void;
  onOpenIncident: (id: string) => void;
  toast: (msg: string, kind?: "ok" | "alert") => void;
  escRef: React.MutableRefObject<(() => boolean) | null>;
  /** the Collector sends; an officer's console only looks */
  canSend: boolean;
}) {
  const [d, setD] = useState<TrafficNow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("act");
  const [pick, setPick] = useState<Pick>(start.spot ? { kind: "spot", id: start.spot } : null);
  const [zone, setZone] = useState<number | null>(null);
  const [flow, setFlow] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const r = await fetch(TRAFFIC_API.now, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Live traffic could not be read.");
      setD(j); setErr(null);
    } catch (e) { if (!quiet || !d) setErr((e as Error).message); }
    finally { setBusy(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); const t = setInterval(() => load(true), REFRESH_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { setMore(false); }, [tab, zone]);

  const spotBy = useMemo(() => new Map((d?.spots ?? []).map((s) => [s.id, s])), [d]);
  const clusterBy = useMemo(() => new Map((d?.clusters ?? []).map((c) => [c.id, c])), [d]);
  const inZone = useCallback((s: { zone: number | null }) => zone == null || s.zone === zone, [zone]);

  // Escape: the card, then the zone; then the console closes the view
  useEffect(() => {
    escRef.current = () => {
      if (sending) { setSending(null); return true; }
      if (pick) { setPick(null); return true; }
      if (zone != null) { setZone(null); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [pick, zone, sending, escRef]);

  // ---- the map: every live spot moving along its road, the trouble spots as numbered badges, the chosen one on top
  const shot = useRef({ key: "", seq: 0 });
  const layer = useMemo<RainLayer | null>(() => {
    if (!d) return null;
    const key = `${pick?.kind}|${pick?.id}|${zone}|${tab}`;
    if (shot.current.key !== key) shot.current = { key, seq: shot.current.seq + 1 };
    const tip = (s: TrafficSpot) => `<b>${esc(LEVEL[s.level].en)}: ${esc(s.name)}</b><span class="tl">${esc(s.label)}${s.delayMin ? ` · about ${s.delayMin} min delay` : ""}${s.lengthM ? ` · ${len(s.lengthM)}` : ""}</span>`
      + `${s.zoneName ? `<span class="tl dim">${esc(s.zoneName)}${s.ward ? `, ward ${s.ward}` : ""} · ${esc(s.owner.name)}</span>` : ""}`
      + `${s.repeat.n >= 2 ? `<span class="tl in">${s.repeat.n} reports here in 30 days${s.repeat.open ? `, ${s.repeat.open} open` : ""}</span>` : ""}<span class="tl dim">Click for the details</span>`;
    const live: NonNullable<RainLayer["live"]> = d.spots.map((s) => ({ id: s.id, path: s.path, tip: tip(s), flooding: s.level === "flood", level: s.level, pick: true,
      faint: (zone != null && s.zone !== zone) || (tab === "act" && !s.action && !(pick?.kind === "spot" && pick.id === s.id)) }));
    const points: NonNullable<RainLayer["points"]> = d.clusters.filter(inZone).map((c) => ({ key: `c:${c.id}`, lat: c.lat, lon: c.lon, level: 3, glyph: String(Math.min(99, c.reports.length)),
      tip: `<b>Keeps coming back: ${esc(c.name)}</b><span class="tl">${esc(c.why)}</span><span class="tl dim">Click to send it as one case to ${esc(c.owner.name)}</span>` }));
    let pts: [number, number][] | null = null, maxZoom: number | undefined;
    const sel = pick?.kind === "spot" ? spotBy.get(pick.id) : null;
    const cl = pick?.kind === "cluster" ? clusterBy.get(pick.id) : null;
    if (sel) { pts = sel.path; maxZoom = 16; }
    else if (cl) { pts = cl.spots.flatMap((id) => spotBy.get(id)?.path ?? []); if (!pts.length) pts = [[cl.lat, cl.lon]]; maxZoom = 16; }
    else if (zone != null) pts = d.spots.filter((s) => s.zone === zone).map((s) => [s.lat, s.lon] as [number, number]);
    else if (tab === "act") pts = d.spots.filter((s) => s.action).map((s) => [s.lat, s.lon] as [number, number]);
    else if (tab === "repeat") pts = d.clusters.map((c) => [c.lat, c.lon] as [number, number]);
    if (pts && !pts.length) pts = null;
    return {
      theme: "traffic", streets: [], dots: [], points, tiles: flow && d.enabled ? TRAFFIC_API.tiles : null, live,
      sel: sel ? { kind: "point", id: `s:${sel.id}` } : cl ? { kind: "point", id: `c:${cl.id}` } : null,
      fit: { seq: shot.current.seq, pts, maxZoom },
      onPick: (_k, id) => {
        if (id.startsWith("s:") && spotBy.has(id.slice(2))) setPick({ kind: "spot", id: id.slice(2) });
        else if (id.startsWith("c:") && clusterBy.has(id.slice(2))) setPick({ kind: "cluster", id: id.slice(2) });
      }
    };
  }, [d, pick, zone, tab, flow, spotBy, clusterBy, inZone]);
  useEffect(() => { onLayer(layer); }, [layer, onLayer]);
  useEffect(() => () => onLayer(null), [onLayer]);

  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const drag = useDragPanel("traffic", phone);
  const head = (
    <header className={`rv-h ${drag.handle.className}`} onPointerDown={drag.handle.onPointerDown} onDoubleClick={drag.handle.onDoubleClick}>
      <Grip off={phone} />
      <span className="rv-ic tf-ic"><I n="flow" /></span>
      <span className="rv-t"><b>Live traffic <span className="tf-live"><i />Live</span></b><small>Jams, closed and flooded roads now; the spots that keep coming back; who to send them to</small></span>
      {drag.tools}
      <button className="amp-x" onClick={onClose} title="Back to the Overview (Esc)"><I n="x" />Close</button>
    </header>
  );

  if (!d) {
    return (
      <aside ref={drag.ref} style={drag.style} className={`amp rv tf${phone ? " sheet" : ""}${drag.cls}`} data-h="half" aria-label="Live traffic" aria-busy={!err}>
        {head}
        <div className="rv-wait">
          {err ? <><I n="alert" /><b>{err}</b><button className="rv-btn" onClick={() => load()}>Try again</button></>
            : <><span className="rv-spin" /><b>Reading live traffic…</b><small>TomTom's jams, closures and flooded roads over Chennai</small></>}
        </div>
      </aside>
    );
  }

  const c = d.counts;
  const strip = (
    <div className="tf-strip">
      <span className="tf-at" title={d.source}><I n="clock" />Updated {hm(d.at)} · every 2 min</span>
      <label className="tf-flow-t" title="Road colours from TomTom: green moves freely, red is stopped"><input type="checkbox" checked={flow} onChange={(e) => setFlow(e.target.checked)} />Road colours</label>
      <button className="tf-rf" onClick={() => load()} disabled={busy} title="Read live traffic again now"><I n="refresh" />{busy ? "…" : ""}</button>
    </div>
  );

  // ---- a spot's card, or a trouble spot's
  let body: React.ReactNode;
  const spot = pick?.kind === "spot" ? spotBy.get(pick.id) ?? null : null;
  const cluster = pick?.kind === "cluster" ? clusterBy.get(pick.id) ?? null : null;
  if (spot) {
    const inCl = d.clusters.find((x) => x.spots.includes(spot.id));
    body = (
      <>
        <button className="rv-back" onClick={() => setPick(null)}><I n="chevl" />Back to the list</button>
        <div className="rv-card">
          <div className="rv-card-h">
            <span className="rv-cic" style={{ background: LEVEL[spot.level].c }}><I n={LEVEL[spot.level].icon} /></span>
            <span><b>{spot.name}</b><small>{spot.zoneName ? `${spot.zoneName}${spot.ward ? `, ward ${spot.ward}` : ""}` : "Chennai"}</small></span>
          </div>
          <div className={`tf-now l-${spot.level}`}>
            <small>Now · {spot.label}</small>
            <b>{LEVEL[spot.level].en}{spot.delayMin ? `, about ${spot.delayMin} min delay` : ""}</b>
            {spot.lengthM ? <span>over {len(spot.lengthM)} of road</span> : null}
          </div>
          <Owner o={spot.owner} />
          {canSend && <button className="rv-go" onClick={() => setSending(`spot:${spot.id}`)}><I n="send" />Send to {spot.owner.name}</button>}
          {inCl && <button className="tf-link" onClick={() => setPick({ kind: "cluster", id: inCl.id })}><I n="layers" />Part of a trouble spot: {inCl.why}</button>}
          <Records reports={spot.repeat.reports} news={spot.repeat.news} onOpenIncident={onOpenIncident} />
          <a className="tf-link" href={`https://www.google.com/maps?q=${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}`} target="_blank" rel="noopener noreferrer"><I n="ext" />Open the place in Google Maps</a>
        </div>
      </>
    );
  } else if (cluster) {
    body = (
      <>
        <button className="rv-back" onClick={() => setPick(null)}><I n="chevl" />Back to the list</button>
        <div className="rv-card">
          <div className="rv-card-h">
            <span className="rv-cic tf-rep"><b>{Math.min(99, cluster.reports.length)}</b></span>
            <span><b>{cluster.name}</b><small>Keeps coming back · {cluster.zoneName ?? "Chennai"}{cluster.ward ? `, ward ${cluster.ward}` : ""}</small></span>
          </div>
          <div className={`tf-now l-${cluster.level}`}>
            <small>Live now</small>
            <b>{LEVEL[cluster.level].en}{cluster.delayMin ? `, about ${cluster.delayMin} min delay` : ""}</b>
            <span>{cluster.why}</span>
          </div>
          <ul className="rv-facts">
            {cluster.open > 0 && <li className="warn"><b>{cluster.open}</b> of these reports {cluster.open === 1 ? "is" : "are"} still open</li>}
            <li>{cluster.spots.length === 1 ? "One live stretch" : `${cluster.spots.length} live stretches`} here now: {cluster.spots.map((id) => spotBy.get(id)?.name).filter(Boolean).slice(0, 3).join("; ")}</li>
          </ul>
          <Owner o={cluster.owner} />
          {canSend && <button className="rv-go" onClick={() => setSending(`cluster:${cluster.id}`)}><I n="send" />Send as one case to {cluster.owner.name}</button>}
          <ul className="tf-mini">
            {cluster.spots.map((id) => spotBy.get(id)).filter((s): s is TrafficSpot => !!s).map((s) => (
              <li key={s.id}><button onClick={() => setPick({ kind: "spot", id: s.id })}><i style={{ background: LEVEL[s.level].c }} /><span>{s.name}</span><small>{s.delayMin ? `${s.delayMin} min` : LEVEL[s.level].en}</small></button></li>
            ))}
          </ul>
          <Records reports={cluster.reports} news={cluster.news} onOpenIncident={onOpenIncident} open />
        </div>
      </>
    );
  } else {
    const act = d.spots.filter((s) => s.action && inZone(s));
    const all = d.spots.filter(inZone);
    const cls = d.clusters.filter(inZone);
    const list = tab === "act" ? act : all;
    const shown = more ? list : list.slice(0, 10);
    const zMax = Math.max(1, ...d.zones.map((z) => z.jams));
    body = (
      <>
        <section className="tf-kpis">
          <Kpi n={c.very} label="Very congested" lv="very" />
          <Kpi n={c.congested} label="Congested" lv="congested" />
          <Kpi n={c.flooded} label="Water on road" lv="flood" />
          <Kpi n={c.accidents} label="Accidents" lv="accident" />
          <Kpi n={c.closed} label="Closed" lv="closed" />
        </section>
        {zone != null && <div className="tf-zone"><span>Showing {d.zones.find((z) => z.zone === zone)?.name ?? `Zone ${zone}`}</span><button onClick={() => setZone(null)}><I n="x" />All zones</button></div>}
        {tab === "act" || tab === "all" ? (
          <>
            <h4 className="rv-sec">{tab === "act" ? "Needs action now" : "Everything live now"} <small>{n0(list.length)} · worst first · click one for its card</small></h4>
            {list.length ? (
              <ul className="tf-list">
                {shown.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setPick({ kind: "spot", id: s.id })}>
                      <i className={`tf-bar l-${s.level}`} />
                      <span className="tf-sn"><b>{s.name}</b><small>{s.why}</small><em>{s.zoneName ?? "Chennai"} · {s.owner.name}</em></span>
                      <span className="tf-v">{s.delayMin ? <><b>{s.delayMin}</b><small>min</small></> : <I n={LEVEL[s.level].icon} />}</span>
                    </button>
                    {canSend && tab === "act" && <button className="tf-send" onClick={() => setSending(`spot:${s.id}`)} title={`Draft an email to ${s.owner.name}`}><I n="send" /></button>}
                  </li>
                ))}
              </ul>
            ) : <p className="rv-muted">{tab === "act" ? "Nothing needs action right now: no very congested stretch, water on a road or accident." : "No traffic incident reported here now."}</p>}
            {list.length > 10 && <button className="rv-more" onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : `Show all ${n0(list.length)}`}</button>}
          </>
        ) : tab === "repeat" ? (
          <>
            <h4 className="rv-sec">Keeps coming back <small>live jams where the district&apos;s own reports pile up (30 days)</small></h4>
            {cls.length ? (
              <ul className="tf-list">
                {cls.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => setPick({ kind: "cluster", id: x.id })}>
                      <i className={`tf-bar l-${x.level}`} />
                      <span className="tf-sn"><b>{x.name}</b><small>{x.why}</small><em>{x.zoneName ?? "Chennai"} · {x.owner.name}</em></span>
                      <span className="tf-v tf-n"><b>{x.reports.length}</b><small>reports</small></span>
                    </button>
                    {canSend && <button className="tf-send" onClick={() => setSending(`cluster:${x.id}`)} title={`Send as one case to ${x.owner.name}`}><I n="send" /></button>}
                  </li>
                ))}
              </ul>
            ) : <p className="rv-muted">No live jam stands where reports have piled up in the last 30 days.</p>}
          </>
        ) : (
          <>
            <h4 className="rv-sec">Jams by zone <small>click a zone to look closer</small></h4>
            <ul className="rv-zones">
              {d.zones.map((z) => (
                <li key={z.zone}><button className={zone === z.zone ? "on" : ""} onClick={() => { setZone(zone === z.zone ? null : z.zone); setTab("act"); }}>
                  <span>{z.name}</span><span className="rv-bar tf-zbar"><i style={{ width: `${(100 * z.jams) / zMax}%` }} /></span><b>{z.jams}{z.very ? <small className="tf-vz"> · {z.very} very</small> : null}</b>
                </button></li>
              ))}
            </ul>
            {!d.zones.length && <p className="rv-muted">No jams in any zone now.</p>}
          </>
        )}
        <details className="rv-from tf-src">
          <summary>Where live traffic comes from</summary>
          <p>{d.source}</p>
          <p>Jams are TomTom&apos;s own sizes: <b>very congested</b> is a major delay, <b>congested</b> a moderate one. &quot;Keeps coming back&quot; joins a live jam with the police traffic reports, road accidents, road-damage and flooding complaints and traffic news within 250–500 m of it in the last 30 days.</p>
          {d.why && <p className="warn">{d.why}</p>}
        </details>
      </>
    );
  }

  const tabs: [Tab, string, number, IconName][] = [["act", "Act now", c.action, "alert"], ["repeat", "Keeps coming", c.clusters, "layers"], ["zones", "By zone", d.zones.length, "map"], ["all", "All live", c.total, "flow"]];
  return (
    <>
      <aside ref={drag.ref} style={drag.style} className={`amp rv tf${phone ? " sheet" : ""}${drag.cls}`} data-h="half" aria-label="Live traffic">
        {head}
        {!pick && (
          <nav className="rv-tabs tf-tabs" role="tablist" aria-label="Live traffic">
            {tabs.map(([k, l, n, ic]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPick(null); }}><I n={ic} />{l}<small>{n0(n)}</small></button>
            ))}
          </nav>
        )}
        {strip}
        {!d.enabled && <div className="rv-now lv-watch"><I n="alert" /><span>{d.why ?? "Live traffic is not switched on."}</span></div>}
        <div className="rv-b">{body}</div>
      </aside>
      <TrafficKey left={drag.right} flow={flow && d.enabled} />
      {sending && <SendSheet k={sending} onClose={() => setSending(null)} toast={toast} />}
    </>
  );
}

function Kpi({ n, label, lv }: { n: number; label: string; lv: TrafficLevel }) {
  return <div className={`l-${lv}${n ? "" : " zero"}`}><b>{n0(n)}</b><span><i />{label}</span></div>;
}

function Owner({ o }: { o: TrafficSpot["owner"] }) {
  return (
    <div className="tf-owner"><I n="user" /><span><small>Who answers for it</small><b>{o.name}</b><em>{o.why}</em></span></div>
  );
}

/** the district's records near a spot: reports (open them in the console) and news */
function Records({ reports, news, onOpenIncident, open }: { reports: TrafficSpot["repeat"]["reports"]; news: TrafficSpot["repeat"]["news"]; onOpenIncident: (id: string) => void; open?: boolean }) {
  const [all, setAll] = useState(false);
  if (!reports.length && !news.length) return <p className="rv-muted">No traffic report, accident or road complaint near it in the last 30 days.</p>;
  const shown = all ? reports : reports.slice(0, 6);
  return (
    <details className="rv-from" open={open ?? reports.length >= 2}>
      <summary>Reports near it, last 30 days <small>{n0(reports.length)}{news.length ? ` · ${plural(news.length, "news item")}` : ""}</small></summary>
      <ul className="rv-list">
        {shown.map((r) => (
          <li key={r.id}><button onClick={() => onOpenIncident(r.id)} title="Open the report">
            <i className={r.open ? "rep" : "new"} /><b>{r.title}</b><small>{r.catLabel} · {day(r.at)} · {r.open ? "open" : "closed"} · {r.m} m away</small>
          </button></li>
        ))}
        {news.map((n) => (
          <li key={n.id}>{n.url ? <a className="rv-a" href={n.url} target="_blank" rel="noopener noreferrer"><i className="news" /><b>{n.title}</b><small>News · {n.outlet} · {day(n.at)}</small></a>
            : <div className="rv-a"><i className="news" /><b>{n.title}</b><small>News · {n.outlet} · {day(n.at)}</small></div>}</li>
        ))}
      </ul>
      {reports.length > 6 && <button className="rv-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${n0(reports.length)}`}</button>}
    </details>
  );
}

/** the map's key: moving lines by level, the trouble-spot badge, and the road colours */
function TrafficKey({ left, flow }: { left?: boolean; flow: boolean }) {
  const [shut, setShut] = useState(false);
  useEffect(() => { try { setShut(localStorage.getItem("diq.traffic.keyShut") === "1"); } catch { /* open */ } }, []);
  const flip = () => setShut((v) => { try { localStorage.setItem("diq.traffic.keyShut", v ? "0" : "1"); } catch { /* not kept */ } return !v; });
  const rows: [TrafficLevel, string][] = [["very", "Very congested: crawling"], ["congested", "Congested"], ["slow", "Slow"], ["flood", "Water on the road"], ["accident", "Accident or breakdown"], ["closed", "Road closed"], ["works", "Road works"]];
  return (
    <div className={`rv-leg tf-leg${left ? " at-left" : ""}${shut ? " shut" : ""}`} aria-label="Map key">
      <button type="button" className="rv-leg-t" onClick={flip} aria-expanded={!shut}><I n="flow" />Live traffic<I n={shut ? "up" : "chevd"} /></button>
      {!shut && (
        <>
          <ul>
            {rows.map(([lv, l]) => <li key={lv}><svg className="tf-sw" viewBox="0 0 28 8" aria-hidden><line x1="2" y1="4" x2="26" y2="4" className={lv === "closed" ? "tf-closed" : `tf-anim tf-${lv}`} stroke={LEVEL[lv].c} /></svg><span>{l}</span></li>)}
            <li><span className="g tf-g">7</span><span>Keeps coming back (reports in 30 days)</span></li>
          </ul>
          {flow && <div className="tf-grad"><span>Road colours</span><i /><small><em>Free</em><em>Stopped</em></small></div>}
          <small>Moving dashes show the direction of travel: the slower they move, the worse the jam.</small>
        </>
      )}
    </div>
  );
}

interface Draft { key: string; dept: string; deptName: string; subject: string; body: string; ids: string[]; title: string; to: { name: string; email: string | null } | null;
  delivery: { mode: string; smtp: boolean; to: string | null; note: string } }

/** the email to the body that answers for it: drafted on the server, read and edited here, sent only on Approve */
function SendSheet({ k, onClose, toast }: { k: string; onClose: () => void; toast: (m: string, kind?: "ok" | "alert") => void }) {
  const [dr, setDr] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    fetch(TRAFFIC_API.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", key: k }) })
      .then((r) => r.json().then((j) => (r.ok ? setDr(j) : setErr(j.error ?? "The email could not be drafted.")))).catch(() => setErr("The email could not be drafted."));
  }, [k]);
  const send = async () => {
    if (!dr) return;
    setBusy(true);
    const x = await fetch(TRAFFIC_API.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", key: k, subject: dr.subject, body: dr.body }) }).catch(() => null);
    const j = x ? await x.json().catch(() => ({})) : {};
    setBusy(false);
    if (!x?.ok || !j.id) { if (j.error) toast(j.error, "alert"); return; }
    const m = `${j.note}${j.followups ? ` Follow-up set on ${plural(j.followups, "open case")} (24 h).` : ""}${j.ref ? ` Reference ${j.ref}.` : ""}`;
    setDone(m);
    toast(`${dr.deptName}: ${j.note}`);
  };
  return (
    <div className="amsheet wide tf-sheet" role="dialog" aria-label="Send about live traffic">
      <h4>Send to {dr?.deptName ?? "the body that answers for it"}</h4>
      <p>One email about {dr ? <b>{dr.title}</b> : "this spot"}, written from the live traffic and the reports near it. Nothing is sent until you press Approve.</p>
      {err && <div className="amp-err">{err}</div>}
      {!dr && !err && <div className="amp-busy" />}
      {dr && (
        <div className="amsend-b">
          <div className="amsend-to">To: {dr.to ? `${dr.to.name} <${dr.to.email ?? "no address"}>` : `${dr.deptName} (no officer account: the team inbox)`} · <b>{dr.delivery.mode === "sandbox" ? "Sandbox" : "Live"}</b>: {dr.delivery.note}</div>
          <input value={dr.subject} onChange={(e) => setDr({ ...dr, subject: e.target.value })} aria-label="Subject" />
          <textarea value={dr.body} rows={12} onChange={(e) => setDr({ ...dr, body: e.target.value })} aria-label="Message" />
          {dr.ids.length > 0 && <small className="tf-note">Also sets a 24-hour follow-up on {plural(dr.ids.length, "open case")} of {dr.deptName} near it.</small>}
          {done ? <div className="amsend-ok">{done}</div>
            : <button className="pri" disabled={busy} onClick={send}><I n="send" />{busy ? "Sending…" : "Approve and send"}</button>}
        </div>
      )}
      <div className="amsheet-b"><button onClick={onClose}>Close</button></div>
    </div>
  );
}
