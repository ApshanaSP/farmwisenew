"use client";

import type { Overview as OverviewData, Station } from "@/lib/collector/intel";
import type { MapGeo } from "@/lib/collector/geo";
import { I, type IconName } from "./icons";
import SatMap, { type MapStation } from "./SatMap";
import {
  CAT_COL, Chart, Cnt, Empty, HBars, SEVS, SEV_HEX, Sources, deptIcon, fmtDate, fmtTime, fullTitle,
  fmtShort, ms, plural, rel, sevTone, sum, type Row
} from "./lib";
import type { Console } from "./CollectorApp";
import type { Insights } from "@/lib/collector/insights";
import { MarketsCard } from "./Insights";
import { AddedRow } from "./Added";
import { ConflictList, DiffBadge, hasConflict } from "./Conflicts";
import { NextDoorList, nextDoorCount } from "./Nearby";
import { useState } from "react";
import { AttentionCard } from "./Attention";
import AskOverlay from "./askmap/AskOverlay";
import { useMapChrome } from "./askmap/Chrome";
import dynamic from "next/dynamic";
import type { RainLayer } from "./rehearsal/rainLayer";

// Rain & flooding loads only when it is opened (the top bar's Rain button, the rain band, Ask the Map)
const RainView = dynamic(() => import("./rehearsal/RainView"), { ssr: false });
import { METRICS, labelled, shortWindow } from "@/lib/reference/metrics";

// =================================================================== page 1 ==

/** The KPI tiles, in the order the Collector chose (Customize). */
function useKpis(d: OverviewData, c: Console) {
  const P = d.periodInfo;
  let ix = 0;
  const iv = () => ({ "--i": ix++ }) as React.CSSProperties;
  // With a department selected, open complaints and ongoing incidents are nearly the same
  // things counted twice (each complaint is usually one incident), so they become one tile.
  const merged = !!c.dept;
  const K = d.kpi.cur as Record<string, number>;
  const KPIS: Record<string, React.ReactNode> = {
    severe: <Kpi key="severe" k="severe" icon="bell" tone="t-sev" label="Severe events" v={d.kpi.cur.severe} p={d.kpi.prev.severe}
      goodDown prevLabel={P.prev} style={iv()} onClick={() => c.openList({ sev: "Severe" }, "Severe events")} sub={split(K.severe_open, "still open", K.severe - K.severe_open, "closed")}
      tip="Incidents rated severe (danger to life, major damage or many people affected), reported in the period, open or closed." />,
    complaints: merged ? null : <Kpi key="complaints" k="complaints" icon="chat" tone="t-high" label="Open complaints" v={d.kpi.cur.complaints}
      p={d.kpi.prev.complaints} goodDown prevLabel={P.prev} style={iv()} sub={`on ${plural(K.complaint_inc, "open incident")}`}
      onClick={() => c.openList({ status: "open", sort: "c" }, "Open complaints")}
      tip="Citizen complaints on incidents that are still open. One incident can have several complaints." />,
    ongoing: <Kpi key="ongoing" k="ongoing" icon="doc" tone="t-info" label={merged ? "Open incidents" : "Ongoing incidents"} v={d.kpi.cur.ongoing} p={d.kpi.prev.ongoing}
      goodDown prevLabel={P.prev} style={iv()} sub={`${fmtN(K.urgent)} of them severe or high`} onClick={() => c.openList({ status: "open", sort: "sev", dir: 1 }, "Open incidents")}
      note={merged ? `${d.kpi.cur.complaints.toLocaleString("en-IN")} complaints` : undefined}
      tip="Incidents reported in the period that are not yet resolved. The same incidents are split by severity in the card below." />,
    resolved: <Kpi key="resolved" k="resolved" icon="checkc" tone="t-low" label={period1(c) ? "Resolved today" : `Resolved this ${P.unit.toLowerCase()}`} v={d.kpi.cur.resolved}
      p={d.kpi.prev.resolved} prevLabel={P.prev} style={iv()} sub={K.reported ? `${Math.round((100 * K.resolved) / K.reported)}% of ${fmtN(K.reported)} reported` : undefined}
      onClick={() => c.openList({ status: "Resolved" }, "Resolved incidents")}
      tip="Incidents reported in the period that the department has already resolved." />
  };
  return c.layout.kpis.filter((k) => KPIS[k]).map((k) => KPIS[k]);
}

const fmtN = (n: number) => Number(n ?? 0).toLocaleString("en-IN");
/** "5 still open · 4 closed": a tile's number split in two (a part that is 0 is left out). */
const split = (a: number, al: string, b: number, bl: string) =>
  [a ? `${fmtN(a)} ${al}` : "", b ? `${fmtN(b)} ${bl}` : ""].filter(Boolean).join(" · ") || undefined;

/** Page 1's ocean band, under the greeting: the four counts, and the snapshot beside them. The briefing lives on page 2. */
export function HeroBody({ d, c }: { d: OverviewData; c: Console }) {
  const kpis = useKpis(d, c);
  const snap = c.layout.panels.snapshot;
  if (!kpis.length && !snap) return null;
  return (
    <div className={`hero-b${snap && kpis.length ? "" : " one"}`}>
      {kpis.length > 0 && <section className="kpis" style={{ gridTemplateColumns: `repeat(${kpis.length},minmax(0,1fr))` }}>{kpis}</section>}
      {snap && (
        <div className="hsnap">
          {d.snapshot.kind === "dept" ? <DeptSnap d={d} c={c} /> : d.snapshot.kind === "area" ? <AreaSnap d={d} c={c} /> : <DistrictSnap d={d} c={c} />}
        </div>
      )}
    </div>
  );
}

