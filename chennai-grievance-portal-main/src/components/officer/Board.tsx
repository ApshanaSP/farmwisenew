"use client";

/*
 * The officer console's first page, laid out like the Collector console's Overview with the
 * department selected: headline tiles, the map down the left, the department snapshot strip,
 * then severity, the officer's own work queue and the department's news. The numbers are the
 * Collector console's own (its overview, filtered to this department), so the officer and the
 * Collector always see the same figures; the work queue adds the officer's steps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatMap from "@/components/collector/app/SatMap";
import AskOverlay from "@/components/collector/app/askmap/AskOverlay";
import { useMapChrome } from "@/components/collector/app/askmap/Chrome";
import { useMapAsk } from "@/components/collector/app/askmap/useMapAsk";
import { I, type IconName } from "@/components/collector/app/icons";
import { Kpi, OfficerCard } from "@/components/collector/app/Overview";
import { Cnt, Empty, deptIcon, fullTitle, rel, type Row } from "@/components/collector/app/lib";
import type { Ctx } from "./OfficerApp";
import { BeforeRainStrip } from "./BeforeRainTasks";
import { OfficerAttention } from "./OfficerAttention";

const noop = () => undefined;
const shortName = (n: string) => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");

export function OverviewPage({ c, goGrievances, openContacts, openNews }: {
  c: Ctx; goGrievances: (tab: "new" | "action") => void; openContacts: () => void; openNews: () => void;
}) {
  const d = c.ov.board;
  const k = c.ov.counts;
  const P = c.ov.periodInfo;
  let ix = 0;
  const iv = () => ({ "--i": ix++ }) as React.CSSProperties;
  const daily = c.ov.period === "daily";
  return (
    <>
      {/* Rain Rehearsal: the jobs the Collector sent before a heavy rain (only while there are some) */}
      <BeforeRainStrip />
      <section className="kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        <Kpi k="severe" icon="bell" tone="t-sev" label="Severe events" v={d.kpi.cur.severe} p={d.kpi.prev.severe} goodDown series={d.kpi.series.severe}
          prevLabel={P.prev} style={iv()} onClick={() => c.openList(null, "Severe events", undefined, { sev: "Severe", tab: "all" })}
          tip="Your department's incidents rated severe (danger to life, major damage or many people affected), reported in the period." />
        <Kpi k="ongoing" icon="doc" tone="t-info" label="Open incidents" v={d.kpi.cur.ongoing} p={d.kpi.prev.ongoing} goodDown series={d.kpi.series.ongoing}
          prevLabel={P.prev} style={iv()} note={`${d.kpi.cur.complaints.toLocaleString("en-IN")} citizen complaints`}
          onClick={() => c.openList(null, "Open incidents", "open")}
          tip="Your department's incidents reported in the period that are not yet resolved." />
        <button className="kpi" style={iv()} onClick={() => goGrievances("new")} title="New grievances waiting for your approval. Click to approve them.">
          <span className="kpi-ic t-high"><I n="tasks" /></span>
          <span className="kpi-b">
            <span className="kpi-l">Waiting for your approval</span>
            <span className="kpi-r"><span>
              <span className="kpi-n"><Cnt v={k.new} /></span>
              <span className={`kpi-d${k.newSerious ? " bad" : ""}`}><em>{k.newSerious.toLocaleString("en-IN")}</em>severe or high</span>
            </span></span>
          </span>
        </button>
        <Kpi k="resolved" icon="checkc" tone="t-low" label={daily ? "Resolved in 24 h" : `Resolved this ${P.unit.toLowerCase()}`} v={d.kpi.cur.resolved}
          p={d.kpi.prev.resolved} series={d.kpi.series.resolved} prevLabel={P.prev} style={iv()}
          onClick={() => c.openList(null, "Verified by the Collector", undefined, { tab: "verified" })}
          tip="Your department's incidents reported in the period that are resolved." />
      </section>

      {/* by severity and My Work share one card two columns wide (a switch at its top), as on the Collector's Overview */}
      <section className="p1 op1 att2">
        <MapCard c={c} style={iv()} />
        <article className="card a-snap" style={iv()}><DeptSnap c={c} openContacts={openContacts} /></article>
        <article className="card a-sev att" style={iv()}><OfficerAttention c={c} goGrievances={goGrievances} /></article>
        <article className="card a-brief" style={iv()}><NewsCard c={c} openNews={openNews} /></article>
      </section>
    </>
  );
}

