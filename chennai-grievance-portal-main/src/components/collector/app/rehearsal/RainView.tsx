"use client";
/**
 * Rain & flooding, on the Overview's own map (the map grows, as for Ask the Map): every past heavy rain, where water
 * stood in it, which streets flood again and again, and the jobs to send before the next one. The panel on the left
 * has two levels, all rains and one rain; anything clicked on the map or in a list opens its card on top, with Back.
 * The map is drawn by SatMap from the RainLayer this view gives it. Data: the live rehearsal (streets, jobs, the IMD
 * warning, live rain gauges) and the past rains with their reports (/api/rehearsal/rains). Nothing is sent without the
 * Collector reading and approving each email (PlanSheet).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I, type IconName } from "../icons";
import type { MapGeo } from "@/lib/collector/geo";
import type { PastRain, RehearsalState, RJob } from "@/lib/rehearsal/types";
import type { RainApi, RainLayer, RainStart } from "./rainLayer";
import { PlanSheet } from "./PlanSheet";
import "./rehearsal.css";
import "./rainview.css";

type View = { kind: "all"; zone: number | null } | { kind: "rain"; id: string; zone: number | null };
type Pick = { kind: "street" | "report"; id: string } | null;
type Report = PastRain["reports"][number];

const n0 = (x: number) => x.toLocaleString("en-IN");
const day = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z");
const fmtD = (d: string) => day(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtT = (t: string) => new Date(t.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
/** "21 Oct", "21–23 Oct", "30 Sept–2 Oct" */
const range = (r: { start: string; end: string }) => {
  if (r.start === r.end) return fmtD(r.start);
  const a = day(r.start), b = day(r.end);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${fmtD(r.end)}` : `${fmtD(r.start)}–${fmtD(r.end)}`;
};
const days = (r: { start: string; end: string }) => Math.round((day(r.end).getTime() - day(r.start).getTime()) / 86_400_000) + 1;
const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
/** the job kinds of the plan (playbook.ts), in plain words */
const KIND: Record<string, string> = {
  drain: "Clear blocked drains", street: "Check drains along flood streets", works: "Finish or make safe road and drain works", pump: "Keep pumps ready",
  hospital: "Ambulances on the dry side of hospitals", fire: "Fire cover where roads close", diversion: "Plan traffic diversions", shelter: "Ready relief schools",
  release: "Warn wards below a releasing reservoir"
};

export default function RainView({ geo, api, start, onClose, onLayer, onOpenIncident, toast, escRef }: {
  geo: MapGeo | null;
  api: RainApi;
  start: RainStart;
  onClose: () => void;
  onLayer: (l: RainLayer | null) => void;
  onOpenIncident: (id: string) => void;
  toast: (msg: string, kind?: "ok" | "alert") => void;
  /** Escape goes back one level here; false when there is nothing to go back from (the console then closes the view) */
  escRef: React.MutableRefObject<(() => boolean) | null>;
}) {
  const [d, setD] = useState<RehearsalState | null>(null);
  const [past, setPast] = useState<PastRain[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "all", zone: null });
  const [pick, setPick] = useState<Pick>(null);
  const [plan, setPlan] = useState<{ only: string[] | null } | null>(null);
  const [allReports, setAllReports] = useState(false);
  const opened = useRef(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, b] = await Promise.all([fetch(api.state), fetch(api.rains)]);
      const [ja, jb] = await Promise.all([a.json(), b.json()]);
      if (!a.ok) throw new Error(ja.error ?? "The flood memory could not be loaded.");
      if (!b.ok) throw new Error(jb.error ?? "The past rains could not be loaded.");
      setD(ja);
      setPast(jb.rains);
    } catch (e) { setErr((e as Error).message); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  // the jobs' progress after a send
  const reloadState = () => fetch(api.state).then((r) => (r.ok ? r.json() : null)).then((j) => j && setD(j)).catch(() => undefined);

  // ---- what the data says, worked out once
  const zoneOfWard = useMemo(() => new Map((geo?.wards ?? []).map((w) => [w.ward, w.zone])), [geo]);
  const zoneName = useMemo(() => new Map((geo?.zones ?? []).map((z) => [z.zone, z.name])), [geo]);
  const zoneLabel = (z: number | null) => (z == null ? "Place not known" : zoneName.get(z) ?? `Zone ${z}`);
  const streetBy = useMemo(() => new Map((d?.streets ?? []).map((s) => [s.key, s])), [d]);
  const chokeStreet = useMemo(() => new Map((d?.chokes ?? []).map((c) => [c.id, c.street])), [d]);
  /** newest first */
  const rains = useMemo(() => [...(past ?? [])].sort((a, b) => b.start.localeCompare(a.start)), [past]);
  const oldestFirst = useMemo(() => [...rains].reverse(), [rains]);
  const zoneOf = (r: Report) => (r.ward != null ? zoneOfWard.get(r.ward) ?? null : null);
  /** a report stood on a street that had already flooded in an earlier rain */
  const repeat = (r: Report, rain: PastRain) => { const s = r.street ? streetBy.get(r.street) : null; return !!s && s.rainDates.some((x) => x < rain.start); };
  const zonesOf = (reports: Report[]) => {
    const m = new Map<number | null, number>();
    for (const r of reports) m.set(zoneOf(r), (m.get(zoneOf(r)) ?? 0) + 1);
    return [...m.entries()].map(([zone, n]) => ({ zone, n })).sort((a, b) => b.n - a.n || String(a.zone).localeCompare(String(b.zone)));
  };
  /** the flood streets of one rain: a flooding report of it stood on them; most reports first */
  const streetsOf = (rain: PastRain) => {
    const n = new Map<string, number>();
    for (const r of rain.reports) if (r.street) n.set(r.street, (n.get(r.street) ?? 0) + 1);
    return [...n.entries()].map(([k, c]) => ({ s: streetBy.get(k)!, n: c })).filter((x) => x.s)
      .sort((a, b) => b.n - a.n || b.s.rains - a.s.rains || a.s.key.localeCompare(b.s.key));
  };
  /** a street's ward and zone (0: outside the Corporation's wards) */
  const wardLine = (ward: number) => (ward ? `Ward ${ward} · ${zoneLabel(zoneOfWard.get(ward) ?? null)}` : "Outside the Corporation's wards");
  /** the open jobs of the plan for some flood streets (their drains, pumps, diversions and drain complaints) */
  const jobsFor = (keys: Set<string>) => (d?.jobs ?? []).filter((j) => {
    if (j.task) return false;
    const i = j.key.indexOf(":"), kind = j.key.slice(0, i), id = j.key.slice(i + 1);
    if (kind === "street" || kind === "pump" || kind === "diversion") return keys.has(id);
    if (kind === "drain") return !!j.incident && keys.has(chokeStreet.get(j.incident) ?? "");
    return false;
  });

  // opened on a rain (the rain band, Ask the Map): show it once the data is in
  useEffect(() => {
    if (opened.current || !rains.length) return;
    opened.current = true;
    const want = start.rain === "latest" ? rains.find((r) => r.reports.length > 0)?.id : start.rain;
    if (want && rains.some((r) => r.id === want)) setView({ kind: "rain", id: want, zone: null });
  }, [rains]); // eslint-disable-line react-hooks/exhaustive-deps

  const rain = view.kind === "rain" ? rains.find((r) => r.id === view.id) ?? null : null;
  const openRain = (id: string) => { setPick(null); setAllReports(false); setView({ kind: "rain", id, zone: null }); };
  const pickStreet = (key: string) => setPick({ kind: "street", id: key });
  const pickReport = (id: string) => setPick({ kind: "report", id });

  // Escape: the sheet, the card, the zone, the rain; then the console closes the view
  useEffect(() => {
    escRef.current = () => {
      if (plan) { setPlan(null); return true; }
      if (pick) { setPick(null); return true; }
      if (view.zone != null) { setView({ ...view, zone: null }); return true; }
      if (view.kind === "rain") { setView({ kind: "all", zone: null }); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [plan, pick, view, escRef]);

  // ---- the map: what to draw, and a new camera shot whenever the view or the choice changes
  const shot = useRef({ key: "", seq: 0 });
  const layer = useMemo<RainLayer | null>(() => {
    if (!d || !past) return null;
    const key = `${view.kind}|${view.kind === "rain" ? view.id : ""}|${view.zone}|${pick?.kind}|${pick?.id}`;
    if (shot.current.key !== key) shot.current = { key, seq: shot.current.seq + 1 };
    const inZone = (r: Report) => view.zone == null || zoneOf(r) === view.zone;
    let streets: RainLayer["streets"], dots: RainLayer["dots"] = [], pts: [number, number][] | null = null;
    if (rain) {
      const wet = new Set(streetsOf(rain).map((x) => x.s.key));
      streets = d.streets.map((s) => ({ key: s.key, lines: s.lines, at: [s.lat, s.lon], level: wet.has(s.key) ? 3 : 0, tip: `${s.label} · ${wet.has(s.key) ? "flooding reported in this rain" : `flooded in ${plural(s.rains, "rain")}`}` }));
      dots = rain.reports.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, tone: repeat(r, rain) ? "repeat" : "new", tip: `${r.place ?? "Flooding report"} · ${fmtT(r.first)}` }));
      const z = rain.reports.filter(inZone);
      pts = z.length ? z.map((r) => [r.lat, r.lon]) : null;
    } else {
      streets = d.streets.map((s) => ({ key: s.key, lines: s.lines, at: [s.lat, s.lon], level: s.rains >= 5 ? 3 : s.rains >= 3 ? 2 : 1, tip: `${s.label} · flooded in ${plural(s.rains, "rain")}` }));
      // framed on the flood streets themselves (all of them, or one zone's)
      const z = view.zone != null ? d.streets.filter((s) => zoneOfWard.get(s.ward) === view.zone) : d.streets;
      pts = z.length ? z.map((s) => [s.lat, s.lon]) : null;
    }
    let maxZoom: number | undefined;
    if (pick?.kind === "street") { const s = streetBy.get(pick.id); if (s) { pts = s.lines.flat(); maxZoom = 16.5; } }
    if (pick?.kind === "report") {
      const r = rains.flatMap((x) => x.reports).find((x) => x.id === pick.id);
      if (r) {
        pts = [[r.lat, r.lon]]; maxZoom = 16.5;
        // a report from another rain (a street card's list) still shows as a dot
        if (!dots.some((x) => x.id === r.id)) dots.push({ id: r.id, lat: r.lat, lon: r.lon, tone: "new", tip: r.place ?? "Flooding report" });
      }
    }
    return { streets, dots, sel: pick, fit: { seq: shot.current.seq, pts, maxZoom }, onPick: (kind, id) => setPick({ kind, id }) };
  }, [d, past, view, pick, rain, streetBy, zoneOfWard]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onLayer(layer); }, [layer, onLayer]);
  useEffect(() => () => onLayer(null), [onLayer]);

  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const head = (
    <header className="rv-h">
      <span className="rv-ic"><I n="cloud" /></span>
      <span className="rv-t"><b>Rain &amp; flooding</b><small>Where water stood in past heavy rains, and what to do before the next one</small></span>
      <button className="amp-x" onClick={onClose} title="Back to the Overview (Esc)"><I n="x" />Close</button>
    </header>
  );
  if (!d || !past) {
    return (
      <aside className={`amp rv${phone ? " sheet" : ""}`} data-h="half" aria-label="Rain and flooding" aria-busy={!err}>
        {head}
        <div className="rv-wait">
          {err ? <><I n="alert" /><b>{err}</b><button className="rv-btn" onClick={load}>Try again</button></>
            : <><span className="rv-spin" /><b>Reading the past rains…</b><small>Flooding reports, flood streets and the road map</small></>}
        </div>
      </aside>
    );
  }

  const total = rains.reduce((a, r) => a + r.reports.length, 0);
  const maxReports = Math.max(1, ...rains.map((r) => r.reports.length));
  const openJobs = d.jobs.filter((j) => !j.task);
  const sheetJobs = plan?.only ? new Set(plan.only) : null;

  // ---- the card of what is chosen
  let card: React.ReactNode = null;
  if (pick?.kind === "street") {
    const s = streetBy.get(pick.id);
    if (s) {
      const chokes = d.chokes.filter((c) => c.street === s.key);
      const jobs = jobsFor(new Set([s.key]));
      const reports = rains.flatMap((r) => r.reports.filter((x) => x.street === s.key).map((x) => ({ ...x, rain: r })));
      card = (
        <>
          <div className="rv-card-h"><span className="rv-cic st"><I n="drop" /></span><span><b>{s.label}</b><small>{wardLine(s.ward)}</small></span></div>
          <div className="rv-often">
            <b>Flooded in {s.rains} of {rains.length} heavy rains</b>
            <RainDots rains={oldestFirst} on={(r) => s.rainDates.includes(r.start)} now={rain?.id ?? null} onRain={openRain} />
          </div>
          <ul className="rv-facts">
            {s.rainIncidents > 0 && <li><b>{n0(s.rainIncidents)}</b> flooding {s.rainIncidents === 1 ? "complaint" : "complaints"} on it during rains{s.otherIncidents ? `, ${n0(s.otherIncidents)} at other times` : ""}</li>}
            {chokes.length > 0 && <li className="warn"><b>{chokes.length}</b> blocked-drain {chokes.length === 1 ? "complaint is" : "complaints are"} still open on it</li>}
            {s.water_m < 1000 && <li><b>{n0(s.water_m)} m</b> from a canal, river or lake</li>}
            {s.low_m != null && s.low_m <= -1 && <li>Ground about <b>{Math.abs(s.low_m).toLocaleString("en-IN")} m lower</b> than the roads around it</li>}
            {s.lateWork && <li className="warn">Works behind schedule nearby: {s.lateWork}</li>}
            {s.main && <li>A main road: traffic needs a diversion when it floods</li>}
          </ul>
          <JobsBox title="Before the next heavy rain" jobs={jobs} onSend={() => setPlan({ only: jobs.map((j) => j.key) })} />
          {reports.length > 0 && (
            <>
              <h4 className="rv-sec">Flooding reports on it</h4>
              <ul className="rv-list">
                {reports.slice(-6).reverse().map((r) => (
                  <li key={r.id}><button onClick={() => pickReport(r.id)}><b>{r.title}</b><small>{range(r.rain)} rain · {fmtT(r.first)}</small></button></li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    }
  } else if (pick?.kind === "report") {
    const owner = rains.find((x) => x.reports.some((y) => y.id === pick.id));
    const r = owner?.reports.find((y) => y.id === pick.id);
    if (r && owner) {
      const s = r.street ? streetBy.get(r.street) : null;
      const before = s ? s.rainDates.filter((x) => x < owner.start).length : 0;
      card = (
        <>
          <div className="rv-card-h"><span className={`rv-cic ${repeat(r, owner) ? "rep" : "new"}`}><I n="pin" /></span><span><b>{r.title}</b><small>{r.place ?? "Place not given"} · {fmtT(r.first)}</small></span></div>
          <ul className="rv-facts">
            <li>Reported in the <b>{range(owner)} rain</b>{r.ward != null ? ` · ward ${r.ward}, ${zoneLabel(zoneOf(r))}` : ""}</li>
            {s ? <li className={before ? "warn" : ""}>On <button className="rv-inl" onClick={() => pickStreet(s.key)}>{s.label}</button>, which {before ? `had already flooded in ${plural(before, "earlier rain")}` : "had not flooded in an earlier rain"} ({s.rains} in all)</li>
              : <li>Not on a known flood street: a place to watch next time</li>}
            <li>The complaint is <b>{r.open ? "still open" : "closed"}</b></li>
          </ul>
          <button className="rv-btn" onClick={() => onOpenIncident(r.id)}><I n="doc" />Open the complaint</button>
        </>
      );
    }
  }

  // ---- the body: all rains, or one rain
  let body: React.ReactNode;
  if (!rain) {
    const allReps = rains.flatMap((r) => r.reports);
    const zones = zonesOf(allReps).filter((z) => z.zone != null).slice(0, 5);
    const zMax = Math.max(1, ...zones.map((z) => z.n));
    const top = [...d.streets].filter((s) => s.tier === 2).sort((a, b) => b.rains - a.rains || b.chokes - a.chokes || b.length_m - a.length_m || a.key.localeCompare(b.key)).slice(0, 5);
    const repeats = rains.reduce((a, r) => a + r.reports.filter((x) => repeat(x, r)).length, 0);
    body = (
      <>
        <section className="rv-kpis">
          <div><b>{rains.length}</b><span>heavy rains since {fmtD(oldestFirst[0]?.start ?? d.asOf)}</span></div>
          <div><b>{n0(total)}</b><span>flooding reports in them</span></div>
          <div><b>{n0(d.counts.likely)}</b><span>streets that flood in 3 or more rains</span></div>
        </section>
        {total > 0 && (
          <p className="rv-insight"><I n="bulb" /><span>
            {zones.length ? <>Most flooding is in <b>{zones.slice(0, 3).map((z) => zoneLabel(z.zone)).join(", ")}</b> ({Math.round((100 * zones.slice(0, 3).reduce((a, z) => a + z.n, 0)) / total)} % of reports). </> : null}
            {repeats > 0 && <><b>{Math.round((100 * repeats) / total)} %</b> of reports came from streets that had already flooded in an earlier rain: the same places, again.</>}
          </span></p>
        )}
        <h4 className="rv-sec">Past heavy rains <small>newest first · click one to see where water stood</small></h4>
        <ul className="rv-rains">
          {rains.map((r) => {
            const z = zonesOf(r.reports).find((x) => x.zone != null);
            return (
              <li key={r.id}><button onClick={() => openRain(r.id)}>
                <span className="rv-date"><b>{range(r)}</b><small>{r.maxMm != null ? `${Math.round(r.maxMm)} mm` : "IMD heavy rain day"}</small></span>
                <span className="rv-mid"><span className="rv-bar"><i style={{ width: `${Math.max(3, (100 * r.reports.length) / maxReports)}%` }} /></span>
                  <small>{plural(r.reports.length, "flooding report")}{z ? ` · most in ${zoneLabel(z.zone)}` : ""}</small></span>
                <I n="chevr" />
              </button></li>
            );
          })}
        </ul>
        {zones.length > 0 && (
          <>
            <h4 className="rv-sec">Zones with the most flooding <small>all rains</small></h4>
            <ul className="rv-zones">
              {zones.map((z) => (
                <li key={String(z.zone)}><button className={view.zone === z.zone ? "on" : ""} onClick={() => { setPick(null); setView({ kind: "all", zone: view.zone === z.zone ? null : z.zone }); }}>
                  <span>{zoneLabel(z.zone)}</span><span className="rv-bar"><i style={{ width: `${(100 * z.n) / zMax}%` }} /></span><b>{n0(z.n)}</b>
                </button></li>
              ))}
            </ul>
          </>
        )}
        <h4 className="rv-sec">Streets that flood in most rains</h4>
        <ul className="rv-streets">
          {top.map((s) => (
            <li key={s.key}><button onClick={() => pickStreet(s.key)}>
              <span className="rv-sn"><b>{s.label}</b><small>{wardLine(s.ward)}{s.chokes ? ` · ${plural(s.chokes, "blocked drain")} open` : ""}</small></span>
              <span className="rv-often-s"><RainDots rains={oldestFirst} on={(r) => s.rainDates.includes(r.start)} /><em>{s.rains} of {rains.length}</em></span>
            </button></li>
          ))}
        </ul>
        <JobsBox title="Before the next heavy rain" jobs={openJobs} sent={d.counts.tasks} done={d.counts.done} depts={d.depts.length} onSend={() => setPlan({ only: null })} big />
      </>
    );
  } else {
    const k = rains.indexOf(rain);
    const newer = k > 0 ? rains[k - 1] : null, older = k < rains.length - 1 ? rains[k + 1] : null;
    const zones = zonesOf(rain.reports);
    const zMax = Math.max(1, ...zones.map((z) => z.n));
    const wet = streetsOf(rain);
    const reps = rain.reports.filter((r) => repeat(r, rain)).length;
    const earlier = oldestFirst.indexOf(rain);
    const jobs = jobsFor(new Set(wet.map((x) => x.s.key)));
    const named = zones.filter((z) => z.zone != null);
    const list = [...rain.reports].filter((r) => view.zone == null || zoneOf(r) === view.zone).sort((a, b) => b.first.localeCompare(a.first));
    body = (
      <>
        <nav className="rv-nav">
          <button onClick={() => { setPick(null); setView({ kind: "all", zone: null }); }}><I n="chevl" />All rains</button>
          <span className="tspace" />
          <button disabled={!older} onClick={() => older && openRain(older.id)} title="The rain before"><I n="chevl" />{older ? range(older) : "Older"}</button>
          <button disabled={!newer} onClick={() => newer && openRain(newer.id)} title="The rain after">{newer ? range(newer) : "Newer"}<I n="chevr" /></button>
        </nav>
        <div className="rv-rh">
          <h3>{range(rain)} rain</h3>
          <div className="rv-chips">
            {rain.maxMm != null && <span><I n="drop" />{Math.round(rain.maxMm)} mm at the wettest gauge</span>}
            <span><I n="pin" />{plural(rain.reports.length, "flooding report")}</span>
            <span><I n="cal" />{plural(days(rain), "day")}</span>
          </div>
        </div>
        <p className="rv-desc">
          {rain.reports.length === 0 ? "No flooding report with an exact place came in during this rain." : <>
            Water stood in <b>{plural(named.length, "zone")}</b>{named.length ? <>; the most in {named.slice(0, 3).map((z, i) => <span key={String(z.zone)}>{i ? (i === Math.min(3, named.length) - 1 ? " and " : ", ") : ""}<b>{zoneLabel(z.zone)}</b> ({z.n})</span>)}</> : null}.{" "}
            {earlier > 0 ? <><b>{plural(reps, "report")}</b> ({Math.round((100 * reps) / rain.reports.length)} %) came from streets that had flooded in an earlier rain; {plural(rain.reports.length - reps, "was", "were")} in places that had not.</>
              : "This is the first heavy rain in the record, so every place was new to it."}
          </>}
        </p>
        {zones.length > 0 && (
          <>
            <h4 className="rv-sec">Where water stood <small>click a zone to look closer</small></h4>
            <ul className="rv-zones">
              {zones.slice(0, 6).map((z) => (
                <li key={String(z.zone)}><button className={view.zone === z.zone ? "on" : ""} disabled={z.zone == null} onClick={() => { setPick(null); setView({ ...view, zone: view.zone === z.zone ? null : z.zone }); }}>
                  <span>{zoneLabel(z.zone)}</span><span className="rv-bar"><i style={{ width: `${(100 * z.n) / zMax}%` }} /></span><b>{n0(z.n)}</b>
                </button></li>
              ))}
            </ul>
          </>
        )}
        {wet.length > 0 && (
          <>
            <h4 className="rv-sec">Flood streets with reports <small>{n0(wet.length)} · how often each has flooded</small></h4>
            <ul className="rv-streets">
              {wet.slice(0, 6).map(({ s, n }) => (
                <li key={s.key}><button onClick={() => pickStreet(s.key)}>
                  <span className="rv-sn"><b>{s.label}</b><small>{s.ward ? `Ward ${s.ward}` : "Outside the Corporation's wards"} · {plural(n, "report")} in this rain</small></span>
                  <span className="rv-often-s"><RainDots rains={oldestFirst} on={(r) => s.rainDates.includes(r.start)} now={rain.id} /><em>{s.rains} of {rains.length}</em></span>
                </button></li>
              ))}
            </ul>
          </>
        )}
        <JobsBox title="Before the next rain like this" jobs={jobs} onSend={() => setPlan({ only: jobs.map((j) => j.key) })}
          empty="No open job on this rain's streets: their drain complaints are closed or their jobs are sent." />
        {list.length > 0 && (
          <>
            <h4 className="rv-sec">Flooding reports <small>{n0(list.length)}{view.zone != null ? ` in ${zoneLabel(view.zone)}` : ""}, newest first</small></h4>
            <ul className="rv-list">
              {(allReports ? list : list.slice(0, 6)).map((r) => (
                <li key={r.id}><button onClick={() => pickReport(r.id)}>
                  <i className={repeat(r, rain) ? "rep" : "new"} /><b>{r.title}</b><small>{r.place ?? "Place not given"} · {fmtT(r.first)}</small>
                </button></li>
              ))}
            </ul>
            {list.length > 6 && <button className="rv-more" onClick={() => setAllReports((v) => !v)}>{allReports ? "Show fewer" : `Show all ${n0(list.length)}`}</button>}
          </>
        )}
      </>
    );
  }

  const backTo = rain ? `the ${range(rain)} rain` : "all rains";
  return (
    <>
      <aside className={`amp rv${phone ? " sheet" : ""}`} data-h="half" aria-label="Rain and flooding">
        {head}
        <NowStrip d={d} />
        <div className="rv-b">
          {card ? <><button className="rv-back" onClick={() => setPick(null)}><I n="chevl" />Back to {backTo}</button><div className="rv-card">{card}</div></> : body}
        </div>
      </aside>
      <Legend rain={!!rain} />
      {plan && (
        <PlanSheet d={sheetJobs ? { ...d, jobs: d.jobs.filter((j) => j.task || sheetJobs.has(j.key)) } : d} lang="en" manual={false} planUrl={api.plan}
          onClose={() => setPlan(null)} onSent={(m) => { toast(m, "ok"); reloadState(); }}
          onShow={(j: RJob) => { setPlan(null); const i = j.key.indexOf(":"), kind = j.key.slice(0, i), id = j.key.slice(i + 1);
            const st = kind === "drain" ? chokeStreet.get(j.incident ?? "") : kind === "street" || kind === "pump" || kind === "diversion" ? id : null;
            if (st && streetBy.has(st)) pickStreet(st); }} />
      )}
    </>
  );
}

/** the warning now, in one line, and the wettest live gauge */
function NowStrip({ d }: { d: RehearsalState }) {
  const t = d.trigger;
  const all = d.rain?.stations.filter((x) => !x.stale) ?? [];
  const city = all.filter((x) => x.district === "Chennai");
  const on = city.length ? city : all;
  const top = on.reduce<typeof on[number] | null>((m, x) => ((x.todayMm ?? 0) > (m?.todayMm ?? -1) ? x : m), null);
  const r0 = t.reasons[0];
  return (
    <div className={`rv-now lv-${t.level}`} title={t.reasons.map((r) => `${r.en} (${r.source})`).join("\n") || undefined}>
      <I n={t.level === "none" ? "checkc" : "alert"} />
      <span>{t.level === "none" ? "No heavy-rain warning now" : r0 && r0.kind !== "manual" ? r0.en : "Heavy rain expected"}{t.hoursLeft != null && t.hoursLeft > 0 ? ` · rain in about ${t.hoursLeft} h` : ""}</span>
      {top && <em title="Chennai Flood Monitor rain gauge, read every 10 minutes"><I n="drop" />{top.todayMm ?? 0} mm today · {top.name}</em>}
    </div>
  );
}

/** one dot per heavy rain, oldest first: filled where the street flooded; the chosen rain ringed */
function RainDots({ rains, on, now = null, onRain }: { rains: PastRain[]; on: (r: PastRain) => boolean; now?: string | null; onRain?: (id: string) => void }) {
  return (
    <span className="rv-dots" aria-label={`${rains.filter(on).length} of ${rains.length} rains`}>
      {rains.map((r) => onRain
        ? <button key={r.id} className={`${on(r) ? "on" : ""}${now === r.id ? " now" : ""}`} title={`${range(r)} rain: ${on(r) ? "flooded" : "no flooding here"}`} onClick={() => onRain(r.id)} />
        : <i key={r.id} className={`${on(r) ? "on" : ""}${now === r.id ? " now" : ""}`} title={`${range(r)} rain: ${on(r) ? "flooded" : "no flooding here"}`} />)}
    </span>
  );
}

/** the jobs of the plan for what is shown: how many of each kind, and one button to read and send them */
function JobsBox({ title, jobs, onSend, sent = 0, done = 0, depts, big, empty }: {
  title: string; jobs: RJob[]; onSend: () => void; sent?: number; done?: number; depts?: number; big?: boolean; empty?: string;
}) {
  const kinds = [...jobs.reduce((m, j) => m.set(j.kind, (m.get(j.kind) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const nd = depts ?? new Set(jobs.map((j) => j.dept)).size;
  if (!jobs.length && !empty) return null;
  return (
    <section className={`rv-act${big ? " big" : ""}`}>
      <h4><I n="tasks" />{title}</h4>
      {jobs.length ? (
        <>
          <p><b>{plural(jobs.length, "job")}</b> ready for {plural(nd, "department")}{sent > 0 ? ` · ${n0(done)} of ${n0(sent)} sent jobs done` : ""}</p>
          <ul className="rv-kinds">{kinds.slice(0, big ? 6 : 4).map(([k, n]) => <li key={k}><b>{n0(n)}</b>{KIND[k] ?? k}</li>)}</ul>
          <button className="rv-go" onClick={onSend}><I n="send" />Review and send {jobs.length === 1 ? "the job" : `${n0(jobs.length)} jobs`}</button>
          <small>You read and approve each department&apos;s email before it goes.</small>
        </>
      ) : <p className="rv-muted">{empty}</p>}
    </section>
  );
}

/** the map's key, bottom right */
function Legend({ rain }: { rain: boolean }) {
  const rows: [string, string][] = rain
    ? [["d-rep", "Report on a street that flooded before"], ["d-new", "Report in a new place"], ["l-3", "Flood street with a report in this rain"], ["l-0", "Other flood streets"]]
    : [["l-3", "Flooded in 5 or more rains"], ["l-2", "Flooded in 3 or 4 rains"], ["l-1", "Flooded in 1 or 2 rains"]];
  const icon: IconName = rain ? "pin" : "drop";
  return (
    <div className="rv-leg" aria-label="Map key">
      <b><I n={icon} />{rain ? "This rain" : "Flood streets"}</b>
      <ul>{rows.map(([k, l]) => <li key={k}><i className={k} />{l}</li>)}</ul>
      <small>Zoom in to see the roads themselves</small>
    </div>
  );
}
