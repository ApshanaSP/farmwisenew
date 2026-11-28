"use client";
/**
 * Thunai's Stage: the full-screen answer it builds for the Collector (portal on <body>, the console stays underneath).
 * It renders only the closed catalog in lib/thunai/stage.ts, every number from the document code built from the data.
 * Everything on it can be clicked or said: open a case, draft for it, show it on the main map, drill into a zone or a
 * department, switch a block between chart, table and map, change the period or the area, pin, export, save.
 * Thunai.tsx owns the document, the narration and the actions; this file draws them.
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapGeo } from "@/lib/collector/geo";
import type { PanelData } from "@/lib/studio/types";
import type { BlockT, CaseRowT, StageDocT } from "@/lib/thunai/stage";
import type { Lang } from "@/lib/thunai/types";
import { ZONE_NAMES } from "@/lib/thunai/lexicon";
import StudioMap from "../studio/StudioMap";
import { I, type IconName } from "../icons";
import StageChart from "./StageChart";
import { StudioActions, type StudioMsg } from "./StudioAnswer";
import { chartHeight, chartSpecOf, compareGroups } from "./chartspec";
import { UNIT_TA } from "@/lib/thunai/stagelocal";
import { WHOLE_SAID } from "@/lib/thunai/v19/whole";
import "leaflet/dist/leaflet.css";
import "../studio/studio.css";
import { CountUp } from "./countup";
import { tabStop } from "./hudstore";
import { SETTLE_MS } from "./hudview";
import "./stage.css";

/** Jarvis mode is on: the tiles count up */
const hudOn = () => typeof document !== "undefined" && document.documentElement.classList.contains("jv-hud");

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
  /**
   * the subtitles: what was heard and what Thunai is saying (the console's dock hides while the Stage is open). `streaming`: the
   * answer's words are still arriving (the live region waits for all of them, then reads the answer once)
   */
  caption: { heard: string; reply: string; alt?: string; interim: boolean; by: string | null; streaming?: boolean };
  a: StageActions;
}

const T = (lang: Lang, en: string, ta: string) => (lang === "ta" ? ta : en);
const PERIODS = [["daily", "Today", "இன்று"], ["weekly", "7 days", "7 நாள்"], ["monthly", "30 days", "30 நாள்"], ["quarterly", "90 days", "90 நாள்"]] as const;
// v18: the summary and the readings and prices take any window too
const SCOPED = new Set(["cases", "map", "dashboard", "trend", "why", "news", "performance", "ranking", "compare", "brief", "summary", "ask", "readings", "prices"]);
/** v19: an analyst's plan asked over another window (its requests' own times replaced), as the window controls set it */
// (its heading was for the window it was asked over: code's own heading is used)
const WINDOW_SAID: Record<string, string> = { daily: "today", weekly: "last 7 days", monthly: "last 30 days", quarterly: "last 90 days" };
const planOver = (plan: unknown, time: { said: string | null; from: string | null; to: string | null; hours: null } | null): unknown => {
  const p = plan as { queries?: Record<string, unknown>[] } | null | undefined;
  // (live roads and a station's latest reading have no window; the whole district stays the whole district)
  const live = (q: Record<string, unknown>) => !!time?.said && !q.time && q.of !== "incidents" && q.of !== "news" && q.of !== "rain" && q.of !== "prices";
  return p && Array.isArray(p.queries) ? { ...p, title: "", title_ta: "", understood: WHOLE_SAID.test(String((p as { understood?: string }).understood ?? "")) ? "the whole district" : "", queries: p.queries.map((q) => (live(q) ? q : { ...q, time })) } : plan;
};
/** v18: a drill as the Stage follows it (stage.ts Drill) */
type DrillT = NonNullable<Extract<BlockT, { kind: "Kpis" }>["items"][number]["drill"]>;
const go = (a: StageActions, d: DrillT | null | undefined) => { if (d) a.direct(d.recipe, d.slots, d.label); };
/** "2026-11-20 00:00:00" -> "2026-11-20" (a date input's value); the last whole day of an exclusive bound */
const dayInput = (t: string | null | undefined, exclusiveEnd = false): string => {
  if (!t) return "";
  const ms = Date.parse(`${t.replace(" ", "T")}+05:30`) - (exclusiveEnd ? 1000 : 0);
  return Number.isFinite(ms) ? new Date(ms + 330 * 60_000).toISOString().slice(0, 10) : "";
};
const todayInput = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
/** a date input's "2026-11-20" as a calendar day of lib/period/read.ts */
const dayOf = (v: string) => { const [y, m, d] = v.split("-").map(Number); return { day: d, month: m - 1, year: y }; };
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** a unit as the screen's language says it (the data's units are English codes: "incidents", "days", "₹/kg") */
const unitIn = (u: string | null, lang: Lang): string | null => (u && lang === "ta" ? UNIT_TA[u] ?? (u === "points" ? "புள்ளிகள்" : u) : u);

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

/**
 * v18: a summary dashboard's spans: the key numbers and the key points across the page, the kinds and the days side by side, the areas and the
 * departments side by side, the cases and the map each across the page, the news across, the readings and the prices in pairs. Nothing is
 * sticky and nothing scrolls inside a box: the screen scrolls as one page.
 */
