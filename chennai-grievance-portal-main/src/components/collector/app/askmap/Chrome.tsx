"use client";

/**
 * The grown map's own tools and legend (Ask the Map): Back to the answer, the circle tool, Layers (facility and water
 * layers from OpenStreetMap and the store), Satellite / Streets; and a legend built only from what is on the map,
 * with counts and sources, including the ward boundaries' origin. The console's existing + / − / fit stay as they are.
 */
import { useEffect, useRef, useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import { onMapCmd } from "./bridge";
import { LAYER_COL, LAYER_WORD } from "@/lib/map/words";
import type { LayerId } from "@/lib/map/types";
import { I } from "../icons";
import { CAT_COL } from "../lib";
import type { MapAsk } from "./useMapAsk";

const TOGGLE: { id: LayerId; en: string }[] = [
  { id: "schools", en: "Schools" }, { id: "colleges", en: "Colleges" }, { id: "hospitals", en: "Hospitals" }, { id: "fire_stations", en: "Fire stations" },
  { id: "police", en: "Police stations" }, { id: "rail_metro", en: "Rail and metro" }, { id: "water_bodies", en: "Lakes and ponds" }, { id: "waterways", en: "Rivers and canals" }
];
/** the Collector's own layers (OpenStreetMap; `partial`: OSM lists only some of them, said on the map) */
const COLLECTOR: { id: LayerId; en: string; partial?: true }[] = [
  { id: "banks", en: "Banks", partial: true }, { id: "atms", en: "ATMs", partial: true }, { id: "ration_shops", en: "Ration shops (by name)", partial: true },
  { id: "liquor", en: "Wine shops and bars", partial: true }, { id: "worship", en: "Places of worship" }, { id: "parks", en: "Parks and playgrounds" },
  { id: "water_tanks", en: "Water tanks", partial: true }, { id: "toilets", en: "Public toilets", partial: true }, { id: "bus_stations", en: "Bus stations" },
  { id: "gov_offices", en: "Government offices and courts" }, { id: "pharmacies", en: "Pharmacies" }, { id: "fuel", en: "Fuel stations" }, { id: "markets", en: "Markets" },
  { id: "cemeteries", en: "Cemeteries and crematoriums" }, { id: "my_list", en: "Your approved lists" }
];
/** live feeds with a place: the latest reading at each, drawn as a value on the map */
const LIVE = [
  { id: "live_rain", k: "rain", en: "Rain, last 24 h", src: "IMD" }, { id: "live_lakes", k: "lakes", en: "Lake levels", src: "PWD" },
  { id: "live_works", k: "works", en: "PWD works under way", src: "PWD" }, { id: "live_hospitals", k: "hospital", en: "Govt hospital beds", src: "MIS" },
  { id: "live_air", k: "air", en: "Air quality", src: "CPCB" }
];
/** every layer the menu can switch (what voice may ask for) */
const LAYER_IDS = new Set<string>([...TOGGLE.map((t) => t.id as string), ...COLLECTOR.map((t) => t.id as string), ...LIVE.map((t) => t.id), "news"]);
export type Overlay = { id: string; kind: string; unplaced?: number; days?: number; meta?: { count: number; partial?: { what: string; owner: string } | null; source?: string } | null;
  features: { id: string; name: string | null; lat?: number; lon?: number; lines?: [number, number][][]; polys?: [number, number][][][]; url?: string | null; sub?: string | null; value?: string | null; kind?: string | null }[] };

export function useMapChrome(ask: MapAsk | null) {
  const [base, setBase] = useState<"sat" | "streets">("sat");
  const [drawCircle, setDrawCircle] = useState(false);
  const [heat, setHeat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [on, setOn] = useState<Record<string, Overlay>>({});
  // ticked at once while the layer loads (the news layer takes a second or two the first time)
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const toggle = async (id: string) => {
    if (on[id]) { setOn((o) => { const n = { ...o }; delete n[id]; return n; }); return; }
    if (loading.has(id)) return;
    setLoading((s) => new Set(s).add(id));
    const r = await fetch(`/api/map/layers/${id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setLoading((s) => { const n = new Set(s); n.delete(id); return n; });
    if (!r) return;
    const features = (r.features as Record<string, unknown>[]).map((f) => ({ id: String(f.id), name: (f.name as string) ?? null, lat: f.lat as number | undefined, lon: f.lon as number | undefined,
      lines: f.lines as [number, number][][] | undefined, polys: f.polys as [number, number][][][] | undefined, url: (f.url as string) ?? null, sub: (f.sub as string) ?? null,
      value: (f.value as string) ?? null, kind: (f.kind as string) ?? null }));
    setOn((o) => ({ ...o, [id]: { id, kind: r.kind, features, unplaced: r.unplaced, days: r.days, meta: r.meta ?? null } }));
  };
  const overlays = Object.values(on);
  // v10: Jarvis's voice reaches the layers, the heat view and the base map (bridge.ts "diq:map-cmd"); the answer says what is on now
  const live = useRef({ on, loading, heat, base, ask, toggle });
  live.current = { on, loading, heat, base, ask, toggle };
  useEffect(() => onMapCmd(["layer", "heat", "base"], (op, a) => {
    const s = live.current;
    const layers = () => [...new Set([...Object.keys(s.on), ...s.loading])];
    if (op === "layer") {
      const id = String(a.id ?? "");
      if (!LAYER_IDS.has(id)) return { ok: false, why: "unknown" };
      const isOn = !!s.on[id] || s.loading.has(id), want = a.on !== false;
      if (isOn !== want && !s.loading.has(id)) void s.toggle(id);
      return { ok: true, state: { layers: layers(), changed: isOn !== want } };
    }
    if (op === "heat") {
      if (s.ask?.resp?.kind !== "answer") return { ok: false, why: "no-answer" };
      setHeat(a.on !== false);
      return { ok: true, state: { heat: a.on !== false } };
    }
    setBase(a.base === "streets" ? "streets" : "sat");
    return { ok: true, state: { base: a.base === "streets" ? "streets" : "sat" } };
  }), []);
  const tools = (
    <>
      {ask?.resp && <button onClick={() => ask.replay(0)} title="Back to the answer" aria-label="Back to the answer"><I n="target" /></button>}
      {ask?.resp?.kind === "answer" && (
        <button className={heat ? "on" : ""} onClick={() => setHeat((v) => !v)} aria-pressed={heat} title="Heat view: where the answer is dense" aria-label="Heat view"><I n="pulse" /></button>
      )}
      <button className={drawCircle ? "on" : ""} onClick={() => setDrawCircle((v) => !v)} aria-pressed={drawCircle}
        title="Draw a circle: what is happening here? (or right-click any spot)" aria-label="Draw a circle to ask what is happening there"><I n="scan" /></button>
      <button className={menu ? "on" : ""} onClick={() => setMenu((v) => !v)} aria-expanded={menu} title="Layers" aria-label="Layers"><I n="layers" /></button>
      <button onClick={() => setBase((b) => (b === "sat" ? "streets" : "sat"))} title={base === "sat" ? "Streets map" : "Satellite"} aria-label={base === "sat" ? "Switch to the streets map" : "Switch to satellite"}>
        <I n={base === "sat" ? "map" : "globe"} />
      </button>
    </>
  );
  const layersMenu = menu ? (
    <div className="amlayers" role="group" aria-label="Layers">
      <h6>On the ground now</h6>
      {LIVE.map((t) => (
        <label key={t.id}><input type="checkbox" checked={!!on[t.id] || loading.has(t.id)} onChange={() => toggle(t.id)} /><i className={`amlive k-${t.k}`} />{t.en}
          <small style={{ marginLeft: "auto", color: "var(--text-3)" }}>{t.src}</small></label>
      ))}
      <h6>Reports</h6>
      <label><input type="checkbox" checked={!!on.news || loading.has("news")} onChange={() => toggle("news")} />News reports, 30 days
        <small style={{ marginLeft: "auto", color: "var(--text-3)" }}>news</small></label>
      <h6>The Collector&apos;s layers</h6>
      {COLLECTOR.map((t) => (
        <label key={t.id}><input type="checkbox" checked={!!on[t.id] || loading.has(t.id)} onChange={() => toggle(t.id)} /><i className="amlayer-dot" style={{ background: LAYER_COL[t.id] ?? "#94A3B8" }} />{t.en}
          <small style={{ marginLeft: "auto", color: "var(--text-3)" }} title={t.partial ? "OpenStreetMap lists only some of these: not the full list" : undefined}>{t.id === "my_list" ? "yours" : t.partial ? "OSM, part" : "OSM"}</small></label>
      ))}
      <h6>Facilities and water</h6>
      {TOGGLE.map((t) => (
        <label key={t.id}><input type="checkbox" checked={!!on[t.id] || loading.has(t.id)} onChange={() => toggle(t.id)} />{t.en}
          <small style={{ marginLeft: "auto", color: "var(--text-3)" }}>{t.id === "police" ? "store" : "OSM"}</small></label>
      ))}
    </div>
  ) : null;
  return { base, drawCircle, setDrawCircle, overlays, tools, layersMenu, heat };
}

/** The legend: only the layers on the map, each with its count and source. */
export function Legend({ r, overlays }: { r: AskResponse | null; overlays: Overlay[] }) {
  if (!r || (r.kind !== "answer" && r.kind !== "brief")) {
    if (!overlays.length) return null;
  }
  const ta = r?.lang === "ta";
  const pinned = r?.features.filter((f) => f.pinnable).length ?? 0;
  const byLayer = new Map<string, number>();
  for (const p of r?.context.points ?? []) byLayer.set(p.layer, (byLayer.get(p.layer) ?? 0) + 1);
  const osm = (r?.asOf.layers.some((l) => l.source === "OpenStreetMap") ?? false) || overlays.length > 0;
  return (
    <div className="amleg" aria-label="Legend">
      <ul>
        {r?.kind === "answer" && pinned > 0 && (
          <>
            <li><i style={{ background: CAT_COL.severe }} />{ta ? "கடுமையான" : "Severe"}<span style={{ flex: 1 }} /></li>
            <li><i style={{ background: CAT_COL.complaint }} />{ta ? "குடிமக்கள் புகார்" : "Citizen complaint"}</li>
            <li><i style={{ background: CAT_COL.other }} />{ta ? "பிற" : "Other"}<b>{pinned.toLocaleString("en-IN")} {ta ? "குறிகள்" : "on the map"}</b></li>
          </>
        )}
        {r && r.unplaced.length > 0 && <li><i style={{ background: "transparent", border: "1.5px dashed var(--text-3)" }} />{ta ? "துல்லிய இடம் இல்லை (குறிக்கவில்லை)" : "No exact place (not pinned)"}<b>{r.unplaced.length}</b></li>}
        {[...byLayer.entries()].map(([l, n]) => (
          <li key={l}><i className="glyph" style={{ borderRadius: l === "schools" || l === "colleges" ? 3 : "50%" }}>{LAYER_WORD[l as LayerId]?.letter ?? ""}</i>
            {cap(ta ? LAYER_WORD[l as LayerId]?.ta ?? l : LAYER_WORD[l as LayerId]?.en ?? l)}<b>{n}</b></li>
        ))}
        {(r?.context.rings.length ?? 0) > 0 && <li><i style={{ background: "rgba(255,210,74,.25)", border: "1.5px solid #FFD24A" }} />{ta ? "தூர வளையம்" : `Within ${Math.round(r!.context.rings[0].r)} m`}</li>}
        {(r?.context.lines.length ?? 0) > 0 && <li><i style={{ background: "#FFD24A", borderRadius: 2, height: 4 }} />{r!.context.lines[0].name}</li>}
        {overlays.map((o) => o.id === "news" ? (
          <li key={o.id}><i className="glyph news">N</i>{ta ? "செய்திகள் (30 நாள்)" : "News reports, 30 days"}<b>{o.features.length}</b>
            {!!o.unplaced && <small className="amleg-sub">{ta ? `+${o.unplaced} இடம் குறிப்பிடாதவை (குறிக்கவில்லை)` : `+${o.unplaced.toLocaleString("en-IN")} name no locality (not pinned)`}</small>}</li>
        ) : o.id.startsWith("live_") ? (
          <li key={o.id}><i className={`amlive k-${LIVE.find((l) => l.id === o.id)?.k}`} />{LIVE.find((l) => l.id === o.id)?.en}<b>{o.features.length}</b></li>
        ) : <li key={o.id}><i style={{ background: LAYER_COL[o.id as LayerId] ?? "#94A3B8" }} />{cap(ta ? LAYER_WORD[o.id as LayerId]?.ta ?? o.id : LAYER_WORD[o.id as LayerId]?.en ?? o.id.replace(/_/g, " "))}<b>{o.features.length}</b>
          {o.meta?.partial && <small className="amleg-sub">{ta ? "OpenStreetMap: முழுப் பட்டியல் அல்ல" : `OpenStreetMap, ${o.features.length.toLocaleString("en-IN")} ${o.meta.partial.what}, not the full list`}</small>}</li>)}
        {(r?.asOf.layers ?? []).filter((l) => l.partial && !overlays.some((o) => o.id === l.id)).map((l) => (
          <li key={`p-${l.id}`}><i style={{ background: LAYER_COL[l.id as LayerId] ?? "#94A3B8" }} />{ta ? l.ta : l.en}<small className="amleg-sub">{ta ? `OpenStreetMap இல் ${l.count} மட்டும்: முழுப் பட்டியல் அல்ல` : `OpenStreetMap, ${l.count.toLocaleString("en-IN")} ${l.partial!.what}, not the full list`}</small></li>
        ))}
        {r?.extra.rank && <li><i style={{ background: "#E0364A", borderRadius: "50%" }} />{ta ? "அதிகரிப்பு" : "Went up"}<i style={{ background: "#16A34A", borderRadius: "50%", marginLeft: 8 }} />{ta ? "குறைவு" : "Went down"}</li>}
        {r?.news && r.news.pins.length > 0 && !overlays.some((o) => o.id === "news") && (
          <li><i className="glyph news">N</i>{ta ? "இந்தச் சம்பவங்களின் செய்திகள்" : "News about these incidents"}<b>{r.news.pins.length}</b></li>
        )}
      </ul>
      <small>{ta ? "வார்டு எல்லைகள்: DataMeet சமூகத் தரவு, GCC அதிகாரப்பூர்வ வரைபடம் அல்ல." : "Ward boundaries: DataMeet community data, not an official GCC map."}{osm && overlays.some((o) => o.id !== "news") || r?.asOf.layers.some((l) => l.source === "OpenStreetMap") ? " Facilities © OpenStreetMap contributors." : ""}{overlays.some((o) => o.id === "news") || r?.news?.pins.length ? (ta ? " செய்தித் தலைப்புகள் வெளியீட்டாளர்களுக்குச் சொந்தமானவை." : " Headlines belong to their publishers.") : ""}</small>
    </div>
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