// ------------------------------------------------------------------- map --

function MapCard({ c, style }: { c: Ctx; style: React.CSSProperties }) {
  const d = c.ov.board;
  const [layers, setLayers] = useState<Record<string, boolean>>({ severe: true, complaint: true, other: true, added: false, stations: false });
  // Ask the Map, locked to the officer's department by the server (the department comes from the database)
  const ctx = useRef({ zone: c.zone, taluk: c.taluk });
  ctx.current = { zone: c.zone, taluk: c.taluk };
  const ask = useMapAsk(useCallback(() => ctx.current, []));
  const chrome = useMapChrome(ask);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    // the map card grows over the officer's page, as on the Collector's Overview; Esc shrinks it back
    box.current?.closest(".dic")?.classList.toggle("map-grown", ask.grown);
    if (!ask.grown) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".scrim")) ask.setGrown(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ask.grown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { box.current?.closest(".dic")?.classList.remove("map-grown"); }, []);
  const pins = useMemo(() => d.map.pins, [d.map.pins]);
  const LAYERS = [
    ["severe", "Severe", "#F2555A", d.map.layerCounts.severe], ["complaint", "Complaints", "#FFA114", d.map.layerCounts.complaint],
    ["other", "Other", "#4D8DFF", d.map.layerCounts.other]
  ] as const;
  return (
    <article className="card a-map" style={style} ref={box}>
      <div className="ch"><I n="map" /><h3>{c.taluk ? `${c.talukName} taluk` : c.zoneName ?? `${c.dept.short} work in Chennai`}</h3></div>
      <div className="map-cb">
        <div className="map-wrap">
          <SatMap geo={c.geo} zoneCounts={d.map.zoneCounts} pins={pins} zone={c.zone} layers={layers} stations={[]} added={[]}
            mode={c.taluk ? "taluks" : "zones"} taluk={c.taluk} focus={null} onZone={(z) => c.setZone(z)} onTaluk={(t) => c.setTaluk(t)}
            onPin={(id) => c.openGrievance(id)} onStation={noop} onItem={noop} zoneTip={c.zoneTip}
            ask={ask} grown={ask.grown} extraTools={ask.grown ? chrome.tools : undefined} base={chrome.base} overlays={chrome.overlays}
            drawCircle={chrome.drawCircle} onDrawn={() => chrome.setDrawCircle(false)} onAskOpen={(id) => c.openGrievance(id)} heat={chrome.heat} />
          <AskOverlay ask={ask} role="officer" toast={c.toast} onOpen={(id) => c.openGrievance(id)} layersMenu={chrome.layersMenu} overlays={chrome.overlays} compact />
          {!c.taluk && <div className="map-heat"><span>Incidents by zone</span><div /><span><em>Fewer</em><em>More</em></span></div>}
        </div>
      </div>
      <div className="map-leg2" role="group" aria-label="Show on the map">
        {LAYERS.map(([key, l, col, n]) => (
          <button key={key} className={layers[key] ? "" : "off"} aria-pressed={layers[key]} onClick={() => setLayers((x) => ({ ...x, [key]: !x[key] }))}
            title={`Show or hide ${l.toLowerCase()} pins`}>
            <i style={{ background: col }} />{l}<b>{Number(n).toLocaleString("en-IN")}</b>
          </button>
        ))}
      </div>
    </article>
  );
}

// -------------------------------------------------------------- snapshot --

function Tile({ onClick, l, v, tone, title, txt }: { onClick?: () => void; l: string; v: React.ReactNode; tone?: string; title?: string; txt?: boolean }) {
  return (
    <button className={`stile${onClick ? "" : " static"}`} onClick={onClick} title={title ?? l} disabled={!onClick}>
      <small>{l}</small>
      <b className={txt ? "txt" : undefined} style={tone ? { color: tone } : undefined}>{v}</b>
    </button>
  );
}

