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
import type { RainWithData } from "@/lib/rehearsal/satflood";
import type { RainApi, RainLayer, RainStart } from "./rainLayer";
import { PlanSheet } from "./PlanSheet";
import ImpactView, { LENS_WORD } from "./ImpactView";
import type { ImpactData, Lens } from "@/lib/rehearsal/impacts";
import { days, fmtD, fmtT, n0, plural, RainDots, range } from "./rainKit";
import { Grip, useDragPanel } from "../askmap/dragPanel";
import { onMapCmd } from "../askmap/bridge";
// the action tracker: assign every street a rain flooded, follow it, and see whether it held in the next rain (FixTracker.tsx)
import { BulkFix, FixBox, FixPill, FixSummary, floodPlacesOf, satName, useFixes } from "./FixTracker";
import { floodDefault, floodHit } from "@/lib/rehearsal/tracker";
import "./rehearsal.css";
import "./rainview.css";

type View = { kind: "all"; zone: number | null } | { kind: "rain"; id: string; zone: number | null };
type Pick = { kind: "street" | "report"; id: string } | null;
type Report = PastRain["reports"][number];

/** the job kinds of the plan (playbook.ts), in plain words */
const KIND: Record<string, string> = {
  drain: "Clear blocked drains", street: "Check drains along flood streets", works: "Finish or make safe road and drain works", pump: "Keep pumps ready",
  hospital: "Ambulances on the dry side of hospitals", fire: "Fire cover where roads close", diversion: "Plan traffic diversions", shelter: "Ready relief schools",
  release: "Warn wards below a releasing reservoir"
};

