"use client";

/**
 * The grown map's own tools and legend (Ask the Map): Back to the answer, the circle tool, Layers (facility and water
 * layers from OpenStreetMap and the store), Satellite / Streets; and a legend built only from what is on the map,
 * with counts and sources, including the ward boundaries' origin. The console's existing + / − / fit stay as they are.
 */
import { useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import { LAYER_WORD } from "@/lib/map/words";
import type { LayerId } from "@/lib/map/types";
import { I } from "../icons";
import { CAT_COL } from "../lib";
import type { MapAsk } from "./useMapAsk";

const TOGGLE: { id: LayerId; en: string }[] = [
  { id: "schools", en: "Schools" }, { id: "colleges", en: "Colleges" }, { id: "hospitals", en: "Hospitals" }, { id: "fire_stations", en: "Fire stations" },
  { id: "police", en: "Police stations" }, { id: "rail_metro", en: "Rail and metro" }, { id: "water_bodies", en: "Lakes and ponds" }, { id: "waterways", en: "Rivers and canals" }
];
export type Overlay = { id: string; kind: string; features: { id: string; name: string | null; lat?: number; lon?: number; lines?: [number, number][][]; polys?: [number, number][][][] }[] };

export function useMapChrome(ask: MapAsk | null) {
  const [base, setBase] = useState<"sat" | "streets">("sat");
  const [drawCircle, setDrawCircle] = useState(false);
  const [heat, setHeat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [on, setOn] = useState<Record<string, Overlay>>({});
  const toggle = async (id: string) => {
    if (on[id]) { setOn((o) => { const n = { ...o }; delete n[id]; return n; }); return; }
    const r = await fetch(`/api/map/layers/${id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) return;
    const features = (r.features as Record<string, unknown>[]).map((f) => ({ id: String(f.id), name: (f.name as string) ?? null, lat: f.lat as number | undefined, lon: f.lon as number | undefined,
      lines: f.lines as [number, number][][] | undefined, polys: f.polys as [number, number][][][] | undefined }));
    setOn((o) => ({ ...o, [id]: { id, kind: r.kind, features } }));
  };
  const overlays = Object.values(on);
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
      <h6>Facilities and water</h6>
      {TOGGLE.map((t) => (
        <label key={t.id}><input type="checkbox" checked={!!on[t.id]} onChange={() => toggle(t.id)} />{t.en}
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
        {overlays.map((o) => <li key={o.id}><i style={{ background: "#94A3B8" }} />{o.id.replace(/_/g, " ")}<b>{o.features.length}</b></li>)}
      </ul>
      <small>{ta ? "வார்டு எல்லைகள்: DataMeet சமூகத் தரவு, GCC அதிகாரப்பூர்வ வரைபடம் அல்ல." : "Ward boundaries: DataMeet community data, not an official GCC map."}{osm ? " Facilities © OpenStreetMap contributors." : ""}</small>
    </div>
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