/** The department snapshot strip of the Collector console, with the officer's own deadlines. */
function DeptSnap({ c, openContacts }: { c: Ctx; openContacts: () => void }) {
  const s = c.ov.board.snapshot as Row;
  const k = c.ov.counts;
  const head = (s.contacts as Row[] | undefined)?.find((x) => x.dept_code === c.dept.code) ?? c.ov.head;
  const period = `${c.ov.periodInfo.word} · ${c.ov.periodInfo.label.toLowerCase()}`;
  return (
    <>
      <div className="snap-t">
        <b><I n={deptIcon(c.dept.code)} />{shortName(c.dept.name)}</b>
        <small>Department snapshot · {period}</small>
        <button className="more" onClick={openContacts}><I n="phone" />All contacts</button>
      </div>
      <div className="snap">
        {head ? <OfficerCard o={head} label="Department head (GCC)" compact />
          : <div className="officer compact"><span className="avatar">{c.dept.short.slice(0, 2).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}><small className="olabel">Department head</small><b title={c.dept.head}>{c.dept.head}</b><small className="desig">{c.dept.org}</small></span></div>}
        <Tile l="Severe or high, still open" v={<Cnt v={Number(s.serious ?? k.serious)} />} tone={Number(s.serious ?? k.serious) ? "var(--sev)" : undefined}
          title="Open incidents rated severe or high, reported in the period. Click for the list." onClick={() => c.openList(null, "Severe or high, still open", "serious")} />
        <Tile l="Past deadline, still open" v={<Cnt v={Number(s.overdue ?? k.overdue)} />} tone={Number(s.overdue ?? k.overdue) ? "var(--high)" : undefined}
          title="Open incidents that have missed their resolution deadline. Click for the list." onClick={() => c.openList(null, "Past deadline, still open", "overdue")} />
        <Tile l="Due in 24 hours" v={<Cnt v={k.due} />} tone={k.due ? "var(--med)" : undefined}
          title="Open incidents not yet late whose deadline falls in the next 24 hours. Click for the list." onClick={() => c.openList(null, "Due within 24 hours", "due")} />
        <Tile l="Most open work in" txt v={s.topZone ? `${s.topZone.name} · ${s.topZone.n}` : "—"} tone="var(--accent-2)"
          title={s.topZone ? `${s.topZone.name} zone has the most open incidents for your department. Click to show only it.` : undefined}
          onClick={s.topZone ? () => c.setZone(Number(s.topZone.zone)) : undefined} />
      </div>
    </>
  );
}

// The severity and work cards are in OfficerAttention.tsx.

// ------------------------------------------------------------------ news --

/** Today's Briefing: the news the monitor linked to the department's incidents. */
function NewsCard({ c, openNews }: { c: Ctx; openNews: () => void }) {
  const news = c.ov.board.news as Row[];
  const seen = new Set<string>();
  const rows = news.filter((r) => { const t = fullTitle(r).toLowerCase(); return seen.has(t) ? false : (seen.add(t), true); });
  return (
    <>
      <div className="ch"><I n="news" /><h3>Today&apos;s Briefing</h3>
        <button className="more" onClick={openNews}>See more<I n="right" /></button>
      </div>
      <div className="fitlist">
        {rows.length ? rows.slice(0, 10).map((i) => (
          <button key={i.id} className="brief" onClick={() => c.openGrievance(i.id, "news")}>
            <span className="bic t-high"><I n={"news" as IconName} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b>{fullTitle(i)}</b>
              <span className="loc">{(i.outletNames as string[] | undefined)?.length ? (i.outletNames as string[]).join(", ") : "News"} · {i.zone_name ?? "Chennai"} · {rel(i.t, c.now)}</span>
            </span>
          </button>
        )) : <Empty>No news about {c.dept.short} {c.ov.period === "daily" ? "in the last 24 hours" : "in this period"}.</Empty>}
      </div>
    </>
  );
}
