"use client";

/*
 * The top of the officer's page, built from the Collector console's own parts so the two look and read alike: the band's count tiles
 * and the department snapshot beside them (the head of department with phone and email, the deadlines, where most work is), then the
 * large map (the Collector's SatMap, its default base map and Ask the Map, locked to the department by the server). The numbers are
 * the Collector console's own (its overview, filtered to this department), so the officer and the Collector always see the same
 * figures; the approval tile adds the officer's step. The Resolved tile is the officer's own count, by the definition of the Verified
 * list it opens (officer-day-13).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatMap, { exitMapFullscreen } from "@/components/collector/app/SatMap";
import AskOverlay from "@/components/collector/app/askmap/AskOverlay";
import { useMapChrome } from "@/components/collector/app/askmap/Chrome";
import { useMapAsk } from "@/components/collector/app/askmap/useMapAsk";
import { I } from "@/components/collector/app/icons";
import { Kpi } from "@/components/collector/app/Overview";
import { CAT_COL, Cnt, deptIcon, type Row } from "@/components/collector/app/lib";
import { labelLower } from "@/lib/period/day";
import type { Ctx } from "./OfficerApp";

const noop = () => undefined;
const shortName = (n: string) => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");

/** The band's four count tiles, the Collector's size (overview-map.css): severe, open, waiting for approval, resolved. */
export function HeroKpis({ c }: { c: Ctx }) {
  const d = c.ov.board;
  const k = c.ov.counts;
  const P = c.ov.periodInfo;
  let ix = 0;
  const iv = () => ({ "--i": ix++ }) as React.CSSProperties;
  return (
    <section className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
      <Kpi k="severe" icon="bell" tone="t-sev" label="Severe events" v={d.kpi.cur.severe} p={d.kpi.prev.severe} goodDown
        prevLabel={P.prev} style={iv()} onClick={() => c.openList(null, "Severe events", undefined, { sev: "Severe", tab: "all" })}
        tip="Your department's incidents rated severe (danger to life, major damage or many people affected), reported in the period." />
      <Kpi k="ongoing" icon="doc" tone="t-info" label="Open incidents" v={d.kpi.cur.ongoing} p={d.kpi.prev.ongoing} goodDown
        prevLabel={P.prev} style={iv()} note={`${d.kpi.cur.complaints.toLocaleString("en-IN")} complaints`}
        onClick={() => c.openList(null, "Open incidents", "open")}
        tip="Your department's incidents reported in the period that are not yet resolved." />
      <button className="kpi" data-k="approve" style={{ ...iv(), ["--kc" as string]: "var(--high)" }} onClick={() => c.openWork("new")}
        title="New grievances waiting for your approval. Click to approve them.">
        <span className="kpi-ic t-high"><I n="tasks" /></span>
        <span className="kpi-b">
          <span className="kpi-l">Waiting for your approval</span>
          <span className="kpi-r">
            <span className="kpi-n"><Cnt v={k.new} /></span>
            <span className={`kpi-d${k.newSerious ? " bad" : ""}`}><em>{k.newSerious.toLocaleString("en-IN")}</em><small>severe or high</small></span>
          </span>
        </span>
      </button>
      <ResolvedKpi c={c} label={resolvedLabel(P)} style={iv()} />
    </section>
  );
}

/**
 * The Resolved tile: the officer's own count (lib/officer/data.ts resolvedTile), by the definition of the list it opens, which holds the
 * cases the Collector verified and those the department closed itself. It showed the Collector overview's figure and opened a list titled
 * "Verified by the Collector" that held another number of other cases (officer-day-13).
 */
export function ResolvedKpi({ c, label, style }: { c: Pick<Ctx, "ov" | "openList">; label: string; style: React.CSSProperties }) {
  const r = c.ov.resolved;
  return (
    <Kpi k="resolved" icon="checkc" tone="t-low" label={label} v={r.cur} p={r.prev} series={r.series} prevLabel={c.ov.periodInfo.prev} style={style}
      onClick={() => c.openList(null, RESOLVED_LIST_TITLE, undefined, { tab: "verified" })}
      tip="Your department's grievances reported in the period that are resolved: verified by the Collector or closed by your department." />
  );
}
/**
 * The officer's Resolved tile counts the department's grievances first reported in the console's window (today since 12 AM, or the last
 * 7, 30 or 90 days back from now) that are now verified (resolvedTile, windowWhere on first_reported_at). It said "Resolved this week /
 * month / quarter" and "Resolved in 24 h": calendar words, and closings, neither of which it counts (fixall-board-resolved-01; the
 * Collector's tile and Ask District IQ were corrected the same way: console-sync-01, reviewerE-04). Tamil in i18n/ta.ts.
 */