export default function RainView({ geo, api, start, onClose, onLayer, onOpenIncident, toast, escRef, onLive }: {
  geo: MapGeo | null;
  api: RainApi;
  start: RainStart;
  onClose: () => void;
  onLayer: (l: RainLayer | null) => void;
  onOpenIncident: (id: string) => void;
  toast: (msg: string, kind?: "ok" | "alert") => void;
  /** Escape goes back one level here; false when there is nothing to go back from (the console then closes the view) */
  escRef: React.MutableRefObject<(() => boolean) | null>;
  /** opens the live Traffic view (its own view on the map: Rain shows what heavy rain does) */
  onLive?: () => void;
}) {
  const [d, setD] = useState<RehearsalState | null>(null);
  // each rain with its CFM-DSS gauge rain, its satellite water and its streets by source (satflood.ts withRainData)
  const [past, setPast] = useState<RainWithData[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "all", zone: null });
  const [pick, setPick] = useState<Pick>(null);
  const [plan, setPlan] = useState<{ only: string[] | null } | null>(null);
  const [allReports, setAllReports] = useState(false);
  const opened = useRef(false);
  // the tab: Flooding (this view) or Traffic, Power, Metro (ImpactView); the chosen rain is shared by all four
  const [lens, setLens] = useState<"flood" | Lens>(start.lens ?? "flood");
  useEffect(() => { if (start.lens) setLens(start.lens); }, [start.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const [imp, setImp] = useState<Partial<Record<Lens, ImpactData>>>({});
  const childEsc = useRef<(() => boolean) | null>(null);
  const [allWet, setAllWet] = useState(false);
  // the other tabs' records, read once in the background: their counts show on the tabs and as "also in this rain"
  useEffect(() => {
    let on = true;
    for (const l of ["traffic", "power", "metro"] as Lens[])
      fetch(api.impacts + l).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j) setImp((m) => ({ ...m, [l]: j })); }).catch(() => undefined);
    return () => { on = false; };
  }, [api]);

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
  const fx = useFixes(api, toast, rains);
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
  // the area (zone) of a job, for reviewing and sending area by area
  const jobArea = (j: RJob) => (j.ward ? zoneLabel(zoneOfWard.get(j.ward) ?? null) : "Outside the Corporation's wards");
  const wardLine = (ward: number) => (ward ? `Ward ${ward} · ${zoneLabel(zoneOfWard.get(ward) ?? null)}` : "Outside the Corporation's wards");
  /** the open jobs of the plan for some flood streets (their drains, pumps, diversions and drain complaints) */
  // streets that already have a sent before-rain job (street, pump or diversion): the existing action, counted as tracked
  const jobStreets = new Set((d?.jobs ?? []).filter((j) => j.task && /^(street|pump|diversion):/.test(j.key)).map((j) => j.key.slice(j.key.indexOf(":") + 1)));
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
  const openRain = (id: string) => { setPick(null); setAllReports(false); setAllWet(false); setView({ kind: "rain", id, zone: null }); };
  // v10: Jarvis's voice moves between the tabs and to a past rain while the view is open (askmap/bridge.ts "diq:map-cmd"); its sends stay the
  // Collector's own (PlanSheet)
  const live = useRef({ rains, lens });
  live.current = { rains, lens };
  useEffect(() => onMapCmd(["rain"], (_op, a) => {
    const s = live.current;
    const tab = a.tab === "flooding" ? "flood" : a.tab === "traffic" || a.tab === "power" || a.tab === "metro" ? a.tab : null;
    if (tab) setLens(tab);
    // v14 (21 Nov review 13, scenarios 8): back to every rain ("all"), so Jarvis's "streets that flood" moves the open view in place, not remounting it
    if (a.rain === "all") { setPick(null); setAllReports(false); setView({ kind: "all", zone: null }); return { ok: true, state: { lens: tab ?? s.lens, rain: null } }; }
    if (typeof a.rain === "string") {
      const id = a.rain === "latest" ? s.rains.find((r) => r.reports.length > 0)?.id : a.rain;
      if (!id || !s.rains.some((r) => r.id === id)) return { ok: false, why: "no-such-rain", state: { rains: s.rains.slice(0, 6).map((r) => r.start.slice(0, 10)) } };
      setPick(null); setAllReports(false); setView({ kind: "rain", id, zone: null });
      const r = s.rains.find((x) => x.id === id)!;
      return { ok: true, state: { lens: tab ?? s.lens, rain: id, start: r.start, reports: r.reports.length } };
    }
    return { ok: true, state: { lens: tab ?? s.lens, rains: s.rains.length } };
  }), []);
  const pickStreet = (key: string) => setPick({ kind: "street", id: key });
  /** a tracked street's card (a street only the satellite saw opens in its rain) */
  const openFix = (f: { place: string; rain: string }) => {
    if (streetBy.has(f.place)) { pickStreet(f.place); return; }
    if (rains.some((r) => r.id === f.rain)) { setAllReports(false); setView({ kind: "rain", id: f.rain, zone: null }); setPick({ kind: "street", id: f.place }); }
  };
  const pickReport = (id: string) => setPick({ kind: "report", id });

  // Escape: the sheet, the card, the zone, the rain; then the console closes the view
  useEffect(() => {
    escRef.current = () => {
      if (lens !== "flood") return childEsc.current?.() ?? false;
      if (plan) { setPlan(null); return true; }
      if (pick) { setPick(null); return true; }
      if (view.zone != null) { setView({ ...view, zone: null }); return true; }
      if (view.kind === "rain") { setView({ kind: "all", zone: null }); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [plan, pick, view, escRef, lens]);

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
    if (pick?.kind === "street") {
      const s = streetBy.get(pick.id);
      if (s) { pts = s.lines.flat(); maxZoom = 16.5; }
      else {
        // a street only the satellite saw (the action tracker opens it): drawn on its own
        const sat = rain?.streets?.find((x) => x.key === pick.id)?.sat;
        if (sat) { streets.push({ key: pick.id, lines: sat.lines, at: [sat.lat, sat.lon], level: 3, tip: `${satName(sat)} · satellite water in this rain` }); pts = sat.lines.flat(); maxZoom = 16.5; }
      }
    }
    if (pick?.kind === "report") {
      const r = rains.flatMap((x) => x.reports).find((x) => x.id === pick.id);
      if (r) {
        pts = [[r.lat, r.lon]]; maxZoom = 16.5;
        // a report from another rain (a street card's list) still shows as a dot
        if (!dots.some((x) => x.id === r.id)) dots.push({ id: r.id, lat: r.lat, lon: r.lon, tone: "new", tip: r.place ?? "Flooding report" });
      }
    }
    // the water Sentinel-1 saw in this rain, under the streets
    const sw = rain?.sat?.status === "pass" && rain.sat.boxes.length ? { boxes: rain.sat.boxes, tip: `Water seen by ${rain.sat.pass?.satellite ?? "satellite"} radar, ${fmtT(rain.sat.pass?.at ?? "")}` } : null;
    return { theme: "flood", streets, dots, satWater: sw, sel: pick, fit: { seq: shot.current.seq, pts, maxZoom }, onPick: (kind, id) => { if (kind === "street" || kind === "report") setPick({ kind, id }); } };
  }, [d, past, view, pick, rain, streetBy, zoneOfWard]); // eslint-disable-line react-hooks/exhaustive-deps
  // the other tabs draw their own layer (ImpactView)
  useEffect(() => { if (lens === "flood") onLayer(layer); }, [layer, onLayer, lens]);
  useEffect(() => () => onLayer(null), [onLayer]);

  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const drag = useDragPanel("rain", phone);
  const SUB: Record<"flood" | Lens, string> = {
    flood: "Where water stood in past heavy rains, and what to do before the next one", traffic: "Roads where traffic jams in heavy rain, and why (live traffic has its own view)",
    power: "Wards that lose power in heavy rain, and for how long", metro: "How late trains run in heavy rain, and which stations close"
  };
  const head = (
    <header className={`rv-h ${drag.handle.className}`} onPointerDown={drag.handle.onPointerDown} onDoubleClick={drag.handle.onDoubleClick}>
      <Grip off={phone} />
      <span className="rv-ic"><I n={lens === "flood" ? "cloud" : LENS_WORD[lens].icon} /></span>
      <span className="rv-t"><b>Rain · {lens === "flood" ? "Flooding" : LENS_WORD[lens].title}</b><small>{SUB[lens]}</small></span>
      {drag.tools}
      <button className="amp-x" onClick={onClose} title="Back to the Overview (Esc)"><I n="x" />Close</button>
    </header>
  );
  const rainNow = view.kind === "rain" ? view.id : null;
  /** a tab's count: Flooding's reports, the other tabs' places hit (roads, wards, lines), in the chosen rain or in any rain */
  const countOf = (l: "flood" | Lens): number | null => {
    if (l === "flood") return past ? (rainNow ? past.find((r) => r.id === rainNow)?.reports.length ?? 0 : past.reduce((a, r) => a + r.reports.length, 0)) : null;
    const x = imp[l];
    if (!x) return null;
    return rainNow ? x.rains.find((r) => r.id === rainNow)?.hit ?? 0 : x.items.filter((y) => y.rains.length).length;
  };
  const tabs = (
    <nav className="rv-tabs" role="tablist" aria-label="What the rain did">
      {(["flood", "traffic", "power", "metro"] as const).map((l) => {
        const n = countOf(l);
        return (
          <button key={l} role="tab" aria-selected={lens === l} className={`t-${l}${lens === l ? " on" : ""}`} onClick={() => { setPick(null); setPlan(null); setLens(l); }}>
            <I n={l === "flood" ? "drop" : LENS_WORD[l].icon} />{l === "flood" ? "Flooding" : LENS_WORD[l].title}<small>{n == null ? "…" : n0(n)}</small>
          </button>
        );
      })}
    </nav>
  );
  /** the other tabs' counts for a rain (or all rains), as chips that open the tab */
  const also = (id: string | null) => {
    const rows = (["traffic", "power", "metro"] as Lens[]).map((l) => ({ l, n: imp[l] ? (id ? imp[l]!.rains.find((r) => r.id === id)?.hit ?? 0 : imp[l]!.items.filter((y) => y.rains.length).length) : null, of: imp[l]?.items.length ?? 0 }));
    if (rows.every((r) => r.n == null)) return null;
    return (
      <div className="rv-also">
        <span>Also in {id ? "this rain" : "these rains"}</span>
        {rows.map(({ l, n, of }) => n != null && <button key={l} className={`t-${l}`} onClick={() => setLens(l)}><I n={LENS_WORD[l].icon} />{LENS_WORD[l].inRain(n, of)}</button>)}
      </div>
    );
  };
  if (!d || !past) {
    return (
      <aside ref={drag.ref} style={drag.style} className={`amp rv l-${lens}${phone ? " sheet" : ""}${drag.cls}`} data-h="half" aria-label="Rain" aria-busy={!err}>
        {head}
        {tabs}
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
      // the rain to act on: the chosen rain when it flooded the street, else the latest one that did
      const cause = (rain && floodHit(rain, s.key, null) ? rain : rains.find((r) => floodHit(r, s.key, null))) ?? null;
      const fixDef = cause ? floodDefault({ label: s.label, ward: s.ward, water_m: s.water_m, chokeDepts: chokes.map((c) => c.dept) }, range(cause)) : null;
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
          <FixBox fx={fx} lens="flood" place={s.key} rainId={cause?.id ?? null} def={fixDef} />
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
    } else {
      // a street only the satellite saw water on in this rain (no complaint): its action and tracking
      const sp = rain?.streets?.find((x) => x.key === pick.id && x.sat);
      if (rain && sp?.sat) {
        const name = satName(sp.sat);
        card = (
          <>
            <div className="rv-card-h"><span className="rv-cic st"><I n="drop" /></span><span><b>{name}</b><small>{wardLine(sp.sat.ward)}</small></span></div>
            <ul className="rv-facts">
              <li>Satellite water {sp.sat.how === "on" ? "on" : "beside"} about <b>{n0(Math.round(sp.sat.floodedM))} m</b> of it in the {range(rain)} rain ({sp.sat.conf} confidence)</li>
              <li>No flooding complaint on it in this rain: the radar picture is the only record</li>
            </ul>
            <FixBox fx={fx} lens="flood" place={sp.key} rainId={rain.id} def={floodDefault({ label: name, ward: sp.sat.ward }, range(rain))} />
          </>
        );
      }
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
        {also(null)}
        <FixSummary fx={fx} lens="flood" onOpen={openFix} />
        <h4 className="rv-sec">Past heavy rains <small>newest first · click one to see where water stood</small></h4>
        <ul className="rv-rains">
          {rains.map((r) => {
            const z = zonesOf(r.reports).find((x) => x.zone != null);
            return (
              <li key={r.id}><button onClick={() => openRain(r.id)}>
                <span className="rv-date" title={r.rain ? `District average from ${r.rain.gauges} CFM-DSS rain gauges; ${Math.round(r.rain.wettest?.mm ?? 0)} mm at the wettest (${r.rain.wettest?.name ?? ""})` : undefined}>
                  <b>{range(r)}</b><small>{r.rain?.dry ? `Little rain at the gauges (${Math.round(r.rain.mean ?? 0)} mm)` : r.rain?.mean != null ? `${Math.round(r.rain.mean)} mm average`
                    : r.rain?.few ? `Only ${r.rain.gauges} gauges reported` : r.maxMm != null ? `${Math.round(r.maxMm)} mm (IMD station)` : "IMD heavy rain day"}</small></span>
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
        <JobsBox title="Before the next heavy rain" jobs={openJobs} sent={d.counts.tasks} done={d.counts.done} depts={d.depts.length} big areaOf={jobArea}
          onSend={(keys) => setPlan({ only: keys ?? null })} />
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
    // every street this rain flooded (reports, and satellite water when a satellite passed), each with its default department
    const fixPlaces = floodPlacesOf(rain, streetBy, d.chokes, (ward) => (ward ? zoneLabel(zoneOfWard.get(ward) ?? null) : "Outside the Corporation's wards"));
    const satOnly = fixPlaces.filter((p) => !p.street && p.sat);
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
            {rain.rain?.mean != null ? <>
              <span title={`${rain.rain.method} ${plural(rain.rain.gauges, "gauge")} reported (${rain.rain.inChennai} inside the wards).${rain.rain.peak ? ` Wettest hour: ${rain.rain.peak.mm} mm at ${rain.rain.peak.name}, from ${fmtT(rain.rain.peak.at)}.` : ""}`}>
                <I n="drop" />{Math.round(rain.rain.mean)} mm average · {plural(rain.rain.gauges, "CFM-DSS gauge")}</span>
              {rain.rain.wettest && <span><I n="drop" />{Math.round(rain.rain.wettest.mm)} mm at {rain.rain.wettest.name}</span>}
            </> : rain.rain?.few ? <span title="A district figure needs at least 20 of the about 75 CFM-DSS gauges to report."><I n="drop" />Only {plural(rain.rain.gauges, "CFM-DSS gauge")} reported: too few to tell the district&apos;s rain</span>
              : rain.maxMm != null && <span><I n="drop" />{Math.round(rain.maxMm)} mm at the wettest IMD station</span>}
            {rain.rain?.dry && <span className="rv-warn" title="This day is on the district pipeline's heavy-rain day list, but the CFM-DSS gauges that reported show no heavy rain (district average under 15 mm and no gauge at IMD's 64.5 mm heavy-rain mark).">
              <I n="alert" />Not a heavy rain at the CFM-DSS gauges</span>}
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
        <SatLine r={rain} />
        {also(rain.id)}
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
        <BulkFix fx={fx} lens="flood" rainId={rain.id} places={fixPlaces} tracked={jobStreets} />
        {wet.length > 0 && (
          <>
            <h4 className="rv-sec">Flood streets with reports <small>{n0(wet.length)} · how often each has flooded</small></h4>
            <ul className="rv-streets">
              {(allWet ? wet : wet.slice(0, 6)).map(({ s, n }) => (
                <li key={s.key}><button onClick={() => pickStreet(s.key)}>
                  <span className="rv-sn"><b>{s.label}</b><small>{s.ward ? `Ward ${s.ward}` : "Outside the Corporation's wards"} · {plural(n, "report")} in this rain{rain.streets?.some((x) => x.key === s.key && x.source === "both") ? " · satellite water too" : ""}</small></span>
                  <span className="rv-often-s"><RainDots rains={oldestFirst} on={(r) => s.rainDates.includes(r.start)} now={rain.id} /><em>{s.rains} of {rains.length}</em><FixPill fx={fx} lens="flood" place={s.key} /></span>
                </button></li>
              ))}
            </ul>
            {wet.length > 6 && <button className="rv-more" onClick={() => setAllWet((v) => !v)}>{allWet ? "Show fewer" : `Show all ${n0(wet.length)}`}</button>}
          </>
        )}
        {satOnly.length > 0 && (
          <>
            <h4 className="rv-sec">Satellite water, no complaint <small>{n0(satOnly.length)} · seen by radar only</small></h4>
            <ul className="rv-streets">
              {(allWet ? satOnly : satOnly.slice(0, 4)).map((p) => (
                <li key={p.place}><button onClick={() => pickStreet(p.place)}>
                  <span className="rv-sn"><b>{p.label}</b><small>{p.ward ? `Ward ${p.ward}` : "Outside the Corporation's wards"} · water {p.sat!.how === "on" ? "on" : "beside"} {n0(Math.round(p.sat!.floodedM))} m of it</small></span>
                  <span className="rv-often-s"><FixPill fx={fx} lens="flood" place={p.place} /></span>
                </button></li>
              ))}
            </ul>
            {satOnly.length > 4 && <button className="rv-more" onClick={() => setAllWet((v) => !v)}>{allWet ? "Show fewer" : `Show all ${n0(satOnly.length)}`}</button>}
          </>
        )}
        <JobsBox title="Before the next rain like this" jobs={jobs} areaOf={jobArea} onSend={(keys) => setPlan({ only: keys ?? jobs.map((j) => j.key) })}
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
      <aside ref={drag.ref} style={drag.style} className={`amp rv l-${lens}${phone ? " sheet" : ""}${drag.cls}`} data-h="half" aria-label="Rain">
        {head}
        {tabs}
        <NowStrip d={d} />
        <div className="rv-b">
          {lens !== "flood" ? (
            <ImpactView lens={lens} api={api} rains={rains} rainId={rainNow} data={imp[lens] ?? null} escRef={childEsc} onLayer={onLayer} onOpenIncident={onOpenIncident} onLive={onLive} fx={fx}
              onRain={(id) => { setPick(null); setView(id ? { kind: "rain", id, zone: null } : { kind: "all", zone: null }); }} />
          ) : card ? <><button className="rv-back" onClick={() => setPick(null)}><I n="chevl" />Back to {backTo}</button><div className="rv-card">{card}</div></> : body}
        </div>
      </aside>
      {lens === "flood" ? <Legend rain={!!rain} sat={rain?.sat?.status === "pass" && rain.sat.boxes.length > 0} left={drag.right} /> :<ImpactLegend lens={lens} rain={!!rain} lines={imp.metro?.items ?? []} left={drag.right} />}
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

/**
 * What Sentinel-1 radar saw in this rain (satflood.ts), in plain words: the water, the roads under or beside it, and what
 * radar cannot see; or why there is no picture (no pass within 2 days, or too little rain at the gauges to compare).
 */
function SatLine({ r }: { r: RainWithData }) {
  const s = r.sat;
  if (!s) return null;
  if (s.status !== "pass") {
    const near = [s.nearest?.before, s.nearest?.after].filter((x): x is string => !!x).map((x) => fmtD(x.slice(0, 10)));
    return <p className="rv-muted rv-sat">{s.note ?? `No satellite picture within 5 days of this rain${near.length ? ` (radar passed on ${near.join(" and ")})` : ""}.`}</p>;
  }
  const on = r.streets.filter((x) => x.sat && x.sat.how === "on").map((x) => ({ name: x.sat!.name, ward: x.sat!.ward }));
  const beside = s.beside ?? [];
  const both = r.streets.filter((x) => x.source === "both").length;
  const named = (xs: { name: string | null; ward: number }[]) => {
    const n = xs.filter((x) => x.name).slice(0, 3).map((x) => `${x.name} (ward ${x.ward})`);
    const rest = xs.length - n.length;
    return [...n, ...(rest > 0 ? [plural(rest, n.length ? "other road" : "road")] : [])].join(", ");
  };
  const km2 = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(1));
  // every picture of the rain: radar sees through cloud, optical only where the sky was clear (its share of the wards is given)
  const lookWords = (l: (typeof s.looks)[number]) =>
    `${l.satellite} ${l.kind === "radar" ? "radar" : "optical"}, ${fmtD(l.at.slice(0, 10))} (${l.daysAfterEnd <= 0 ? "during the rain" : `${Math.round(l.daysAfterEnd * 10) / 10} day${l.daysAfterEnd === 1 ? "" : "s"} after`}${l.kind === "optical" ? `, ${Math.round(l.clearShare * 100)} % of the wards clear of cloud` : ""}): ${l.waterKm2 > 0 ? `${km2(l.waterKm2)} km² of new water` : "no new water"}`;
  return (
    <p className="rv-desc rv-sat">
      {s.looks.length > 1 && <span className="rv-looks">{s.looks.length} satellite pictures: {s.looks.map(lookWords).join("; ")}. Together: </span>}
      {s.looks.length <= 1 && <b>{s.pass?.satellite ?? "Satellite"} {s.looks[0]?.kind === "optical" ? "optical" : "radar"}, {fmtT(s.pass?.at ?? "")}:</b>}{" "}
      {s.waterKm2 != null ? `about ${km2(s.waterKm2)} km² of possible new water${s.highKm2 != null ? ` (${km2(s.highKm2)} km² high confidence)` : ""}` : "no reading"} (cyan on the map).{" "}
      {s.clamped ? "The radar picture had no clear split between water and land, so the area is uncertain. " : null}
      {on.length ? <>Water on {(s.roadKm ?? 0).toFixed(1)} km of road: {named(on)}. </> : "No mapped road was under water. "}
      {beside.length ? <>Water beside {named(beside)} (not counted as flooded streets). </> : null}
      {both ? <>{plural(both, "street")} with complaints also had satellite water. </> : null}
      Radar cannot see water between buildings, so streets without satellite water may still have flooded.
    </p>
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
      {top && <em title={`The wettest of ${on.length} Chennai Flood Monitor rain gauges reporting now (read every 10 minutes)`}><I n="drop" />{top.todayMm ?? 0} mm today · {top.name}</em>}
    </div>
  );
}

/** the jobs of the plan for what is shown: how many of each kind, and one button to read and send them */
/**
 * Jobs before the next rain. With `areaOf`, they are reviewed and sent AREA BY AREA (owner, 28 Nov): one row per zone with its
 * jobs and departments, each with its own "Review and send" (the review sheet then holds only that zone's jobs). Without it (one
 * street's jobs) one button sends them all.
 */
function JobsBox({ title, jobs, onSend, sent = 0, done = 0, depts, big, empty, areaOf }: {
  title: string; jobs: RJob[]; onSend: (keys?: string[]) => void; sent?: number; done?: number; depts?: number; big?: boolean; empty?: string;
  areaOf?: (j: RJob) => string;
}) {
  const kinds = [...jobs.reduce((m, j) => m.set(j.kind, (m.get(j.kind) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const nd = depts ?? new Set(jobs.map((j) => j.dept)).size;
  if (!jobs.length && !empty) return null;
  const areas = areaOf ? [...jobs.reduce((m, j) => { const k = areaOf(j); return m.set(k, [...(m.get(k) ?? []), j]); }, new Map<string, RJob[]>()).entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])) : null;
  return (
    <section className={`rv-act${big ? " big" : ""}`}>
      <h4><I n="tasks" />{title}</h4>
      {jobs.length ? (
        <>
          <p><b>{plural(jobs.length, "job")}</b> ready for {plural(nd, "department")}{areas ? ` in ${plural(areas.length, "area")}` : ""}{sent > 0 ? ` · ${n0(done)} of ${n0(sent)} sent jobs done` : ""}</p>
          <ul className="rv-kinds">{kinds.slice(0, big ? 6 : 4).map(([k, n]) => <li key={k}><b>{n0(n)}</b>{KIND[k] ?? k}</li>)}</ul>
          {areas && areas.length > 1 ? (
            <ul className="rv-areas">
              {areas.map(([area, xs]) => {
                const ds = new Set(xs.map((j) => j.deptName || j.dept));
                return (
                  <li key={area}>
                    <span><b>{area}</b><small>{plural(xs.length, "job")} · {[...ds].slice(0, 3).join(", ")}{ds.size > 3 ? ` +${ds.size - 3}` : ""}</small></span>
                    <button className="rv-go" onClick={() => onSend(xs.map((j) => j.key))}><I n="send" />Review and send</button>
                  </li>
                );
              })}
            </ul>
          ) : <button className="rv-go" onClick={() => onSend()}><I n="send" />Review and send {jobs.length === 1 ? "the job" : `${n0(jobs.length)} jobs`}</button>}
          <small>You read and approve each department&apos;s email before it goes{areas && areas.length > 1 ? ", one area at a time" : ""}.</small>
        </>
      ) : <p className="rv-muted">{empty}</p>}
    </section>
  );
}

/**
 * The map's key, in the map's bottom-right corner (bottom-left when the panel has been moved to the right), so it never
 * covers the panel or what it shows. Its title folds it to one line; that choice is kept in this browser.
 */
function MapKey({ title, left, wide, children, foot }: { title: React.ReactNode; left?: boolean; wide?: boolean; children: React.ReactNode; foot?: string }) {
  const [shut, setShut] = useState(false);
  useEffect(() => { try { setShut(localStorage.getItem("diq.rain.keyShut") === "1"); } catch { /* open */ } }, []);
  const flip = () => setShut((v) => { try { localStorage.setItem("diq.rain.keyShut", v ? "0" : "1"); } catch { /* not kept */ } return !v; });
  return (
    <div className={`rv-leg${left ? " at-left" : ""}${wide ? " wide" : ""}${shut ? " shut" : ""}`} aria-label="Map key">
      <button type="button" className="rv-leg-t" onClick={flip} aria-expanded={!shut} title={shut ? "Show the map key" : "Fold the map key"}>
        {title}<I n={shut ? "up" : "chevd"} />
      </button>
      {!shut && <>{children}{foot && <small>{foot}</small>}</>}
    </div>
  );
}

/** the other tabs' map key */
function ImpactLegend({ lens, rain, lines, left }: { lens: Lens; rain: boolean; lines: ImpactData["items"]; left?: boolean }) {
  const ln = (c: string, h = 4, o = 1) => <i className="ln" style={{ background: c, height: h, opacity: o }} />;
  const rows: [React.ReactNode, string][] = lens === "traffic"
    ? rain ? [[ln("#C2410C", 5), "Jammed badly in this rain"], [ln("#F97316", 4), "Jammed in this rain"], [ln("#94A3B8", 2, 0.6), "Not jammed this time"], [<span key="u" className="g" style={{ background: "#C2410C" }}>U</span>, "Underpass with water in it"]]
      : [[ln("#C2410C", 5), "Jams in 4 or more rains"], [ln("#F97316", 4), "Jams in 2 or 3 rains"], [ln("#FDBA74", 3), "Jammed once"], [<span key="u" className="g" style={{ background: "#F97316" }}>U</span>, "Underpass that fills with water"]]
    : lens === "power"
      ? rain ? [[ln("#A16207", 10, 0.7), "Off 5 hours or more"], [ln("#EAB308", 10, 0.6), "Off 3 or 4 hours"], [ln("#FDE047", 10, 0.6), "Off 1 or 2 hours"]]
        : [[ln("#A16207", 10, 0.7), "Loses power in 4 or more rains"], [ln("#EAB308", 10, 0.6), "In 2 or 3 rains"], [ln("#FDE047", 10, 0.6), "Once, or often in planned cuts"]]
      : [...lines.map((x) => [ln(x.color ?? "#6D28D9", 5), x.label] as [React.ReactNode, string]),
        [<span key="x" className="g" style={{ background: "#5B21B6", borderRadius: "50%" }}>×</span>, rain ? "Station closed in this rain" : "Station closed in 2 or more rains"],
        ...(rain ? [[ln("#94A3B8", 3, 0.6), "On time in this rain"] as [React.ReactNode, string]] : [])];
  return (
    <MapKey left={left} wide={lens === "metro"} foot={lens === "traffic" ? "Zoom in to see the roads; point at one for its name" : lens === "power" ? "Point at a ward for its name and hours" : undefined}
      title={<><I n={LENS_WORD[lens].icon} />{lens === "metro" ? (rain ? "Lines in this rain: thicker = later" : "Lines: thicker = late in more rains") : `${LENS_WORD[lens].title} ${rain ? "in this rain" : "in heavy rains"}`}</>}>
      <ul>{rows.map(([k, l]) => <li key={l}>{k}<span>{l}</span></li>)}</ul>
    </MapKey>
  );
}

/** Flooding's map key */
function Legend({ rain, left, sat }: { rain: boolean; left?: boolean; sat?: boolean }) {
  const rows: [string, string][] = rain
    ? [["d-rep", "Report on a street that flooded before"], ["d-new", "Report in a new place"], ["l-3", "Flood street with a report in this rain"], ["l-0", "Other flood streets"]]
    : [["l-3", "Flooded in 5 or more rains"], ["l-2", "Flooded in 3 or 4 rains"], ["l-1", "Flooded in 1 or 2 rains"]];
  // the satellite's water (satflood.ts), when the chosen rain has a picture
  if (sat) rows.push(["sat", "Water seen by satellite radar"]);
  const icon: IconName = rain ? "pin" : "drop";
  return (
    <MapKey left={left} foot="Zoom in to see the roads themselves" title={<><I n={icon} />{rain ? "This rain" : "Flood streets"}</>}>
      <ul>{rows.map(([k, l]) => <li key={k}><i className={k} style={k === "sat" ? { width: 12, height: 10, margin: "0 4px", borderRadius: 2, background: "#22D3EE", boxShadow: "inset 0 0 0 1px #0891B2" } : undefined} /><span>{l}</span></li>)}</ul>
    </MapKey>
  );
}
