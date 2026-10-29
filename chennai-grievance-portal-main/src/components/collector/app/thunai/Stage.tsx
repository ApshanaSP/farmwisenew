"use client";
/**
 * Thunai's Stage: the full-screen answer it builds for the Collector (portal on <body>, the console stays underneath).
 * It renders only the closed catalog in lib/thunai/stage.ts, every number from the document code built from the data.
 * Everything on it can be clicked or said: open a case, draft for it, show it on the main map, drill into a zone or a
 * department, switch a block between chart, table and map, change the period or the area, pin, export, save.
 * Thunai.tsx owns the document, the narration and the actions; this file draws them.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapGeo } from "@/lib/collector/geo";
import type { PanelData } from "@/lib/studio/types";
import type { BlockT, CaseRowT, StageDocT } from "@/lib/thunai/stage";
import type { Lang } from "@/lib/thunai/types";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";
import StudioMap from "../studio/StudioMap";
import { I, type IconName } from "../icons";
import StageChart from "./StageChart";
import "leaflet/dist/leaflet.css";
import "../studio/studio.css";
import "./stage.css";

export type BlockView = "chart" | "table" | "map";
export interface PinnedScreen { id: string; title: string; recipe: string; slots: Record<string, unknown>; at: string }
export interface StageDraft { incidentId: string; title: string; to: string | null; sandbox: boolean }

export interface StageActions {
  close: () => void;
  back: (() => void) | null;
  ask: (text: string) => void;
  mic: () => void;
  listening: boolean;
  direct: (recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string) => void;
  openCase: (id: string) => void;
  openInConsole: (id: string) => void;
  takeAction: (id: string) => void;
  draft: (ids: string[]) => void;
  showOnMainMap: (q: { incidentId?: string; zone?: number; text?: string }) => void;
  zone: (z: number) => void;
  dept: (code: string, name: string) => void;
  station: (name: string, metric: string) => void;
  read: () => void;
  stop: () => void;
  pin: () => void;
  openPin: (p: PinnedScreen) => void;
  unpin: (id: string) => void;
  exportCsv: () => void;
  exportPng: (root: HTMLElement) => void;
  save: (name: string) => void;
  setView: (blockId: string, v: BlockView) => void;
  confirmTray: () => void;
  discardTray: () => void;
}

interface Props {
  doc: StageDocT;
  lang: Lang;
  theme: "dark" | "light";
  busy: string | null;
  /** the item being read aloud and the word in it (karaoke) */
  reading: { key: string; char: number | null; lead?: string } | null;
  narrating: boolean;
  views: Record<string, BlockView>;
  pins: PinnedScreen[];
  geo: MapGeo | null;
  tray: StageDraft[];
  brain: { model: string | null; ms: number; rounds: number; calls: number } | null;
  filtered: string | null;
  saveAsk: string | null;
  /** the subtitles: what was heard and what Thunai is saying (the console's dock hides while the Stage is open) */
  caption: { heard: string; reply: string; interim: boolean; by: string | null };
  a: StageActions;
}