export const resolvedLabel = (P: { label: string }) => `Resolved, reported ${/^last\b/i.test(P.label) ? "in " : ""}${labelLower(P.label)}`;

export const RESOLVED_LIST_TITLE = "Resolved: verified by the Collector or closed by your department";

// -------------------------------------------------------------- snapshot --

function Tile({ onClick, l, v, tone, title, txt }: { onClick?: () => void; l: string; v: React.ReactNode; tone?: string; title?: string; txt?: boolean }) {
  return (
    <button className={`stile${onClick ? "" : " static"}`} data-l={l} onClick={onClick} title={title ?? l} disabled={!onClick}>
      <small>{l}</small>
      <b className={txt ? "txt" : undefined} style={tone ? { color: tone } : undefined}>{v}</b>
    </button>
  );
}

/**
 * Beside the count tiles, as the Collector's department snapshot: the head of department (GCC Who's who: phone and email), what is past
 * its deadline or due within 24 hours, and the zone with the most open work. "Severe or high, still open" is not repeated here: the
 * severity card below counts the same incidents (the Collector's snapshot leaves it out for the same reason).
 */
export function DeptSnap({ c }: { c: Ctx }) {
  const s = c.ov.board.snapshot as Row;
  const k = c.ov.counts;
  const head = (s.contacts as Row[] | undefined)?.find((x) => x.dept_code === c.dept.code) ?? c.ov.head;
  const overdue = Number(s.overdue ?? k.overdue);
  const phone = head ? String(head.phone ?? "").split("/")[0].trim() : "";
  // three slim lines, as the Collector's band (owner, 28 Nov: "make the space for the KPI small as in the Collector console")
  return (
    <>
      <SnapTitleSlim c={c} />
      <div className="snap">
        <Tile l="Head of department" txt v={head ? `${String(head.name)}${phone ? ` · ${phone}` : ""}` : c.dept.head}
          title={head ? `${String(head.name)}, ${String(head.designation ?? "")}${head.email ? ` · ${String(head.email)}` : ""}. Click for every contact.` : "Click for every contact."}
          onClick={c.openContacts} />
        <Tile l={`Past deadline · ${k.due.toLocaleString("en-IN")} due in 24 h`} v={<Cnt v={overdue} />} tone={overdue ? "var(--high)" : undefined}
          title="Past deadline, still open: open incidents that have missed their resolution deadline. Click for the list. The due-in-24-hours count is beside its name."
          onClick={() => c.openList(null, "Past deadline, still open", "overdue")} />
        <Tile l="Most open work in" txt v={s.topZone ? `${s.topZone.name} · ${s.topZone.n}` : "—"}
          title={s.topZone ? `${s.topZone.name} zone has the most open incidents for your department. Click to show only it.` : undefined}
          onClick={s.topZone ? () => c.setZone(Number(s.topZone.zone)) : undefined} />
      </div>
    </>
  );
}

/** the snapshot's name, as the Collector's (hidden in the band by the Collector's own CSS, read by screen readers) */
function SnapTitleSlim({ c }: { c: Ctx }) {
  return (
    <div className="snap-t">
      <b><I n={deptIcon(c.dept.code)} />{shortName(c.dept.name)}</b>
      <small>Department snapshot · {c.ov.periodInfo.word} · {labelLower(c.ov.periodInfo.label)}</small>
    </div>
  );
}

// ------------------------------------------------------------------- map --

/**
 * The map, as on the Collector's Overview: no header, so the map starts at the card's top; its name, the layers and the Zones / Taluks
 * switch sit in the row under it. Ask the Map grows it over the page (Esc shrinks it back), locked to the department by the server.
 */
