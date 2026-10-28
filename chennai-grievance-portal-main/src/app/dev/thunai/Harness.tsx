"use client";
/**
 * A stand-in console for Thunai (dev only): the same control names the real console uses (page tabs with data-key, the
 * Zone and Department selects, the Period buttons, severity tabs, Zones/Taluks), a small incident list and a panel area,
 * driven by a Console-shaped object. Numbers here are made up for the check; the real console uses its own data.
 */
import { useState } from "react";
import Thunai, { type Snap, type ThunaiHost } from "@/components/collector/app/thunai/Thunai";
import type { Console } from "@/components/collector/app/CollectorApp";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";

type Page = Snap["page"];
const PAGES: Page[] = ["overview", "briefing", "trends", "environment", "studio"];
const SEVS = ["Severe", "High", "Medium", "Low"];
const DEPTS = [{ code: "CMWSSB", name: "Metro Water (CMWSSB)" }, { code: "POL-GCP", name: "Greater Chennai Police" }, { code: "PWD-WRD", name: "PWD Water Resources" },
  { code: "GCC-SWM", name: "Solid Waste Management" }, { code: "GCC-SWD", name: "Storm Water Drains" }];
const ROWS = [
  { id: "INC-101", sev: "Severe", title: "Waterlogging, Velachery Main Road" }, { id: "INC-102", sev: "Severe", title: "Tree fall, Adyar" },
  { id: "INC-103", sev: "High", title: "Sewage overflow, Royapuram" }, { id: "INC-104", sev: "Medium", title: "Garbage pile, Anna Nagar" }
];