export function Page1({ d, c }: { d: OverviewData; c: Console }) {
  const env = useEnv(d, c.geo, c);
  const chrome = useMapChrome(c.mapAsk ?? null);
  // Rain & flooding: the map grows, and draws the rain view's streets and reports instead of the console's pins
  const rv = c.rainView?.open ? c.rainView : null;
  const [rainLayer, setRainLayer] = useState<RainLayer | null>(null);
  const L = c.layout;
  let ix = 4;
  const iv = () => ({ "--i": ix++ }) as React.CSSProperties;
  const addedPins = d.added.pins;

  // Under the band the map leads: it takes the left half and more, full height; by severity (what is urgent) and my
  // tasks (what to check) stack beside it, and the latest news runs down the right. The counts live in the band above.
  const W: Record<string, string> = { map: "1.3fr", sev: "1fr", tasks: "1fr", brief: "1.12fr" };
  const cols = ([["map", L.panels.map], ["sev", L.panels.severity], ["tasks", L.panels.tasks], ["brief", L.panels.brief]] as const)
    .filter(([, on]) => on).map(([k]) => k as string);
  // by severity and my tasks share one full-height card (a switch at its top) when both are on: each list gets the
  // whole column instead of half of it (Attention.tsx)
  const both = cols.includes("sev") && cols.includes("tasks");
  const stack = both ? ["sev"] : cols.filter((k) => k === "sev" || k === "tasks");
  const r0 = ["map"], r1 = ["map"];
  if (stack.length) { r0.push(stack[0]); r1.push(stack[1] ?? stack[0]); }
  if (cols.includes("brief")) { r0.push("brief"); r1.push("brief"); }
  const grid: React.CSSProperties = cols.includes("map") && cols.length > 1 ? {
    gridTemplateColumns: ["minmax(0,1.9fr)", ...r0.slice(1).map((k) => (k === "brief" ? "minmax(0,1fr)" : "minmax(0,1.15fr)"))].join(" "),
    gridTemplateRows: "minmax(0,1.15fr) minmax(0,.85fr)",
    gridTemplateAreas: `"${r0.join(" ")}" "${r1.join(" ")}"`
  } : {
    gridTemplateColumns: cols.map((k) => `minmax(0,${W[k]})`).join(" "),
    gridTemplateRows: "minmax(0,1fr)",
    gridTemplateAreas: `"${cols.join(" ")}"`
  };
  const LAYERS = [
    ["severe", "Severe", CAT_COL.severe, d.map.layerCounts.severe], ["complaint", "Complaints", CAT_COL.complaint, d.map.layerCounts.complaint],
    ["other", "Other", CAT_COL.other, d.map.layerCounts.other]
  ] as const;

  return (
    <>
      <section className="p1" style={grid}>
        {L.panels.map && (
          <article className="card a-map" style={iv()}>
            {/* no header: the map takes the card; its name and the Zones/Taluks switch sit in the row under it */}
            <div className="map-cb">
              <div className="map-wrap">
                <SatMap geo={c.geo} zoneCounts={d.map.zoneCounts} pins={d.map.pins} zone={d.zone} layers={c.layers} stations={env.mapStations}
                  added={addedPins} onItem={(i) => c.openItem(i)}
                  mode={c.mapMode} taluk={c.taluk} focus={c.focus}
                  onZone={(z) => c.setZone(z)} onTaluk={(t) => c.setTaluk(t)} onPin={(id) => c.openInc(id)} zoneTip={c.zoneTip}
                  onStation={(st) => { c.setEnvSel(st.kind, st.id); c.setPage("environment"); c.toast(`${st.name} selected on the Environment page.`); }}
                  ask={rv ? null : c.mapAsk} grown={!!rv || !!c.mapAsk?.grown} extraTools={!rv && c.mapAsk?.grown ? chrome.tools : undefined}
                  base={rv ? "streets" : chrome.base} overlays={rv ? undefined : chrome.overlays}
                  drawCircle={!rv && chrome.drawCircle} onDrawn={() => chrome.setDrawCircle(false)} onAskOpen={(id) => c.openInc(id)} heat={!rv && chrome.heat}
                  rain={rv ? rainLayer : null} />
                {rv ? (
                  <RainView key={rv.open!.seq} geo={c.geo} api={rv.api} start={rv.open!} onClose={rv.close} onLayer={setRainLayer}
                    onOpenIncident={(id) => c.openInc(id)} toast={c.toast} escRef={rv.esc} />
                ) : c.mapAsk && (
                  <AskOverlay ask={c.mapAsk} role="collector" toast={c.toast} onOpen={(id) => c.openInc(id)} layersMenu={chrome.layersMenu} overlays={chrome.overlays} />
                )}
                {c.mapMode === "zones"
                  ? <div className="map-heat"><span>Incidents by zone</span><div /><span><em>Fewer</em><em>More</em></span></div>
                  : <div className="map-heat"><span>Colour = revenue taluk</span></div>}
              </div>
            </div>
            {/* the legend sits under the map, so nothing covers the map itself; each item turns its pins on or off */}
            <div className="map-leg2" role="group" aria-label="Show on the map">
              <h3 className="map-title"><I n="map" />{c.taluk ? <>{c.talukName(c.taluk)} taluk</> : c.zoneName ? c.zoneName : "Chennai District"}</h3>
              {LAYERS.map(([k, l, col, n]) => (
                <button key={k} className={c.layers[k] ? "" : "off"} aria-pressed={c.layers[k]} onClick={() => c.toggleLayer(k)} title={`Show or hide ${l.toLowerCase()} pins`}>
                  <i style={{ background: col, color: col }} />{l}<b>{n.toLocaleString("en-IN")}</b>
                </button>
              ))}
              <button className={c.layers.added ? "" : "off"} aria-pressed={c.layers.added} onClick={() => c.toggleLayer("added")}
                title="Items from sources you added that name a place in or near Chennai">
                <i className="dia" style={{ background: "var(--ai)" }} />Added<b>{addedPins.length}</b>
              </button>
              <button className={c.layers.stations ? "" : "off"} aria-pressed={c.layers.stations} onClick={() => c.toggleLayer("stations")}
                title="Air-quality stations, rain gauges and lakes">
                <i className="sq" style={{ background: "linear-gradient(90deg,#34D399 33%,#7FD3E6 33% 66%,#3B82F6 66%)" }} />Stations<b>{env.mapStations.length}</b>
              </button>
              {/* not pinned: a district-wide or locality-only place would draw a false hotspot (see PINNABLE in intel.ts) */}
              {d.map.unlocated > 0 && (
                <button className="unloc" onClick={() => c.openList({ place: "unlocated", sort: "sev", dir: 1 }, "Incidents with no exact place")}
                  title={`${d.map.unlocated.toLocaleString("en-IN")} of ${d.map.total.toLocaleString("en-IN")} incidents in this view have no exact place (district-wide or unknown), so they are not drawn as pins. Click for the list.`}>
                  <i className="ring" /><b>{d.map.unlocated.toLocaleString("en-IN")}</b>not on the map
                </button>
              )}
              <div className="seg sm map-seg" role="tablist" aria-label="Map areas">
                <button className={c.mapMode === "zones" ? "on" : ""} onClick={() => c.setMapMode("zones")} title="GCC zones and wards">Zones</button>
                <button className={c.mapMode === "taluks" ? "on" : ""} onClick={() => c.setMapMode("taluks")} title="Revenue taluks (wards coloured by taluk)">Taluks</button>
              </div>
            </div>
          </article>
        )}

        {both ? <article className="card a-sev att" style={iv()}><AttentionCard d={d} c={c} /></article> : <>
          {L.panels.severity && <article className="card a-sev att" style={iv()}><AttentionCard d={d} c={c} only="sev" /></article>}
          {L.panels.tasks && <article className="card a-tasks att" style={iv()}><AttentionCard d={d} c={c} only="tasks" /></article>}
        </>}
        {L.panels.brief && <article className="card a-brief" style={iv()}><BriefCard d={d} c={c} /></article>}
      </section>
    </>
  );
}

