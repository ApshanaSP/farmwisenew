"use client";
/**
 * Rain, on the Overview's own map (the map grows, as for Ask the Map). 28 Nov 2026, the owner: "simplify it: I click Rain and see the
 * past rains; I click one rain and see the areas it affected; I click an area, the map zooms in with a circle, and its flooded streets are
 * listed one by one, each with Take action and its follow-up. Nothing else. The same for flooding, traffic, power and metro."
 *
 * So the panel has three steps, the same on all four tabs:
 *   1. the past rains that hit something on this tab, newest first, each with its district average (CFM-DSS gauges) and what it hit;
 *   2. one rain: the areas (zones; Metro: its lines) it hit, most first; the map rings each area;
 *   3. one area: the map zooms to its circle; its places (streets, roads, wards, lines) one by one, each opening its action tracker
 *      (FixTracker.tsx FixBox): assign to a department, follow what the department reports, verify, and see whether the next rain proved it.
 * Back goes one step. Satellite water seen in the chosen rain is drawn on every tab, and the map key says so.
 * Data: the flood memory (/api/rehearsal/state), the past rains (/api/rehearsal/rains) and the other tabs' records (/api/rehearsal/impacts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I, type IconName } from "../icons";
import type { MapGeo } from "@/lib/collector/geo";
import type { RehearsalState } from "@/lib/rehearsal/types";
import type { RainWithData } from "@/lib/rehearsal/satflood";
import type { RainApi, RainLayer, RainStart } from "./rainLayer";
import { LENS_WORD } from "./ImpactView";
import type { ImpactData, ImpactItem, Lens } from "@/lib/rehearsal/impacts";
import { n0, plural, range } from "./rainKit";
import { Grip, useDragPanel } from "../askmap/dragPanel";
import { onMapCmd } from "../askmap/bridge";
import { FixBox, FixPill, floodPlacesOf, satName, useFixes } from "./FixTracker";
import { impactDefault } from "@/lib/rehearsal/tracker";
import "./rehearsal.css";
import "./rainview.css";

type Tab = "flood" | Lens;
/** one place a rain hit, the same shape on every tab */
interface Place {
  key: string; label: string; sub: string; area: string;
  /** points that frame it on the map, and where its circle centre counts it */
  pts: [number, number][]; at: [number, number];
  def: { dept: string; note: string };
}
const TAB_WORD: Record<Tab, { title: string; icon: IconName; one: string; many: string; hit: string }> = {
  flood: { title: "Flooding", icon: "drop", one: "flooded street", many: "flooded streets", hit: "flooded" },
  traffic: { title: "Traffic", icon: LENS_WORD.traffic.icon, one: "jammed road", many: "jammed roads", hit: "jammed" },
  power: { title: "Power", icon: LENS_WORD.power.icon, one: "ward without power", many: "wards without power", hit: "lost power" },
  metro: { title: "Metro", icon: LENS_WORD.metro.icon, one: "late line", many: "late lines", hit: "ran late" }
};
const AREA_WORD: Record<Tab, string> = { flood: "Areas flooded", traffic: "Areas with jams", power: "Areas without power", metro: "Lines affected" };

/** metres between two points (small distances) */
const dist = (a: [number, number], b: [number, number]) => {
  const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k), y = (b[0] - a[0]) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
};
/** the circle round some places: their centre, and a radius that holds them all with a margin */
function ringOf(ps: Place[]): { lat: number; lon: number; r: number } | null {
  const at = ps.map((p) => p.at).filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]));
  if (!at.length) return null;
  const lat = at.reduce((s, x) => s + x[0], 0) / at.length, lon = at.reduce((s, x) => s + x[1], 0) / at.length;
  const far = Math.max(0, ...ps.flatMap((p) => p.pts).map((x) => dist([lat, lon], x)));
  return { lat, lon, r: Math.min(6000, Math.max(550, far + 300)) };
}
const ringPts = (g: { lat: number; lon: number; r: number }): [number, number][] => {
  const dLat = g.r / 111_320, dLon = g.r / (111_320 * Math.cos((g.lat * Math.PI) / 180));
  return [[g.lat - dLat, g.lon - dLon], [g.lat + dLat, g.lon + dLon]];
};
/** the rain's district average from the CFM-DSS gauges, in plain words (nothing when there is no gauge figure) */
const avgOf = (r: RainWithData): string | null => (r.rain?.mean != null ? `${Math.round(r.rain.mean)} mm average` : null);

