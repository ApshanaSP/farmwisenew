"use client";
/**
 * Rain Rehearsal (மழை ஒத்திகை): the map that gets Chennai ready before the rain. Opens over the console from the rain
 * band, the palette or Ask the Map. A clock with five stops (Warn, Act, Rain, Check, Learn) changes what the map shows;
 * the panel explains it in plain words; Send tasks turns it into jobs for departments. Replay any past rain to see the
 * rehearsal as it would have looked two days before, then the real reports arriving. Data: GET /api/rehearsal/state
 * (lib/rehearsal/engine.ts), polled every minute while open.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../icons";
import type { MapGeo } from "@/lib/collector/geo";
import type { Line, RehearsalState, RFacility, RJob, RStreet } from "@/lib/rehearsal/types";
import type { Layers, MapSel, Stop } from "./RehearsalMap";
import { PlanSheet } from "./PlanSheet";
import { w, type Lang } from "./words";
import { dayName } from "./RainBand";
import "./rehearsal.css";

const RehearsalMap = dynamic(() => import("./RehearsalMap"), { ssr: false, loading: () => <div className="rr-map rr-map-wait">Loading the map…</div> });

export interface Endpoints { state: (q: string) => string; reach: (q: string) => string; plan: string }
export const LIVE_ENDPOINTS: Endpoints = { state: (q) => `/api/rehearsal/state?${q}`, reach: (q) => `/api/rehearsal/reach?${q}`, plan: "/api/rehearsal/plan" };

const STOPS: Stop[] = ["warn", "act", "rain", "check", "learn"];
const n0 = (x: number) => x.toLocaleString("en-IN");
const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 1000) / 10} %`);
const fmtT = (t: string | null) => (t ? new Date(t.replace(" ", "T") + "Z").toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "");
const fmtD = (t: string) => new Date(t.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const addH = (t: string, h: number) => new Date(Date.parse(t.replace(" ", "T") + "Z") + h * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
const CAT: Record<string, string> = { FLOOD_WATERLOGGING: "Waterlogging", DRAINAGE_SEWAGE: "Drain / sewage", DRAIN_WORKS_SAFETY: "Drain works", WATERBODY_INFRA: "Water body" };
const reachLost = (f: RFacility) => (f.normalKm > 0 ? 1 - f.rehearsalKm / f.normalKm : 0);

export default function RainRehearsal({ geo, init, onClose, onOpenIncident, toast, endpoints = LIVE_ENDPOINTS, dev = false }: {
  geo: MapGeo | null;
  init: { replay: string | null; manual: boolean; stop?: Stop | null; focus?: "streets" | "help" | "schools" | "drains" | null };
  onClose: () => void;
  onOpenIncident?: (id: string) => void;
  toast?: (msg: string, kind?: "ok" | "alert") => void;
  endpoints?: Endpoints;
  dev?: boolean;
}) {
  const [opts, setOpts] = useState({ replay: init.replay, manual: init.manual, t: 10 });
  const [d, setD] = useState<RehearsalState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stop, setStop] = useState<Stop>("warn");
  const [sel, setSel] = useState<MapSel | null>(null);
  const [reach, setReach] = useState<{ id: string; kept: Line[]; lost: Line[] } | null>(null);
  const [layers, setLayers] = useState<Layers>({ streets: true, help: true, drains: true, schools: true, water: true });
  const [lang, setLang] = useState<Lang>("en");
  const [plan, setPlan] = useState(false);
  const [method, setMethod] = useState(false);
  const [replayMenu, setReplayMenu] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [base, setBase] = useState<"streets" | "sat">("streets");
  const etag = useRef<string | null>(null);
  const first = useRef(true);
  // the flood-spot tour: which spot (null = none), playing, and a nonce that re-frames the whole district
  const [tour, setTour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [wide, setWide] = useState(0);
  const flewIn = useRef(false);

  const q = useMemo(() => {
    const p = new URLSearchParams();
    if (opts.replay) p.set("replay", opts.replay);
    if (opts.manual) p.set("manual", "1");
    if (opts.t !== 10) p.set("t", String(opts.t));
    return p.toString();
  }, [opts]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch(endpoints.state(q), { headers: quiet && etag.current ? { "if-none-match": etag.current } : {} });
      if (r.status === 304) return;
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The rehearsal could not be loaded.");
      etag.current = r.headers.get("etag");
      setD(j);
      setErr(null);
    } catch (e) { if (!quiet) setErr((e as Error).message); } finally { if (!quiet) setLoading(false); }
  }, [endpoints, q]);

  useEffect(() => { etag.current = null; load(); }, [load]);
  // live: refresh every minute (304 when nothing changed)
  useEffect(() => {
    if (opts.replay) return;
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load, opts.replay]);
  // the first stop: Act once jobs are out or rain is under a day away; else Warn
  useEffect(() => {
    if (!d || !first.current) return;
    first.current = false;
    setStop(init.stop ?? (d.mode === "live" && (d.counts.tasks > 0 || d.trigger.level === "act") ? "act" : "warn"));
    // opened from a question: point at what it asked about
    if (init.focus === "help") {
      const f = d.facilities.filter((x) => x.routed && x.kind === "hospital").sort((a, b) => reachLost(b) - reachLost(a))[0];
      if (f) setSel({ kind: "facility", id: f.id, lat: f.lat, lon: f.lon });
    } else if (init.focus === "schools" && d.dry[0]) setSel({ kind: "dry", id: d.dry[0].id, lat: d.dry[0].lat, lon: d.dry[0].lon });
  }, [d]);
  // a tapped hospital or fire station: its reach
  useEffect(() => {
    if (sel?.kind !== "facility") { setReach(null); return; }
    let live = true;
    const p = new URLSearchParams(q);
    p.set("id", sel.id);
    fetch(endpoints.reach(p.toString())).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setReach({ id: sel.id, kept: j.kept, lost: j.lost }); }).catch(() => undefined);
    return () => { live = false; };
  }, [sel?.kind, sel?.id, q, endpoints]); // eslint-disable-line react-hooks/exhaustive-deps
  // the Rain stop: the reports drop in, in the order they came
  const play = useCallback(() => {
    const n = d?.check?.reports.length ?? 0;
    setRevealed(0);
    if (!n) return;
    const step = Math.max(1, Math.ceil(n / 60));
    let k = 0;
    const t = setInterval(() => { k = Math.min(n, k + step); setRevealed(k); if (k >= n) clearInterval(t); }, 110);
    return () => clearInterval(t);
  }, [d?.check?.reports.length]);
  useEffect(() => { if (stop === "rain") return play(); setRevealed(d?.check?.reports.length ?? 0); }, [stop]); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape: the card first, then the rehearsal
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (plan) setPlan(false); else if (sel) setSel(null); else if (method) setMethod(false); else onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [plan, sel, method, onClose]);

  const streetBy = useMemo(() => new Map((d?.streets ?? []).map((s) => [s.key, s])), [d]);
  // the flood spots, worst first: most rains, then open drains, then length
  const spots = useMemo(() => [...(d?.streets ?? [])].filter((x) => x.tier === 2)
    .sort((a, b) => b.rains - a.rains || b.chokes - a.chokes || b.length_m - a.length_m || a.key.localeCompare(b.key)).slice(0, 30), [d]);
  const goSpot = useCallback((k: number) => {
    if (!spots.length) return;
    const i = ((k % spots.length) + spots.length) % spots.length;
    const x = spots[i];
    setTour(i);
    setSel({ kind: "street", id: x.key, lat: x.lat, lon: x.lon });
  }, [spots]);
  const wholeDistrict = () => { setPlaying(false); setTour(null); setSel(null); setWide((n) => n + 1); };
  // on opening: the district for a moment, then the worst flood spot, close up (once; not when a question chose a focus)
  useEffect(() => {
    if (!d || flewIn.current || init.focus || stop !== "warn" || !spots.length) return;
    // marked done only when it has flown (a second answer in the meantime would otherwise cancel it for good)
    const t = setTimeout(() => { flewIn.current = true; goSpot(0); }, 1600);
    return () => clearTimeout(t);
  }, [d, stop, spots.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTour((i) => { const n = i == null ? 0 : i + 1; const x = spots[n % spots.length]; if (x) setSel({ kind: "street", id: x.key, lat: x.lat, lon: x.lon }); return n % spots.length; }), 6000);
    return () => clearInterval(t);
  }, [playing, spots]);
  const mapD = useMemo(() => {
    if (!d || stop !== "learn" || !d.learn) return d;
    // Learn: the streets that were added or moved up after the rain, over the streets as they were
    const extra: RStreet[] = d.learn.streets.map((s) => ({ ...(streetBy.get(s.key) ?? { name: null, name_ta: null, near: null, label_ta: s.label, ward: 0, rains: 0, rainDates: [], rainIncidents: 0, otherIncidents: 0, lastFlood: null, length_m: 0, water_m: 0, main: false, incidents: [], chokes: 0, lateWork: null }),
      key: s.key, label: s.label, tier: s.tier, lat: s.lat, lon: s.lon, lines: s.lines } as RStreet));
    return { ...d, streets: [...d.streets.filter((s) => !d.learn!.streets.some((x) => x.key === s.key)), ...extra] };
  }, [d, stop, streetBy]);

  if (!d) {
    return (
      <div className="rr" role="dialog" aria-label={w("title", lang)}>
        <div className="rr-wait">
          {err ? <><I n="alert" /><b>{err}</b><button className="rr-btn" onClick={() => load()}>Try again</button><button className="rr-btn" onClick={onClose}>Close</button></>
            : <><span className="rr-spin" /><b>Rehearsing the rain…</b><small>Reading past floods, open complaints and the road network</small></>}
        </div>
      </div>
    );
  }

  const t = d.trigger;
  const replay = d.mode === "replay";
  const hospitalsHit = d.facilities.filter((f) => f.kind === "hospital" && f.routed && (f.cutOff || reachLost(f) >= 0.1)).sort((a, b) => reachLost(b) - reachLost(a));
  const wardsLose = d.wards.filter((x) => x.loses.length);
  const openJobs = d.jobs.filter((j) => !j.task);
  const rainAt = t.rainAt;
  const stopTime: Record<Stop, string> = {
    warn: fmtT(d.asOf), act: rainAt ? fmtT(addH(rainAt, -24)) : "", rain: rainAt ? fmtD(rainAt) : "", check: d.check ? fmtD(addH(`${d.check.event.end} 00:00:00`, 48)) : "after the rain", learn: d.learn ? fmtD(d.learn.asOf) : ""
  };
  const showJob = (j: RJob) => { setPlan(false); setSel({ kind: "job", id: j.key, lat: j.lat, lon: j.lon }); };

  return (
    <div className="rr" role="dialog" aria-label={w("title", lang)}>
      {/* ---- head: what, when, how ready */}
      <header className={`rr-head lv-${t.level}`}>
        <span className="rr-rain" aria-hidden="true" />
        <div className="rr-ttl"><b><I n="cloud" />{w("title", lang)}</b><small>{lang === "en" ? "மழை ஒத்திகை" : "Rain rehearsal"}</small></div>
        <span className={`rr-mode${replay ? " replay" : ""}`}>{replay ? `Replay · ${fmtD(d.replay!.start)} rain, as on ${fmtT(d.asOf)}` : `${w("live", lang)} · ${fmtT(d.asOf)}`}</span>
        <span className="rr-why" title={t.reasons.map((r) => `${r.en} (${r.source})`).join("\n")}>
          {t.level === "none" ? "No heavy-rain warning now." : t.reasons[0]?.en}
          {t.reasons.length > 1 && <em> +{t.reasons.length - 1}</em>}
        </span>
        {t.hoursLeft != null && t.hoursLeft > 0 && <span className="rr-left"><I n="timer" />{t.hoursLeft} h to {dayName(rainAt!)}</span>}
        {!replay && d.rain && (() => { const all = d.rain.stations.filter((x) => !x.stale); const city = all.filter((x) => x.district === "Chennai"); const on = city.length ? city : all; const top = on.reduce<typeof on[number] | null>((m, x) => ((x.todayMm ?? 0) > (m?.todayMm ?? -1) ? x : m), null); return (
          <button className="rr-rainnow" disabled={!top} onClick={() => top && top.lat != null && setSel({ kind: "rain", id: top.id, lat: top.lat, lon: top.lon! })}
            title={`Live rain gauges of the Chennai Flood Monitor (read every 10 minutes). ${on.length} of ${d.rain.stations.length} stations reporting.${d.rain.error ? ` ${d.rain.error}` : ""}`}>
            <span className="rr-live-dot" aria-hidden="true" /><I n="drop" />Rain now {top ? `${top.todayMm ?? 0} mm` : "–"}<small>{top ? `${top.name} · ${top.at ? top.at.slice(11, 16) : ""}` : "no station reporting"}</small>
          </button>); })()}
        <span className="tspace" />
        {!replay && d.counts.tasks > 0 && (
          <span className="rr-meter" title="Before-rain jobs done"><b>{w("ready", lang)} {d.counts.done} / {d.counts.tasks}</b>
            <i><s style={{ width: `${(100 * d.counts.done) / Math.max(1, d.counts.tasks)}%` }} /></i>{d.counts.late > 0 && <em>{d.counts.late} late</em>}</span>
        )}
        {!replay && t.level === "none" && !opts.manual && (
          <button className="rr-btn ghost" onClick={() => setOpts((o) => ({ ...o, manual: true }))} title="Rehearse a heavy rain 48 hours from now"><I n="play" />Rehearse a heavy rain anyway</button>
        )}
        {/* no warning now: the newest past rain is one click away (the demo) */}
        {!replay && t.level === "none" && (() => { const r = [...d.rains].reverse().find((x) => x.reports >= 20); return r ? (
          <button className="rr-btn ghost" onClick={() => { first.current = true; setSel(null); setOpts((o) => ({ ...o, replay: r.id, manual: false })); }} title="See the rehearsal as it would have looked two days before this rain, then the real reports">
            <I n="refresh" />Replay the {fmtD(r.start)} rain</button>) : null; })()}
        <div className="rr-rel">
          <button className="rr-btn ghost" onClick={() => setReplayMenu((v) => !v)} aria-expanded={replayMenu}><I n="refresh" />{w("replay", lang)}</button>
          {replayMenu && (
            <div className="rr-menu" role="menu">
              <button role="menuitem" className={!replay ? "on" : ""} onClick={() => { setReplayMenu(false); first.current = true; setSel(null); setOpts((o) => ({ ...o, replay: null })); }}>
                <b>Now</b><small>{t.level === "none" ? "no warning" : `IMD ${t.days.find((x) => x.level > 0)?.colour ?? ""}`}</small></button>
              {[...d.rains].reverse().map((r) => (
                <button key={r.id} role="menuitem" className={d.replay?.id === r.id ? "on" : ""} disabled={r.reports < 20}
                  onClick={() => { setReplayMenu(false); first.current = true; setSel(null); setOpts((o) => ({ ...o, replay: r.id, manual: false })); }}>
                  <b>{fmtD(r.start)}{r.end !== r.start ? `–${fmtD(r.end)}` : ""}</b>
                  <small>{r.maxMm != null ? `${Math.round(r.maxMm)} mm · ` : ""}{r.reports} flooding reports{r.reports < 20 ? " (too few to judge)" : ""}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rr-seg" role="group" aria-label="Minutes counted as quick help">
          {[5, 10, 15].map((m) => <button key={m} className={opts.t === m ? "on" : ""} onClick={() => setOpts((o) => ({ ...o, t: m }))} title={`Quick help = within ${m} minutes`}>{m}′</button>)}
        </div>
        <div className="rr-seg" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "ta" ? "on" : ""} onClick={() => setLang("ta")}>த</button>
        </div>
        <button className="rr-x" onClick={onClose} aria-label="Close the rehearsal (Esc)" title="Close (Esc)"><I n="x" /></button>
      </header>

      <div className="rr-main">
        <div className="rr-mapbox">
          <RehearsalMap geo={geo} d={mapD!} stop={stop} layers={layers} sel={sel} onSel={setSel} reach={reach?.id === sel?.id ? reach : null}
            route={routeFor(d, sel)} revealed={revealed} base={base} fitKey={`${d.rehearsal}|${d.asOf.slice(0, 10)}|${wide}`} />
          <div className="rr-layers" role="group" aria-label="Show on the map">
            {([["streets", "Flood streets"], ["help", "Help"], ["drains", "Drains"], ["schools", "Dry schools"], ["water", "Water"]] as [keyof Layers, string][]).map(([k, l]) => (
              <button key={k} className={layers[k] ? "on" : ""} aria-pressed={layers[k]} onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}>{l}</button>
            ))}
            <button onClick={() => setBase((b) => (b === "sat" ? "streets" : "sat"))} title="Base map">{base === "sat" ? "Map" : "Satellite"}</button>
          </div>
          {spots.length > 0 && (stop === "warn" || stop === "act" || stop === "learn") && (
            <div className="rr-tour" role="group" aria-label="Flood spots, worst first">
              <button onClick={() => { setPlaying(false); goSpot((tour ?? 0) - 1); }} aria-label="Previous flood spot" title="Previous flood spot"><I n="chevl" /></button>
              <button className="rr-tour-t" onClick={() => goSpot(tour ?? 0)} title="Fly to this flood spot">
                <b>{tour == null ? "Flood spots" : `Flood spot ${tour + 1} of ${spots.length}`}</b>
                <small>{tour == null ? `${spots.length} worst streets, worst first` : `${spots[tour].label} · ${spots[tour].rains} rains`}</small>
              </button>
              <button onClick={() => { setPlaying(false); goSpot((tour ?? -1) + 1); }} aria-label="Next flood spot" title="Next flood spot"><I n="chevr" /></button>
              <button className={playing ? "on" : ""} onClick={() => { if (!playing && tour == null) goSpot(0); setPlaying((v) => !v); }} title={playing ? "Stop the tour" : "Tour the flood spots, one every 6 seconds"}>
                <I n={playing ? "stop" : "play"} /></button>
              <button onClick={wholeDistrict} title="Whole district" aria-label="Whole district"><I n="expand" /></button>
            </div>
          )}
          <Legend stop={stop} />
          {loading && <div className="rr-loading"><span className="rr-spin" />Updating…</div>}
        </div>

        <aside className="rr-panel" aria-live="polite">
          {sel ? <Card d={d} sel={sel} stop={stop} lang={lang} onClose={() => setSel(null)} onOpenIncident={onOpenIncident} streetBy={streetBy} reach={reach} onSel={setSel} />
            : method ? <Method d={d} onClose={() => setMethod(false)} />
              : stop === "warn" ? (
                <div className="rr-p">
                  <p className="rr-honest"><I n="info" />{w("notForecast", lang)}</p>
                  <div className="rr-stats">
                    <Stat n={d.counts.likely} l={w("likely", lang)} tone="blue" tip={`The worst 20 km of streets whose area flooded in 3 or more past rains (${d.method.events} rains in the record)`} />
                    <Stat n={d.counts.possible} l={w("possible", lang)} tone="sky" tip="The next 40 km: flooding was reported around them in at least one past rain" />
                    <Stat n={d.counts.chokes} l={w("chokes", lang)} tone="orange" tip="Drain, sewage or waterlogging complaints still open, within 100 m of a flood street" />
                    <Stat n={hospitalsHit.length} l={w("reach", lang)} tone="red" tip={`Government hospitals whose ${opts.t}-minute drive reach shrinks by 10 % or more when the flood streets close`} />
                    <Stat n={wardsLose.length} l={w("wards", lang)} tone="grey" tip={`Wards where the nearest fire station is within ${opts.t} minutes on normal roads but not on rehearsal roads`} />
                    <Stat n={d.counts.dry} l={w("dry", lang)} tone="green" tip="Schools not on a likely flood street, still reachable from a hospital in 15 minutes on rehearsal roads. GCC's own list of relief centres comes first." />
                  </div>
                  <h4>Worst flood streets</h4>
                  <ol className="rr-worst">
                    {spots.slice(0, 6).map((x, k) => (
                      <li key={x.key}><button className={tour === k ? "on" : ""} onClick={() => { setPlaying(false); goSpot(k); }}>
                        <b>{lang === "ta" ? x.label_ta : x.label}</b><small>Ward {x.ward} · flooded in {x.rains} rains{x.chokes ? ` · ${x.chokes} open drain${x.chokes === 1 ? "" : "s"}` : ""}</small>
                        <I n="pin" /></button></li>
                    ))}
                  </ol>
                  <h4>{w("first", lang)}</h4>
                  <ol className="rr-first">
                    {openJobs.slice(0, 5).map((j) => (
                      <li key={j.key}><button onClick={() => showJob(j)}><b>{lang === "ta" ? j.ta : j.en}</b><small>{j.deptName} · {j.why}</small></button></li>
                    ))}
                    {!openJobs.length && <li className="rr-muted">Every job of this rehearsal has been sent.</li>}
                  </ol>
                  <SendBar d={d} replay={replay} dev={dev} onOpen={() => setPlan(true)} lang={lang} />
                  <button className="rr-link" onClick={() => setMethod(true)}><I n="flow" />{w("method", lang)}</button>
                </div>
              ) : stop === "act" ? <ActPanel d={d} replay={replay} onShow={showJob} onOpen={() => setPlan(true)} dev={dev} lang={lang} />
                : stop === "rain" ? <RainPanel d={d} revealed={revealed} onPlay={play} onSel={setSel} />
                  : stop === "check" ? <CheckPanel d={d} onMethod={() => setMethod(true)} />
                    : <LearnPanel d={d} onSel={setSel} />}
        </aside>
        {plan && !replay && (
          <PlanSheet d={d} lang={lang} manual={opts.manual} planUrl={endpoints.plan} onClose={() => setPlan(false)} onShow={showJob}
            onSent={(m) => { toast?.(m, "ok"); etag.current = null; load(true); }} />
        )}
      </div>

      {/* ---- the rehearsal clock */}
      <nav className="rr-clock" aria-label="Rehearsal clock">
        {STOPS.map((s, k) => (
          <button key={s} className={`rr-stop${stop === s ? " on" : ""}${STOPS.indexOf(stop) > k ? " past" : ""}`} onClick={() => { setStop(s); setSel(null); }}
            aria-current={stop === s ? "step" : undefined}>
            <i>{k + 1}</i><b>{w(s, lang)}</b><small>{stopTime[s] || (s === "learn" ? "after the check" : "")}</small>
          </button>
        ))}
        <span className="rr-clock-line" aria-hidden="true"><s style={{ width: `${(100 * STOPS.indexOf(stop)) / (STOPS.length - 1)}%` }} /></span>
      </nav>
    </div>
  );
}

/** a cut-off facility's way out, or a selected job's road: drawn as a route */
function routeFor(d: RehearsalState, sel: MapSel | null): { line: Line; normal?: Line } | null {
  if (sel?.kind !== "facility") return null;
  const f = d.facilities.find((x) => x.id === sel.id);
  const r = f?.detour?.rehearsal;
  return r ? { line: r.line, normal: f!.detour!.normal?.line } : null;
}

function Stat({ n, l, tone, tip }: { n: number; l: string; tone: string; tip: string }) {
  return <div className={`rr-stat t-${tone}`} title={tip}><b>{n0(n)}</b><span>{l}<i aria-label={tip}>ⓘ</i></span></div>;
}

function SendBar({ d, replay, dev, onOpen, lang }: { d: RehearsalState; replay: boolean; dev: boolean; onOpen: () => void; lang: Lang }) {
  const open = d.jobs.filter((j) => !j.task).length;
  if (replay) return <p className="rr-note"><I n="info" />Replay: this is practice on a past rain. Nothing is sent. Go back to Now to send tasks.</p>;
  return (
    <div className="rr-send">
      <button className="rr-btn primary big" disabled={!open} onClick={onOpen}><I n="send" />{w("send", lang)} ({open})</button>
      <small>{open ? `${d.depts.length} departments · you approve every email${dev ? " · dev preview (dry-run store, no email)" : ""}` : "All jobs sent"}</small>
    </div>
  );
}

function ActPanel({ d, replay, onShow, onOpen, dev, lang }: { d: RehearsalState; replay: boolean; onShow: (j: RJob) => void; onOpen: () => void; dev: boolean; lang: Lang }) {
  const sent = d.jobs.filter((j) => j.task);
  const late = sent.filter((j) => j.task!.status === "late");
  return (
    <div className="rr-p">
      <h3>Getting ready</h3>
      {replay ? <p className="rr-muted">In a replay no jobs were sent. The flags on the map are the jobs the rehearsal would have given each department.</p>
        : !sent.length ? <p className="rr-muted">No jobs sent yet. Send tasks to start the countdown; each flag turns green when the officer marks it done.</p>
          : <div className="rr-ready"><b>{d.counts.done} of {d.counts.tasks}</b><span>jobs done before the rain</span><i><s style={{ width: `${(100 * d.counts.done) / Math.max(1, d.counts.tasks)}%` }} /></i></div>}
      <table className="rr-tab">
        <thead><tr><th>Department</th><th>Jobs</th><th>Done</th><th>Late</th></tr></thead>
        <tbody>{d.depts.map((x) => <tr key={x.code}><td>{x.name}</td><td>{x.jobs}</td><td>{replay ? "–" : x.done}</td><td className={x.late ? "bad" : ""}>{replay ? "–" : x.late}</td></tr>)}</tbody>
      </table>
      {late.length > 0 && (<><h4>Late</h4><ul className="rr-list">{late.slice(0, 6).map((j) => <li key={j.key}><button onClick={() => onShow(j)}><b>{lang === "ta" ? j.ta : j.en}</b><small>{j.deptName} · due {fmtT(j.due)}</small></button></li>)}</ul></>)}
      <SendBar d={d} replay={replay} dev={dev} onOpen={onOpen} lang={lang} />
    </div>
  );
}

function RainPanel({ d, revealed, onPlay, onSel }: { d: RehearsalState; revealed: number; onPlay: () => void; onSel: (s: MapSel) => void }) {
  if (!d.check) return (
    <div className="rr-p">
      <h3>The rain</h3>
      {d.rain && <><h4>Rain now · Chennai Flood Monitor gauges{d.rain.fetchedAt ? ` · ${fmtT(d.rain.fetchedAt)}` : ""}</h4>
        <table className="rr-tab"><thead><tr><th>Station</th><th>Last hour</th><th>Since 08:30</th></tr></thead>
          <tbody>{[...d.rain.stations].sort((a, b) => Number(a.stale) - Number(b.stale) || (b.todayMm ?? 0) - (a.todayMm ?? 0)).slice(0, 12).map((r) => (
            <tr key={r.id} className={r.stale ? "rr-stale" : ""} onClick={() => r.lat != null && onSel({ kind: "rain", id: r.id, lat: r.lat, lon: r.lon! })}>
              <td>{r.name}<small> {r.district}</small></td><td>{r.stale ? "–" : `${r.hourMm ?? 0} mm`}</td><td>{r.stale ? "not reporting" : `${r.todayMm ?? 0} mm`}</td></tr>))}</tbody></table>
        {d.rain.error && <p className="rr-muted small">{d.rain.error}</p>}</>}
      <p className="rr-muted">When the rain comes, flooding reports drop onto the map here, over dotted outlines of the streets the rehearsal named, so you see at once where it is happening.</p>
    </div>);
  const shown = d.check.reports.slice(0, revealed);
  const on = shown.filter((r) => !r.missed).length;
  return (
    <div className="rr-p">
      <h3>Where it is happening</h3>
      <div className="rr-big"><b>{n0(shown.length)}</b><span>flooding reports{d.mode === "replay" ? ` (${fmtD(d.check.event.start)} to ${fmtD(addH(`${d.check.event.end} 00:00:00`, 48))})` : " so far"}</span></div>
      <p><b>{n0(on)}</b> on a predicted street (within 100 m) · <b>{n0(shown.length - on)}</b> elsewhere</p>
      <button className="rr-btn" onClick={onPlay}><I n="play" />Play the rain again</button>
      <ul className="rr-list">
        {[...shown].reverse().slice(0, 7).map((r) => <li key={r.id}><button onClick={() => onSel({ kind: "report", id: r.id, lat: r.lat, lon: r.lon })}><b>{r.title}</b><small>{r.place ?? ""} · {fmtT(r.first)}{r.missed ? "" : " · predicted street"}</small></button></li>)}
      </ul>
    </div>
  );
}

function CheckPanel({ d, onMethod }: { d: RehearsalState; onMethod: () => void }) {
  const c = d.check;
  if (!c) return <div className="rr-p"><h3>After the rain</h3><p className="rr-muted">Two days after the rain, every predicted street is marked: <b>still flooded</b> (a report within 60 m) or <b>no flooding reported</b>. Reports far from every predicted street are <b>missed</b>, and join the memory for next time.</p></div>;
  const total = c.reports.length;
  return (
    <div className="rr-p">
      <h3>Report card · {fmtD(c.event.start)} rain</h3>
      <div className="rr-big"><b>{n0(c.onPredicted)} of {n0(total)}</b><span>flooding reports were on predicted streets ({pct(total ? c.onPredicted / total : 0)})</span></div>
      {c.randomShare != null && (
        <p className="rr-lift"><b>{c.lift != null ? `${(Math.round(c.lift * 10) / 10).toLocaleString("en-IN")}×` : "–"}</b> what chance gives: the same length of random streets catches {pct(c.randomShare)}.<small> On our test data.</small></p>
      )}
      <ul className="rr-marks">
        <li className="f"><i />Still flooded<b>{n0(c.flooded)}</b><small>streets</small></li>
        <li className="q"><i />No flooding reported<b>{n0(c.quiet)}</b><small>streets</small></li>
        <li className="m"><i />Missed<b>{n0(c.missed)}</b><small>reports, now in the memory</small></li>
      </ul>
      <p className="rr-muted">&ldquo;No flooding reported&rdquo; does not prove the work prevented it; it is what the reports say.</p>
      <button className="rr-link" onClick={onMethod}><I n="flow" />Every past rain, replayed</button>
    </div>
  );
}

function LearnPanel({ d, onSel }: { d: RehearsalState; onSel: (s: MapSel) => void }) {
  const l = d.learn;
  if (!l) return <div className="rr-p"><h3>Learn</h3><p className="rr-muted">After the check, the rain&apos;s reports join the flood memory: missed places become streets to watch, and streets that flooded again move up. Nothing to learn until a rain has passed.</p></div>;
  return (
    <div className="rr-p">
      <h3>The memory after the rain</h3>
      <div className="rr-big"><b>+{n0(l.added)}</b><span>new streets to watch · {n0(l.upgraded)} moved up</span></div>
      <p>Now {n0(l.likely)} likely and {n0(l.possible)} possible streets (as of {fmtT(l.asOf)}).</p>
      <ul className="rr-list">{l.streets.slice(0, 8).map((s) => <li key={s.key}><button onClick={() => onSel({ kind: "street", id: s.key, lat: s.lat, lon: s.lon })}><b>{s.label}</b><small>{s.isNew ? "new" : "moved up"} · {s.tier === 2 ? "likely" : "may flood"}</small></button></li>)}</ul>
    </div>
  );
}

function Legend({ stop }: { stop: Stop }) {
  const [open, setOpen] = useState(true);
  const rows = stop === "check" ? [["f", "Still flooded"], ["q", "No flooding reported"], ["m", "Missed report"]]
    : stop === "rain" ? [["g", "Predicted street (dotted)"], ["r", "Flooding report"]]
      : stop === "act" ? [["jt", "Job to do"], ["jd", "Job done"], ["jl", "Job late"], ["jp", "Not sent yet"]]
        : [["l", "Likely to flood (blue spot)"], ["p", "May flood"], ["c", "Open drain complaint (zoom in)"], ["h", "Hospital / fire (red ring: cut off)"], ["w", "Ward losing quick help"], ["s", "Dry school (zoom in)"]];
  return (
    <div className={`rr-legend${open ? "" : " shut"}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}><I n="layers" />Legend</button>
      {open && <ul>{rows.map(([k, l]) => <li key={k}><i className={`lg-${k}`} />{l}</li>)}</ul>}
    </div>
  );
}

function Card({ d, sel, stop, lang, onClose, onOpenIncident, streetBy, reach, onSel }: {
  d: RehearsalState; sel: MapSel; stop: Stop; lang: Lang; onClose: () => void; onOpenIncident?: (id: string) => void; streetBy: Map<string, RStreet>;
  reach: { id: string; kept: Line[]; lost: Line[] } | null; onSel: (s: MapSel) => void;
}) {
  const head = (title: string, sub: string, icon: Parameters<typeof I>[0]["n"]) => (
    <div className="rr-card-h"><I n={icon} /><span><b>{title}</b><small>{sub}</small></span><button className="rr-x" onClick={onClose} aria-label="Close"><I n="x" /></button></div>
  );
  if (sel.kind === "street") {
    const s = streetBy.get(sel.id) ?? d.learn?.streets.find((x) => x.key === sel.id) as unknown as RStreet | undefined;
    if (!s) return null;
    const chokes = d.chokes.filter((c) => c.street === s.key);
    return (
      <div className="rr-card">
        {head(lang === "ta" ? s.label_ta ?? s.label : s.label, `${s.ward ? `Ward ${s.ward} · ` : ""}${s.tier === 2 ? "Likely to flood" : "May flood"}`, "drop")}
        <ul className="rr-facts">
          <li>Flooding was reported around it in <b>{s.rains}</b> past {s.rains === 1 ? "rain" : "rains"}{s.rainDates?.length ? ` (${s.rainDates.map(fmtD).join(", ")})` : ""}</li>
          {s.rainIncidents > 0 && <li><b>{s.rainIncidents}</b> flooding {s.rainIncidents === 1 ? "complaint" : "complaints"} on it during rains{s.otherIncidents ? `, ${s.otherIncidents} at other times` : ""}</li>}
          {chokes.length > 0 && <li className="warn"><b>{chokes.length}</b> drain {chokes.length === 1 ? "complaint" : "complaints"} still open on it</li>}
          {s.water_m < 1000 && <li><b>{n0(s.water_m)} m</b> from a canal, river or lake</li>}
          {s.low_m != null && s.low_m <= -1 && <li>Ground about <b>{Math.abs(s.low_m).toLocaleString("en-IN")} m lower</b> than the roads around it<small className="rr-muted"> (satellite height, a few metres of error)</small></li>}
          {s.lateWork && <li className="warn">PWD work behind schedule nearby: {s.lateWork}</li>}
          {s.main && <li>A main road: plan a diversion</li>}
          {s.flooded != null && (stop === "check" || stop === "learn") && <li className={s.flooded ? "bad" : "good"}>{s.flooded ? "Still flooded in the checked rain" : "No flooding reported in the checked rain"}</li>}
        </ul>
        <p className="rr-honest small">{w("notForecast", lang)}</p>
        {s.incidents?.length > 0 && <><h4>Past complaints</h4><ul className="rr-list">{s.incidents.slice(0, 6).map((id) => <li key={id}><button onClick={() => onOpenIncident?.(id)} disabled={!onOpenIncident}><b>{id}</b><small>Open the complaint</small></button></li>)}</ul></>}
        {chokes.length > 0 && <><h4>Open now</h4><ul className="rr-list">{chokes.slice(0, 5).map((c) => <li key={c.id}><button onClick={() => onSel({ kind: "choke", id: c.id, lat: c.lat, lon: c.lon })}><b>{c.title}</b><small>{CAT[c.cat] ?? c.cat} · open {c.ageDays} days{c.breached ? " · past its deadline" : ""}</small></button></li>)}</ul></>}
      </div>
    );
  }
  if (sel.kind === "facility") {
    const f = d.facilities.find((x) => x.id === sel.id);
    if (!f) return null;
    const lost = Math.round(reachLost(f) * 100);
    const det = f.detour;
    return (
      <div className="rr-card">
        {head(f.name, f.kind === "hospital" ? (f.government ? "Government hospital" : "Hospital") : "Fire station", f.kind === "hospital" ? "health" : "alert")}
        {f.beds?.total != null && <p>{n0(f.beds.total)} beds{f.beds.pct != null ? `, ${Math.round(f.beds.pct)} % full` : ""}{f.ambulance != null ? ` · ambulance ${f.ambulance ? "available" : "not available"}` : ""}</p>}
        {!f.routed ? <p className="rr-muted">Too far from a mapped road to work out its reach.</p> : (
          <>
            <div className="rr-reach">
              <div><small>Normal roads</small><b>{f.normalKm} km</b><span>of road in {d.method.tHelpMin} min · {f.normalWards} wards</span></div>
              <I n="right" />
              <div className={lost >= 10 ? "bad" : ""}><small>Rehearsal roads</small><b>{f.rehearsalKm} km</b><span>{lost > 0 ? `${lost} % less` : "no change"} · {f.rehearsalWards} wards</span></div>
            </div>
            {f.cutOff && <p className="rr-bad"><I n="alert" />{f.why === "own-road" ? "Its own road is a flood street." : "It loses more than half its reach."}</p>}
            {det?.rehearsal && det.rehearsal.min > (det.normal?.min ?? 0) && (
              <p>Way out to {det.to ?? "the main road"}: <b>{det.normal?.min ?? "?"} → {det.rehearsal.min} min</b>{det.rehearsal.names.length ? ` via ${det.rehearsal.names.join(", ")}` : ""} <small className="rr-muted">(purple on the map)</small></p>
            )}
            {det?.rehearsal && det.rehearsal.min <= (det.normal?.min ?? 0) && <p>Its way out to {det.to ?? "the main road"} stays open{det.rehearsal.names.length ? ` (via ${det.rehearsal.names.join(", ")})` : ""}.</p>}
            <p className="rr-muted small">{reach ? "Green: roads it still reaches. Grey dashes: roads it loses." : "Drawing its reach…"} Drive times use OpenStreetMap roads and typical speeds without traffic: they show which roads matter, not exact minutes.</p>
          </>
        )}
      </div>
    );
  }
  if (sel.kind === "ward") {
    const x = d.wards.find((y) => String(y.ward) === sel.id);
    if (!x) return null;
    return (
      <div className="rr-card">
        {head(`Ward ${x.ward}`, x.name ? `${x.name} zone` : "", "pin")}
        <ul className="rr-facts">
          <li>Nearest fire station: <b>{x.fire.normal ?? "–"} min</b> now → <b className={x.loses.includes("fire") ? "bad" : ""}>{x.fire.rehearsal ?? "no road"}{x.fire.rehearsal != null ? " min" : ""}</b> in the rehearsal</li>
          <li>Nearest government hospital: <b>{x.hospital.normal ?? "–"} min</b> → <b className={x.loses.includes("hospital") ? "bad" : ""}>{x.hospital.rehearsal ?? "no road"}{x.hospital.rehearsal != null ? " min" : ""}</b></li>
        </ul>
        {x.loses.length > 0 && <p className="rr-bad"><I n="alert" />Loses quick {x.loses.join(" and ")} help (more than {d.method.tHelpMin} minutes).</p>}
        <p className="rr-muted small">Median over the ward&apos;s road junctions.</p>
      </div>
    );
  }
  if (sel.kind === "lake") {
    const k = d.lakes.find((x) => x.id === sel.id);
    if (!k) return null;
    return (
      <div className="rr-card">
        {head(k.name, "Lake", "drop")}
        <div className="rr-lakebar"><i style={{ height: `${Math.min(100, k.pct)}%` }} /><b>{Math.round(k.pct)} %</b></div>
        <p>{k.slope != null ? (k.slope > 0 ? `Rising ${k.slope} points a day` : k.slope < 0 ? `Falling ${-k.slope} points a day` : "Steady") : "No trend yet"}{k.daysToFull != null ? ` · full in about ${k.daysToFull} days at this rate` : ""}.</p>
        <p className="rr-muted small">PWD lake level, {fmtT(k.at)}.</p>
      </div>
    );
  }
  if (sel.kind === "gauge") {
    const g = d.gauges.find((x) => x.id === sel.id);
    if (!g) return null;
    return (
      <div className="rr-card">
        {head(g.name, "River gauge · Chennai Flood Monitor", "pulse")}
        <p><b>{g.level} m</b>{g.warning != null ? ` · warning level ${g.warning} m${g.gap != null ? ` (${g.gap > 0 ? `${g.gap} m below` : "at or above"})` : ""}` : ""}{g.danger != null ? ` · danger level ${g.danger} m` : ""}</p>
        {g.suspect && <p className="rr-muted">CFM lists this point&apos;s danger level below its warning level, so it is shown but never used to raise the alarm.</p>}
        <p className="rr-muted small">Reading of {fmtT(g.at)}.</p>
      </div>
    );
  }
  if (sel.kind === "dry") {
    const s = d.dry.find((x) => x.id === sel.id);
    if (!s) return null;
    return (
      <div className="rr-card">
        {head(lang === "ta" ? s.name_ta ?? s.name : s.name, "Possible relief centre", "home")}
        <ul className="rr-facts">
          <li>Not on a likely flood street; nearest one <b>{n0(s.floodM)} m</b> away</li>
          <li><b>{s.hospitalMin} min</b> from a hospital on rehearsal roads</li>
          {s.government && <li>Government or Corporation school</li>}
        </ul>
        <p className="rr-muted small">GCC&apos;s own list of relief centres comes first; this is a suggestion from the map.</p>
      </div>
    );
  }
  if (sel.kind === "choke") {
    const c = d.chokes.find((x) => x.id === sel.id);
    if (!c) return null;
    const s = streetBy.get(c.street);
    return (
      <div className="rr-card">
        {head(c.title, `${CAT[c.cat] ?? c.cat} · open ${c.ageDays} days${c.breached ? " · past its deadline" : ""}`, "drop")}
        <p>On {s ? s.label : "a flood street"}{s ? `, which flooded in ${s.rains} past rains` : ""}. Clearing it before the rain is the first job.</p>
        {onOpenIncident && <button className="rr-btn" onClick={() => onOpenIncident(c.id)}><I n="doc" />Open the complaint</button>}
      </div>
    );
  }
  if (sel.kind === "job") {
    const j = d.jobs.find((x) => x.key === sel.id);
    if (!j) return null;
    return (
      <div className="rr-card">
        {head(lang === "ta" ? j.ta : j.en, `${j.deptName} · by ${fmtT(j.due) || "as soon as possible"}`, "tasks")}
        <p>{j.why}</p>
        <p>{j.task ? (j.task.status === "done" ? `Done ${fmtT(j.task.doneAt)}${j.task.photoM != null ? ` · photo taken ${j.task.photoM <= 300 ? "at the place" : `${n0(j.task.photoM)} m away`}` : ""}` : j.task.status === "late" ? "Late: not done by its deadline" : "Sent; not done yet") : "Not sent yet"}</p>
        {j.task?.photo && <img className="rr-photo" src={`/api/rehearsal/photo/${j.task.photo}`} alt="Photo from the officer" />}
        {j.incident && onOpenIncident && <button className="rr-btn" onClick={() => onOpenIncident(j.incident!)}><I n="doc" />Open the complaint</button>}
      </div>
    );
  }
  if (sel.kind === "rain") {
    const r = d.rain?.stations.find((x) => x.id === sel.id);
    if (!r) return null;
    return (
      <div className="rr-card">
        {head(r.name, `Rain gauge · ${r.district} · Chennai Flood Monitor`, "drop")}
        {r.stale ? <p className="rr-muted">Not reporting: its newest reading is {r.at ? fmtT(r.at) : "missing"}. A silent gauge is never read as "no rain".</p> : (
          <div className="rr-reach"><div><small>Last hour</small><b>{r.hourMm ?? 0} mm</b><span>{r.hour ?? ""}</span></div><I n="right" /><div><small>Since 08:30</small><b>{r.todayMm ?? 0} mm</b><span>yesterday {r.yesterdayMm ?? 0} mm</span></div></div>)}
        <p className="rr-muted small">Read live every 10 minutes{d.rain?.fetchedAt ? ` (last ${fmtT(d.rain.fetchedAt)})` : ""}. Shown at {r.place ?? "its place name"}: the Flood Monitor publishes no coordinates. 64.5 mm in a day is heavy rain (IMD).</p>
      </div>
    );
  }
  if (sel.kind === "report") {
    const r = d.check?.reports.find((x) => x.id === sel.id);
    if (!r) return null;
    return (
      <div className="rr-card">
        {head(r.title, `${r.place ?? ""} · ${fmtT(r.first)}`, "drop")}
        <p>{r.missed ? "Not within 100 m of a predicted street: it joins the memory for next time." : `On a predicted street${r.street && streetBy.get(r.street) ? `: ${streetBy.get(r.street)!.label}` : ""}.`}</p>
        {onOpenIncident && <button className="rr-btn" onClick={() => onOpenIncident(r.id)}><I n="doc" />Open the complaint</button>}
      </div>
    );
  }
  return null;
}

function Method({ d, onClose }: { d: RehearsalState; onClose: () => void }) {
  const m = d.method;
  return (
    <div className="rr-card rr-method">
      <div className="rr-card-h"><I n="flow" /><span><b>How this was worked out</b><small>Plain words first; the method in grey</small></span><button className="rr-x" onClick={onClose} aria-label="Close"><I n="x" /></button></div>
      <ol>
        <li>We found the streets where people reported flooding in past heavy rains.<small>{n0(m.incidentsUsed)} water complaints placed to the street (300 m or better) · {m.events} rains before {fmtD(d.asOf)}</small></li>
        <li>Where flooding came back in 3 or more rains, the worst 20 km of street are <b>likely</b>; the next 40 km <b>may flood</b>.<small>Flood spot 150 m; chosen by replaying the rains before 21 Oct only</small></li>
        <li>We closed the likely streets on the road map, slowed the others, and worked out how far help can drive in {m.tHelpMin} minutes, before and after.<small>OpenStreetMap: {n0(m.roads.km)} km of road, {n0(m.roads.junctions)} junctions; shortest paths; speeds {Object.entries(m.speeds).map(([k, v]) => `${k.replace("_", " ")} ${v}`).slice(0, 4).join(", ")} … km/h, no traffic; {m.facilities.hospitals} hospitals, {m.facilities.fire} fire stations mapped</small></li>
        <li>Streets next to a canal, river or lake move up the list; ground height is shown on each street.<small>Chosen by replaying the rains before 21 Oct: water nearby helped (lift 1.61 → 1.69); low ground helped as much, so it stays information only</small></li>
        <li>We added open drain complaints and late PWD works on those streets, and turned it all into jobs for each department.<small>Rules, not AI: the same rehearsal never sends the same job twice</small></li>
        <li>We checked it on every past rain: how many of the rain&apos;s flooding reports fell on the streets it named, against the same length of random streets.</li>
      </ol>
      <table className="rr-tab">
        <thead><tr><th>Rain</th><th>Reports</th><th>On named streets</th><th>Random</th><th>Lift</th></tr></thead>
        <tbody>{d.backtest.map((b) => (
          <tr key={b.event.id}><td>{fmtD(b.event.start)}</td><td>{b.tested}</td><td>{pct(b.share)}</td><td>{pct(b.randomShare)}</td><td><b>{b.lift != null ? `${(Math.round(b.lift * 100) / 100).toFixed(2)}×` : "–"}</b></td></tr>
        ))}</tbody>
      </table>
      <p className="rr-muted small">Each row uses only what was known two days before that rain. On our test data. Official words are quoted from IMD and the Chennai Flood Monitor; we never forecast the weather.</p>
      <ul className="rr-notes">{m.notes.map((x) => <li key={x}>{x}</li>)}</ul>
      {d.bulletins.length > 0 && <><h4>Newest Chennai Flood Monitor bulletins</h4><ul className="rr-notes">{d.bulletins.map((b) => <li key={b.id}><a href={b.url} target="_blank" rel="noopener noreferrer">{b.title}</a> · {fmtD(b.date)}</li>)}</ul>
        <p className="rr-muted small">Bulletins are published as pictures; open one to read the official map. A Street Flood Inundation Forecast turns the rehearsal on by itself.</p></>}
      <p className="rr-muted small">Live: IMD warnings (hourly), Flood Monitor rain gauges (every 10 minutes), its bulletin list (hourly, from the CFM collector). The Flood Monitor's station rain forecasts are closed to programs, so they are not used.</p>
    </div>
  );
}