export function MapCard({ c, style }: { c: Ctx; style?: React.CSSProperties }) {
  const d = c.ov.board;
  const [layers, setLayers] = useState<Record<string, boolean>>({ severe: true, complaint: true, other: true, added: false, stations: false });
  const [mode, setMode] = useState<"zones" | "taluks">("zones");
  const ctx = useRef({ zone: c.zone, taluk: c.taluk });
  ctx.current = { zone: c.zone, taluk: c.taluk };
  const ask = useMapAsk(useCallback(() => ctx.current, []));
  const chrome = useMapChrome(ask);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    // the map card grows over the officer's page, as on the Collector's Overview; Esc shrinks it back
    box.current?.closest(".dic")?.classList.toggle("map-grown", ask.grown);
    if (!ask.grown) return;
    box.current?.closest(".body")?.scrollTo({ top: 0 });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".scrim")) ask.setGrown(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ask.grown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { box.current?.closest(".dic")?.classList.remove("map-grown"); }, []);
  const pins = useMemo(() => d.map.pins, [d.map.pins]);
  const view = c.taluk ? "taluks" : mode;
  // the pins drawn per layer, with the layer's total beside them when the map's pin limit cut it (as the Collector's legend, hunt2-ops-11)
  const LAYERS = [
    ["severe", "Severe", CAT_COL.severe, d.map.drawn.severe, d.map.layerCounts.severe],
    ["complaint", "Complaints", CAT_COL.complaint, d.map.drawn.complaint, d.map.layerCounts.complaint],
    ["other", "Other", CAT_COL.other, d.map.drawn.other, d.map.layerCounts.other]
  ] as const;
  const open = (id: string) => { exitMapFullscreen(); c.openGrievance(id); };
  return (
    <article className="card a-map" style={style} ref={box}>
      <div className="map-cb">
        <div className="map-wrap">
          <SatMap geo={c.geo} zoneCounts={d.map.zoneCounts} pins={pins} zone={c.zone} layers={layers} stations={[]} added={[]}
            mode={view} taluk={c.taluk} focus={null} onZone={(z) => c.setZone(z)} onTaluk={(t) => c.setTaluk(t)}
            onPin={open} onStation={noop} onItem={noop} zoneTip={c.zoneTip}
            ask={ask} grown={ask.grown} extraTools={ask.grown ? chrome.tools : undefined} base={chrome.base} overlays={chrome.overlays}
            drawCircle={chrome.drawCircle} onDrawn={() => chrome.setDrawCircle(false)} onAskOpen={open} heat={chrome.heat} />
          <AskOverlay ask={ask} role="officer" toast={c.toast} onOpen={open} layersMenu={chrome.layersMenu} overlays={chrome.overlays} />
          {view === "zones"
            ? <div className="map-heat"><span>Incidents by zone</span><div /><span><em>Fewer</em><em>More</em></span></div>
            : <div className="map-heat"><span>Colour = revenue taluk</span></div>}
        </div>
      </div>
      {/* the legend sits under the map, so nothing covers the map itself; each item turns its pins on or off */}
      <div className="map-leg2" role="group" aria-label="Show on the map">
        <h3 className="map-title"><I n="map" />{c.taluk ? `${c.talukName} taluk` : c.zoneName ?? `${c.dept.short} work in Chennai`}</h3>
        {LAYERS.map(([key, l, col, n, all]) => (
          <button key={key} className={layers[key] ? "" : "off"} aria-pressed={layers[key]} onClick={() => setLayers((x) => ({ ...x, [key]: !x[key] }))}
            title={n < all ? `Show or hide ${l.toLowerCase()} pins. ${n.toLocaleString("en-IN")} of ${all.toLocaleString("en-IN")} are drawn: the map draws the ${d.map.pinLimit} most urgent (open first, then the most severe).`
              : `Show or hide ${l.toLowerCase()} pins`}>
            <i style={{ background: col, color: col }} />{l}<b>{Number(n).toLocaleString("en-IN")}</b>{n < all && <small>of {all.toLocaleString("en-IN")}</small>}
          </button>
        ))}
        {d.map.unlocated > 0 && (
          <button className="unloc" onClick={() => c.openList(null, "Open incidents", "open")}
            title={`${d.map.unlocated.toLocaleString("en-IN")} of ${d.map.total.toLocaleString("en-IN")} incidents in this view have no exact place (district-wide or unknown), so they are not drawn as pins. Click for the open list.`}>
            <i className="ring" /><b>{d.map.unlocated.toLocaleString("en-IN")}</b>not on the map
          </button>
        )}
        <div className="seg sm map-seg" role="tablist" aria-label="Map areas">
          <button role="tab" aria-selected={view === "zones"} className={view === "zones" ? "on" : ""} disabled={!!c.taluk} onClick={() => setMode("zones")} title="GCC zones and wards">Zones</button>
          <button role="tab" aria-selected={view === "taluks"} className={view === "taluks" ? "on" : ""} onClick={() => setMode("taluks")} title="Revenue taluks (wards coloured by taluk)">Taluks</button>
        </div>
      </div>
    </article>
  );
}