function summarySpans(blocks: BlockT[]): number[] {
  const n = (k: BlockT["kind"]) => blocks.filter((b) => b.kind === k).length;
  return blocks.map((b) => {
    switch (b.kind) {
      case "Chart": return n("Trend") ? 6 : 12;
      case "Trend": return n("Chart") ? 6 : 12;
      case "Ranking": return n("Ranking") >= 2 ? 6 : 12;
      // (two short sets of readings side by side; a long one, or one alone, across the page)
      case "Readings": { const rs = blocks.filter((x): x is Extract<BlockT, { kind: "Readings" }> => x.kind === "Readings"); return rs.length === 2 && rs.every((x) => x.items.length <= 4) ? 6 : 12; }
      case "Answer": return n("Answer") >= 2 || n("Readings") ? 6 : 12;
      // (28 Nov: a comparison's sides, each side's cases and each side's news, two to a row)
      case "CaseList": return /^top-/.test(b.id) && blocks.filter((x) => x.kind === "CaseList" && /^top-/.test(x.id)).length >= 2 ? 6 : 12;
      case "NewsReader": return /^news-/.test(b.id) && blocks.filter((x) => x.kind === "NewsReader" && /^news-/.test(x.id)).length >= 2 ? 6 : 12;
      default: return 12;
    }
  });
}

/**
 * The brain's answer (its id starts with "b-"): the words beside the first picture, the points under them, every list across the page. With no
 * picture the words and the points stand side by side.
 */
function brainSpans(blocks: BlockT[]): number[] {
  const pic = !!blocks[1] && ["Ranking", "Chart", "Trend", "Heat", "Kpis", "MapView"].includes(blocks[1].kind);
  const short = blocks[0]?.kind === "Answer" && blocks[0].text.length <= 520;
  return blocks.map((b, i) => {
    if (i === 0) return pic ? (short ? 5 : 6) : blocks[1]?.kind === "Brief" && short ? 6 : 12;
    if (i === 1 && pic) return short ? 7 : 6;
    if (i === 1 && b.kind === "Brief" && short) return 6;
    if (b.kind === "Chart" || b.kind === "Ranking") return 6;
    return 12;
  });
}