export function Kpi({ k, icon, tone, label, v, p, goodDown, prevLabel, style, onClick, tip, note, sub }: {
  k: string; icon: IconName; tone: string; label: string; v: number; p: number; goodDown?: boolean;
  /** no longer drawn (the tiles say the change in words); kept so callers need not change */ series?: number[];
  prevLabel: string; style: React.CSSProperties; onClick: () => void;
  /** what the number counts, in plain words (hover) */ tip?: string; /** a second fact shown after the label */ note?: string;
  /** the breakdown under the number: "5 still open · 4 closed" */ sub?: string;
}) {
  const diff = v - p;
  const same = diff === 0;
  const cls = same ? "" : (goodDown ? diff < 0 : diff > 0) ? "good" : "bad";
  const than = prevLabel.replace(/^prev\. /, "the previous ");
  return (
    <button className="kpi" style={{ ...style, ["--kc" as string]: KC[tone] ?? "var(--accent)" }} onClick={onClick}
      title={tip ? `${tip}${sub ? ` (${sub}.)` : ""} Click for the list.` : sub}>
      <span className={`kpi-ic ${tone}`}><I n={icon} /></span>
      <span className="kpi-b">
        <span className="kpi-l">{label}{note && <em className="kpi-note">· {note}</em>}</span>
        <span className="kpi-r">
          <span className={`kpi-n ${k === "severe" ? "c-sev" : ""}`}><Cnt v={v} /></span>
          <span className={`kpi-d ${cls}`} title={`${v.toLocaleString("en-IN")} now, ${p.toLocaleString("en-IN")} ${prevLabel}`}>
            {same ? <em>No change</em>
              : <em><I n={diff > 0 ? "up" : "down"} />{Math.abs(diff).toLocaleString("en-IN")} {diff > 0 ? "more" : "fewer"}</em>}
            <small>{same ? `from ${than}` : `than ${than}`}</small>
          </span>
        </span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </span>
    </button>
  );
}

/** The KPI's edge colour, from its tone. */
const KC: Record<string, string> = { "t-sev": "var(--sev)", "t-high": "var(--high)", "t-info": "var(--accent)", "t-low": "var(--low)" };

// The severity and tasks cards are in Attention.tsx.

// ------------------------------------------------------------ snapshot --

function Tile({ onClick, l, v, tone, title, txt }: { onClick?: () => void; l: string; v: React.ReactNode; tone?: string; title?: string; txt?: boolean }) {
  return (
    <button className={`stile${onClick ? "" : " static"}`} onClick={onClick} title={title ?? l} disabled={!onClick}>
      <small>{l}</small>
      <b className={txt ? "txt" : undefined} style={tone ? { color: tone } : undefined}>{v}</b>
    </button>
  );
}

function SnapTitle({ icon, title, sub, more }: { icon: IconName; title: string; sub: string; more?: React.ReactNode }) {
  return (
    <div className="snap-t">
      <b><I n={icon} />{title}</b>
      <small>{sub}</small>
      {more}
    </div>
  );
}

/**
 * The two tiles every snapshot shares. None repeats the KPI tiles above: they count open
 * incidents that are severe or high, or past their deadline. (What is only in the news is a
 * tab of Latest news, where the reports can be read.)
 */