const T = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);
const PERIODS = [["daily", "Today", "இன்று"], ["weekly", "Week", "வாரம்"], ["monthly", "30 days", "30 நாள்"], ["quarterly", "90 days", "90 நாள்"]] as const;
const SCOPED = new Set(["cases", "map", "dashboard", "trend", "why", "news", "performance", "ranking", "compare", "brief"]);
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** "2026-10-28 07:41:25" -> "28 Oct, 7:41 AM" */
function when(t: string | null | undefined): string {
  const m = String(t ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return t ?? "";
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
  if (m[4] == null) return `${Number(m[3])} ${mo}`;
  const h = Number(m[4]);
  return `${Number(m[3])} ${mo}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}
/** age from an IST timestamp, against the data's as-of time */
function age(t: string | null, asOf: string | null): string | null {
  const p = (x: string | null) => (x ? Date.parse(`${x.replace(" ", "T").slice(0, 19)}+05:30`) : NaN);
  const a = p(t), b = p(asOf);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const h = (b - a) / 3_600_000;
  return h < 1 ? "under 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}

/** Grid spans (of 12) for the blocks, by what sits next to what. */
function spans(blocks: BlockT[]): number[] {
  const kinds = blocks.map((b) => b.kind);
  return blocks.map((b, i) => {
    const other = kinds.filter((_, j) => j !== i);
    switch (b.kind) {
      case "Kpis": case "NewsReader": case "Note": case "Drafts": return 12;
      case "Compare": return other.includes("MapView") ? 8 : 12;
      case "CaseList": return other.includes("MapView") && kinds.length <= 3 ? (kinds[0] === "CaseList" ? 7 : 5) : kinds.length >= 5 ? 7 : other.includes("Chart") || other.includes("Answer") ? 12 : 12;
      case "MapView": return other.includes("Compare") ? 4 : kinds[0] === "MapView" ? 7 : other.includes("CaseList") && kinds.length <= 3 ? 5 : other.includes("Readings") || other.includes("CaseDetail") ? 4 : 7;
      case "Ranking": return other.includes("Trend") && !other.includes("MapView") ? 4 : other.includes("MapView") ? 5 : 12;
      case "Trend": return other.includes("Ranking") && !other.includes("MapView") ? 8 : other.includes("Heat") ? 6 : kinds.length >= 5 ? 5 : 12;
      case "Heat": return other.includes("Trend") ? 6 : 12;
      case "Readings": case "CaseDetail": return other.includes("MapView") ? 8 : 12;
      case "Chart": case "Answer": return 6;
      case "Brief": return 12;
      default: return 12;
    }
  });
}

const SEV_CLASS: Record<string, string> = { Severe: "sev", High: "high", Medium: "med", Low: "low" };

function Stage(p: Props) {
  const { doc, lang, a } = p;
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [cmd, setCmd] = useState("");
  const [menu, setMenu] = useState<"export" | "save" | null>(null);
  const [saveName, setSaveName] = useState("");

  const menuRef = useRef(menu);
  menuRef.current = menu;
  const aRef = useRef(a);
  aRef.current = a;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [font, setFont] = useState<string | null>(null);
  // the console's own UI font (Geist in the Command look), read once
  useEffect(() => {
    const dic = document.querySelector<HTMLElement>(".dic");
    const f = dic ? getComputedStyle(dic).getPropertyValue("--font-ui").trim() : "";
    if (f) setFont(f);
  }, []);
  // focus moves in, stays in (Tab cycles inside), and returns to where it was on close; set up once, live values by ref
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (menuRef.current) setMenu(null); else aRef.current.close(); return; }
      if (e.key !== "Tab" || !root.current) return;
      const f = [...root.current.querySelectorAll<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled") && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!root.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); before?.focus?.({ preventScroll: true }); };
  }, []);
  // a new screen replaces the old one's buttons: focus goes to its title, never to the console behind
  const firstDoc = useRef(true);
  useEffect(() => {
    if (firstDoc.current) { firstDoc.current = false; return; }
    if (!root.current?.contains(document.activeElement) || document.activeElement === document.body) titleRef.current?.focus({ preventScroll: true });
  }, [doc.id]);

  const sp = useMemo(() => spans(doc.blocks), [doc.blocks]);
  const slots = doc.slots as Record<string, unknown>;
  const zones = Array.isArray(slots.zones) ? (slots.zones as number[]) : [];
  const setPeriod = (period: string) => a.direct(doc.recipe, { ...slots, period }, `${doc.title} (${period})`);
  const setZone = (z: number | null) => a.direct(doc.recipe, doc.recipe === "compare" ? slots : { ...slots, zones: z ? [z] : [] }, doc.title);
  const metric = typeof slots.metric === "string" ? slots.metric : typeof slots.measure === "string" && ["rain", "aqi", "lakes", "temp"].includes(slots.measure as string) ? (slots.measure as string) : null;

  return createPortal(
    <div className="st-root" data-theme={p.theme} data-busy={p.busy ? "1" : undefined} ref={root} role="dialog" aria-modal="true" aria-labelledby="st-title" data-thunai-ui
      style={font ? { ["--st-font" as string]: font } : undefined}>
      <div className="st-scrim" aria-hidden="true" />
      <div className="st-frame">
        <header className="st-head">
          <div className="st-titles">
            <div className="st-crumbs">
              {a.back && <button className="st-icon" onClick={a.back} aria-label={T(lang, "Previous screen", "முந்தைய திரை")}><I n="chevl" /></button>}
              <span className="st-kicker"><span className={`st-live${p.narrating ? " on" : ""}`} aria-hidden="true" />Thunai</span>
            </div>
            <h2 id="st-title" ref={titleRef} tabIndex={-1}>{doc.title}</h2>
            {doc.takeaway && <p className="st-take"><I n="spark" />{doc.takeaway[lang]}</p>}
            {!!doc.next?.length && (
              <div className="st-sugg" role="group" aria-label={T(lang, "Suggested next", "அடுத்து")}>
                <span>{T(lang, "Next", "அடுத்து")}</span>
                {doc.next.map((n, i) => (
                  <button key={i} disabled={!!p.busy} onClick={() => (n.kind === "draft" ? a.draft(n.ids) : n.kind === "direct" && n.recipe ? a.direct(n.recipe, n.slots ?? {}, n.label[lang]) : n.text ? a.ask(n.text) : undefined)}>
                    <I n={n.kind === "draft" ? "send" : "right"} />{n.label[lang]}
                  </button>
                ))}
              </div>
            )}
            {p.filtered && <p className="st-filtered">{T(lang, `Showing only: ${p.filtered}`, `மட்டும்: ${p.filtered}`)} <button onClick={() => a.direct(doc.recipe, slots, doc.title)}>{T(lang, "Show all", "அனைத்தும்")}</button></p>}
          </div>
          <div className="st-tools">
            {p.narrating
              ? <button className="st-btn" onClick={a.stop}><I n="stop" />{T(lang, "Stop", "நிறுத்து")}</button>
              : <button className="st-btn" onClick={a.read}><I n="volume" />{T(lang, "Read aloud", "படி")}</button>}
            <button className="st-icon" onClick={a.pin} aria-label={T(lang, "Pin this screen", "இந்தத் திரையைப் பின் செய்")} title={T(lang, "Pin", "பின்")}><I n="bookmark" /></button>
            <div className="st-menuwrap">
              <button className="st-icon" onClick={() => setMenu(menu === "export" ? null : "export")} aria-expanded={menu === "export"} aria-haspopup="true" aria-controls="st-export-menu" aria-label={T(lang, "Export", "ஏற்றுமதி")} title={T(lang, "Export", "ஏற்றுமதி")}><I n="download" /></button>
              {menu === "export" && (
                <div className="st-menu" id="st-export-menu">
                  <button onClick={() => { setMenu(null); if (root.current) a.exportPng(root.current); }}><I n="photo" />{T(lang, "Picture of this screen (PNG)", "படம் (PNG)")}</button>
                  <button onClick={() => { setMenu(null); a.exportCsv(); }}><I n="table" />{T(lang, "Its data (CSV)", "தரவு (CSV)")}</button>
                </div>
              )}
            </div>
            <div className="st-menuwrap">
              <button className="st-icon" onClick={() => { setSaveName(doc.title.slice(0, 40)); setMenu(menu === "save" ? null : "save"); }} aria-expanded={menu === "save"} aria-label={T(lang, "Save as a workspace", "பணியிடமாகச் சேமி")} title={T(lang, "Save as workspace", "சேமி")}><I n="layers" /></button>
              {menu === "save" && (
                <form className="st-menu st-save" onSubmit={(e) => { e.preventDefault(); setMenu(null); if (saveName.trim()) a.save(saveName.trim()); }}>
                  <label htmlFor="st-save-name">{T(lang, "Workspace name", "பணியிடப் பெயர்")}</label>
                  <input id="st-save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={60} autoFocus />
                  <button type="submit" className="primary">{T(lang, "Save", "சேமி")}</button>
                </form>
              )}
            </div>
            <button ref={closeBtn} className="st-icon st-close" onClick={a.close} aria-label={T(lang, "Close (Esc)", "மூடு (Esc)")} title="Esc"><I n="x" /></button>
          </div>
        </header>

        {p.saveAsk && <div className="st-confirm" role="alert">{p.saveAsk}</div>}

        <div className="st-bar">
          <form className="st-cmd" onSubmit={(e) => { e.preventDefault(); const t = cmd.trim(); if (t) { setCmd(""); a.ask(t); } }}>
            <I n="ai" />
            <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder={T(lang, "Ask a follow-up: \"only severe\", \"add Perungudi\", \"make it monthly\"", "தொடர்ந்து கேளுங்கள்")} aria-label={T(lang, "Ask Thunai", "துணையிடம் கேள்")} />
            <button type="button" className={`st-mic${a.listening ? " on" : ""}`} onClick={a.mic} aria-label={T(lang, "Speak", "பேசு")} aria-pressed={a.listening}><I n="mic" /></button>
          </form>
          {SCOPED.has(doc.recipe) && (
            <div className="st-filters" role="group" aria-label={T(lang, "Filters", "வடிகட்டிகள்")}>
              <div className="st-seg" role="group" aria-label={T(lang, "Period", "காலம்")}>
                {PERIODS.map(([k, en, ta]) => (
                  <button key={k} aria-pressed={doc.scope.period === k} className={doc.scope.period === k ? "on" : ""} onClick={() => setPeriod(k)} disabled={!!p.busy}>{lang === "ta" ? ta : en}</button>
                ))}
              </div>
              {doc.recipe !== "compare" && doc.recipe !== "performance" && (
                <select aria-label={T(lang, "Area", "பகுதி")} value={zones.length === 1 ? zones[0] : doc.scope.zone ?? ""} onChange={(e) => setZone(e.target.value ? Number(e.target.value) : null)} disabled={!!p.busy}>
                  <option value="">{T(lang, "All of Chennai", "முழு சென்னை")}</option>
                  {ZONE_NAMES.map((z, i) => <option key={z} value={i + 1}>{i + 1}. {z}</option>)}
                </select>
              )}
              {doc.recipe === "compare" && (
                <select aria-label={T(lang, "Add an area", "பகுதியைச் சேர்")} value="" onChange={(e) => { const z = Number(e.target.value); if (z) a.direct("compare", { ...slots, zones: [...new Set([...zones, z])].slice(0, 4) }, doc.title); }} disabled={!!p.busy || zones.length >= 4}>
                  <option value="">{T(lang, "+ Add an area", "+ பகுதி")}</option>
                  {ZONE_NAMES.map((z, i) => (zones.includes(i + 1) ? null : <option key={z} value={i + 1}>{z}</option>))}
                </select>
              )}
              {doc.recipe === "performance" && (
                <div className="st-seg" role="group" aria-label={T(lang, "By", "வகை")}>
                  {(["dept", "zone"] as const).map((b) => <button key={b} aria-pressed={slots.by === b} className={slots.by === b ? "on" : ""} onClick={() => a.direct("performance", { ...slots, by: b }, doc.title)}>{b === "dept" ? T(lang, "Departments", "துறைகள்") : T(lang, "Zones", "மண்டலங்கள்")}</button>)}
                </div>
              )}
              {metric && (
                <select aria-label={T(lang, "Measure", "அளவு")} value={metric} onChange={(e) => a.direct(doc.recipe, doc.recipe === "ranking" ? { ...slots, measure: e.target.value, metric: null } : { ...slots, metric: e.target.value }, doc.title)} disabled={!!p.busy}>
                  {[["rain", "Rainfall", "மழை"], ["aqi", "Air quality", "காற்று"], ["lakes", "Reservoirs", "ஏரிகள்"], ["temp", "Temperature", "வெப்பம்"]].map(([k, en, ta]) => <option key={k} value={k}>{lang === "ta" ? ta : en}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {(p.caption.heard || p.caption.reply) && (
          <div className="st-caption">
            {p.caption.heard && <span className={`hd${p.caption.interim ? " interim" : ""}`} aria-hidden={p.caption.interim || undefined}><I n="mic" />{p.caption.heard}</span>}
            {p.caption.reply && <span className="rp">{p.caption.reply}</span>}
            {p.caption.by && <span className="by">{p.caption.by}</span>}
          </div>
        )}

        {p.pins.length > 0 && (
          <nav className="st-pins" aria-label={T(lang, "Pinned screens", "பின் செய்த திரைகள்")}>
            {p.pins.map((x) => (
              <span key={x.id} className="st-pinchip">
                <button onClick={() => a.openPin(x)}><I n="bookmark" />{x.title}</button>
                <button className="x" onClick={() => a.unpin(x.id)} aria-label={T(lang, `Unpin ${x.title}`, "நீக்கு")}><I n="x" /></button>
              </span>
            ))}
          </nav>
        )}

        <main className="st-grid" key={doc.id} aria-busy={!!p.busy}>
          {doc.blocks.map((b, i) => (
            <section key={`${doc.id}-${b.id}`} className={`st-block k-${b.kind}`} style={{ ["--span" as string]: sp[i], ["--i" as string]: i }} aria-label={"title" in b ? (b as { title: string }).title : b.kind}>
              <Block b={b} doc={doc} lang={lang} reading={p.reading} view={p.views[b.id] ?? null} geo={p.geo} tray={p.tray} a={a} />
            </section>
          ))}
          {p.busy && <div className="st-busy"><span className="st-beat" aria-hidden="true" />{p.busy}</div>}
        </main>

        <p className="st-sr" role="status" aria-live="polite">{p.busy ?? p.caption.reply}</p>
        <footer className="st-foot">
          <span><I n="info" />{T(lang, "From", "ஆதாரம்")}: {doc.sources.join(", ") || "-"}</span>
          {doc.asOf && <span><I n="clock" />{T(lang, "Data as of", "தரவு நேரம்")} {when(doc.asOf)}</span>}
          {doc.notes.map((n) => <span key={n} className="note">{n}</span>)}
          {p.brain && <span className="brain"><I n="ai" />{p.brain.model ? `${p.brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")} · ` : T(lang, "No model needed · ", "AI தேவையில்லை · ")}{(p.brain.ms / 1000).toFixed(1)} s{p.brain.calls ? ` · ${p.brain.calls} ${T(lang, "data calls", "தரவு அழைப்புகள்")}` : ""}</span>}
        </footer>
      </div>
    </div>,
    document.body
  );
}
export default memo(Stage);

// ------------------------------------------------------------------ blocks --

interface BP { b: BlockT; doc: StageDocT; lang: Lang; reading: Props["reading"]; view: BlockView | null; geo: MapGeo | null; tray: StageDraft[]; a: StageActions }

function Head({ title, icon, children, sub }: { title: string; icon: IconName; children?: React.ReactNode; sub?: string | null }) {
  return (
    <header className="st-bh">
      <h3><I n={icon} />{title}</h3>
      {sub && <p className="st-sub">{sub}</p>}
      {children && <div className="st-bh-tools">{children}</div>}
    </header>
  );
}

function ViewSwitch({ id, views, cur, a, lang }: { id: string; views: BlockView[]; cur: BlockView; a: StageActions; lang: Lang }) {
  const ICON: Record<BlockView, IconName> = { chart: "barH", table: "table", map: "map" };
  const NAME: Record<BlockView, [string, string]> = { chart: ["Chart", "வரைபடம்"], table: ["Table", "அட்டவணை"], map: ["Map", "நிலவரைபடம்"] };
  return (
    <div className="st-vs" role="group" aria-label={T(lang, "Show as", "காட்டும் வகை")}>
      {views.map((v) => <button key={v} aria-pressed={cur === v} className={cur === v ? "on" : ""} onClick={() => a.setView(id, v)} title={NAME[v][lang === "ta" ? 1 : 0]} aria-label={NAME[v][lang === "ta" ? 1 : 0]}><I n={ICON[v]} /></button>)}
    </div>
  );
}

const EMPTY_EN = "No data for this, for this period and area.";
function isEmpty(b: BlockT): boolean {
  switch (b.kind) {
    case "Kpis": return !b.items.length;
    case "Readings": case "Ranking": return !b.items.length;
    case "Chart": return !b.values.length;
    case "Heat": return !b.rows.length;
    case "Compare": return !b.sides.length;
    case "MapView": return !b.points.length && !(b.shade?.values.length) && !b.outline.length;
    default: return false;
  }
}

function Block(p: BP) {
  const { b, lang } = p;
  if (isEmpty(b)) return <><Head title={"title" in b ? (b as { title: string }).title : b.kind} icon="info" /><p className="st-empty">{T(lang, EMPTY_EN, "இந்தக் காலம், பகுதிக்கு தரவு இல்லை.")}</p></>;
  return <BlockBody {...p} />;
}

function BlockBody(p: BP) {
  const { b, lang, a } = p;
  switch (b.kind) {
    case "Kpis": return (
      <>
        <div className="st-kpis">
          {b.items.map((k) => (
            <div key={k.key} className={`st-kpi t-${k.tone}`}>
              <span className="lbl">{k.label}</span>
              <b className="val">{fmt(k.value)}{k.unit && <small>{k.unit === "%" ? "%" : ` ${k.unit}`}</small>}</b>
              {k.delta != null && k.delta !== 0 && (
                <span className={`dl ${k.delta > 0 ? "up" : "down"}`}><I n={k.delta > 0 ? "up" : "down"} />{fmt(Math.abs(k.delta))}{k.pct != null ? ` (${k.pct > 0 ? "+" : "-"}${Math.abs(k.pct)}%)` : ""}{k.prev != null ? <em>{T(lang, ` vs ${fmt(k.prev)}`, ` / ${fmt(k.prev)}`)}</em> : null}</span>
              )}
              {k.spark.length > 2 && <Spark values={k.spark} />}
            </div>
          ))}
        </div>
      </>
    );
    case "CaseList": return <CaseList {...p} b={b} />;
    case "CaseDetail": return <CaseDetail {...p} b={b} />;
    case "NewsReader": return <News {...p} b={b} />;
    case "Readings": return (
      <>
        <Head title={b.title} icon={b.metric === "lakes" ? "drop" : b.metric === "aqi" ? "wind" : "cloud"} />
        <div className="st-gauges">
          {b.items.map((x, i) => {
            const pct = b.unit.includes("%") ? Math.max(0, Math.min(100, x.value)) : null;
            const vs = x.mean28 != null && x.mean28 > 0 ? Math.round(((x.value - x.mean28) / x.mean28) * 100) : null;
            return (
              <button key={x.id} className={`st-gauge${i === 0 ? " first" : ""}${p.reading?.key === x.name ? " reading" : ""}`} onClick={() => a.station(x.name, b.metric)}>
                {pct != null ? <Ring pct={pct} /> : <span className="big">{fmt(x.value)}<small>{b.unit}</small></span>}
                <span className="nm">{x.name}</span>
                {pct != null && <span className="v">{fmt(x.value)}{b.unit.includes("%") ? "% full" : ` ${b.unit}`}</span>}
                {vs != null && <span className={`vs ${vs >= 0 ? "up" : "down"}`}>{vs >= 0 ? "+" : "-"}{Math.abs(vs)}% {T(lang, "vs 28-day mean", "28 நாள் சராசரியுடன்")}</span>}
                {x.anomaly && <span className="flag"><I n="alert" />{T(lang, "Unusual", "வழக்கத்துக்கு மாறானது")}</span>}
                <time>{when(x.t)}</time>
              </button>
            );
          })}
        </div>
      </>
    );
    case "Ranking": {
      const hasMap = b.items.some((x) => x.zone != null || x.lat != null);
      const v = p.view ?? "chart";
      const pick = (i: number) => {
        const x = b.items[i];
        if (!x) return;
        if (x.action === "zone" && x.zone) a.zone(x.zone);
        else if (x.action === "dept") a.dept(x.key, x.label);
        else if (x.action === "station") a.station(x.label, String(p.doc.slots.measure ?? p.doc.slots.metric ?? "rain"));
      };
      return (
        <>
          <Head title={b.title} icon="barH" sub={b.method}><ViewSwitch id={b.id} views={hasMap ? ["chart", "table", "map"] : ["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
          {v === "chart" && (
            <ol className="st-rank">
              {b.items.map((x, i) => {
                const max = Math.max(...b.items.map((y) => Math.abs(y.value)), 1);
                return (
                  <li key={x.key} className={p.reading?.key === x.key ? "reading" : ""} style={{ ["--w" as string]: `${Math.max(2, (Math.abs(x.value) / max) * 100)}%`, ["--d" as string]: `${i * 60}ms` }}>
                    <button onClick={() => pick(i)} disabled={x.action === "none"}>
                      <span className="rk">{x.rank}</span>
                      <span className="nm">{x.label}{x.sub && <small>{x.sub}</small>}</span>
                      <span className="bar" aria-hidden="true"><i /></span>
                      <b>{fmt(x.value)}{b.unit && b.unit !== "points" ? <small> {b.unit}</small> : null}</b>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {v === "table" && <Table cols={["#", T(lang, "Name", "பெயர்"), `${T(lang, "Value", "மதிப்பு")}${b.unit ? ` (${b.unit})` : ""}`, T(lang, "Detail", "விவரம்")]} rows={b.items.map((x) => [x.rank, x.label, fmt(x.value), x.sub ?? ""])} />}
          {v === "map" && <MapBox geo={p.geo} title={b.title} shade={b.items.some((x) => x.zone != null && x.lat == null) ? { geo: "zone", label: b.title, values: b.items.filter((x) => x.zone != null).map((x) => ({ key: x.zone as number, value: x.value })) } : null}
            pins={b.items.filter((x) => x.lat != null && x.lon != null).map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: `${x.label}: ${fmt(x.value)}`, sev: null, hot: x.rank <= 3 }))}
            outline={b.items.filter((x) => x.zone != null).slice(0, 3).map((x) => x.zone as number)} onZone={a.zone} />}
        </>
      );
    }
    case "MapView": return (
      <>
        <Head title={b.title} icon="map" sub={b.rule} />
        <MapBox geo={p.geo} title={b.title} shade={b.shade} outline={b.outline} onZone={a.zone}
          pins={b.points.map((x) => ({ ...x, hot: x.hot || (p.reading != null && p.reading.key === x.id) }))}
          onPin={(i) => { const x = b.points[i]; if (x && /^INC-/.test(x.id)) a.openCase(x.id); }} />
      </>
    );
    case "Compare": return <Compare {...p} b={b} />;
    case "Trend": {
      const v = p.view ?? "chart";
      return (
        <>
          <Head title={b.title} icon="line" sub={b.marks.length ? T(lang, `${b.marks.length} marked: ${b.marks[0].why.toLowerCase()}`, `${b.marks.length} குறிக்கப்பட்டவை`) : b.normal ? T(lang, "Shaded: the usual range", "நிழல்: வழக்கமான வரம்பு") : null}>
            <ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} />
          </Head>
          {!b.values.length ? <p className="st-empty">{T(lang, "No data for this period.", "இந்தக் காலத்துக்குத் தரவு இல்லை.")}</p>
            : v === "chart" ? <StageChart spec={{ type: "trend", labels: b.labels, values: b.values, unit: b.unit, marks: b.marks, normal: b.normal }} height={230} title={b.title} />
              : <Table cols={[T(lang, "Period", "காலம்"), b.unit]} rows={b.labels.map((l, i) => [l, fmt(b.values[i])])} />}
        </>
      );
    }
    case "Chart": {
      const v = p.view ?? "chart";
      return (
        <>
          <Head title={b.title} icon={b.chart === "donut" ? "donut" : "barH"}><ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
          {v === "chart" ? <StageChart spec={b.chart === "donut" ? { type: "donut", labels: b.labels, values: b.values, unit: b.unit } : { type: "bars", labels: b.labels, values: b.values, keys: b.labels, unit: b.unit, horizontal: b.chart !== "bar" && b.chart !== "line", highlight: null }}
            height={Math.max(180, Math.min(320, b.labels.length * 30 + 30))} title={b.title} />
            : <Table cols={["", b.unit ?? ""]} rows={b.labels.map((l, i) => [l, fmt(b.values[i])])} />}
        </>
      );
    }
    case "Heat": {
      const colMax = b.cols.map((_, j) => Math.max(...b.cells.map((r) => r[j] ?? 0), 0));
      return (
        <>
          <Head title={b.title} icon="grid" />
          <div className="st-heat" role="table" aria-label={b.title} style={{ ["--cols" as string]: b.cols.length }}>
            <div role="row" className="hr"><span role="columnheader" />{b.cols.map((c) => <span key={c} role="columnheader">{c}</span>)}</div>
            {b.rows.map((r, i) => (
              <div role="row" key={r}>
                <span role="rowheader">{r}</span>
                {b.cells[i].map((v, j) => {
                  const t = colMax[j] ? v / colMax[j] : 0;
                  return <span role="cell" key={j} style={{ ["--t" as string]: t.toFixed(3) }} className={t > 0.6 ? "dk" : ""}>{fmt(v)}</span>;
                })}
              </div>
            ))}
          </div>
        </>
      );
    }
    case "Brief": return (
      <>
        <Head title={b.title} icon="scroll" />
        <ol className="st-brief">
          {b.points.map((x, i) => {
            const on = p.reading?.key === `brief-${i}`;
            return (
              <li key={i} className={on ? "reading" : ""} aria-current={on ? "true" : undefined}>
                <span className="n">{i + 1}</span>
                <p>{on ? <Karaoke text={x.text} char={p.reading?.char ?? null} /> : x.text}</p>
                {x.incidentId && <button className="st-link" onClick={() => a.openCase(x.incidentId!)}>{T(lang, "Open", "திற")}<I n="chevr" /></button>}
              </li>
            );
          })}
        </ol>
      </>
    );
    case "Answer": return (
      <>
        <Head title={b.title} icon="bulb" />
        <p className="st-answer">{b.text}</p>
        {b.facts.length > 0 && (
          <dl className="st-facts">
            {b.facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{fmt(f.value)}{f.unit ? <small> {f.unit}</small> : null}</dd></div>)}
          </dl>
        )}
      </>
    );
    case "Drafts": return (
      <>
        <Head title={b.title} icon="send" />
        {!p.tray.length ? <p className="st-empty">{T(lang, "No drafts waiting. Say \"draft action for 2\" on a list of cases.", "காத்திருக்கும் வரைவுகள் இல்லை.")}</p> : (
          <>
            <ol className="st-drafts">{p.tray.map((d, i) => <li key={d.incidentId}><span className="n">{i + 1}</span><b>{d.title}</b><small>{d.to ?? T(lang, "no recipient on record", "பெறுநர் இல்லை")}{d.sandbox ? T(lang, " · sandbox delivery", " · சோதனை வழி") : T(lang, " · send from the Take action panel", "")}</small></li>)}</ol>
            <p className="st-hint">{T(lang, `Nothing is sent until you say "confirm ${p.tray.length}" or press the button.`, `"உறுதி ${p.tray.length}" என்று சொல்லும் வரை எதுவும் அனுப்பப்படாது.`)}</p>
            <div className="st-row"><button className="st-btn primary" onClick={a.confirmTray}><I n="send" />{T(lang, `Approve and send ${p.tray.length}`, `${p.tray.length} அனுப்பு`)}</button><button className="st-btn" onClick={a.discardTray}>{T(lang, "Discard", "நீக்கு")}</button></div>
          </>
        )}
      </>
    );
    case "Note": return <p className="st-note"><I n="info" />{b.text}</p>;
  }
}

function CaseList({ b, doc, lang, reading, a }: BP & { b: Extract<BlockT, { kind: "CaseList" }> }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!reading) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(reading.key)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }, [reading?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Head title={b.title} icon="alert" sub={b.total > b.rows.length ? T(lang, `${b.rows.length} of ${b.total} shown`, `${b.total}-இல் ${b.rows.length}`) : null}>
        {b.rows.length > 1 && <button className="st-btn sm" onClick={() => a.draft(b.rows.slice(0, 3).map((r) => r.id))}><I n="send" />{T(lang, "Draft for the top 3", "முதல் 3-க்கு வரைவு")}</button>}
      </Head>
      {!b.rows.length ? <p className="st-empty">{T(lang, "Nothing matches this view.", "எதுவும் இல்லை.")}</p> : (
        <ol className="st-cases" ref={listRef}>
          {b.rows.map((r, i) => <CaseCard key={r.id} r={r} n={i + 1} asOf={doc.asOf} on={reading?.key === r.id} char={reading?.key === r.id ? reading.char : null} lang={lang} a={a} />)}
        </ol>
      )}
    </>
  );
}

function CaseCard({ r, n, asOf, on, lang, a }: { r: CaseRowT; n: number; asOf: string | null; on: boolean; char: number | null; lang: Lang; a: StageActions }) {
  const ag = age(r.t, asOf);
  return (
    <li data-id={r.id} className={`st-case s-${SEV_CLASS[r.sev ?? ""] ?? "none"}${on ? " reading" : ""}`} style={{ ["--d" as string]: `${Math.min(n, 10) * 45}ms` }} aria-current={on ? "true" : undefined}>
      <button className="main" onClick={() => a.openCase(r.id)}>
        <span className="n">{n}</span>
        <span className="body">
          <b className="t">{r.title}</b>
          <span className="meta">
            {r.sev && <em className="sv">{r.sev}</em>}
            <span><I n="pin" />{[r.place, r.zoneName].filter(Boolean).join(", ") || "Chennai"}</span>
            {ag && <span><I n="clock" />{ag}</span>}
            {r.complaints > 0 && <span><I n="chat" />{r.complaints} {T(lang, r.complaints === 1 ? "complaint" : "complaints", "புகார்")}</span>}
            {r.deptName && <span><I n="gov" />{r.deptName}</span>}
            {r.status && <span className="st">{r.status}</span>}
            {r.overdue && <span className="od"><I n="timer" />{T(lang, "Past deadline", "காலக்கெடு தாண்டியது")}</span>}
          </span>
        </span>
      </button>
      <span className="acts">
        <button onClick={() => a.takeAction(r.id)} title={T(lang, "Take action", "நடவடிக்கை")} aria-label={`${T(lang, "Take action", "நடவடிக்கை")}: ${n}`}><I n="bolt" /></button>
        <button onClick={() => a.draft([r.id])} title={T(lang, "Draft into the approval tray", "வரைவு")} aria-label={`${T(lang, "Draft", "வரைவு")}: ${n}`}><I n="send" /></button>
        <button onClick={() => a.showOnMainMap({ incidentId: r.id })} title={T(lang, "Show on the main map", "முதன்மை வரைபடத்தில்")} aria-label={`${T(lang, "Show on the main map", "வரைபடம்")}: ${n}`}><I n="map" /></button>
      </span>
    </li>
  );
}

function CaseDetail({ b, lang, a, doc }: BP & { b: Extract<BlockT, { kind: "CaseDetail" }> }) {
  const r = b.incident;
  return (
    <article className={`st-detail s-${SEV_CLASS[r.sev ?? ""] ?? "none"}`}>
      <div className="st-dhead">
        <span className="chips">{r.sev && <em className="sv">{r.sev}</em>}{r.status && <em>{r.status}</em>}{r.overdue && <em className="od">{T(lang, "Past deadline", "காலக்கெடு தாண்டியது")}</em>}</span>
        <h3>{r.title}</h3>
        <p className="id">{r.id}</p>
      </div>
      <dl className="st-dl">
        <div><dt>{T(lang, "Where", "எங்கே")}</dt><dd>{[r.place, r.ward ? `Ward ${r.ward}` : null, r.zoneName].filter(Boolean).join(", ") || "-"}</dd></div>
        <div><dt>{T(lang, "Since", "எப்போது")}</dt><dd>{when(r.t)}{age(r.t, doc.asOf) ? ` (${age(r.t, doc.asOf)})` : ""}</dd></div>
        <div><dt>{T(lang, "Department", "துறை")}</dt><dd>{r.deptName ?? "-"}</dd></div>
        <div><dt>{T(lang, "Deadline", "காலக்கெடு")}</dt><dd>{r.deadline ?? "-"}</dd></div>
        <div><dt>{T(lang, "Complaints", "புகார்கள்")}</dt><dd>{r.complaints}</dd></div>
        <div><dt>{T(lang, "Kind", "வகை")}</dt><dd>{r.cat ?? "-"}</dd></div>
      </dl>
      {r.what.length > 0 && <ul className="st-what">{r.what.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {r.why && <p className="st-why"><I n="alert" />{r.why}</p>}
      {r.next && <p className="st-next"><I n="right" />{r.next}</p>}
      {r.officials.length > 0 && <p className="st-off"><I n="user" />{r.officials.map((o) => `${o.name}, ${o.role}`).join(" · ")}</p>}
      <div className="st-row">
        <button className="st-btn primary" onClick={() => a.takeAction(r.id)}><I n="bolt" />{T(lang, "Take action", "நடவடிக்கை")}</button>
        <button className="st-btn" onClick={() => a.draft([r.id])}><I n="send" />{T(lang, "Draft to tray", "வரைவு")}</button>
        <button className="st-btn" onClick={() => a.showOnMainMap({ incidentId: r.id })}><I n="map" />{T(lang, "On the main map", "வரைபடத்தில்")}</button>
        <button className="st-btn" onClick={() => a.openInConsole(r.id)}><I n="ext" />{T(lang, "Open in console", "பலகையில் திற")}</button>
      </div>
      {b.timeline.length > 0 && (
        <ol className="st-tl">{b.timeline.map((x, i) => <li key={i}><time>{x.t}</time><span className="src">{x.source}</span><span>{x.text}</span></li>)}</ol>
      )}
    </article>
  );
}

function News({ b, lang, reading, a }: BP & { b: Extract<BlockT, { kind: "NewsReader" }> }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!reading) return;
    ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(reading.key)}"]`)?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }, [reading?.key]);
  return (
    <>
      <Head title={b.title} icon="news" sub={b.total > b.items.length ? T(lang, `${b.items.length} newest of ${b.total}`, `${b.total}-இல் புதிய ${b.items.length}`) : null} />
      <ol className="st-news" ref={ref}>
        {b.items.map((x, i) => {
          const on = reading?.key === x.id;
          return (
            <li key={x.id} data-id={x.id} className={on ? "reading" : ""} aria-current={on ? "true" : undefined} style={{ ["--d" as string]: `${Math.min(i, 10) * 45}ms` }}>
              <span className="n">{i + 1}</span>
              <div className="body">
                <p className="hl">{on ? <Karaoke text={`${reading?.lead ?? ""}${x.title}`} char={reading?.char ?? null} strip={reading?.lead ?? ""} /> : x.title}</p>
                <span className="meta">
                  {x.source && <span><I n="news" />{x.source}</span>}
                  {x.t && <span><I n="clock" />{when(x.t)}</span>}
                  {x.place && <span><I n="pin" />{x.place}</span>}
                </span>
              </div>
              <span className="acts">
                {x.incidentId && <button className="st-link" onClick={() => a.openCase(x.incidentId!)}>{T(lang, "Incident", "சம்பவம்")}<I n="chevr" /></button>}
                {x.url && <a className="st-link" href={x.url} target="_blank" rel="noopener noreferrer">{T(lang, "Article", "கட்டுரை")}<I n="ext" /></a>}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The sentence being read, the word under the voice highlighted (from the speech engine's word boundaries). */
function Karaoke({ text, char, strip = "" }: { text: string; char: number | null; strip?: string }) {
  const body = text.slice(strip.length);
  if (char == null) return <span className="kk">{body}</span>;
  const c = Math.max(0, char - strip.length);
  const end = body.slice(c).search(/\s|$/);
  const stop = end < 0 ? body.length : c + end;
  return <span className="kk"><span className="done">{body.slice(0, c)}</span><mark>{body.slice(c, stop)}</mark>{body.slice(stop)}</span>;
}

function Compare({ b, lang, view, a }: BP & { b: Extract<BlockT, { kind: "Compare" }> }) {
  const v = view ?? "chart";
  const maxOf = (k: string) => Math.max(...b.sides.map((s) => s.values[k] ?? 0));
  return (
    <>
      <Head title={b.title} icon="compare"><ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
      <div className="st-cmp" style={{ ["--n" as string]: b.sides.length }}>
        <div className="st-cmp-head"><span />{b.sides.map((s, i) => <b key={s.key} className={`c${i + 1}`}><i aria-hidden="true" />{s.zone ? <button className="st-link" onClick={() => a.zone(s.zone!)}>{s.label}</button> : s.label}</b>)}</div>
        {b.metrics.map((m) => (
          <div key={m.key} className="st-cmp-row">
            <span>{m.label}</span>
            {b.sides.map((s) => {
              const val = s.values[m.key] ?? 0;
              const top = val > 0 && val === maxOf(m.key) && b.sides.filter((x) => (x.values[m.key] ?? 0) === val).length === 1;
              return <b key={s.key} className={top ? "top" : ""}>{fmt(val)}</b>;
            })}
          </div>
        ))}
      </div>
      {b.diffs.length > 0 && (
        <div className="st-diffs">
          <h4>{T(lang, "What differs most", "அதிக வேறுபாடு")}</h4>
          <ul>{b.diffs.slice(0, 3).map((d) => <li key={d.metric}><b>{d.label}</b>: {d.hi} {d.ratio ? `${d.ratio}×` : `+${fmt(d.gap)}`} {T(lang, "of", "")} {d.lo}</li>)}</ul>
        </div>
      )}
      {v === "chart" && (
        <div className="st-cmp-charts">
          <StageChart spec={{ type: "group", categories: b.metrics.map((m) => m.label), series: b.sides.map((s) => ({ name: s.label, values: b.metrics.map((m) => s.values[m.key] ?? 0) })), unit: null }} height={240} title={b.title} />
          {b.sides.some((s) => s.series.length > 1) && <StageChart spec={{ type: "lines", labels: b.seriesLabels, series: b.sides.map((s) => ({ name: s.label, values: s.series })), unit: "incidents" }} height={220} title={T(lang, "Incidents reported over the period", "காலம் முழுவதும்")} />}
          {b.sides.some((s) => s.cats.length) && (
            <div className="st-cmp-cats">
              {b.sides.map((s, i) => <div key={s.key}><h4 className={`c${i + 1}`}><i aria-hidden="true" />{s.label}</h4><ol>{s.cats.slice(0, 5).map((c) => <li key={c.code}><span>{c.label}</span><b>{fmt(c.n)}</b></li>)}</ol></div>)}
            </div>
          )}
        </div>
      )}
      {v === "table" && <Table cols={["", ...b.sides.map((s) => s.label)]} rows={b.metrics.map((m) => [m.label, ...b.sides.map((s) => fmt(s.values[m.key] ?? 0))])} />}
    </>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="st-tablewrap">
      <table className="st-table">
        <thead><tr>{cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

function MapBox({ geo, title, shade, pins, outline, onZone, onPin }: { geo: MapGeo | null; title: string; shade: Extract<BlockT, { kind: "MapView" }>["shade"]; pins: { n: number | null; id: string; lat: number; lon: number; label: string; sev: string | null; hot: boolean }[]; outline: number[]; onZone?: (z: number) => void; onPin?: (i: number) => void }) {
  const panel = useMemo<PanelData>(() => ({
    id: "stage", plan: { agg: "count" } as unknown as PanelData["plan"], title, subtitle: shade?.label ?? "", chart: "map",
    labels: (shade?.values ?? []).map((x) => String(x.key)), values: (shade?.values ?? []).map((x) => x.value), keys: (shade?.values ?? []).map((x) => x.key),
    geo: shade?.geo ?? null, points: [], total: 0, rows: 0, format: "int", unit: null, kpi: null, table: null, note: null
  }), [title, shade]);
  return <div className="st-map"><StudioMap geo={geo} panel={panel} focusZone={null} onZone={onZone} pins={pins} outline={outline} onPin={onPin} /></div>;
}

function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className="st-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="trk" />
      <circle cx="32" cy="32" r={r} className="val" style={{ strokeDasharray: `${(pct / 100) * c} ${c}` }} />
      <text x="32" y="36" textAnchor="middle">{Math.round(pct)}%</text>
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 26}`).join(" ");
  return <svg className="st-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} /></svg>;
}