/** Grid spans (of 12) for the blocks, by what sits next to what. */
function spans(blocks: BlockT[]): number[] {
  // KPI tiles sit on their own row: the layout of the rest is decided without them
  const kinds = blocks.map((b) => b.kind).filter((k) => k !== "Kpis");
  return blocks.map((b) => {
    const other = kinds.filter((k) => k !== b.kind);
    switch (b.kind) {
      case "Kpis": case "NewsReader": case "Note": case "Drafts": return 12;
      case "Compare": return other.includes("MapView") ? 8 : 12;
      case "CaseList": return other.includes("MapView") && kinds.length <= 3 ? 6 : kinds.length >= 5 ? 7 : other.includes("Chart") || other.includes("Answer") ? 12 : 12;
      case "MapView": return other.includes("Compare") ? 4 : kinds[0] === "MapView" ? 7 : other.includes("CaseList") && kinds.length <= 3 ? 6 : other.includes("Readings") || other.includes("CaseDetail") ? 4 : 7;
      case "Ranking": return other.includes("Trend") && !other.includes("MapView") ? 4 : other.includes("MapView") ? 5 : 12;
      case "Trend": return other.includes("Ranking") && !other.includes("MapView") ? 8 : other.includes("Heat") ? 6 : kinds.length >= 5 ? 5 : 12;
      case "Heat": return other.includes("Trend") ? 6 : 12;
      case "Readings": case "CaseDetail": return other.includes("MapView") ? 8 : 12;
      // (a chart alone has the page)
      case "Chart": return kinds.length === 1 ? 12 : 6;
      case "Answer": return 6;
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
  const [look, setLook] = useState<Record<string, string>>({});
  // the console's own UI font and accent (FarmWise green), read once: a screen looks like the dashboard it came from
  useEffect(() => {
    const dic = document.querySelector<HTMLElement>(".dic");
    if (!dic) return;
    const cs = getComputedStyle(dic), v = (k: string) => cs.getPropertyValue(k).trim();
    if (v("--font-ui")) setFont(v("--font-ui"));
    const accent = (p.theme === "dark" ? v("--accent") : v("--accent-3")) || v("--accent");
    if (accent) setLook({ "--accent": accent, "--accent-fill": v("--accent-3") || accent, "--signal": accent, ...(v("--accent-soft") ? { "--accent-soft": v("--accent-soft") } : {}) });
  }, [p.theme]);
  // focus moves in, stays in (Tab cycles inside, and through the HUD's own controls when the HUD is up), and returns to where it was on close; set up once, live values by ref
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (menuRef.current) setMenu(null); else aRef.current.close(); return; }
      if (e.key !== "Tab" || !root.current) return;
      const inBox = (box: Element | null) => (box ? [...box.querySelectorAll<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled") && x.offsetParent !== null) : []);
      const at = document.activeElement as HTMLElement | null, hudEl = document.querySelector(".hud");
      const next = tabStop(inBox(root.current), inBox(hudEl), at, e.shiftKey, !!at && (root.current.contains(at) || !!hudEl?.contains(at)));
      if (next) { e.preventDefault(); next.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); before?.focus?.({ preventScroll: true }); };
  }, []);
  // a new screen replaces the old one's buttons: focus goes to its title, never to the console behind
  const firstDoc = useRef(true);
  useEffect(() => {
    if (firstDoc.current) { firstDoc.current = false; return; }
    if (document.activeElement?.closest?.(".hud")) return;
    if (!root.current?.contains(document.activeElement) || document.activeElement === document.body) titleRef.current?.focus({ preventScroll: true });
  }, [doc.id]);

  // (28 Nov: a dashboard's AI summary, id "ai", runs across the page above it; the rest are laid out as they were without it)
  const sp = useMemo(() => {
    const rest = doc.blocks.filter((b) => b.id !== "ai");
    const board = doc.recipe === "compare" && rest.some((b) => b.kind === "Compare" && !!b.chart);
    const s = doc.recipe === "answer" && doc.id.startsWith("b-") ? brainSpans(rest) : doc.recipe === "summary" || board || rest.length > 6 ? summarySpans(rest) : spans(rest);
    let j = 0;
    return doc.blocks.map((b) => (b.id === "ai" ? 12 : s[j++]));
  }, [doc.blocks, doc.recipe, doc.id]);
  // v18 (24 Nov, the owner: "a small scrolling space, insights overlapping; I want a large scrolling space where I can see all the insights one
  // by one"): the screen always scrolls as one page, each part at its natural height; no part scrolls inside its own small box
  const fit = false;
  // v18: the whole screen scrolls as one page (header included, stage.css); once its header has scrolled away, Back, Top and Close float at the top
  const frameRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { frameRef.current?.scrollTo({ top: 0 }); setScrolled(false); }, [doc.id]);
  // v18: the window the screen counts, and the date pickers to set any other
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => { setFrom(dayInput(doc.when?.from)); setTo(dayInput(doc.when?.to, true)); }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRange = () => {
    if (!from) return;
    const end = to || from;
    const max = todayInput();
    const lo = (from <= end ? from : end) > max ? max : from <= end ? from : end, hi = (from <= end ? end : from) > max ? max : from <= end ? end : from;
    const span = { kind: "days", from: dayOf(lo), to: dayOf(hi) };
    const rest = { ...(doc.slots as Record<string, unknown>) };
    delete rest.span;
    // v19: an analyst's screen asks the same over those days
    if (doc.recipe === "ask") { a.direct("ask", { ...rest, plan: planOver(rest.plan, { said: null, from: lo, to: hi, hours: null }) }, `${doc.title} (${lo === hi ? lo : `${lo} to ${hi}`})`); return; }
    a.direct(doc.recipe, { ...rest, span }, `${doc.title} (${lo === hi ? lo : `${lo} to ${hi}`})`);
  };
  /** the map over the whole answer area ("Enlarge map"), back with "Back to the list" */
  const [bigMap, setBigMap] = useState(false);
  useEffect(() => { setBigMap(false); }, [doc.id]);
  // the map redraws its tiles for its new size (it grows with "Enlarge map" and with the fitted layout)
  useEffect(() => { const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 80); return () => clearTimeout(t); }, [bigMap, doc.id]);
  const slots = doc.slots as Record<string, unknown>;
  // v19: the analyst's screen: its area is its requests' own; a live answer has no window to choose
  const askQs = doc.recipe === "ask" ? ((slots.plan as { queries?: { zones?: number[]; time?: unknown }[] } | undefined)?.queries ?? []) : [];
  // (its heading is in the language its parts are in: a Tamil question's Tamil screen had an English heading)
  const stTitle = (doc.recipe === "ask" ? doc.title : doc.titles?.[lang]) || doc.title;
  // (nor has one that sets two windows side by side)
  const liveOnly = doc.recipe === "ask" && ((!!doc.when && !doc.when.from && !doc.when.to) || new Set(askQs.map((q) => JSON.stringify(q.time ?? null))).size > 1);
  const zones = askQs.length === 1 ? askQs[0].zones ?? [] : Array.isArray(slots.zones) ? (slots.zones as number[]) : [];
  // (a preset clears a window of its own dates: the four buttons are the console's own windows)
  const setPeriod = (period: string) => { const rest = { ...slots }; delete rest.span; a.direct(doc.recipe, { ...rest, period, ...(doc.recipe === "ask" ? { plan: planOver(rest.plan, { said: WINDOW_SAID[period] ?? null, from: null, to: null, hours: null }) } : {}) }, `${doc.title} (${period})`); };
  const setZone = (z: number | null) => doc.recipe === "ask" ? a.direct("ask", { ...slots, fresh: true, plan: { ...(slots.plan as object), title: "", title_ta: "", understood: "", queries: askQs.map((q) => ({ ...q, zones: z ? [z] : [], place: null, ward: null, taluk: null })) } }, doc.title) : a.direct(doc.recipe, doc.recipe === "compare" ? slots : { ...slots, zones: z ? [z] : [] }, doc.title);
  const metric = typeof slots.metric === "string" ? slots.metric : typeof slots.measure === "string" && ["rain", "aqi", "lakes", "temp"].includes(slots.measure as string) ? (slots.measure as string) : null;
  // for screen readers: what the screen is doing, or the answer once it has stopped growing (half a second settled, and never while
  // its words are still streaming in), so an answer is read once, not again with every sentence
  const liveNow = p.busy ?? (p.caption.streaming ? null : p.caption.reply);
  const [announced, setAnnounced] = useState(liveNow ?? "");
  useEffect(() => {
    if (liveNow == null) return;
    const t = setTimeout(() => setAnnounced(liveNow), SETTLE_MS);
    return () => clearTimeout(t);
  }, [liveNow]);

  return createPortal(
    <div className="st-root" lang={p.lang} data-theme={p.theme} data-busy={p.busy ? "1" : undefined} ref={root} role="dialog" aria-modal="true" aria-labelledby="st-title" data-thunai-ui
      style={{ ...(font ? { ["--st-font" as string]: font } : {}), ...look } as React.CSSProperties}>
      <div className="st-scrim" aria-hidden="true" />
      <div className="st-frame" ref={frameRef} onScroll={(e) => { const s = (e.currentTarget as HTMLDivElement).scrollTop > 140; if (s !== scrolled) setScrolled(s); }}>
        {/* v18: Back, Top and Close stay in reach while the page is scrolled */}
        <div className={`st-float${scrolled ? " on" : ""}`} aria-hidden={!scrolled}>
          <div>
            <span className="st-float-t">{stTitle}</span>
            {a.back && <button className="st-back" onClick={a.back} tabIndex={scrolled ? 0 : -1}><I n="chevl" />{T(lang, "Back", "பின்செல்")}</button>}
            <button className="st-icon" onClick={() => frameRef.current?.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })} tabIndex={scrolled ? 0 : -1} aria-label={T(lang, "Back to the top", "மேலே")} title={T(lang, "Back to the top", "மேலே")}><I n="up" /></button>
            <button className="st-icon st-close" onClick={a.close} tabIndex={scrolled ? 0 : -1} aria-label={T(lang, "Close this screen", "இந்தத் திரையை மூடு")} title={T(lang, "Close this screen", "இந்தத் திரையை மூடு")}><I n="x" /></button>
          </div>
        </div>
        <header className="st-head">
          <div className="st-titles">
            <div className="st-crumbs">
              {/* v18: Back to the screen this one was opened from (a tile, a point, a bar clicked), in words */}
              {a.back && <button className="st-back" onClick={a.back} title={T(lang, "Back to the previous screen", "முந்தைய திரைக்கு")}><I n="chevl" />{T(lang, "Back", "பின்செல்")}</button>}
              <button className="st-home" onClick={a.close}><I n="x" />{T(lang, "Back to dashboard", "டாஷ்போர்டுக்குத் திரும்பு")}</button>
              <span className="st-kicker"><span className={`st-live${p.narrating ? " on" : ""}`} aria-hidden="true" />Jarvis</span>
            </div>
            <h2 id="st-title" ref={titleRef} tabIndex={-1}>{stTitle}</h2>
            {/* v16 (the browser drive): in the screen's own language, as its title and blocks are (a Tamil screen showed this line in English) */}
            {doc.takeaway && <p className="st-take"><I n="spark" />{doc.takeaway[doc.lang === "ta" || doc.lang === "en" ? doc.lang : lang] || doc.takeaway[lang]}</p>}
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
            <button ref={closeBtn} className="st-icon st-close" onClick={a.close} aria-label={T(lang, "Close this screen", "இந்தத் திரையை மூடு")} title={T(lang, "Close this screen", "இந்தத் திரையை மூடு")}><I n="x" /></button>
          </div>
        </header>

        {p.saveAsk && <div className="st-confirm" role="alert">{p.saveAsk}</div>}

        {/* only the period and the area stay above the answer: questions and follow-ups go in Jarvis's panel beside it */}
        <div className="st-bar slim" hidden={!SCOPED.has(doc.recipe)}>
          {SCOPED.has(doc.recipe) && (
            <div className="st-filters" role="group" aria-label={T(lang, "Filters", "வடிகட்டிகள்")}>
              <div className="st-seg" role="group" aria-label={T(lang, "Period", "காலம்")} hidden={liveOnly}>
                {PERIODS.map(([k, en, ta]) => {
                  const on = !doc.when && doc.scope.period === k;
                  return <button key={k} aria-pressed={on} className={on ? "on" : ""} onClick={() => setPeriod(k)} disabled={!!p.busy}>{lang === "ta" ? ta : en}</button>;
                })}
              </div>
              {/* v18: the window of its own dates this screen counts ("last 2 days", "20 Nov"), and any other: from, to, Show */}
              {doc.when && <span className="st-when" title={doc.when.from && doc.when.to ? `${doc.when.from} → ${doc.when.to}` : undefined}><I n="clock" />{lang === "ta" ? doc.when.ta : doc.when.en}</span>}
              <form className="st-range" hidden={liveOnly} onSubmit={(e) => { e.preventDefault(); setRange(); }} aria-label={T(lang, "Any dates", "எந்தத் தேதியும்")}>
                <label><span>{T(lang, "From", "முதல்")}</span><input type="date" value={from} max={todayInput()} onChange={(e) => setFrom(e.target.value)} disabled={!!p.busy} /></label>
                <label><span>{T(lang, "To", "வரை")}</span><input type="date" value={to} max={todayInput()} onChange={(e) => setTo(e.target.value)} disabled={!!p.busy} /></label>
                <button type="submit" className="st-btn sm" disabled={!!p.busy || !from}>{T(lang, "Show", "காட்டு")}</button>
              </form>
              {doc.recipe !== "compare" && doc.recipe !== "performance" && !(doc.recipe === "ask" && askQs.length > 1) && (
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


        {/* v18 round 2 (the owner: "I don't know what all the tiles in the preview are; it is still difficult to scroll down"): every part of
            the screen by its title, one click to it */}
        {doc.blocks.filter((b) => b.kind !== "Note").length >= 4 && (
          <nav className="st-index" aria-label={T(lang, "On this screen", "இந்தத் திரையில்")}>
            <span>{T(lang, "On this screen", "இந்தத் திரையில்")}</span>
            {doc.blocks.filter((b) => b.kind !== "Note").map((b) => {
              const t = ("title" in b ? String((b as { title: string }).title) : b.kind).split(" · ")[0];
              return <button key={b.id} type="button" onClick={() => document.getElementById(`st-sec-${b.id}`)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" })}>{t}</button>;
            })}
          </nav>
        )}

        <main className={`st-grid${fit ? " fit" : ""}${bigMap ? " bigmap" : ""}`} key={doc.id} aria-busy={!!p.busy}>
          {doc.blocks.map((b, i) => (
            <section key={`${doc.id}-${b.id}`} id={`st-sec-${b.id}`} className={`st-block k-${b.kind}${b.id === "ai" ? " st-ai" : ""}`} style={{ ["--span" as string]: sp[i], ["--i" as string]: i }} aria-label={"title" in b ? (b as { title: string }).title : b.kind}>
              <AboutCtx.Provider value={(b as { about?: string | null }).about ?? null}>
                <Block b={b} doc={doc} lang={lang} reading={p.reading} view={p.views[b.id] ?? null} geo={p.geo} tray={p.tray} a={a}
                  big={bigMap} setBig={doc.blocks.length > 1 ? setBigMap : undefined} />
              </AboutCtx.Provider>
            </section>
          ))}
          {p.busy && <div className="st-busy"><span className="st-beat" aria-hidden="true" />{p.busy}</div>}
        </main>

        <p className="st-sr" role="status" aria-live="polite">{announced}</p>
        <footer className="st-foot">
          {doc.asOf && <span title={`${T(lang, "From", "ஆதாரம்")}: ${doc.sources.join(", ") || "-"}`}><I n="clock" />{T(lang, "Data as of", "தரவு நேரம்")} {when(doc.asOf)}</span>}
          {/* the notes in the reader's language; a note with nothing in it is not shown as a blank */}
          {(doc.notesBi?.map((n) => n[lang]) ?? doc.notes).filter((n) => n && n.trim()).map((n) => <span key={n} className="note">{n}</span>)}
        </footer>
      </div>
    </div>,
    document.body
  );
}
export default memo(Stage);

// ------------------------------------------------------------------ blocks --

interface BP { b: BlockT; doc: StageDocT; lang: Lang; reading: Props["reading"]; view: BlockView | null; geo: MapGeo | null; tray: StageDraft[]; a: StageActions;
  /** the map enlarged over the answer area, and its switch (none when the map is the only block) */
  big?: boolean; setBig?: (v: boolean) => void }

/** v18 round 2: the part's own line of what it shows (stage.ts ABOUT), handed to its heading by the section that holds it */
const AboutCtx = createContext<string | null>(null);

function Head({ title, icon, children, sub }: { title: string; icon: IconName; children?: React.ReactNode; sub?: string | null }) {
  const about = useContext(AboutCtx);
  return (
    <header className="st-bh">
      <h3><I n={icon} />{title}</h3>
      {about && <p className="st-about">{about}</p>}
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
    case "Table": return !b.rows.length;
    case "Timeline": return !b.items.length;
    case "Lines": return !b.labels.length;
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
        <Head title={b.title || T(lang, "Key numbers", "முக்கிய எண்கள்")} icon="spark" />
        <div className="st-kpis">
          {b.items.map((k) => {
            // v18: a tile with records behind it opens them
            const Tag = k.drill ? "button" : "div";
            return (
            <Tag key={k.key} className={`st-kpi t-${k.tone}${k.drill ? " drill" : ""}`} {...(k.drill ? { type: "button" as const, onClick: () => go(a, k.drill), title: T(lang, `Open: ${k.drill.label}`, `திற: ${k.drill.label}`) } : {})}>
              <span className="lbl">{k.label}{k.drill && <I n="chevr" />}</span>
              <b className="val">{hudOn() ? <CountUp value={k.value} format={fmt} /> : fmt(k.value)}{k.unit && <small>{k.unit === "%" ? "%" : ` ${unitIn(k.unit, lang)}`}</small>}</b>
              {k.delta == null && k.pct != null && k.pct !== 0 && <span className={`dl ${k.pct > 0 ? "up" : "down"}`}><I n={k.pct > 0 ? "up" : "down"} />{`${k.pct > 0 ? "+" : "-"}${Math.abs(k.pct)}%`}<em>{T(lang, " vs the period before", " முந்தைய காலத்துடன்")}</em></span>}
              {k.delta != null && k.delta !== 0 && (
                <span className={`dl ${k.delta > 0 ? "up" : "down"}`}><I n={k.delta > 0 ? "up" : "down"} />{fmt(Math.abs(k.delta))}{k.pct != null ? ` (${k.pct > 0 ? "+" : "-"}${Math.abs(k.pct)}%)` : ""}{k.prev != null ? <em>{T(lang, ` vs ${fmt(k.prev)}`, ` / ${fmt(k.prev)}`)}</em> : null}</span>
              )}
              {k.spark.length > 2 && <Spark values={k.spark} />}
            </Tag>
            );
          })}
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
              <button key={x.id} className={`st-gauge${i === 0 ? " first" : ""}${p.reading?.key === x.name ? " reading" : ""}`} onClick={() => (x.drill ? go(a, x.drill) : a.station(x.name, b.metric))}>
                {pct != null ? <Ring pct={pct} /> : <span className="big">{fmt(x.value)}<small>{unitIn(b.unit, lang)}</small></span>}
                <span className="nm">{x.name}</span>
                {pct != null && <span className="v">{fmt(x.value)}{b.unit.includes("%") ? T(lang, "% full", "% நிரம்பியது") : ` ${unitIn(b.unit, lang)}`}</span>}
                {vs != null && <span className={`vs ${vs >= 0 ? "up" : "down"}`}>{vs >= 0 ? "+" : "-"}{Math.abs(vs)}% {T(lang, "vs 28-day mean", "28 நாள் சராசரியுடன்")}</span>}
                {x.anomaly && <span className="flag"><I n="alert" />{T(lang, "Unusual", "வழக்கத்துக்கு மாறானது")}</span>}
                {x.detail && <span className="dt">{x.detail}</span>}
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
        // v18: the item's own records, in this screen's window, when it has them
        if (x.drill) go(a, x.drill);
        else if (x.action === "zone" && x.zone) a.zone(x.zone);
        else if (x.action === "dept") a.dept(x.key, x.label);
        else if (x.action === "station") a.station(x.label, String(p.doc.slots.measure ?? p.doc.slots.metric ?? "rain"));
      };
      // v18 (review, 24 Nov): a zone clicked on the map view is that zone's own item, opened as the list opens it (its drill: its records in this
      // screen's window); a zone no single item holds opens the zone (Thunai.tsx keeps the screen's own window and subject). A pin is its item.
      const onMapZone = (z: number) => {
        const at = b.items.flatMap((x, i) => (x.zone === z ? [i] : []));
        // (v19: a locality or a road is not its area: on the analyst's screen only an area's own row answers for it)
        if (at.length === 1 && b.items[at[0]].drill && (p.doc.recipe !== "ask" || b.items[at[0]].action === "zone")) pick(at[0]); else a.zone(z);
      };
      const pinned = b.items.flatMap((x, i) => (x.lat != null && x.lon != null ? [i] : []));
      return (
        <>
          <Head title={b.title} icon="barH" sub={b.method}><ViewSwitch id={b.id} views={hasMap ? ["chart", "table", "map"] : ["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
          {v === "chart" && (
            <ol className="st-rank">
              {b.items.map((x, i) => {
                const max = Math.max(...b.items.map((y) => Math.abs(y.value)), 1);
                return (
                  <li key={x.key} className={p.reading?.key === x.key ? "reading" : ""} style={{ ["--w" as string]: `${Math.max(2, (Math.abs(x.value) / max) * 100)}%`, ["--d" as string]: `${i * 60}ms` }}>
                    <button onClick={() => pick(i)} disabled={x.action === "none" && !x.drill} title={x.drill ? T(lang, `Open: ${x.drill.label}`, `திற: ${x.drill.label}`) : undefined}>
                      <span className="rk">{x.rank}</span>
                      <span className="nm">{x.label}{x.sub && <small>{x.sub}</small>}</span>
                      <span className="bar" aria-hidden="true"><i /></span>
                      <b>{fmt(x.value)}{b.unit && b.unit !== "points" ? <small> {unitIn(b.unit, lang)}</small> : null}</b>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {v === "table" && <Table cols={["#", T(lang, "Name", "பெயர்"), `${T(lang, "Value", "மதிப்பு")}${b.unit ? ` (${unitIn(b.unit, lang)})` : ""}`, T(lang, "Detail", "விவரம்")]} rows={b.items.map((x) => [x.rank, x.label, fmt(x.value), x.sub ?? ""])} />}
          {v === "map" && <MapBox geo={p.geo} title={b.title} shade={b.items.some((x) => x.zone != null && x.lat == null) ? { geo: "zone", label: b.title, values: b.items.filter((x) => x.zone != null).map((x) => ({ key: x.zone as number, value: x.value })) } : null}
            pins={pinned.map((i) => b.items[i]).map((x) => ({ n: x.rank, id: x.key, lat: x.lat as number, lon: x.lon as number, label: `${x.label}: ${fmt(x.value)}`, sev: null, hot: x.rank <= 3 }))}
            outline={b.items.filter((x) => x.zone != null).slice(0, 3).map((x) => x.zone as number)} onZone={onMapZone}
            onPin={(k) => { const i = pinned[k]; if (i != null) pick(i); }} />}
        </>
      );
    }
    case "MapView": return (
      <>
        <Head title={b.title} icon="map" sub={p.big ? null : b.rule}>
          {p.setBig && <button className="st-btn sm st-bigmap" onClick={() => p.setBig!(!p.big)}><I n={p.big ? "chevl" : "expand"} />{p.big ? T(p.lang, "Back to the list", "பட்டியலுக்குத் திரும்பு") : T(p.lang, "Enlarge map", "வரைபடத்தைப் பெரிதாக்கு")}</button>}
        </Head>
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
          <Head title={b.title} icon="line" sub={[b.marks.length ? T(lang, `${b.marks.length} marked: ${b.marks[0].why.toLowerCase()}`, `${b.marks.length} குறிக்கப்பட்டவை`) : b.normal ? T(lang, "Shaded: the usual range", "நிழல்: வழக்கமான வரம்பு") : null,
            b.drills?.some(Boolean) ? T(lang, "Click a point to open that day", "அந்த நாளைத் திறக்க ஒரு புள்ளியைத் தொடுங்கள்") : null].filter(Boolean).join(" · ") || null}>
            <ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} />
          </Head>
          {!b.values.length ? <p className="st-empty">{T(lang, "No data for this period.", "இந்தக் காலத்துக்குத் தரவு இல்லை.")}</p>
            : v === "chart" ? <StageChart spec={{ type: "trend", labels: b.labels, values: b.values, unit: b.unit, marks: b.marks, normal: b.normal }} height={240} title={b.title}
              onPick={b.drills?.some(Boolean) ? (i) => go(a, b.drills?.[i]) : undefined} />
              : <Table cols={[T(lang, "Period", "காலம்"), unitIn(b.unit, lang) ?? ""]} rows={b.labels.map((l, i) => [l, fmt(b.values[i])])} onRow={b.drills?.some(Boolean) ? (i) => go(a, b.drills?.[i]) : undefined} />}
        </>
      );
    }
    case "Chart": {
      const v = p.view ?? "chart";
      // a line chart is a line (chartspec.ts): it was drawn as upright bars
      return (
        <>
          <Head title={b.title} icon={b.chart === "donut" ? "donut" : b.chart === "line" ? "line" : "barH"} sub={b.drills?.some(Boolean) ? T(lang, "Click a bar to open it", "திறக்க ஒரு பட்டையைத் தொடுங்கள்") : null}><ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
          {v === "chart" ? <StageChart spec={chartSpecOf(b)} height={chartHeight(b)} title={b.title} onPick={b.drills?.some(Boolean) ? (i) => go(a, b.drills?.[i]) : undefined} />
            : <Table cols={["", unitIn(b.unit, lang) ?? ""]} rows={b.labels.map((l, i) => [l, fmt(b.values[i])])} onRow={b.drills?.some(Boolean) ? (i) => go(a, b.drills?.[i]) : undefined} />}
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
            const text = lang === "ta" ? x.ta || x.text : x.text;
            // v18: a point opens what it rests on (its case, or the records behind it in this window)
            const open = x.incidentId ? () => a.openCase(x.incidentId!) : x.drill ? () => go(a, x.drill) : null;
            return (
              <li key={i} className={`${on ? "reading" : ""}${open ? " drill" : ""}`} aria-current={on ? "true" : undefined}>
                <span className="n">{i + 1}</span>
                {open ? <button className="st-point" onClick={open} title={T(lang, "Open the details", "விவரங்களைத் திற")}>{on ? <Karaoke text={text} char={p.reading?.char ?? null} /> : text}</button>
                  : <p>{on ? <Karaoke text={text} char={p.reading?.char ?? null} /> : text}</p>}
                {open && <button className="st-link" onClick={open} tabIndex={-1} aria-hidden="true">{T(lang, "Details", "விவரம்")}<I n="chevr" /></button>}
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
        {/* v17: an answer from the Collector's own dataset keeps the Studio's actions: add it to a dashboard, alert, open it in the Studio */}
        {p.doc.recipe === "dataset" && p.doc.studio && b.id === "studio" && (
          <div className="st-studio-acts"><StudioActions s={p.doc.studio as unknown as StudioMsg} /></div>
        )}
      </>
    );
    case "Findings": return (
      <>
        <Head title={b.title} icon="bulb" />
        <ul className="st-findings">
          {b.items.map((f, i) => (
            <li key={i} className={`t-${f.tone}${f.drill ? " drill" : ""}`}>
              <div className="st-find-h">{f.drill ? <button className="st-point" onClick={() => go(a, f.drill)}><b>{f.title}</b></button> : <b>{f.title}</b>}{f.value != null && <span className="st-find-v">{fmt(f.value)}{f.unit ? <small> {f.unit}</small> : null}</span>}</div>
              <small className="st-find-m">{f.method} · n = {f.n}</small>
              <small className="st-find-c">{f.caveat}</small>
              {f.drill && <button className="st-link" onClick={() => go(a, f.drill)}>{T(lang, "Open the records", "பதிவுகளைத் திற")}<I n="chevr" /></button>}
            </li>
          ))}
        </ul>
      </>
    );
    case "Filled": return (
      <>
        <Head title={b.title} icon="doc" />
        <p className="st-filled-sum">{T(lang, `${b.filled} filled from code and reference data, ${b.left} left blank. Nothing guessed.`, `${b.filled} குறியீடு மற்றும் குறிப்புத் தரவிலிருந்து நிரப்பியது, ${b.left} காலி. எதுவும் ஊகிக்கவில்லை.`)}</p>
        <div className="st-tablewrap"><table className="st-table st-filled">
          <thead><tr><th>{T(lang, "Incident", "சம்பவம்")}</th>{b.cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{b.rows.map((r) => (
            <tr key={r.id}><td>{r.title}</td>{r.cells.map((c, i) => <td key={i} className={c.filled ? "filled" : c.v == null ? "blank" : ""}>{c.v ?? "—"}{c.filled && c.src ? <small className="st-src">{c.src}</small> : null}</td>)}</tr>
          ))}</tbody>
        </table></div>
        {b.cannot.length > 0 && <ul className="st-cannot">{b.cannot.map((x) => <li key={x.col}><b>{x.n} {x.col}</b>: {x.why}</li>)}</ul>}
      </>
    );
    case "Drafts": return (
      <>
        <Head title={b.title} icon="send" />
        {!p.tray.length ? <p className="st-empty">{T(lang, "No drafts waiting. Say \"draft action for 2\" on a list of cases.", "காத்திருக்கும் வரைவுகள் இல்லை.")}</p> : (
          <>
            <ol className="st-drafts">{p.tray.map((d, i) => <li key={d.incidentId}><span className="n">{i + 1}</span><b>{d.title}</b><small>{d.to ?? T(lang, "no recipient on record", "பெறுநர் இல்லை")}{d.sandbox ? T(lang, " · sandbox delivery", " · சோதனை வழி") : T(lang, " · send from the Take action panel", "")}</small></li>)}</ol>
            <p className="st-hint">{T(lang, "Nothing is sent until you press the button. Jarvis cannot send by voice.", "பொத்தானை அழுத்தும் வரை எதுவும் அனுப்பப்படாது. குரலால் அனுப்ப முடியாது.")}</p>
            <div className="st-row"><button className="st-btn primary" onClick={a.confirmTray}><I n="send" />{T(lang, `Approve and send ${p.tray.length}`, `${p.tray.length} அனுப்பு`)}</button><button className="st-btn" onClick={a.discardTray}>{T(lang, "Discard", "நீக்கு")}</button></div>
          </>
        )}
      </>
    );
    case "Note": return <p className="st-note"><I n="info" />{b.text}</p>;
    // 26 Nov (lib/brain): a result's own table, a timeline, several lines over one time
    case "Table": return (
      <>
        <Head title={b.title} icon="table" sub={b.total > b.rows.length ? T(lang, `${b.rows.length} of ${b.total} shown`, `${b.total}-இல் ${b.rows.length}`) : null} />
        {!b.rows.length ? <p className="st-empty">{T(lang, "Nothing matches.", "எதுவும் இல்லை.")}</p> : (
          <div className="st-tablewrap"><table className="st-table st-any">
            <thead><tr>{b.cols.map((c) => <th key={c.key} className={c.num ? "num" : ""}>{c.label}{c.unit ? <small> ({c.unit})</small> : null}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => {
              const open = r.id ? () => a.openCase(r.id!) : null;
              return (
                <tr key={`${r.id ?? "r"}-${i}`} className={open ? "drill" : ""} onClick={open ?? undefined} tabIndex={open ? 0 : undefined}
                  onKeyDown={open ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } } : undefined}>
                  {r.cells.map((c, k) => <td key={k} className={b.cols[k]?.num ? "num" : ""}>{c == null ? "—" : typeof c === "number" ? fmt(c) : /^https?:\/\//.test(c) ? <a href={c} target="_blank" rel="noreferrer">{T(lang, "Open", "திற")}</a> : c}</td>)}
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </>
    );
    case "Timeline": return (
      <>
        <Head title={b.title} icon="clock" sub={T(lang, `${b.items.length} steps, first to last`, `${b.items.length} நிகழ்வுகள்`)} />
        <ol className="st-tl">{b.items.map((x, i) => (
          <li key={i}><span className="dot" aria-hidden="true" /><time>{x.t || "—"}</time><div><p>{x.stage && <b>{x.stage}: </b>}{x.text}</p>{x.by && <small>{x.by}</small>}</div></li>
        ))}</ol>
      </>
    );
    case "Lines": {
      const v = p.view ?? "chart";
      return (
        <>
          <Head title={b.title} icon="line"><ViewSwitch id={b.id} views={["chart", "table"]} cur={v} a={a} lang={lang} /></Head>
          {v === "chart" ? <StageChart spec={{ type: "lines", labels: b.labels, series: b.series, unit: b.unit }} height={280} title={b.title} />
            : <Table cols={[T(lang, "Period", "காலம்"), ...b.series.map((x) => x.name)]} rows={b.labels.map((l, i) => [l, ...b.series.map((x) => fmt(x.values[i] ?? 0))])} />}
        </>
      );
    }
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
            {r.status && <span className="st" data-i18n-ctx="status">{r.status}</span>}
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
        <span className="chips">{r.sev && <em className="sv">{r.sev}</em>}{r.status && <em data-i18n-ctx="status">{r.status}</em>}{r.overdue && <em className="od">{T(lang, "Past deadline", "காலக்கெடு தாண்டியது")}</em>}</span>
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
  // v18: a headline opens in place to its report's own summary
  const [open, setOpen] = useState<string | null>(null);
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
                {x.summary ? (
                  <button className="hl st-point" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
                    {on ? <Karaoke text={`${reading?.lead ?? ""}${x.title}`} char={reading?.char ?? null} strip={reading?.lead ?? ""} /> : x.title}<I n={open === x.id ? "chevd" : "chevr"} />
                  </button>
                ) : <p className="hl">{on ? <Karaoke text={`${reading?.lead ?? ""}${x.title}`} char={reading?.char ?? null} strip={reading?.lead ?? ""} /> : x.title}</p>}
                {open === x.id && x.summary && <p className="st-news-sum">{x.summary}</p>}
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
  // (the measures that are counts go on the grouped bars; "the window before" and a reading stay in the table above)
  const chartMetrics = b.chart ? b.metrics.filter((m) => b.chart!.includes(m.key)) : b.metrics;
  const groups = useMemo(() => compareGroups(b, lang === "ta"), [b, lang]);
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
          {chartMetrics.length > 0 && <StageChart spec={{ type: "group", categories: chartMetrics.map((m) => m.label), series: b.sides.map((s) => ({ name: s.label, values: chartMetrics.map((m) => s.values[m.key] ?? 0) })), unit: null }} height={240} title={b.title} />}
          {b.sides.some((s) => s.series.length > 1) && <StageChart spec={{ type: "lines", labels: b.seriesLabels, series: b.sides.map((s) => ({ name: s.label, values: s.series })), unit: "incidents" }} height={220} title={T(lang, "Incidents reported over the period", "காலம் முழுவதும்")} />}
          {/* 28 Nov: the kinds, the departments and who reported them as grouped bars, every side on one scale (they were separate lists) */}
          {groups.map((g) => (
            <div key={g.key} className="st-cmp-group">
              <h4>{g.title}</h4>
              <StageChart spec={{ type: "group", categories: g.categories, series: g.series, unit: "incidents", horizontal: true }} height={Math.max(200, 44 + g.categories.length * (g.series.length * 14 + 12))} title={g.title} />
            </div>
          ))}
          {!groups.some((g) => g.key === "cats") && b.sides.some((s) => s.cats.length) && (
            <div className="st-cmp-cats">
              {b.sides.map((s, i) => <div key={s.key}><h4 className={`c${i + 1}`}><i aria-hidden="true" />{s.label}</h4><ol>{s.cats.slice(0, 5).map((c) => <li key={c.code}><span>{c.label}</span><b>{fmt(c.n)}</b></li>)}</ol></div>)}
            </div>
          )}
          {b.sides.some((s) => s.drill) && (
            <div className="st-row st-cmp-open">
              {b.sides.map((s) => s.drill ? <button key={s.key} className="st-btn sm" onClick={() => go(a, s.drill)}><I n="chevr" />{T(lang, `${s.label}: its own summary`, `${s.label}: முழுச் சுருக்கம்`)}</button> : null)}
            </div>
          )}
        </div>
      )}
      {v === "table" && <Table cols={["", ...b.sides.map((s) => s.label)]} rows={[...b.metrics.map((m) => [m.label, ...b.sides.map((s) => fmt(s.values[m.key] ?? 0))]),
        ...groups.flatMap((g) => g.categories.map((c, j) => [`${g.title}: ${c}`, ...g.series.map((x) => fmt(x.values[j] ?? 0))]))]} />}
    </>
  );
}

function Table({ cols, rows, onRow }: { cols: string[]; rows: (string | number)[][]; onRow?: (i: number) => void }) {
  return (
    <div className="st-tablewrap">
      <table className="st-table">
        <thead><tr>{cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={onRow ? "drill" : undefined} onClick={onRow ? () => onRow(i) : undefined}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{onRow ? <button className="st-point" onClick={(e) => { e.stopPropagation(); onRow(i); }}>{c}</button> : c}</th> : <td key={j} className={/^[-+]?[\d,.]+%?$/.test(String(c)) ? "num" : ""}>{c}</td>))}</tr>)}</tbody>
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