function CommonTiles({ s, c }: { s: { overdue: number }; c: Console }) {
  const p = c.periodLabel.toLowerCase();
  // "Severe or high, still open" is not repeated here: the severity card beside it counts the same incidents
  return (
    <>
      <Tile l={`Past deadline, still open · ${shortWindow(c.period)}`} v={<Cnt v={s.overdue} />} tone={s.overdue ? "var(--high)" : undefined}
        title={`${labelled("past_deadline", c.period)}: ${METRICS.past_deadline.measure}. Click for the list.`}
        onClick={() => c.openList({ status: "overdue", sort: "sev", dir: 1 }, "Open and past deadline")} />
    </>
  );
}

/** "Daily · last 24 hours": the period's name and what it covers. */
const periodSub = (c: Console) => `${PERIOD_NAME[c.period]} · ${c.periodLabel.toLowerCase()}`;
const period1 = (c: Console) => c.period === "daily";
const PERIOD_NAME: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" };

function DistrictSnap({ d, c }: { d: OverviewData; c: Console }) {
  const s = d.snapshot as Extract<OverviewData["snapshot"], { kind: "district" }>;
  const top = s.topZones.map((z) => z.name);
  const p = c.periodLabel.toLowerCase();
  return (
    <>
      <SnapTitle icon="chart" title="District Snapshot" sub={`${periodSub(c)} · hover a tile for what it counts`} />
      <div className="snap">
        <Tile l="Most serious zones" txt v={top.join(", ") || "None"} tone="var(--accent-2)"
          title={`GCC zones with the most severe and high incidents reported in the ${p} (a severe incident counts 3, a high one 1). ` +
            `Click to show ${top[0] ?? "the first zone"}.`}
          onClick={s.topZones[0] ? () => c.setZone(s.topZones[0].zone) : undefined} />
        <CommonTiles s={s} c={c} />
        <Tile l="Severe, not yet checked" v={<Cnt v={s.critical} />} tone={s.critical ? "var(--sev)" : undefined}
          title="Open severe incidents that no officer has confirmed on the ground yet (any date). Click for the list."
          onClick={() => c.openList({ status: "critical", scope: "all" }, "Severe, not yet checked")} />
      </div>
    </>
  );
}