export default function Harness() {
  const [page, setPage] = useState<Page>("overview");
  const [period, setPeriod] = useState<Snap["period"]>("daily");
  const [zone, setZone] = useState<number | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [taluk, setTaluk] = useState<string | null>(null);
  const [sevTab, setSevTab] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"zones" | "taluks">("zones");
  const [layers, setLayers] = useState<Record<string, boolean>>({ severe: true, complaint: true, other: true, added: true, stations: false });
  const [inc, setInc] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [log, setLog] = useState<string[]>([]);
  const note = (s: string) => setLog((l) => [s, ...l].slice(0, 8));

  const ov = {
    zoneTable: ZONE_NAMES.map((name, i) => ({ zone: i + 1, name, n: 40 - i * 2, open: 30 - i * 2, complaints: 20 - i, severe: i === 12 ? 9 : 5 - (i % 5) })),
    severity: { counts: { Severe: 2, High: 1, Medium: 1, Low: 0 }, rows: ROWS },
    bell: [], deptNav: []
  };
  const open = (kind: string) => () => { setModal(kind); note(`opened ${kind}`); };
  const c = {
    page, setPage: (p: Page) => { setPage(p); note(`page ${p}`); }, period, setPeriod: (p: Snap["period"]) => { setPeriod(p); note(`period ${p}`); },
    zone, zoneName: zone ? ZONE_NAMES[zone - 1] : null, setZone, dept, deptName: dept, setDept, depts: DEPTS.map((d) => ({ ...d, head: null, open: 0, n: 0, severe: 0, unverified: 0 })),
    cat, setCat, taluk, setTaluk, mapMode, setMapMode, layers, toggleLayer: (k: string) => setLayers((l) => ({ ...l, [k]: !l[k] })), sevTab, setSevTab,
    focus: null, setAsk, openInc: (id: string) => { setInc(id); note(`incident ${id}`); }, openAction: (id: string) => { setInc(id); setModal("take action"); note(`draft for ${id}`); },
    openNewsAll: open("latest news"), openStories: open("developing stories"), openGaps: open("in the news, not in records"), openNextDoor: open("next door"),
    openMarkets: open("mandi prices"), openZones: open("zones"), openDepts: open("departments"), openFeeds: open("data sources"), openReview: open("review"),
    openWorkspace: open("workspaces"), openConflict: open("conflicts"), conflicts: null, dayBrief: null,
    closeAll: () => { setInc(null); setModal(null); }, askOnMap: (q: unknown) => note(`ask the map: ${JSON.stringify(q)}`),
    mapAsk: { setGrown: () => undefined }, saveWorkspace: async (n: string) => { note(`saved ${n}`); return 1; }, openSavedWorkspace: async () => undefined
  } as unknown as Console;
  const host: ThunaiHost = {
    c, ov: ov as unknown as ThunaiHost["ov"], ins: null, inc, modal, ask, theme,
    toggleTheme: () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); document.documentElement.dataset.theme = t; },
    openExport: open("export"), openCustomize: open("customize"), openPalette: open("search"), askWith: (q) => { setAsk(true); note(`asked District IQ: ${q}`); },
    applyView: (v) => {
      if (v.zone !== undefined) setZone(v.zone);
      if (v.dept !== undefined) setDept(v.dept);
      if (v.cat !== undefined) setCat(v.cat);
      if (v.taluk !== undefined) setTaluk(v.taluk);
      if (v.sev) setSevTab(v.sev);
      note(`view ${JSON.stringify(v)}`);
    },
    snapshot: () => ({ page, period, zone, dept, cat, taluk, sev: sevTab, mapMode, layers }),
    restore: (s) => { setPage(s.page); setPeriod(s.period); setZone(s.zone); setDept(s.dept); setCat(s.cat); setTaluk(s.taluk); setSevTab(s.sev); setMapMode(s.mapMode); setLayers(s.layers); note("restored"); }
  };

  const box: React.CSSProperties = { border: "1px solid #ccd", borderRadius: 10, padding: 12, background: theme === "dark" ? "#16213a" : "#fff" };
  return (
    <main style={{ minHeight: "100vh", padding: 20, fontFamily: "Inter, system-ui", background: theme === "dark" ? "#0a1020" : "#f6f4ee", color: theme === "dark" ? "#e8ecf5" : "#14213d" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 10px" }}>Thunai test console (dev only, made-up numbers)</h1>
      <nav className="ptabs" role="tablist" aria-label="Pages" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {PAGES.map((p) => <button key={p} data-key={p} role="tab" aria-selected={page === p} onClick={() => setPage(p)} style={{ fontWeight: page === p ? 700 : 400 }}>{p}</button>)}
      </nav>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <select aria-label="Zone" value={zone ?? ""} onChange={(e) => setZone(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All zones</option>{ZONE_NAMES.map((z, i) => <option key={z} value={i + 1}>{i + 1}. {z}</option>)}
        </select>
        <select aria-label="Department" value={dept ?? ""} onChange={(e) => setDept(e.target.value || null)}>
          <option value="">All departments</option>{DEPTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
        <div aria-label="Period" role="radiogroup" style={{ display: "flex", gap: 4 }}>
          {(["daily", "weekly", "monthly", "quarterly"] as const).map((p) => <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} style={{ fontWeight: period === p ? 700 : 400 }}>{{ daily: "Day", weekly: "Week", monthly: "Month", quarterly: "Quarter" }[p]}</button>)}
        </div>
        <button className="theme-t" onClick={host.toggleTheme} aria-label="Switch theme">{theme}</button>
        <button aria-label="Export report" onClick={host.openExport}>Export</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
        <section className="card" style={box}>
          <h3>Open, by severity</h3>
          <div className="sevtabs" style={{ display: "flex", gap: 4 }}>{SEVS.map((s) => <button key={s} className="sevtab" onClick={() => setSevTab(s)} style={{ fontWeight: sevTab === s ? 700 : 400 }}>{s}</button>)}</div>
          <ul>{ROWS.filter((r) => r.sev === (sevTab ?? "Severe")).map((r) => <li key={r.id}><button onClick={() => setInc(r.id)}>{r.title}</button></li>)}</ul>
          <div style={{ display: "flex", gap: 4 }}><button onClick={() => setMapMode("zones")}>Zones</button><button onClick={() => setMapMode("taluks")}>Taluks</button></div>
        </section>
        <section className="card" style={box}>
          <h3>State</h3>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }} data-testid="state">{JSON.stringify({ page, period, zone, dept, cat, taluk, sevTab, mapMode, stations: layers.stations, inc, modal, ask }, null, 1)}</pre>
          <ol style={{ fontSize: 12 }} data-testid="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </section>
      </div>
      <Thunai host={host} />
    </main>
  );
}