export default function RainView({ geo, api, start, onClose, onLayer, toast, escRef }: {
  geo: MapGeo | null;
  api: RainApi;
  start: RainStart;
  onClose: () => void;
  onLayer: (l: RainLayer | null) => void;
  onOpenIncident: (id: string) => void;
  toast: (msg: string, kind?: "ok" | "alert") => void;
  /** Escape goes back one step here; false when there is nothing to go back from (the console then closes the view) */
  escRef: React.MutableRefObject<(() => boolean) | null>;
  onLive?: () => void;
}) {
  const [d, setD] = useState<RehearsalState | null>(null);
  const [past, setPast] = useState<RainWithData[] | null>(null);
  const [imp, setImp] = useState<Partial<Record<Lens, ImpactData>>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(start.lens ?? "flood");
  const [rainId, setRainId] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (start.lens) setTab(start.lens); }, [start.seq]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => {
    let on = true;
    for (const l of ["traffic", "power", "metro"] as Lens[])
      fetch(api.impacts + l).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j) setImp((m) => ({ ...m, [l]: j })); }).catch(() => undefined);
    return () => { on = false; };
  }, [api]);

  const zoneOfWard = useMemo(() => new Map((geo?.wards ?? []).map((w) => [w.ward, w.zone])), [geo]);
  const zoneName = useMemo(() => new Map((geo?.zones ?? []).map((z) => [z.zone, z.name])), [geo]);
  const areaOfWard = useCallback((ward: number | null | undefined) => {
    if (!ward) return "Outside the Corporation's wards";
    const z = zoneOfWard.get(ward);
    return z == null ? "Place not known" : zoneName.get(z) ?? `Zone ${z}`;
  }, [zoneOfWard, zoneName]);
  const streetBy = useMemo(() => new Map((d?.streets ?? []).map((s) => [s.key, s])), [d]);
  /** newest first */
  const rains = useMemo(() => [...(past ?? [])].sort((a, b) => b.start.localeCompare(a.start)), [past]);
  const fx = useFixes(api, toast, rains);

  /** every place a rain hit on a tab */
  const placesOf = useCallback((t: Tab, rain: RainWithData): Place[] => {
    if (t === "flood") {
      if (!d) return [];
      return floodPlacesOf(rain, streetBy, d.chokes, areaOfWard).map((p) => {
        const s = p.street;
        const pts: [number, number][] = s ? s.lines.flat() : p.sat ? p.sat.lines.flat() : [];
        const at: [number, number] = s ? [s.lat, s.lon] : p.sat ? [p.sat.lat, p.sat.lon] : [NaN, NaN];
        const sub = [p.ward ? `Ward ${p.ward}` : null, p.reports ? plural(p.reports, "flooding report") : null, p.sat ? "satellite water on it" : null].filter(Boolean).join(" · ");
        return { key: p.place, label: p.label, sub, area: p.area ?? areaOfWard(p.ward), pts: pts.length ? pts : [at], at, def: { dept: p.dept, note: p.note } };
      });
    }
    const x = imp[t];
    if (!x) return [];
    return x.items.filter((y) => y.byRain[rain.id]).map((y: ImpactItem) => {
      const pts: [number, number][] = y.lines?.length ? y.lines.flat() : y.rings?.length ? y.rings.flat() : y.path?.length ? y.path : [[y.lat, y.lon]];
      const ar = t === "metro" ? y.label : t === "power" ? y.sub.replace(/ zone$/, "") : y.sub.includes(" · ") ? y.sub.split(" · ").slice(1).join(" · ") : y.sub || "Place not known";
      return { key: y.key, label: y.label, sub: y.byRain[rain.id]?.why ?? y.sub, area: ar || "Place not known", pts, at: [y.lat, y.lon],
        def: impactDefault(t, y, y.byRain[rain.id]?.why ?? null, range(rain)) };
    });
  }, [d, imp, streetBy, areaOfWard]);

  // the rains that hit something on this tab, with their places
  const hitRains = useMemo(() => rains.map((r) => ({ r, places: placesOf(tab, r) })).filter((x) => x.places.length > 0), [rains, tab, placesOf]);
  const cur = rainId ? hitRains.find((x) => x.r.id === rainId) ?? null : null;
  const areas = useMemo(() => {
    if (!cur) return [];
    const m = new Map<string, Place[]>();
    for (const p of cur.places) (m.get(p.area) ?? m.set(p.area, []).get(p.area)!).push(p);
    return [...m.entries()].map(([name, ps]) => ({ name, ps, ring: ringOf(ps) })).sort((a, b) => b.ps.length - a.ps.length || a.name.localeCompare(b.name));
  }, [cur]);
  const curArea = area ? areas.find((a) => a.name === area) ?? null : null;

  // a tab change keeps the rain when it hit something there too; the area and the open place start again
  const pickTab = (t: Tab) => { setTab(t); setArea(null); setOpen(null); };
  useEffect(() => { if (rainId && past && !cur && (tab === "flood" || imp[tab as Lens])) setRainId(null); }, [tab, cur, rainId, past, imp]);
  const openRain = (id: string | null) => { setRainId(id); setArea(null); setOpen(null); };
  const openArea = (name: string | null) => { setArea(name); setOpen(null); };

  // opened on a rain (the rain band, Ask the Map, Jarvis): the latest one that hit something, or the one asked for, once the data is in
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !hitRains.length) return;
    opened.current = true;
    const want = start.rain === "latest" ? hitRains[0].r.id : start.rain;
    if (want && hitRains.some((x) => x.r.id === want)) setRainId(want);
  }, [hitRains]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jarvis moves between the tabs and the rains while the view is open (askmap/bridge.ts "diq:map-cmd")
  const live = useRef({ hitRains, tab });
  live.current = { hitRains, tab };
  useEffect(() => onMapCmd(["rain"], (_op, a) => {
    const s = live.current;
    const t = a.tab === "flooding" ? "flood" : a.tab === "traffic" || a.tab === "power" || a.tab === "metro" ? a.tab : null;
    if (t) { setTab(t); setArea(null); setOpen(null); }
    if (a.rain === "all") { setOpen(null); setArea(null); setRainId(null); return { ok: true, state: { lens: t ?? s.tab, rain: null } }; }
    if (typeof a.rain === "string") {
      const id = a.rain === "latest" ? s.hitRains[0]?.r.id : a.rain;
      const x = id ? s.hitRains.find((y) => y.r.id === id) : null;
      if (!x) return { ok: false, why: "no-such-rain", state: { rains: s.hitRains.slice(0, 6).map((y) => y.r.start.slice(0, 10)) } };
      setOpen(null); setArea(null); setRainId(x.r.id);
      return { ok: true, state: { lens: t ?? s.tab, rain: x.r.id, start: x.r.start, reports: x.r.reports.length } };
    }
    return { ok: true, state: { lens: t ?? s.tab, rains: s.hitRains.length } };
  }), []);

  // Escape: the open place, the area, the rain; then the console closes the view
  useEffect(() => {
    escRef.current = () => {
      if (open) { setOpen(null); return true; }
      if (area) { setArea(null); return true; }
      if (rainId) { setRainId(null); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [open, area, rainId, escRef]);

  // ---- the map: what to draw, and a new camera shot whenever the step or the choice changes
  const shot = useRef({ key: "", seq: 0 });
  const layer = useMemo<RainLayer | null>(() => {
    if (!d || !past) return null;
    const key = `${tab}|${rainId}|${area}|${open}`;
    if (shot.current.key !== key) shot.current = { key, seq: shot.current.seq + 1 };
    const inRain = new Set(cur?.places.map((p) => p.key) ?? []);
    const inArea = new Set(curArea?.ps.map((p) => p.key) ?? []);
    /** 3: in the open area (or the rain, before an area is open); 1: hit by the rain elsewhere; 0: not hit */
    const lv = (k: string, base: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 => (cur ? (curArea ? (inArea.has(k) ? 3 : inRain.has(k) ? 1 : 0) : inRain.has(k) ? 3 : 0) : base);
    const tip = (label: string, sub: string) => `<b>${label.replace(/</g, "&lt;")}</b><span class="tl">${sub.replace(/</g, "&lt;")}</span>`;
    const placeBy = new Map((cur?.places ?? []).map((p) => [p.key, p]));
    let streets: RainLayer["streets"] = [], areasL: RainLayer["areas"] = [], rails: RainLayer["rails"] = [], points: NonNullable<RainLayer["points"]> = [];
    if (tab === "flood") {
      streets = d.streets.map((s) => {
        const p = placeBy.get(s.key);
        return { key: s.key, lines: s.lines, at: [s.lat, s.lon] as [number, number], level: lv(s.key, s.rains >= 5 ? 3 : s.rains >= 3 ? 2 : 1), tip: tip(s.label, p ? p.sub : `Flooded in ${plural(s.rains, "rain")}`) };
      });
      // streets only the satellite saw in this rain
      for (const p of cur?.places ?? []) if (!streetBy.has(p.key)) {
        const sat = cur!.r.streets?.find((x) => x.key === p.key)?.sat;
        if (sat) streets.push({ key: p.key, lines: sat.lines, at: [sat.lat, sat.lon], level: lv(p.key, 3), tip: tip(satName(sat), "Satellite water on it in this rain") });
      }
    } else {
      const items = imp[tab]?.items ?? [];
      for (const x of items) {
        const level = lv(x.key, x.level);
        const t = tip(x.label, placeBy.get(x.key)?.sub ?? x.sub);
        if (x.lines?.length) streets.push({ key: x.key, lines: x.lines, at: [x.lat, x.lon], level, tip: t });
        else if (x.rings?.length) areasL.push({ key: x.key, rings: x.rings, level, tip: t });
        else if (x.path?.length) rails.push({ id: x.key, color: x.color ?? "#6D28D9", path: x.path, level: cur ? level : (Math.max(1, x.level) as 1 | 2 | 3), tip: t });
        if (x.kind === "underpass" && level > 0) points.push({ key: x.key, lat: x.lat, lon: x.lon, level, glyph: "U", tip: t });
      }
    }
    // the circles: every area of the chosen rain (faint, clickable), the open one strong
    const rings: NonNullable<RainLayer["rings"]> = tab === "metro" ? [] : areas.filter((a) => a.ring && (!curArea || a === curArea))
      .map((a) => ({ key: a.name, ...a.ring!, label: a.name, n: a.ps.length, on: a === curArea }));
    // the camera: the open place, else the open area's circle, else the rain's places, else the district's worst
    let pts: [number, number][] | null = null, maxZoom: number | undefined;
    const sel = open ? placeBy.get(open) : null;
    if (sel) { pts = sel.pts; maxZoom = 16.5; }
    else if (curArea) { pts = curArea.ring ? ringPts(curArea.ring) : curArea.ps.flatMap((p) => p.pts); maxZoom = 16; }
    else if (cur) pts = cur.places.map((p) => p.at).filter((x) => Number.isFinite(x[0]));
    else pts = tab === "flood" ? d.streets.filter((s) => s.rains >= 3).map((s) => [s.lat, s.lon] as [number, number]) : null;
    if (pts && !pts.length) pts = null;
    // the water a satellite saw in the chosen rain, on every tab
    const r = cur?.r;
    const satWater = r?.sat?.status === "pass" && r.sat.boxes.length ? { boxes: r.sat.boxes, tip: `Water seen by satellite (${r.sat.pass?.satellite ?? "radar"}) in the ${range(r)} rain` } : null;
    const selKind: RainLayer["sel"] = sel ? { kind: tab === "power" ? "area" : tab === "metro" ? "line" : "street", id: sel.key } : null;
    return {
      theme: tab, streets, dots: [], areas: areasL, rails, points, rings, satWater, sel: selKind,
      fit: { seq: shot.current.seq, pts, maxZoom },
      onPick: (kind, id) => {
        if (kind === "ring") { openArea(id); return; }
        const k = id.split("#")[0];
        const p = placeBy.get(k);
        if (p) { setArea(p.area); setOpen(k); }
      }
    };
  }, [d, past, tab, rainId, area, open, cur, curArea, areas, imp, streetBy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onLayer(layer); }, [layer, onLayer]);
  useEffect(() => () => onLayer(null), [onLayer]);

  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const drag = useDragPanel("rain", phone);
  const w = TAB_WORD[tab];
  const head = (
    <header className={`rv-h ${drag.handle.className}`} onPointerDown={drag.handle.onPointerDown} onDoubleClick={drag.handle.onDoubleClick}>
      <Grip off={phone} />
      <span className="rv-ic"><I n={tab === "flood" ? "cloud" : w.icon} /></span>
      <span className="rv-t"><b>Rain · {w.title}</b><small>{cur ? `${range(cur.r)} rain` : "Past heavy rains"}{curArea ? ` · ${curArea.name}` : ""}</small></span>
      {drag.tools}
      <button className="amp-x" onClick={onClose} title="Back to the Overview (Esc)"><I n="x" />Close</button>
    </header>
  );
  const tabs = (
    <nav className="rv-tabs" role="tablist" aria-label="What the rain did">
      {(["flood", "traffic", "power", "metro"] as const).map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={`t-${t}${tab === t ? " on" : ""}`} onClick={() => pickTab(t)}>
          <I n={TAB_WORD[t].icon} />{TAB_WORD[t].title}
        </button>
      ))}
    </nav>
  );

  const ready = !!d && !!past && (tab === "flood" || !!imp[tab]);
  let body: React.ReactNode;
  if (!ready) {
    body = (
      <div className="rv-wait">
        {err ? <><I n="alert" /><b>{err}</b><button className="rv-btn" onClick={load}>Try again</button></>
          : <><span className="rv-spin" /><b>Reading the past rains…</b></>}
      </div>
    );
  } else if (!cur) {
    // step 1: the rains
    const max = Math.max(1, ...hitRains.map((x) => x.places.length));
    body = (
      <>
        <h4 className="rv-step"><span>1</span>Past heavy rains <small>click a rain to see the areas it affected</small></h4>
        {hitRains.length ? (
          <ul className="rw-rains">
            {hitRains.map(({ r, places }) => {
              const top = [...places.reduce((m, p) => m.set(p.area, (m.get(p.area) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0];
              const avg = avgOf(r);
              return (
                <li key={r.id}><button onClick={() => openRain(r.id)}>
                  <span className="rw-top"><b>{range(r)}</b>{avg && <em>{avg}</em>}</span>
                  <span className="rw-bar"><i style={{ width: `${Math.max(4, (100 * places.length) / max)}%` }} /></span>
                  <span className="rw-sub">{plural(places.length, w.one, w.many)}{top && tab !== "metro" ? ` · most in ${top[0]}` : ""}</span>
                  <I n="chevr" />
                </button></li>
              );
            })}
          </ul>
        ) : <p className="rv-muted">No past heavy rain has a record on this tab.</p>}
      </>
    );
  } else if (!curArea) {
    // step 2: the areas of one rain
    const max = Math.max(1, ...areas.map((a) => a.ps.length));
    const avg = avgOf(cur.r);
    body = (
      <>
        <button className="rv-back" onClick={() => openRain(null)}><I n="chevl" />All rains</button>
        <div className="rw-head"><h3>{range(cur.r)} rain</h3>{avg && <em><I n="drop" />{avg}</em>}<span>{plural(cur.places.length, w.one, w.many)} in {plural(areas.length, tab === "metro" ? "line" : "area")}</span></div>
        <h4 className="rv-step"><span>2</span>{AREA_WORD[tab]} <small>most first · click one to zoom in</small></h4>
        <ul className="rw-areas">
          {areas.map((a) => {
            const acted = a.ps.filter((p) => fx.forPlace(tab, p.key).some((f) => f.stage !== "closed")).length;
            return (
              <li key={a.name}><button onClick={() => openArea(a.name)}>
                <span className="rw-an"><b>{a.name}</b><small>{plural(a.ps.length, w.one, w.many)}{acted ? ` · ${n0(acted)} with action` : ""}</small></span>
                <span className="rw-bar"><i style={{ width: `${Math.max(6, (100 * a.ps.length) / max)}%` }} /></span>
                <b className="rw-n">{n0(a.ps.length)}</b>
                <I n="chevr" />
              </button></li>
            );
          })}
        </ul>
      </>
    );
  } else {
    // step 3: one area's places, one by one, each with its action and follow-up
    body = (
      <>
        <button className="rv-back" onClick={() => openArea(null)}><I n="chevl" />All areas of the {range(cur.r)} rain</button>
        <div className="rw-head"><h3>{curArea.name}</h3><span>{plural(curArea.ps.length, w.one, w.many)} in the {range(cur.r)} rain</span></div>
        <h4 className="rv-step"><span>3</span>{w.many[0].toUpperCase() + w.many.slice(1)} <small>open one to take action and follow it</small></h4>
        <ol className="rw-places">
          {curArea.ps.map((p, k) => {
            const on = open === p.key;
            return (
              <li key={p.key} className={on ? "on" : ""}>
                <button className="rw-ph" onClick={() => setOpen(on ? null : p.key)} aria-expanded={on}>
                  <span className="rw-k">{k + 1}</span>
                  <span className="rw-pn"><b>{p.label}</b><small>{p.sub}</small></span>
                  <FixPill fx={fx} lens={tab} place={p.key} />
                  {!fx.forPlace(tab, p.key).length && <span className="rw-act">Take action</span>}
                  <I n={on ? "up" : "chevd"} />
                </button>
                {on && (
                  <div className="rw-pb">
                    <FixBox fx={fx} lens={tab} place={p.key} rainId={cur.r.id} def={p.def} />
                    {!fx.url && <p className="rv-muted">Actions are not kept on this preview copy.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  const sat = !!cur && cur.r.sat?.status === "pass" && (cur.r.sat.boxes?.length ?? 0) > 0;
  return (
    <>
      <aside ref={drag.ref} style={drag.style} className={`amp rv rw l-${tab}${phone ? " sheet" : ""}${drag.cls}`} data-h="half" aria-label="Rain">
        {head}
        {tabs}
        <div className="rv-b">{body}</div>
      </aside>
      <Legend tab={tab} step={cur ? (curArea ? 3 : 2) : 1} sat={sat} left={drag.right} />
    </>
  );
}

/** the map's key: what the lines, the circle and the satellite water mean, in the step shown */
function Legend({ tab, step, sat, left }: { tab: Tab; step: 1 | 2 | 3; sat: boolean; left?: boolean }) {
  const [shut, setShut] = useState(false);
  useEffect(() => { try { setShut(localStorage.getItem("diq.rain.keyShut") === "1"); } catch { /* open */ } }, []);
  const flip = () => setShut((v) => { try { localStorage.setItem("diq.rain.keyShut", v ? "0" : "1"); } catch { /* not kept */ } return !v; });
  const C: Record<Tab, [string, string]> = { flood: ["#1E40AF", "#60A5FA"], traffic: ["#C2410C", "#FDBA74"], power: ["#A16207", "#FDE047"], metro: ["#5B21B6", "#C4B5FD"] };
  const [strong, light] = C[tab];
  const w = TAB_WORD[tab];
  const rows: [React.ReactNode, string][] = step === 1
    ? [[<i key="a" className="ln" style={{ background: strong, height: 5 }} />, `${w.title}: hit in many rains`], [<i key="b" className="ln" style={{ background: light, height: 3 }} />, "Hit in one or two rains"]]
    : [[<i key="a" className="ln" style={{ background: strong, height: 5 }} />, step === 3 ? `${w.many[0].toUpperCase() + w.many.slice(1)} in this area` : `${w.many[0].toUpperCase() + w.many.slice(1)} in this rain`],
      ...(step === 3 ? [[<i key="b" className="ln" style={{ background: light, height: 3 }} />, "Hit elsewhere in this rain"] as [React.ReactNode, string]] : []),
      ...(tab !== "metro" ? [[<i key="c" className="ring" style={{ borderColor: strong }} />, step === 3 ? "The area (circle)" : "An area hit (click a circle)"] as [React.ReactNode, string]] : [])];
  rows.push([<i key="s" className="sat" />, sat ? "Water seen by satellite in this rain" : step === 1 ? "Satellite water: open a rain" : "Satellite water: no picture of this rain"]);
  return (
    <div className={`rv-leg rw-leg${left ? " at-left" : ""}${shut ? " shut" : ""}`} aria-label="Map key">
      <button type="button" className="rv-leg-t" onClick={flip} aria-expanded={!shut} title={shut ? "Show the map key" : "Fold the map key"}>
        <I n={w.icon} />Map key<I n={shut ? "up" : "chevd"} />
      </button>
      {!shut && <ul>{rows.map(([k, l]) => <li key={l}>{k}<span>{l}</span></li>)}</ul>}
    </div>
  );
}