export function OfficerCard({ o, label, compact }: { o: Row; label?: string; compact?: boolean }) {
  const phones = String(o.phone ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  const initials = String(o.name).replace(/^(Dr\.?|Tmt\.?|Thiru\.?)\s*/i, "").split(/[\s.]+/).filter((x) => x.length > 1).slice(0, 2).map((x) => x[0]).join("");
  return (
    <div className={`officer${compact ? " compact" : ""}`}>
      <span className="avatar">{initials || "GC"}</span>
      <span style={{ minWidth: 0 }}>
        {label && <small className="olabel">{label}</small>}
        <b title={o.name}>{o.name}</b>
        <small className="desig" title={o.designation}>{o.designation}</small>
        <span className="ocontact">
          {phones.slice(0, compact ? 1 : 2).map((p) => <a key={p} href={`tel:${/^\d{8}$/.test(p) ? "044" + p : p.replace(/[^\d+]/g, "")}`}>{p}</a>)}
          {o.email && <a href={`mailto:${String(o.email).split(/[,\s/]+/)[0]}`} title={String(o.email).split(/[,\s/]+/)[0]}>
            {compact ? "Email" : String(o.email).split(/[,\s/]+/)[0]}</a>}
        </span>
      </span>
    </div>
  );
}

function AreaSnap({ d, c }: { d: OverviewData; c: Console }) {
  const s = d.snapshot as Extract<OverviewData["snapshot"], { kind: "area" }>;
  return (
    <>
      <SnapTitle icon="pin" title={c.zoneName ?? "Zone"} sub={`Zone snapshot · ${periodSub(c)}`} />
      <div className="snap">
        {s.zoneOfficer ? <OfficerCard o={s.zoneOfficer} label="Zonal officer (GCC)" compact />
          : <div className="officer compact"><span className="avatar">ZO</span><span><b>Zonal officer</b><small>Not listed on the GCC website</small></span></div>}
        <CommonTiles s={s} c={c} />
        <Tile l="Busiest department" title={`Department with the most open incidents in this zone (${c.periodLabel.toLowerCase()}): ${s.keyDept?.name ?? "none"}${s.keyDept ? `, ${s.keyDept.n}` : ""}. Click to show only it.`}
          v={s.keyDept?.name ?? "—"} tone="var(--accent-2)" txt onClick={s.keyDept ? () => c.setDept(s.keyDept.code) : undefined} />
      </div>
    </>
  );
}

function DeptSnap({ d, c }: { d: OverviewData; c: Console }) {
  const s = d.snapshot as Extract<OverviewData["snapshot"], { kind: "dept" }>;
  const dept = s.dept as Row;
  const head = s.contacts.find((x) => x.dept_code === dept.code);
  return (
    <>
      <SnapTitle icon={deptIcon(dept.code)} title={shortName(dept.name)} sub={`Department snapshot · ${periodSub(c)}`}
        more={<button className="more" onClick={() => c.openContact(dept, s.contacts)}><I n="phone" />All contacts</button>} />
      <div className="snap">
        {head ? <OfficerCard o={head} label="Department head (GCC)" compact />
          : <div className="officer compact"><span className="avatar">{shortInit(dept.head)}</span>
            <span style={{ minWidth: 0 }}><small className="olabel">Department head</small><b title={dept.head}>{dept.head}</b><small className="desig">{dept.org}</small></span></div>}
        <CommonTiles s={s} c={c} />
        <Tile l="Most open work in" title={s.topZone ? `${s.topZone.name} zone has the most open incidents for this department (${s.topZone.n}). Click to show only it.` : undefined}
          v={s.topZone ? `${s.topZone.name} · ${s.topZone.n}` : "—"} tone="var(--accent-2)" txt
          onClick={s.topZone ? () => c.setZone(s.topZone.zone) : undefined} />
      </div>
    </>
  );
}
const shortName = (n: string) => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");
const shortInit = (s: string) => String(s ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

/**
 * Latest news: the news (every outlet's article merged), the stories whose outlets disagree, the neighbouring districts'
 * news that could reach Chennai ("Next door"), and items from sources the Collector added.
 */
function BriefCard({ d, c }: { d: OverviewData; c: Console }) {
  const [tab, setTab] = useState<"news" | "differ" | "door" | "added">("news");
  const when = c.period === "daily" ? "last 24 hours" : `last ${d.added.days} days`;
  const differ = c.conflicts?.stories.filter((s) => s.items.some((x) => x.kind === "conflict")).length ?? 0;
  return (
    <>
      <div className="ch"><I n="news" /><h3>Latest news</h3>
        {tab !== "differ" && <button className="more" onClick={() => (tab === "news" ? c.openNewsAll() : tab === "door" ? c.openNextDoor() : c.openAdded())}>See more<I n="right" /></button>}
      </div>
      <div className="btabs" role="tablist" aria-label="Briefing source">
        <button role="tab" aria-selected={tab === "news"} className={tab === "news" ? "on" : ""} onClick={() => setTab("news")}>
          News{d.allNews && <> <b className="tab-n">{d.allNewsTotal || d.allNews.length}</b></>}</button>
        <button role="tab" aria-selected={tab === "differ"} className={`${tab === "differ" ? "on" : ""}${differ ? " warn" : ""}`} onClick={() => setTab("differ")}
          title="Stories where the outlets report the same event differently (deaths, age, place...): confirm before quoting">
          Differ{c.conflicts && <> <b className="tab-n">{c.conflicts.stories.length}</b></>}</button>
        <button role="tab" aria-selected={tab === "door"} className={tab === "door" ? "on" : ""} onClick={() => setTab("door")}
          title="News from Tiruvallur, Kancheepuram and Chengalpattu that could reach Chennai: what to prepare for and what to watch">
          Next door{c.nearby && <> <b className="tab-n">{nextDoorCount(c.nearby)}</b></>}</button>
        <button role="tab" aria-selected={tab === "added"} className={tab === "added" ? "on" : ""} onClick={() => setTab("added")}
          title={`Items from sources you added, ${when}`}>Added <b className="tab-n">{d.added.count}</b></button>
      </div>
      <div className={(tab === "news" && d.allNews) || tab === "differ" || tab === "door" ? "fitlist scroll" : "fitlist"}>
        {tab === "differ" ? <ConflictList c={c} now={d.now} /> : tab === "door" ? <NextDoorList c={c} now={d.now} /> : tab === "news"
          ? d.allNews
            ? d.allNews.length ? d.allNews.map((i) => <NewsStory key={i.id} i={i} now={d.now} c={c} />) : <Empty>No news {c.period === "daily" ? "in the last 24 hours" : "in this period"}.</Empty>
            : d.news.length ? uniqueNews(d.news).slice(0, 10).map((i) => <NewsItem key={i.id} i={i} now={d.now} c={c} />) : <Empty>No news reports {c.period === "daily" ? "in the last 24 hours" : "in this period"}.</Empty>
          : d.added.items.length ? d.added.items.slice(0, 10).map((i: Row) => <AddedRow key={i.item_id} i={i} now={d.now} c={c} />)
            : <Empty>Nothing from added sources {`in the ${when}`}.</Empty>}
      </div>
    </>
  );
}

/** The same headline linked to two incidents (one story, two places) is shown once. */
function uniqueNews(rows: Row[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = String(r.news_title ?? fullTitle(r)).toLowerCase().replace(/\s+/g, " ").trim();
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export type Story = NonNullable<OverviewData["allNews"]>[number];

/**
 * One news story (every outlet's article merged). A story in our records opens its incident, where
 * "How it unfolded" shows the articles and the citizen grievances together; news alone opens the article.
 */
export function NewsStory({ i, now, c }: { i: Story; now: string; c: Console }) {
  const diff = c.conflicts?.stories.find((s) => s.id === i.id || s.docIds.includes(i.id));
  return (
    <button className="brief" onClick={() => c.openStory(i)} title={i.incident ? "Open the incident: the news and the grievances together" : "Read the story and every outlet's report"}>
      <span className={`bic ${i.incident ? "t-high" : "t-info"}`}><I n="news" /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b title={i.original ?? undefined}>{i.title}</b>
        <span className="loc">{outletLine(i)} · {i.loc ?? "Chennai"} · {rel(i.t, now)}</span>
        {diff && hasConflict(diff) ? <DiffBadge s={diff} /> : <StoryLink i={i} />}
      </span>
    </button>
  );
}

/** "The Hindu, DT Next +3": the outlets that carried the story. */
export function outletLine(i: Story) {
  const n = i.outletNames.length;
  if (!n) return "News";
  return n > 2 ? `${i.outletNames.slice(0, 2).join(", ")} +${n - 2}` : i.outletNames.join(", ");
}

/** Whether a news story is also in our records: citizen grievances, an incident, or news only. */
export function StoryLink({ i }: { i: Story }) {
  const more = i.headlines > 1 ? ` · ${plural(i.headlines - 1, "similar report")}` : "";
  if (i.grievances > 0) return <span className="routed"><I n="user" />Also a grievance · {plural(i.grievances, "citizen complaint")}</span>;
  if (i.incident) return <span className="routed" title="Linked to an incident in our records; no citizen has complained about it yet">
    <I n="alert" />{i.sev ? `${i.sev} severity incident` : "Incident on record"} · no citizen complaint yet</span>;
  return more ? <span className="routed dim"><I n="news" />{more.replace(/^ · /, "")}</span> : null;
}

export function NewsItem({ i, now, c, showDept }: { i: Row; now: string; c: Console; showDept?: boolean }) {
  const outlets: string[] = i.outletNames ?? [];
  return (
    <button className="brief" onClick={() => c.openInc(i.id)}>
      <span className="bic t-high"><I n="news" /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b title={i.news_title ? `Incident: ${fullTitle(i)}` : undefined}>{i.news_title ?? fullTitle(i)}</b>
        <span className="loc">{outlets.length ? outlets.join(", ") : "News"} · {i.zone_name ?? "Chennai"} · {rel(i.t, now)}</span>
        {showDept && !i.assigned && <span className="routed"><I n="gov" />Belongs to {i.dept_name ?? i.dept}</span>}
        {i.assigned && <span className="routed"><I n="send" />Sent to {i.assigned.officer_designation ?? i.dept_name}</span>}
      </span>
    </button>
  );
}

// ==================================================== environment & markets ==

/** Page 4: weather, water and prices for the whole district. No zone or department filter applies here. */
export function EnvPage({ d, ins, c }: { d: OverviewData; ins: Insights | null; c: Console }) {
  const env = useEnv(d, c.geo, c, true);
  let ix = 0;
  const iv = () => ({ "--i": ix++ }) as React.CSSProperties;
  return (
    // conditions in a compact column on the left; the price table gets the page's full height on the right
    <section className="p2 env2">
      <div className="env2-col">
        <RainCard d={d} c={c} env={env} style={iv()} />
        <AqiCard c={c} d={d} env={env} style={iv()} />
        <LakeCard c={c} d={d} env={env} style={iv()} />
      </div>
      <article className="card mk-card" style={iv()}><MarketsCard ins={ins} c={c} /></article>
    </section>
  );
}

// ------------------------------------------------------- environment --

type Kind = "rain" | "aqi" | "lake";
interface Picked { kind: Kind; stations: Station[]; label: string }

/**
 * Which stations each environment card shows. "auto" follows the zone filter:
 * stations inside the zone, else the nearest one (named, with its distance);
 * with no zone it averages every station. The card's picker can override it.
 */
function useEnv(d: OverviewData, geo: MapGeo | null, c: Console, district = false) {
  const b = d.bottom;
  const zoneNo = district ? null : d.zone;
  const z = zoneNo && geo ? geo.zones.find((x) => x.zone === zoneNo) : null;
  const zoneName = c.zoneName;
  const km = (st: Station) => {
    if (!z) return 0;
    const dy = (st.lat - z.lat) * 111.2, dx = (st.lon - z.lon) * 111.2 * Math.cos((z.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };
  const pick = (kind: Kind, all: Station[], noun: string): Picked => {
    const sel = c.envSel[kind] ?? "auto";
    const one = all.find((s) => s.id === sel);
    if (one) return { kind, stations: [one], label: one.name };
    if (sel === "all" || !zoneNo || !all.length) return { kind, stations: all, label: all.length === 1 ? all[0].name : `Average of ${all.length} ${noun}` };
    const inside = all.filter((s) => s.zone === zoneNo);
    if (inside.length) return { kind, stations: inside, label: inside.length === 1 ? `${inside[0].name} (in ${zoneName})` : `${inside.length} ${noun} in ${zoneName}` };
    if (!z) return { kind, stations: all, label: `Average of ${all.length} ${noun}` };
    const near = [...all].sort((a, y) => km(a) - km(y))[0];
    return { kind, stations: [near], label: `Nearest to ${zoneName}: ${near.name}, ${km(near).toFixed(1)} km` };
  };
  const last = (s: Station) => s.series[s.series.length - 1];
  const mapStations: MapStation[] = [
    ...b.aqi.stations.map((s) => ({ id: s.id, name: s.name, kind: "aqi" as const, lat: s.lat, lon: s.lon, label: `AQI ${last(s)}` })),
    ...b.rain.stations.map((s) => ({ id: s.id, name: s.name, kind: "rain" as const, lat: s.lat, lon: s.lon, label: `${last(s)} mm in 24 h` })),
    ...b.lakes.stations.map((s) => ({ id: s.id, name: s.name, kind: "lake" as const, lat: s.lat, lon: s.lon, label: `${last(s)}% full` }))
  ];
  const lake = pick("lake", b.lakes.stations, b.lakes.source === "CMWSSB" ? "reservoirs" : "lakes");
  // CMWSSB's reservoirs serve the whole city: "all" is their combined storage, as CMWSSB totals it
  if (b.lakes.source === "CMWSSB" && lake.stations.length > 1) lake.label = `Chennai's ${lake.stations.length} drinking-water reservoirs, combined`;
  return { rain: pick("rain", b.rain.stations, "rain gauges"), aqi: pick("aqi", b.aqi.stations, "stations"), lake, mapStations };
}
type Env = ReturnType<typeof useEnv>;

/** Average several stations' series, aligned on a time key (the day for rain gauges). */
function combine(stations: Station[], key: (t: string) => string = (t) => t) {
  const by = new Map<string, number[]>();
  for (const s of stations) s.times.forEach((t, k) => { const kk = key(t); (by.get(kk) ?? by.set(kk, []).get(kk)!).push(s.series[k]); });
  const times = [...by.keys()].sort();
  const series = times.map((t) => { const v = by.get(t)!; return Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10; });
  return { times, series, now: series[series.length - 1], prev: series.length > 1 ? series[series.length - 2] : null };
}

function StationPicker({ c, kind, all }: { c: Console; kind: Kind; all: Station[] }) {
  return (
    <select className="sel" style={{ marginLeft: "auto", maxWidth: 170 }} value={c.envSel[kind] ?? "auto"} aria-label="Choose station"
      onChange={(e) => c.setEnvSel(kind, e.target.value)}>
      <option value="auto">All stations (average)</option>
      {all.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

function Trend({ now, prev, unit, upIsBad, since, dec = 1 }: { now: number | null; prev: number | null; unit: string; upIsBad: boolean; since: string; dec?: number }) {
  if (now == null || prev == null) return null;
  const d = Math.round((now - prev) * 10 ** dec) / 10 ** dec;
  const flat = Math.abs(d) < (dec ? 0.1 : 1);
  const cls = flat ? "flat" : (d > 0) === upIsBad ? "up-bad" : "up-good";
  return (
    <span className={`trend ${cls}`} title={`Previous reading: ${prev} ${unit}`}>
      <span className="arr"><I n={flat ? "right" : d > 0 ? "up" : "down"} /></span>
      <span><b>{flat ? "Steady" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(dec)} ${unit}`}</b><small>vs. {since}</small></span>
    </span>
  );
}

function Level({ text, color }: { text: string; color: string }) {
  return <span className="lvl" style={{ color, background: `${color}1F` }}><i />{text}</span>;
}

/** The official scale in grey, with only the band the reading falls in coloured. */
function Scale({ stops, value, max }: { stops: { upto: number; c: string; l: string }[]; value: number | null; max: number }) {
  let prev = 0;
  const at = value == null ? -1 : stops.findIndex((s) => value <= s.upto);
  return (
    <div className="scale" aria-hidden="true">
      <div className="bar">{stops.map((s, k) => {
        const w = ((s.upto - prev) / max) * 100;
        prev = s.upto;
        return <span key={s.l} style={{ background: k === (at < 0 ? stops.length - 1 : at) && value != null ? s.c : "var(--surface-3)", flex: `0 0 ${w}%`, boxShadow: "inset -1px 0 0 var(--surface)" }} />;
      })}</div>
      {value != null && <span className="mk" style={{ left: `${Math.min(100, (value / max) * 100)}%` }} />}
      <div className="lb">{(() => { let p = 0; return stops.map((s) => { const w = ((s.upto - p) / max) * 100; p = s.upto; return <span key={s.l} style={{ flex: `0 0 ${w}%` }}>{s.l}</span>; }); })()}</div>
    </div>
  );
}

const RAIN_STOPS = [
  { upto: 15.5, c: "#9FD8B9", l: "Light" }, { upto: 64.4, c: "#F4C542", l: "Moderate" }, { upto: 115.5, c: "#F28A1E", l: "Heavy" }, { upto: 160, c: "#F2555A", l: "Very heavy" }
];
function rainLevel(v: number): [string, string, string] {
  return v < 15.6 ? ["Low", "#35C28C", v < 0.1 ? "No rain" : "Light rain"] : v < 64.5 ? ["Moderate", "#E8B84A", "Moderate rain"] : v < 115.6 ? ["High", "#F7893B", "Heavy rain"] : ["High", "#F2555A", "Very heavy rain"];
}
const AQI_STOPS = [
  { upto: 50, c: "#3FB67B", l: "Good" }, { upto: 100, c: "#9ACD5A", l: "Satisf." }, { upto: 200, c: "#F4C542", l: "Moderate" },
  { upto: 300, c: "#F28A1E", l: "Poor" }, { upto: 400, c: "#F2555A", l: "V. poor" }, { upto: 500, c: "#8E1B2A", l: "Severe" }
];
function aqiLevel(a: number): [string, string, string] {
  return a <= 50 ? ["Low", "#35C28C", "Good"] : a <= 100 ? ["Low", "#35C28C", "Satisfactory"] : a <= 200 ? ["Moderate", "#E8B84A", "Moderate"]
    : a <= 300 ? ["High", "#F7893B", "Poor"] : ["High", "#F2555A", a <= 400 ? "Very poor" : "Severe"];
}
const LAKE_STOPS = [{ upto: 30, c: "#E5767A", l: "Low" }, { upto: 70, c: "#F4C542", l: "Normal" }, { upto: 100, c: "#3FB67B", l: "High" }];
function lakeLevel(p: number): [string, string, string] {
  return p < 30 ? ["Low", "#F2555A", "Low storage: water supply may need watching"] : p < 50 ? ["Below half", "#E8B84A", "Below half full"] : p < 70 ? ["Normal", "#E8B84A", "Normal storage"]
    : p < 92 ? ["High", "#35C28C", "Good storage"] : ["High", "#F7893B", "Near full: watch for surplus release"];
}

function EnvHead({ icon, title, c, kind, all }: { icon: IconName; title: string; c: Console; kind: Kind; all: Station[] }) {
  return <div className="ch"><I n={icon} /><h3>{title}</h3><StationPicker c={c} kind={kind} all={all} /></div>;
}

function RainCard({ d, c, env, style }: { d: OverviewData; c: Console; env: Env; style: React.CSSProperties }) {
  const r = combine(env.rain.stations, (t) => t.slice(0, 10));
  const lvl = r.now != null ? rainLevel(r.now) : null;
  const b = d.bottom.rain;
  const days = r.times.slice(-10), vals = r.series.slice(-10);
  // the latest reading's day: a reading days old must not read as "the last 24 hours"
  const last = r.now != null && r.times.length ? r.times[r.times.length - 1] : null;
  const behind = last ? Math.round((Date.parse(String(d.now).slice(0, 10)) - Date.parse(last.slice(0, 10))) / 864e5) : 0;
  return (
    <article className="card env" style={style}>
      <EnvHead icon="cloud" title="Rainfall" c={c} kind="rain" all={b.stations} />
      <div className="cb">
        <div className="env-lbl"><I n="pin" />{env.rain.label}</div>
        <div className="env-top">
          <span className="env-v">{r.now != null ? <Cnt v={r.now} dec={1} /> : "—"}<small>mm / 24 h</small></span>
          {lvl && <Level text={lvl[0]} color={lvl[1]} />}
          <Trend now={r.now} prev={r.prev} unit="mm" upIsBad since="previous day" />
        </div>
        <Scale stops={RAIN_STOPS} value={r.now} max={160} />
        <div className="env-say">
          {lvl ? (behind > 1
            ? <><b>{lvl[2]}</b> on {fmtDate(last!)}, the latest IMD reading ({behind} days ago; nothing newer has come in). </>
            : <><b>{lvl[2]}</b> in the last 24 hours{last ? ` (IMD, ${fmtDate(last)})` : ""}. </>) : "No readings. "}
          {b.rainDays} rain day{b.rainDays === 1 ? "" : "s"} in the last {b.days.length} days ({b.prevRainDays} in the {b.days.length} days before).
        </div>
        {vals.some((v) => v > 0) ? <Chart kind="bar" vals={vals} labels={days.map((t) => fmtDate(t))} color="var(--live)" fmt={(v) => `${v} mm`} />
          : <Empty>No rain recorded at {env.rain.stations.length === 1 ? "this gauge" : "these gauges"} in the last {days.length} days.</Empty>}
      </div>
    </article>
  );
}

function AqiCard({ d, c, env, style }: { d: OverviewData; c: Console; env: Env; style: React.CSSProperties }) {
  const a = combine(env.aqi.stations);
  const lvl = a.now != null ? aqiLevel(a.now) : null;
  const worst = env.aqi.stations.length > 1 ? [...env.aqi.stations].sort((x, y) => y.series[y.series.length - 1] - x.series[x.series.length - 1])[0] : null;
  const n = Math.min(a.series.length, 24);
  return (
    <article className="card env" style={style}>
      <EnvHead icon="wind" title="Air quality" c={c} kind="aqi" all={d.bottom.aqi.stations} />
      <div className="cb">
        <div className="env-lbl"><I n="pin" />{env.aqi.label}</div>
        <div className="env-top">
          <span className="env-v">{a.now != null ? <Cnt v={a.now} /> : "—"}<small>AQI</small></span>
          {lvl && <Level text={lvl[0]} color={lvl[1]} />}
          <Trend now={a.now} prev={a.prev} unit="" upIsBad since="previous hour" dec={0} />
        </div>
        <Scale stops={AQI_STOPS} value={a.now} max={500} />
        <div className="env-say">
          {lvl ? <>Air is <b>{lvl[2].toLowerCase()}</b> (CPCB scale). </> : "No readings. "}
          {worst && <>Worst now: <b>{worst.name.replace(/^Chennai-/, "").replace(/, Chennai.*$/, "")}</b> at {worst.series[worst.series.length - 1]}.</>}
        </div>
        <Chart kind="line" vals={a.series.slice(-n)} labels={a.times.slice(-n).map((t) => fmtTime(t))} color="var(--ok)" fmt={(v) => `AQI ${v}`}
          band={{ at: 100, label: "Satisfactory limit" }} />
      </div>
    </article>
  );
}

function LakeCard({ d, c, env, style }: { d: OverviewData; c: Console; env: Env; style: React.CSSProperties }) {
  const L = d.bottom.lakes;
  const all = env.lake.stations.length > 1 && L.total && env.lake.stations.length === L.stations.length;
  // all reservoirs: storage over capacity (a big reservoir counts for more than a small one), else the one chosen
  const k = all && L.total
    ? { times: L.total.times, series: L.total.series, now: L.total.series[L.total.series.length - 1] ?? null, prev: L.total.series.length > 1 ? L.total.series[L.total.series.length - 2] : null }
    : combine(env.lake.stations);
  const lvl = k.now != null ? lakeLevel(k.now) : null;
  const first = k.series[0];
  const one = env.lake.stations.length === 1 ? env.lake.stations[0] : null;
  const store = all && L.total ? { st: L.total.storageMcft, cap: L.total.capacityMcft, ly: L.total.lastYearMcft }
    : one?.capacity ? { st: one.storage?.[one.storage.length - 1] ?? null, cap: one.capacity, ly: one.lastYear ?? null } : null;
  const mcft = (v: number) => `${Math.round(v).toLocaleString("en-IN")} mcft`;
  return (
    <article className="card env" style={style}>
      <EnvHead icon="drop" title="Reservoir storage" c={c} kind="lake" all={d.bottom.lakes.stations} />
      <div className="cb">
        <div className="env-lbl"><I n="pin" />{env.lake.label}</div>
        <div className="env-top">
          <span className="env-v">{k.now != null ? <Cnt v={k.now} dec={1} /> : "—"}<small>% full</small></span>
          {lvl && <Level text={lvl[0]} color={lvl[1]} />}
          <Trend now={k.now} prev={k.prev} unit="pts" upIsBad={false} since="previous day" />
        </div>
        <Scale stops={LAKE_STOPS} value={k.now} max={100} />
        <div className="env-say">
          {lvl ? <><b>{lvl[2]}</b>. </> : "No readings. "}
          {store?.st != null && <>{mcft(store.st)} of {mcft(store.cap)}{store.ly != null ? <>; a year ago {mcft(store.ly)} ({Math.round((store.ly / store.cap) * 100)}%)</> : null}. </>}
          {k.now != null && first != null && k.series.length > 1 && <>{k.now >= first ? "Up" : "Down"} {Math.abs(k.now - first).toFixed(1)} points since {fmtDate(k.times[0])}.</>}
          {L.source === "CMWSSB" && L.asOn && <> <a className="env-src" href={L.sourceUrl ?? undefined} target="_blank" rel="noreferrer">CMWSSB, {fmtDate(L.asOn + " 06:00:00")}</a></>}
        </div>
        <Chart kind="line" vals={k.series} labels={k.times.map((t) => fmtDate(t))} color="var(--accent)" fmt={(v) => `${v}% full`} />
      </div>
    </article>
  );
}
