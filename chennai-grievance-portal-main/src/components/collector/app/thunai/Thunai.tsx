"use client";
/**
 * Jarvis (ஜார்விஸ், formerly Thunai), the Collector console's voice pilot. Turn on Jarvis mode (the top bar, Ctrl+Shift+J) and
 * there is nothing to press: it listens, works out whether it was spoken to (lib/thunai/addressed.ts), acts and answers,
 * in English, Tamil or Tanglish; the console moves by itself. Talk over it and it stops. With the mode off the microphone is
 * closed and the panel takes typed questions. The understanding is in lib/thunai (rules first, tested);
 * this file is the hands and the face: it presses the console's own controls (Console in CollectorApp), shows a ghost
 * pointer, step chips and subtitles, keeps an undo stack, an approval tray for anything that leaves the console, the
 * Collector's memory, a polite Watch, and two missions. Every number it speaks comes from the console's data through a
 * template (lib/thunai/say.ts); it never sends, approves or deletes: drafts wait in the tray for the Collector's own tap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Overview } from "@/lib/collector/intel";
import { chartFacts, type ChartFacts } from "@/lib/thunai/explain";
import { ZONE_NAMES, ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { isPlainMove, isReflex, type Checked, type Turn } from "@/lib/thunai/plan";
import { confirmGate, planRisk, tapRisk } from "@/lib/thunai/risk";
import { say as line } from "@/lib/thunai/say";
import type { Lang, OutMode, PageKey, PeriodKey, ScreenState, Sev, Step, Understood, View, World } from "@/lib/thunai/types";
import { describe as describeStep, PAGE_EN, PAGE_TA, PERIOD_EN, PERIOD_TA, SUGGEST, understand } from "@/lib/thunai/understand";
import { band, canSpeak as watchMaySpeak, remember as watchRemember, type Signal, type WatchMemory } from "@/lib/thunai/watch";
import type { MapGeo } from "@/lib/collector/geo";
import type { AgentResult, StageOp } from "@/lib/thunai/agent";
import { figuresOf, stageContext, type StageDocT } from "@/lib/thunai/stage";
import { allowedSet, figuresIn } from "@/lib/thunai/numbergate";
import { spokenPart as spoken } from "@/lib/thunai/chunker";
import { ackFor, ackTemplated, localStageCommand, narrationOf, stageDigest, stageReducer, toCsv, type LocalCmd, type StageEffect, type StageModel } from "@/lib/thunai/stagelocal";
import { cannotLine, NO_MODEL_LINE } from "@/lib/thunai/reach";
import type { Console } from "../CollectorApp";
import { byName, clickables, press, readChart, scroll, spotlight, targetFor, typeInto, type Clickable } from "./dom";
import Stage, { type BlockView, type PinnedScreen } from "./Stage";
import { download, exportPng, fileName } from "./export";
import { canContinue, continueAnswer, forgetBookmark, hasVoice, nowSaying, prefetch, setJarvisVoice, speakAck, speaking, speakLines, speakText, stopVoice, voiceInfo, voicePath, voicesFor, warmVoices } from "./mouth";
import { Conductor, type HeardLine } from "./conductor";
import { Captions, canCaption } from "./captions";
import { coreOf, hud, type JarvisMode } from "./hudstore";
import { levelAllowed, type Addressed } from "@/lib/thunai/addressed";
import { districtNounIn, quickScreen } from "@/lib/thunai/quick";
import type { TurnState } from "@/lib/thunai/turn";
import Panel, { type Ear, type Msg } from "./Panel";
import Hud from "./Hud";
import type { AnswerCard as Card, ConsoleAction } from "@/lib/assistant/answer";
import { JARVIS_VOICES, type JarvisVoice } from "@/lib/jarvis/voices";
import { useLang } from "@/lib/i18n/lang";
import { otherLang } from "@/lib/i18n/line";
import "./thunai.css";

const speak = (text: string, lang: string, onEnd?: () => void, rate = 1, voice?: string | null, allowed?: Set<string>) => {
  // a Tamil line with no Tamil voice on this device is shown, not read out by an English voice
  if (lang === "ta-IN" && !hasVoice("ta-IN")) { setTimeout(() => onEnd?.(), 900); return true; }
  return speakText(text, lang, { onEnd, rate, voice, allowed });
};
/** dev only: a time mark the end-to-end specs read */
const SPEC = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_JARVIS_SPEC === "1";
const jvMark = (name: string) => { if (SPEC) (window as unknown as { __jv?: { marks: { name: string; t: number }[] } }).__jv?.marks.push({ name, t: performance.now() }); };
/** What a screen's narration may say: its own figures and what code wrote from them; an answer screen's model text may say only the facts. */
function screenFigures(doc: StageDocT, lang: Lang): Set<string> {
  const base = figuresOf(doc);
  if (doc.recipe === "answer") return base;
  const out = new Set(base);
  for (const f of figuresIn(`${doc.say[lang] ?? ""} ${narrationOf(doc, lang).map((x) => x.text).join(" ")}`)) if (!Number.isNaN(f.value)) out.add(String(f.value));
  for (const v of allowedSet(narrationOf(doc, lang).flatMap((x) => (x.text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)))) out.add(v);
  return out;
}
const stopSpeaking = () => stopVoice();

export interface Snap { page: PageKey; period: PeriodKey; zone: number | null; dept: string | null; cat: string | null; taluk: string | null;
  sev: string | null; mapMode: "zones" | "taluks"; layers: Record<string, boolean> }

/** What the console hands Thunai: its controls, its data, and a few shell actions that are not on Console. */
export interface ThunaiHost {
  c: Console;
  ov: Overview;
  /** the page insights (environment readings, trends), when loaded */
  ins: unknown;
  inc: string | null;
  modal: string | null;
  ask: boolean;
  theme: "dark" | "light" | null;
  toggleTheme: () => void;
  openExport: () => void;
  openCustomize: () => void;
  openPalette: () => void;
  askWith: (q: string) => void;
  /** set several filters in one transaction (one render, one undo) */
  applyView: (v: View) => void;
  snapshot: () => Snap;
  restore: (s: Snap) => void;
  /** where the brain lives (the dev test console uses its own) */
  planUrl?: string;
  /** where the agent lives (v2: screens built from the data) */
  agentUrl?: string;
  /** the ward and zone outlines for the Stage's maps */
  loadGeo?: () => Promise<MapGeo | null>;
  /** where a Take action draft is read (the dev test console uses its own, which cannot send) */
  draftUrl?: (incidentId: string) => string;
  /** where Jarvis's ears post a sentence (the dev test console uses its own) */
  hearUrl?: string;
  /** resolves when the console has finished loading what the last step asked for */
  settled?: () => Promise<void>;
}

type Phase = "off" | "ready" | "listening" | "thinking" | "acting" | "speaking" | "asking" | "waiting" | "blocked";
interface AskCard { question: string; lang: Lang; heard: string; choices: { label: string; en: string; steps?: Step[]; request?: string }[] }
interface Chip { id: number; label: string; state: "pending" | "running" | "done" | "failed" }
interface Draft { incidentId: string; title: string; subject: string; body: string; to: string | null; sandbox: boolean }
interface MemoryView { notes: { id: string; text: string; at: string }[]; habits: Record<string, string>; reminders: { id: string; text: string; at: string; done: boolean }[];
  recent: { text: string; at: string }[]; prefs: { lang?: Lang; mode?: OutMode; rate?: number } }
interface Station { id: string; name: string; zone: number | null; times: string[]; series: number[]; capacity?: number; storage?: number[] }
interface EnvData { rain?: { stations: Station[] }; aqi?: { stations: Station[] }; lakes?: { stations: Station[]; asOn: string | null } }

const SEVS: Sev[] = ["Severe", "High", "Medium", "Low"];
const NO_FIGURES = new Set<string>();
const DANGER_BUTTON = /send|approve|confirm|delete|remove|discard|reject|submit|verify|close it|work is done|accept|அனுப்பு|நீக்கு|உறுதி|ஒப்புதல்|ஏற்க|நிராகரி/i;
/** A line the model wrote beside a plan is said only if it holds no figure: the figures come from code. */
const noFigure = (t?: string | null) => (t && !figuresIn(t).length ? t : undefined);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not saved */ } } };

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

/** A soft heartbeat while the agent works (lane 1, after jarvis-v3): stops when the answer arrives. */
function heartbeat(): () => void {
  let ctx: AudioContext | null = null;
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) return () => undefined;
    ctx = new AC();
  } catch { return () => undefined; }
  const c = ctx;
  const beat = () => {
    [0, 0.16].forEach((dt, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = i ? 98 : 110;
      const t = c.currentTime + dt;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.16);
    });
  };
  beat();
  const t = setInterval(beat, 1100);
  return () => { clearInterval(t); setTimeout(() => c.close().catch(() => undefined), 300); };
}

/** told when an earcon starts: it must not count as speech */
let onEarcon: (() => void) | null = null;
/** Earcons from the Web Audio API: no files. */
function earcon(kind: "open" | "done" | "need" | "blocked") {
  onEarcon?.();
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = W.AudioContext ?? W.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = { open: [660], done: [523, 784], need: [330], blocked: [220] }[kind];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 600);
  } catch { /* no audio */ }
}

const pct = (st: Station) => {
  const s = st.storage?.[st.storage.length - 1];
  return st.capacity && s != null ? Math.round((s / st.capacity) * 100) : null;
};
const lastOf = (st: Station) => st.series?.[st.series.length - 1] ?? null;
const whenOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "the latest reading");

export default function Thunai({ host }: { host: ThunaiHost }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const [mounted, setMounted] = useState(false);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("off");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  /** the reply in the other language (every answer is shown in English and Tamil) */
  const [alt, setAlt] = useState("");
  const altSeq = useRef(0);
  const [uiLang] = useLang();
  // ---- the conversation (round 27): Jarvis's ears (ears.ts), the panel's thread, the minute of quiet before it rests
  /** Jarvis mode: off (the mic's tracks are stopped), on (it listens, no mic button), muted (closed, one keystroke away) */
  const [mode, setModeState] = useState<JarvisMode>("off");
  const modeRef = useRef<JarvisMode>("off");
  modeRef.current = mode;
  const conductor = useRef<Conductor | null>(null);
  const captions = useRef<Captions | null>(null);
  const [turnState, setTurnState] = useState<TurnState>("off");
  const [offline, setOffline] = useState(false);
  const conv = mode === "on";
  const [activity, setActivity] = useState<"speech" | "reading" | "idle">("idle");
  const [micBlocked, setMicBlocked] = useState(false);
  /** when Jarvis last finished a turn (the gate's 20 s of being engaged) */
  const lastTurnAt = useRef<number | null>(null);
  /** the question in flight: a new sentence, a barge-in or Esc aborts it; the generation stops any late answer speaking */
  const turnGen = useRef(0);
  const turnCtl = useRef<AbortController | null>(null);
  /** what passed the address gate for the sentence being handled: level B and C need tier 1 or 2 */
  const gateRef = useRef<Addressed | null>(null);
  const sourceRef = useRef<"whisper" | "captions" | "typed">("typed");
  /** the last request said, so a cancelled one can be asked again and "no, Anna Nagar" can refine it */
  const lastRequest = useRef<{ text: string; lang: "en" | "ta" } | null>(null);
  /** when the sentence being answered ended (the strip's latency runs from here) */
  const utterEnd = useRef<number | null>(null);
  const utterEnd2 = useRef<number | null>(null);
  /** The screen's real figures, as a panel for the HUD; the place it is about, for the map's reticle. */
  const toHud = (doc: StageDocT, lang: Lang) => {
    const ta = lang === "ta";
    const figures: { label: string; value: number; unit: string | null }[] = [];
    let focus: { label: string; lat: number | null; lon: number | null; zone: number | null; pulses?: { lat: number; lon: number }[] } | null = null;
    for (const b of doc.blocks) {
      if (!focus && b.kind === "MapView" && b.points.length) {
        const hot = b.points.filter((p) => p.hot).slice(0, 4);
        focus = { label: doc.title.slice(0, 40), lat: b.points[0].lat, lon: b.points[0].lon, zone: doc.scope.zone, pulses: hot.map((p) => ({ lat: p.lat, lon: p.lon })) };
      }
      if (figures.length >= 3) continue;
      if (b.kind === "CaseList") figures.push({ label: ta ? "சம்பவங்கள்" : "Cases", value: b.total, unit: null });
      else if (b.kind === "Kpis") for (const k of b.items.slice(0, 3)) { if (figures.length < 3) figures.push({ label: k.label, value: k.value, unit: k.unit }); }
      else if (b.kind === "Ranking" && b.items[0]) figures.push({ label: b.items[0].label, value: b.items[0].value, unit: b.unit });
      else if (b.kind === "Readings" && b.items[0]) figures.push({ label: b.items[0].name, value: b.items[0].value, unit: b.unit });
      else if (b.kind === "Compare") for (const x of b.sides.slice(0, 3)) figures.push({ label: x.label, value: Number(x.values.severe ?? 0), unit: ta ? "கடுமையான" : "severe" });
      else if (b.kind === "Filled") figures.push({ label: ta ? "நிரப்பியது" : "Filled", value: b.filled, unit: null }, { label: ta ? "மீதம்" : "Left", value: b.left, unit: null });
      else if (b.kind === "Findings") { const f = b.items.find((x) => x.value != null); if (f) figures.push({ label: f.title.slice(0, 40), value: f.value as number, unit: f.unit }); }
    }
    hud.panel({ id: doc.id, title: doc.title.slice(0, 90), takeaway: doc.takeaway?.[lang] ?? null, figures: figures.filter((f) => Number.isFinite(f.value)).slice(0, 3), source: doc.sources[0] ?? null, recipe: doc.recipe, at: Date.now() });
    hud.set({ focus });
  };
  /** the answer exists: it is on screen now, whatever the voice is doing */
  const markAnswer = () => {
    jvMark("answer");
    if (utterEnd.current) { hud.strip({ lastMs: Math.round(performance.now() - utterEnd.current) }); utterEnd.current = null; }
  };
  const [thread, setThread] = useState<Msg[]>([]);
  const [focusKey, setFocusKey] = useState(0);
  const [jvVoice, setJvVoice] = useState<JarvisVoice>("Despina");
  /** how the sentence being handled came: said (the ears) or typed */
  const via = useRef<"voice" | "typed">("typed");
  /** the insight screen the next reply belongs to (its card in the thread) */
  const pendingScreen = useRef<Msg["screen"] | null>(null);
  const lastBot = useRef("");
  const ackText = useRef("");
  const listenLangRef = useRef<Lang>("en");
  const pushMsg = (m: Omit<Msg, "id" | "at">) => setThread((t) => [...t, { ...m, id: Math.random().toString(36).slice(2, 10), at: Date.now() }].slice(-60));
  const [chips, setChips] = useState<Chip[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [askOnce, setAskOnce] = useState<AskCard | null>(null);
  /** who understood the last sentence: the model (and how fast), the built-in rules, or an instant control */
  const [brain, setBrain] = useState<{ by: "ai" | "rules" | "instant"; model: string | null; ms: number } | null>(null);
  const [pendingB, setPendingB] = useState<{ text: string; steps: Step[]; heard: string; lang: Lang; act?: () => void } | null>(null);
  const [tray, setTray] = useState<Draft[]>([]);
  const [trayShownAt, setTrayShownAt] = useState<number | null>(null);
  const [panel, setPanel] = useState<"memory" | "trail" | "help" | "voice" | null>(null);
  /** Jarvis as a small card in the corner: after it acts on the dashboard ("go to the briefing page"), so the Collector
   *  sees the page change; the next answer with a screen opens it full again */
  const [mini, setMini] = useState(false);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [trail, setTrail] = useState<{ lines: { at: string; heard: string | null; outcome: string; risk: string }[]; intact: boolean } | null>(null);
  const [numbers, setNumbers] = useState<{ names: boolean; items: Clickable[] } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; label: string; show: boolean; ripple: boolean }>({ x: 0, y: 0, label: "", show: false, ripple: false });
  const [outMode, setOutMode] = useState<OutMode>("voice");
  const [listenLang, setListenLang] = useState<Lang>("en");
  const [rate, setRate] = useState(1);
  const [typed, setTyped] = useState("");
  const [ref, setRef] = useState<Pick<World, "cats" | "taluks" | "places">>({ cats: [], taluks: [], places: [] });
  // ---- the Stage (v2)
  const [stage, setStage] = useState<StageDocT | null>(null);
  const [stageBack, setStageBack] = useState<StageDocT[]>([]);
  const [stageViews, setStageViews] = useState<Record<string, BlockView>>({});
  const [stageBusy, setStageBusy] = useState<string | null>(null);
  const [stageBrain, setStageBrain] = useState<{ model: string | null; ms: number; rounds: number; calls: number } | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [reading, setReading] = useState<{ key: string; char: number | null; lead?: string } | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [pins, setPins] = useState<PinnedScreen[]>([]);
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [saveAsk, setSaveAsk] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(() => store.get("thunai-voice"));
  const stageRef = useRef<StageDocT | null>(null);
  stageRef.current = stage;
  const stageFocus = useRef<number | null>(null);
  const narration = useRef<{ key: string; text: string; lead: string }[]>([]);
  const narrIndex = useRef(0);

  const orbRef = useRef<HTMLSpanElement>(null);
  const undoStack = useRef<{ steps: Step[]; snap: Snap }[]>([]);
  const lastSteps = useRef<Step[]>([]);
  /** the incident an "item" step opened in the plan now running */
  const justOpened = useRef<string | null>(null);
  /** the last few turns, so "same for Adyar" and "open that" make sense to the brain */
  const turns = useRef<Turn[]>([]);
  const remember = (heardText: string, did: string) => { turns.current = [...turns.current, { heard: heardText.slice(0, 300), did: did.slice(0, 300) }].slice(-4); };
  const lastSpoken = useRef<{ text: string; lang: Lang } | null>(null);
  const lastFilter = useRef<ScreenState["lastFilter"]>(null);
  const lastPlace = useRef<string | null>(null);
  const numbersRef = useRef(numbers);
  numbersRef.current = numbers;
  const abortMission = useRef(false);
  const lastHeardAt = useRef<number>(0);
  const lastUserSpeech = useRef<number | null>(null);
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const onRef = useRef(on);
  onRef.current = on;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const chipId = useRef(0);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const t = (e: PointerEvent) => { pointerAt.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", t, { passive: true });
    return () => window.removeEventListener("pointermove", t);
  }, []);

  // --------------------------------------------------------------- the world --
  const world: World = useMemo(() => {
    const zt = host.ov.zoneTable ?? [];
    const env = (host.ins as { env?: EnvData } | null)?.env;
    return {
      zones: ZONE_NAMES.map((name, i) => ({ n: i + 1, name: zt.find((z) => z.zone === i + 1)?.name ?? name, ta: ZONE_TA_NAME[i + 1] })),
      depts: host.c.depts.map((d) => ({ code: d.code, name: d.name })),
      ...ref,
      reservoirs: (env?.lakes?.stations ?? []).map((s) => ({ id: s.id, name: s.name })),
      zoneRank: [...zt].sort((a, b) => b.severe - a.severe || b.open - a.open).map((z) => z.zone),
      aliases: memory?.habits ?? {}
    };
  }, [host.ov.zoneTable, host.ins, host.c.depts, ref, memory?.habits]);
  const worldRef = useRef(world);
  worldRef.current = world;

  const buildState = useCallback((): ScreenState => {
    const h = hostRef.current, c = h.c;
    const counts = (h.ov.severity?.counts ?? {}) as Record<string, number>;
    const first = SEVS.find((s) => counts[s] > 0) ?? "Severe";
    const tab = c.sevTab && counts[c.sevTab] > 0 ? c.sevTab : first;
    const rows = (h.ov.severity?.rows ?? []) as { id: string; sev: string }[];
    return {
      page: c.page, period: c.period as PeriodKey, zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk, sev: (c.sevTab as Sev | null) ?? null,
      mapMode: c.mapMode, panel: h.modal ?? (h.inc ? "incident" : h.ask ? "assistant" : null), incident: h.inc ?? c.focus?.id ?? null,
      list: rows.filter((r) => r.sev === tab).map((r) => String(r.id)), lastFilter: lastFilter.current, lastPlace: lastPlace.current,
      numbers: !!numbersRef.current, now: Date.now()
    };
  }, []);

  // the Collector changing a filter by hand also counts as "touched last"
  const prevView = useRef<string>("");
  useEffect(() => {
    const c = host.c;
    const cur = { zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk, sev: c.sevTab, period: c.period };
    const prev = prevView.current ? JSON.parse(prevView.current) : null;
    if (prev) for (const k of Object.keys(cur) as (keyof typeof cur)[]) if (prev[k] !== cur[k]) lastFilter.current = { slot: k as never, at: Date.now() };
    prevView.current = JSON.stringify(cur);
  }, [host.c]);

  // --------------------------------------------------------------- speaking --
  const out = useCallback((full: string, lang: Lang, ph: Phase = "ready", allowed?: Set<string>) => {
    const text = full;
    markAnswer();  // eslint-disable-line @typescript-eslint/no-use-before-define
    setReply(text);
    showAlt(text, lang); // eslint-disable-line @typescript-eslint/no-use-before-define
    lastSpoken.current = { text, lang };
    if (!text) { setPhase(ph); return; }
    if (outMode === "voice") {
      setPhase("speaking");
      const ok = speak(spoken(text), lang === "ta" ? "ta-IN" : "en-IN", () => {
        setPhase(onRef.current ? ph : "off");
      }, rate, voiceName, allowed);
      if (!ok) setPhase(ph);
    } else setPhase(ph);
  }, [outMode, rate, voiceName]); // eslint-disable-line react-hooks/exhaustive-deps

  /** the same words in the other language, shown under the reply (fetched after it, so the answer is never slower) */
  /** the other language written with the answer (a screen's own Tamil and English), used instead of a translation */
  const givenAlt = useRef<{ text: string; alt: string } | null>(null);
  function showAlt(text: string, lang: Lang) {
    const my = ++altSeq.current;
    const g = givenAlt.current;
    if (g && g.text === text) { givenAlt.current = null; setAlt(g.alt); return; }
    setAlt("");
    if (!text || text.length > 900) return;
    otherLang(text, lang).then((t) => { if (t && my === altSeq.current) setAlt(t); }).catch(() => undefined);
  }

  const audit = (heardText: string | null, steps: Step[], outcome: string, approval: { how: "none" | "tap" | "spoken"; count?: number } | null = null) => {
    post("/api/collector/thunai/audit", { heard: heardText, plan: steps as unknown as Record<string, unknown>[], risk: planRisk(steps), approval, outcome }).catch(() => undefined);
  };

  useEffect(() => {
    // the quick "Putting them side by side" while the agent works is not an answer: it stays on the busy line
    if (!reply || phase === "thinking" || phase === "acting" || reply === ackText.current) return;
    if (reply === lastBot.current) return;
    lastBot.current = reply;
    const scr = pendingScreen.current;
    pendingScreen.current = null;
    pushMsg({ who: "jarvis", text: reply, lang: /[஀-௿]/.test(reply) ? "ta" : "en", screen: scr ?? undefined });
  }, [reply, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!alt) return;
    setThread((t) => {
      let k = t.length - 1;
      while (k >= 0 && t[k].who !== "jarvis") k--;
      if (k < 0 || t[k].text !== reply) return t;
      const c = [...t]; c[k] = { ...c[k], alt }; return c;
    });
  }, [alt]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------- memory --
  const loadMemory = useCallback(async () => {
    try { const r = await fetch("/api/collector/thunai/memory"); if (r.ok) setMemory(await r.json()); } catch { /* offline */ }
  }, []);
  /** true when the server saved the change (a failure is never reported as "remembered") */
  const changeMemory = async (op: Record<string, unknown>): Promise<boolean> => {
    try { setMemory(await post("/api/collector/thunai/memory", op)); return true; } catch { return false; }
  };

  // --------------------------------------------------------------- the pointer --
  const glide = async (step: Step) => {
    const el = targetFor(step);
    const orb = orbRef.current?.getBoundingClientRect();
    if (!el || !orb) { if (orbRef.current) { orbRef.current.classList.add("pulse"); setTimeout(() => orbRef.current?.classList.remove("pulse"), 400); } return; }
    const r = el.getBoundingClientRect();
    const label = describeStep(step, worldRef.current, listenLang).split(" · ")[0];
    if (reduced()) { setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, label, show: true, ripple: true }); await sleep(120); }
    else {
      setPointer({ x: orb.left + orb.width / 2, y: orb.top + orb.height / 2, label, show: true, ripple: false });
      await sleep(30);
      setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, label, show: true, ripple: false });
      await sleep(320);
      setPointer((p) => ({ ...p, ripple: true }));
      await sleep(140);
    }
    setTimeout(() => setPointer((p) => ({ ...p, show: false, ripple: false })), 700);
  };

  // --------------------------------------------------------------- readings --
  const env = async (): Promise<EnvData | null> => {
    const h = hostRef.current;
    if (h.c.page !== "environment") h.c.setPage("environment");
    for (let k = 0; k < 30; k++) {
      const e = (hostRef.current.ins as { env?: EnvData } | null)?.env;
      if (e?.lakes || e?.rain) return e;
      await sleep(200);
    }
    return null;
  };

  const read = async (step: Extract<Step, { a: "read" }>, lang: Lang): Promise<string> => {
    const h = hostRef.current;
    if (step.what === "worstZone") {
      const z = [...(h.ov.zoneTable ?? [])].sort((a, b) => b.severe - a.severe || b.open - a.open)[0];
      if (!z) return line("noData", lang);
      lastPlace.current = z.name;
      return line("worstZone", lang, { name: lang === "ta" ? ZONE_TA_NAME[z.zone] ?? z.name : z.name, severe: z.severe, open: z.open });
    }
    const e = await env();
    if (!e) return line("noData", lang);
    await sleep(250);
    if (step.what === "reservoir") {
      const st = e.lakes?.stations ?? [];
      const named = step.name ? st.find((s) => s.name.toLowerCase().includes(step.name!.toLowerCase())) : null;
      const asOf = whenOf(e.lakes?.asOn ?? named?.times?.[named.times.length - 1]);
      if (named) {
        const p = pct(named);
        spotlight(named.name);
        return p == null ? line("noData", lang) : line("reservoir", lang, { name: named.name, pct: p, asOf });
      }
      const list = st.map((s) => ({ s, p: pct(s) })).filter((x) => x.p != null).slice(0, 4).map((x) => `${x.s.name} ${x.p}%`).join(", ");
      return list ? line("reservoirs", lang, { list, asOf }) : line("noData", lang);
    }
    if (step.what === "rain") {
      const st = (e.rain?.stations ?? []).filter((s) => lastOf(s) != null).sort((a, b) => (lastOf(b) ?? 0) - (lastOf(a) ?? 0))[0];
      if (!st) return line("noData", lang);
      spotlight(st.name);
      return line("rain", lang, { name: st.name, mm: Math.round((lastOf(st) ?? 0) * 10) / 10, asOf: whenOf(st.times?.[st.times.length - 1]) });
    }
    const aqi = e.aqi?.stations ?? [];
    const zoneN = step.name ? worldRef.current.zones.find((z) => z.name.toLowerCase() === step.name!.toLowerCase())?.n : null;
    const st = (zoneN ? aqi.find((s) => s.zone === zoneN) ?? aqi.find((s) => s.name.toLowerCase().includes(step.name!.toLowerCase())) : null)
      ?? aqi.filter((s) => lastOf(s) != null).sort((a, b) => (lastOf(b) ?? 0) - (lastOf(a) ?? 0))[0];
    if (!st || lastOf(st) == null) return line("noData", lang);
    spotlight(st.name);
    return line("air", lang, { name: st.name, aqi: Math.round(lastOf(st)!), asOf: whenOf(st.times?.[st.times.length - 1]) });
  };

  const explain = (lang: Lang): string => {
    const h = hostRef.current;
    let f: ChartFacts | null = readChart(pointerAt.current);
    if (!f && h.c.page === "trends") {
      const lines = ((h.ins as { trends?: Record<string, { lines?: { label: string; total: number }[] }> } | null)?.trends?.[h.c.period === "monthly" || h.c.period === "quarterly" ? "monthly" : "weekly"]?.lines ?? [])
        .filter((l) => l.label !== "All other categories");
      f = chartFacts(lang === "ta" ? "வகைவாரி நிகழ்வுகள்" : "Incidents by category", lines.map((l) => l.label), lines.map((l) => l.total));
    }
    if (!f) {
      const zt = h.ov.zoneTable ?? [];
      f = chartFacts(lang === "ta" ? "மண்டலவாரி திறந்த நிகழ்வுகள்" : "Open incidents by zone", zt.map((z) => z.name), zt.map((z) => z.open));
    }
    return f ? line("explainChart", lang, f as unknown as Record<string, string | number>) : line("noChart", lang);
  };

  // --------------------------------------------------------------- tray (level C) --
  const draftFor = async (incidentId: string): Promise<Draft | null> => {
    try {
      const r = await fetch(hostRef.current.draftUrl?.(incidentId) ?? `/api/collector/incidents/${encodeURIComponent(incidentId)}/action`);
      const j = await r.json();
      if (!r.ok) return null;
      return { incidentId, title: String(j.subject ?? incidentId), subject: j.subject, body: j.body, to: j.to?.role ?? j.to?.name ?? null,
        sandbox: j.delivery?.mode === "sandbox" };
    } catch { return null; }
  };
  const addToTray = (ds: Draft[]) => {
    setTray((t) => [...t, ...ds.filter((d) => !t.some((x) => x.incidentId === d.incidentId))]);
    setTrayShownAt(Date.now());
    setPhase("waiting");
    earcon("need");
  };
  const sendTray = async (n: number | null, lang: Lang, how: "spoken" | "tap") => {
    const g = confirmGate(n, tray.length, trayShownAt, Date.now());
    if (!g.ok) {
      const k = g.why === "nothing" ? "trayEmpty" : g.why === "count" ? "confirmCount" : g.why === "mismatch" ? "confirmMismatch" : "confirmEarly";
      earcon("blocked");
      out(line(k, lang, { n: tray.length, said: n ?? "" }), lang, tray.length ? "waiting" : "ready");
      return;
    }
    let sent = 0;
    for (const d of tray) {
      if (!d.sandbox) { hostRef.current.c.openAction(d.incidentId); continue; }
      try { await post(`/api/collector/incidents/${encodeURIComponent(d.incidentId)}/action`, { subject: d.subject, body: d.body }); sent++; } catch { /* stays */ }
    }
    audit(null, [{ a: "confirm", n }], `sent ${sent} of ${tray.length} (sandbox only)`, { how, count: n ?? undefined });
    setTray([]); setTrayShownAt(null);
    earcon("done");
    out(sent === tray.length ? line("sent", lang, { n: sent }) : line("approvedOnly", lang), lang);
  };

  // --------------------------------------------------------------- one step --
  const runStep = async (step: Step, lang: Lang, heardText: string): Promise<string | null> => {
    const h = hostRef.current, c = h.c;
    switch (step.a) {
      case "page": c.setPage(step.page); return null;
      case "period": c.setPeriod(step.period); lastFilter.current = { slot: "period", at: Date.now() }; return null;
      case "view": {
        h.applyView(step.view);
        const slots = Object.keys(step.view) as (keyof View)[];
        if (slots.length) lastFilter.current = { slot: slots[slots.length - 1], at: Date.now() };
        if (step.view.zone) lastPlace.current = worldRef.current.zones.find((z) => z.n === step.view.zone)?.name ?? null;
        if (step.view.taluk) lastPlace.current = worldRef.current.taluks.find((t) => t.code === step.view.taluk)?.name ?? null;
        return null;
      }
      case "mapMode": c.setMapMode(step.mode); return null;
      case "layer": if (step.on == null || !!c.layers[step.layer] !== step.on) c.toggleLayer(step.layer); return null;
      case "panel": {
        const p = step.panel;
        if (p === "news") c.openNewsAll(); else if (p === "stories") c.openStories(); else if (p === "gaps") c.openGaps();
        else if (p === "nextdoor") c.openNextDoor(); else if (p === "markets") c.openMarkets(); else if (p === "zones") c.openZones();
        else if (p === "depts") c.openDepts(); else if (p === "sources") c.openFeeds(); else if (p === "review") c.openReview();
        else if (p === "workspace") c.openWorkspace(); else if (p === "export") h.openExport(); else if (p === "customize") h.openCustomize();
        else if (p === "palette") h.openPalette(); else if (p === "assistant") c.setAsk(true);
        else if (p === "map") { c.setPage("overview"); c.mapAsk?.setGrown(true); }
        else if (p === "trail") { await openTrail(); }
        else if (p === "memory") { await loadMemory(); setPanel("memory"); }
        else if (p === "conflicts") {
          const first = (c.conflicts as { stories?: unknown[] } | null)?.stories?.[0];
          if (first) c.openConflict(first as never); else { c.setPage("briefing"); }
        }
        return null;
      }
      case "close":
        if (step.all) { c.closeAll(); c.setAsk(false); c.mapAsk?.setGrown(false); setPanel(null); }
        else if (panel) setPanel(null);
        else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return null;
      case "item": {
        const st = buildState();
        if (!st.list.length) return line("noItem", lang);
        let idx = typeof step.which === "number" ? step.which - 1 : st.list.indexOf(st.incident ?? "") + (step.which === "next" ? 1 : -1);
        idx = Math.max(0, Math.min(st.list.length - 1, idx));
        c.openInc(st.list[idx]);
        justOpened.current = st.list[idx];
        return null;
      }
      case "draft": {
        // the incident a step just opened counts before the console has re-rendered
        const id = justOpened.current ?? buildState().incident;
        if (!id) return line("noIncident", lang);
        c.openAction(id);
        return line("draft", lang);
      }
      case "zoom": {
        const id = justOpened.current ?? buildState().incident;
        if (id) { c.askOnMap?.({ incidentId: id }); return null; }
        if (step.target ?? lastPlace.current) { c.askOnMap?.(`incidents in ${step.target ?? lastPlace.current}`); return null; }
        return line("noIncident", lang);
      }
      case "ask": await askAnalyst(step.q, lang); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "map": c.askOnMap?.(step.q); return null;
      case "theme": if ((h.theme ?? "light") !== step.theme) h.toggleTheme(); return null;
      case "lang": setListenLang(step.lang); changeMemory({ op: "prefs", prefs: { lang: step.lang } }); return null;
      case "mode": setOutMode(step.mode); changeMemory({ op: "prefs", prefs: { mode: step.mode } }); return null;
      case "speed": { const r = Math.round(Math.max(0.7, Math.min(1.4, rate + (step.faster ? 0.15 : -0.15))) * 100) / 100; setRate(r); changeMemory({ op: "prefs", prefs: { rate: r } }); return null; }
      case "handsfree": setMode(step.on ? "on" : "off"); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "workspace": {
        if (step.op === "save") { const id = await c.saveWorkspace(step.name ?? "Jarvis view"); return id ? line("saved", lang, { name: step.name }) : null; }
        try {
          const r = await fetch("/api/collector/workspaces");
          const j = await r.json();
          const list: { id: number; name: string }[] = j.workspaces ?? j.items ?? j ?? [];
          const q = (step.name ?? "").toLowerCase();
          const w = list.find((x) => x.name.toLowerCase() === q) ?? list.find((x) => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
          if (!w) return line("noWorkspace", lang, { name: step.name });
          await c.openSavedWorkspace(w.id);
          return null;
        } catch { return line("noWorkspace", lang, { name: step.name }); }
      }
      case "undo": {
        let snap: Snap | null = null; let undone: Step[] = [];
        for (let k = 0; k < step.n && undoStack.current.length; k++) { const u = undoStack.current.pop()!; snap = u.snap; undone = u.steps; }
        if (!snap) return line("nothingToUndo", lang);
        h.restore(snap);
        return line("undone", lang, { what: undone.map((s) => describeStep(s, worldRef.current, lang)).join(", ") });
      }
      case "stop": stopSpeaking(); abortMission.current = true; return null;
      case "off": switchOff(); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "repeat": { const l = lastSpoken.current; if (l) out(l.text, lang === l.lang ? l.lang : lang); return null; }
      case "whatDid": {
        const s = lastSteps.current;
        return s.length ? line("did", lang, { what: s.map((x) => describeStep(x, worldRef.current, lang)).join(", ") }) : line("didNothing", lang);
      }
      case "whereAmI": {
        const st = buildState();
        const w = worldRef.current;
        const scope = [st.zone ? `${lang === "ta" ? "மண்டலம்" : "Zone"} ${st.zone} ${w.zones.find((z) => z.n === st.zone)?.name ?? ""}` : null,
          st.taluk ? w.taluks.find((t) => t.code === st.taluk)?.name : null, st.dept ? w.depts.find((d) => d.code === st.dept)?.name : null,
          st.cat ? w.cats.find((x) => x.code === st.cat)?.label : null].filter(Boolean).join(", ") || (lang === "ta" ? "முழு மாவட்டம்" : "District-wide");
        return line("where", lang, { page: lang === "ta" ? PAGE_TA[st.page] : PAGE_EN[st.page], scope, period: lang === "ta" ? PERIOD_TA[st.period] : PERIOD_EN[st.period] });
      }
      case "explain": return explain(lang);
      case "numbers": if (step.show) setNumbers({ names: step.names, items: clickables() }); else setNumbers(null); return null;
      case "click": {
        const list = numbersRef.current?.items ?? clickables();
        const t = step.n != null ? list.find((x) => x.n === step.n) ?? null : byName(list, step.name ?? "");
        setNumbers(null);
        if (!t) return line("notUnderstood", lang, { heard: heardText, examples: "show numbers, click 3" });
        // Jarvis never presses send, approve or delete, by number or by name
        // (a button's name can hide what it does, and no pattern can catch a bare "Yes": those carry data-jarvis-never)
        if (t.el.closest("[data-jarvis-never]") || DANGER_BUTTON.test(`${t.name ?? ""} ${t.el.textContent ?? ""}`)) return lang === "ta" ? "அனுப்புவதும் ஒப்புதலும் நீக்குவதும் உங்கள் கையால் மட்டுமே." : "Sending, approving and deleting are yours to tap. I won't press those.";
        press(t.el);
        return null;
      }
      case "scroll": scroll(step.dir); return null;
      case "type": typeInto(step.text); return null;
      case "clearText": typeInto("", true); return null;
      case "remember": return (await changeMemory({ op: "note", text: step.text })) ? line("remembered", lang) : line("memoryFail", lang);
      case "recall": await loadMemory(); setPanel("memory"); return null;
      case "forget": return (await changeMemory(step.all ? { op: "forget", all: true } : { op: "forget" })) ? line(step.all ? "forgottenAll" : "forgotten", lang) : line("memoryFail", lang);
      case "remind": return (await changeMemory({ op: "remind", text: step.text, at: step.at })) ? line("reminder", lang, { when: whenOf(step.at) }) : line("memoryFail", lang);
      case "send": {
        if (tray.length) return line("sendGate", lang, { n: tray.length });
        const id = buildState().incident;
        if (!id) return line("noDraft", lang);
        const d = await draftFor(id);
        if (!d) return line("noDraft", lang);
        addToTray([d]);
        return line("sendGate", lang, { n: 1 });
      }
      // Jarvis never sends or approves, even when told to: the tray's button is the Collector's own tap
      case "confirm": return lang === "ta" ? "அனுப்புவது உங்கள் கையால்: தட்டில் உள்ள ஒப்புதல் பொத்தானைத் தட்டுங்கள்." : "Approving is yours to tap: the Approve button is in the tray. I never send.";
      case "mission": await mission(step.name, lang); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "read": return read(step, lang);
      case "help": setPanel("help"); return line("help", lang);
      default: return null;
    }
  };

  // --------------------------------------------------------------- a plan --
  const ACTS_ON_PAGE = new Set(["page", "period", "view", "mapMode", "layer", "panel", "item", "draft", "zoom", "map", "workspace", "theme", "read"]);
  const VIEW_CHANGING = new Set(["page", "period", "view", "mapMode", "layer", "panel", "item", "draft", "zoom", "map", "close", "mission", "read", "workspace"]);
  const run = async (steps: Step[], lang: Lang, heardText: string, by: "rules" | "ai", note?: string, quiet = false) => {
    if (!steps.length) { setPhase("ready"); return; }
    const changes = steps.some((s) => VIEW_CHANGING.has(s.a) && !(s.a === "workspace" && s.op === "save"));
    if (changes) {
      undoStack.current.push({ steps, snap: hostRef.current.snapshot() });
      if (undoStack.current.length > 20) undoStack.current.shift();
    }
    const ids = steps.map(() => ++chipId.current);
    setChips(steps.map((s, i) => ({ id: ids[i], label: describeStep(s, worldRef.current, lang), state: "pending" })));
    setPhase("acting");
    // an interruption, or a newer sentence, ends this plan where it stands: it never speaks or moves anything after that
    const gen = turnGen.current, alive = () => gen === turnGen.current;
    abortMission.current = false;
    justOpened.current = null;
    const said: string[] = [];
    const t0 = performance.now();
    for (let i = 0; i < steps.length; i++) {
      if ((abortMission.current || !alive()) && steps[i].a !== "stop") break;
      setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "running" } : c)));
      try {
        await glide(steps[i]);
        const s = await runStep(steps[i], lang, heardText);
        if (s) said.push(s);
        setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "done" } : c)));
      } catch (e) {
        console.error("thunai step failed", steps[i], e);
        setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state: "failed" } : c)));
      }
    }
    const ms = Math.round(performance.now() - t0);
    setChips((cs) => cs.map((c, i) => (i === cs.length - 1 ? { ...c, label: `${c.label} (${(ms / 1000).toFixed(1)} s)` } : c)));
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat" || s.a === "undo")) lastSteps.current = steps;
    audit(heardText, steps, `done by ${by}${note ? `; ${note}` : ""}`);
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat")) remember(heardText, steps.map((s) => describeStep(s, worldRef.current, "en")).join("; "));
    changeMemory({ op: "recent", text: heardText });
    if (!alive()) return;
    const speakLine = [note, ...said].filter(Boolean).join(" ");
    if (steps.some((s) => s.a === "off")) return;
    // a command on the dashboard (a page, a filter, a panel, the map): the insight screen closes and Jarvis becomes a
    // small card, so what it did is in plain view; the conversation goes on
    if (!quiet && steps.some((s) => ACTS_ON_PAGE.has(s.a))) {
      if (stageRef.current) closeStage(); // eslint-disable-line @typescript-eslint/no-use-before-define
      setMini(true);
    }
    // the Stage speaks for itself: the steps only made the console agree with it
    if (quiet) { setPhase(tray.length ? "waiting" : "ready"); return; }
    if (speakLine) out(speakLine, lang, tray.length ? "waiting" : "ready");
    else { earcon("done"); const done = steps.map((s) => describeStep(s, worldRef.current, lang)).join(" · "); setReply(done); showAlt(done, lang); setPhase(tray.length ? "waiting" : "ready"); }
  };

  const ask = (card: AskCard, allowed?: Set<string>) => {
    setAskOnce(card);
    setPhase("asking");
    earcon("need");
    out(card.question, card.lang, "asking", allowed);
  };
  const fromRules = (r: Extract<Understood, { kind: "ask" }>): AskCard =>
    ({ question: r.question[r.lang], lang: r.lang, heard: r.heard, choices: r.choices.map((c) => ({ label: c.label[r.lang], en: c.label.en, steps: c.steps })) });
  const pickChoice = async (card: AskCard, c: AskCard["choices"][number]) => {
    setAskOnce(null);
    if (c.request) { await handle(c.request, 0.95, card.heard); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
    if (!c.steps?.length) { setPhase("ready"); return; }
    void changeMemory({ op: "habit", heard: card.heard.toLowerCase(), meant: c.en });
    await run(c.steps, card.lang, card.heard, "rules");
  };

  /** Ask the brain (the model on the server); null when it cannot be reached. */
  const think = async (said: string, st: ScreenState): Promise<{ plan: Checked; model: string | null; ms: number } | null> => {
    try {
      const j = await post(hostRef.current.planUrl ?? "/api/collector/thunai/plan", {
        text: said, turns: turns.current.slice(-4),
        state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode,
          panel: st.panel, incident: st.incident, listLength: st.list.length, lastPlace: st.lastPlace, numbers: !!st.numbers }
      });
      return j?.plan?.kind ? { plan: j.plan as Checked, model: j.model ?? null, ms: j.ms ?? 0 } : null;
    } catch { return null; }
  };

  /** Steps that change something saved wait for one tap or "yes" (level B). */
  const gateB = (steps: Step[], said: string, lang: Lang) => {
    const s = steps.find((x) => x.a === "workspace" || x.a === "remember" || x.a === "forget" || x.a === "remind");
    // a plan with something outward in it (level C) and nothing to keep: run() only drafts to the tray, never sends
    if (!s) { void run(steps, lang, said, "ai"); return; }
    const q = s.a === "workspace" ? line("saveAsk", lang, { name: s.name }) : s.a === "remember" ? line("rememberAsk", lang, { text: s.text })
      : s.a === "forget" ? line("forgetAsk", lang, { what: s.all ? (lang === "ta" ? "எல்லாவற்றையும்" : "everything") : (lang === "ta" ? "கடைசி குறிப்பை" : "the last note") })
        : line("remindAsk", lang, { when: whenOf((s as Extract<Step, { a: "remind" }>).at), text: (s as Extract<Step, { a: "remind" }>).text });
    setPendingB({ text: q, steps, heard: said, lang });
    earcon("need");
    out(q, lang, "asking");
  };


  // --------------------------------------------------------------- the Stage (v2) --
  const loadPins = useCallback(() => {
    const fromMem = (memoryRef.current as unknown as { pins?: PinnedScreen[] } | null)?.pins;
    // the server's memory holds the pins; the Overview's chips read this browser's copy of them
    if (fromMem) { setPins(fromMem); store.set("thunai-pins", JSON.stringify(fromMem)); window.dispatchEvent(new CustomEvent("jarvis:pins")); return; }
    try { setPins(JSON.parse(store.get("thunai-pins") ?? "[]")); } catch { setPins([]); }
  }, []);
  useEffect(() => { loadPins(); }, [memory, loadPins]);
  useEffect(() => { void loadMemory(); }, [loadMemory]);
  const savePins = async (next: PinnedScreen[], op: Record<string, unknown>) => {
    setPins(next);
    store.set("thunai-pins", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("jarvis:pins"));
    await changeMemory(op);
  };
  // a pinned screen's chip on the Overview: it opens built fresh from the data
  useEffect(() => {
    const f = (e: Event) => { const p = (e as CustomEvent<PinnedScreen>).detail; if (!onRef.current) switchOn(true); void directStage(p.recipe as StageDocT["recipe"], p.slots, p.title); }; // eslint-disable-line @typescript-eslint/no-use-before-define
    window.addEventListener("jarvis:open-pin", f);
    return () => window.removeEventListener("jarvis:open-pin", f);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ask the agent: a sentence (with the screen, the turns and the open Stage), or a Stage control's direct screen. */
  const callAgent = async (said: string, st: ScreenState, direct?: { recipe: StageDocT["recipe"]; slots: Record<string, unknown>; lang: Lang }, signal?: AbortSignal): Promise<AgentResult | null> => {
    const turnId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const url = `${hostRef.current.agentUrl ?? "/api/collector/thunai/agent"}/round`;
    const t0 = performance.now();
    const stepId = `think-${turnId}`;
    if (!direct) { hud.clearSteps(); hud.step({ id: stepId, label: listenLangRef.current === "ta" ? "புரிந்துகொள்கிறேன்" : "Understanding" }); }
    const finishStep = (state: "done" | "failed") => { if (!direct) hud.step({ id: stepId, label: listenLangRef.current === "ta" ? "புரிந்துகொள்கிறேன்" : "Understanding", state }); };
    let observations: { step: string; ok: boolean; error?: string | null }[] = [];
    try {
      // the browser drives the rounds: it applies what comes back, makes the digest, and asks again (at most 3, 8 s in all)
      for (let round = 0; round < 3; round++) {
        if (performance.now() - t0 > 8000) break;
        const doc = stageRef.current;
        const j = await post(url, {
          turnId, round, text: said.slice(0, 300), turns: turns.current.slice(-4), lastText: lastRequest.current && lastRequest.current.text !== said ? lastRequest.current.text.slice(0, 300) : null,
          state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode,
            panel: st.panel, incident: st.incident, listLength: st.list.length, lastPlace: st.lastPlace, numbers: !!st.numbers },
          stage: doc ? stageContext(doc, stageFocus.current) : null,
          stageDigest: doc ? stageDigest(stageModel(), stageFocus.current) : null, // eslint-disable-line @typescript-eslint/no-use-before-define
          observations, direct: direct ?? null
        }, signal) as { done: boolean; result: AgentResult | null; steps?: Step[]; trace?: { label: string; ms: number; ok: boolean }[]; tokens?: number; hops?: string[] };
        // the work timeline: only what really ran, with the time it took
        if (!direct) for (const [i, x] of (j.trace ?? []).entries()) hud.step({ id: `${turnId}-${round}-${i}`, label: x.label, state: x.ok ? "done" : "failed", ms: x.ms });
        hud.strip({ tokens: j.tokens ?? null });
        // steps the plan runs before it looks again; how they went goes back with the next round
        observations = [];
        for (const s of j.steps ?? []) {
          if (signal?.aborted) return null;
          try { await runStep(s, listenLangRef.current, said); await hostRef.current.settled?.(); observations.push({ step: s.a, ok: true }); }
          catch (e) { observations.push({ step: s.a, ok: false, error: String((e as Error).message).slice(0, 150) }); }
        }
        if (j.done) { finishStep("done"); if (j.result?.model) hud.strip({ provider: j.result.model.replace(/#\d+$/, "") }); return j.result ?? null; }
      }
      finishStep("failed");
      return null;
    } catch { finishStep("failed"); return null; }
  };

  const stopNarration = () => { stopVoice(); setNarrating(false); setReading(null); };

  /** Read the summary, then (for news and the brief) every item, the one being read highlighted; then listen again. */
  const narrate = (doc: StageDocT, say: string | null, lang: Lang, items: boolean) => {
    const list = items ? narrationOf(doc, lang) : [];
    narration.current = list;
    narrIndex.current = 0;
    const lines = [...(say ? [spoken(say)] : []), ...list.map((x) => x.text)];
    const offset = say ? 1 : 0;
    if (say) { setReply(say); showAlt(say, lang); lastSpoken.current = { text: say, lang }; }
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    if (outMode !== "voice" || !lines.length || (lang === "ta" && voiceLang !== "ta-IN")) { setPhase(tray.length ? "waiting" : "ready"); return; }
    setNarrating(true);
    setPhase("speaking");
    speakLines(lines, voiceLang, {
      rate, voice: voiceName, allowed: screenFigures(doc, lang),
      onLine: (i) => { const it = list[i - offset]; if (it) narrIndex.current = i - offset; setReading(it ? { key: it.key, char: null, lead: it.lead } : null); },
      onWord: (i, ch) => { const it = list[i - offset]; if (it) setReading({ key: it.key, char: ch, lead: it.lead }); },
      onEnd: () => {
        setNarrating(false); setReading(null);
        setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off");
      }
    });
  };

  /** Read the items from item i onwards ("next", "again", "read them"). */
  const readFrom = (i: number, lang: Lang) => {
    const doc = stageRef.current;
    if (!doc) return;
    const list = narrationOf(doc, lang);
    if (!list.length) { out(doc.say[lang], lang); return; }
    const k = Math.max(0, Math.min(list.length - 1, i));
    narration.current = list;
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    narrIndex.current = k;
    setReading({ key: list[k].key, char: null, lead: list[k].lead });
    if (outMode !== "voice") { setReply(list[k].text); return; }
    setNarrating(true); setPhase("speaking");
    speakLines(list.slice(k).map((x) => x.text), voiceLang, {
      rate, voice: voiceName, allowed: screenFigures(doc, lang),
      onLine: (j) => { narrIndex.current = k + j; setReading({ key: list[k + j].key, char: null, lead: list[k + j].lead }); },
      onWord: (j, ch) => setReading({ key: list[k + j].key, char: ch, lead: list[k + j].lead }),
      onEnd: () => { setNarrating(false); setReading(null); setPhase("ready"); }
    });
  };

  const ensureGeo = () => {
    if (geo) return;
    const h = hostRef.current;
    (h.loadGeo ? h.loadGeo() : fetch("/api/collector/geo").then((r) => (r.ok ? r.json() : null))).then((g) => g && setGeo(g as MapGeo)).catch(() => undefined);
  };

  const showStage = (doc: StageDocT, say: string | null, lang: Lang, brainInfo: { model: string | null; ms: number; rounds: number; calls: number } | null, opts: { push?: boolean; drafts?: boolean } = {}) => {
    stopNarration();
    markAnswer(); // eslint-disable-line @typescript-eslint/no-use-before-define
    toHud(doc, lang);
    setMini(false);
    // the conversation keeps a card of this screen (a click opens it again)
    const scr = { title: doc.title, recipe: doc.recipe, slots: doc.slots };
    // the screen carries its words in both languages, every figure from the data: no translation needed
    if (say) givenAlt.current = { text: say, alt: doc.say[lang === "ta" ? "en" : "ta"] ?? "" };
    if (say) pendingScreen.current = scr; else pushMsg({ who: "jarvis", text: doc.title, lang, screen: scr });
    ensureGeo();
    const withDrafts: StageDocT = opts.drafts && doc.blocks.length < 6 ? { ...doc, blocks: [...doc.blocks, { kind: "Drafts", id: "drafts", title: lang === "ta" ? "ஒப்புதலுக்காக" : "Waiting for your approval" }] } : doc;
    const apply = () => {
      if (stageRef.current && opts.push !== false) { const cur = stageRef.current; setStageBack((b) => [...b, cur].slice(-8)); }
      setStage(withDrafts); setStageViews({}); setStageFilter(null); setStageBrain(brainInfo); stageFocus.current = null;
    };
    // a shared-element style hand-over where the browser has it (the View Transitions API), a plain swap elsewhere
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !reduced() && stageRef.current) d.startViewTransition(() => apply()); else apply();
    stageRef.current = withDrafts;
    remember(doc.title, `showed a ${doc.recipe} screen: ${doc.title}`);
    const auto = withDrafts.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief");
    narrate(withDrafts, say, lang, auto);
  };

  const closeStage = () => { stopNarration(); setStage(null); stageRef.current = null; setStageBack([]); setStageBusy(null); setSaveAsk(null); setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); };

  /** A screen from a Stage control or a local command: built by code from the data, no model. */
  const directStage = async (recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string, lang: Lang = listenLang, opts: { drafts?: boolean } = {}) => {
    // it replaces what is in flight, and anything newer replaces it: a cancelled screen never appears
    const gen = ++turnGen.current;
    turnCtl.current?.abort();
    const ctl = new AbortController();
    turnCtl.current = ctl;
    setStageBusy(label);
    stopNarration();
    const t0 = performance.now();
    const r = await callAgent(label, buildState(), { recipe, slots, lang }, ctl.signal);
    if (gen !== turnGen.current) return;
    setStageBusy(null);
    if (!r?.stage) { earcon("blocked"); setReply(lang === "ta" ? "அந்தத் திரையை உருவாக்க முடியவில்லை." : "I could not build that screen."); return; }
    // an answer on Jarvis's screen leaves the dashboard as the Collector set it: its filters are not changed behind the
    // screen (they used to follow the answer, so the dashboard stayed filtered after Jarvis closed)
    showStage(r.stage, r.say, lang, { model: null, ms: Math.round(performance.now() - t0), rounds: 0, calls: r.calls.length }, opts);
  };

  const draftMany = async (ids: string[], lang: Lang) => {
    const uniq = [...new Set(ids)].slice(0, 10);
    if (!uniq.length) { out(line("noIncident", lang), lang); return; }
    setReply(line("draftsMaking", lang, { n: uniq.length }));
    const ds = (await Promise.all(uniq.map(draftFor))).filter((d): d is Draft => !!d);
    const total = new Set([...tray.map((t) => t.incidentId), ...ds.map((d) => d.incidentId)]).size;
    if (ds.length) { addToTray(ds); out(line("sendGate", lang, { n: total }), lang, "waiting"); }
    else out(line("noDraft", lang), lang);
    audit(`draft ${uniq.join(", ")}`, [{ a: "draft" }], `drafted ${ds.length} of ${uniq.length} into the tray (nothing sent)`);
  };

  const exportCsv = () => {
    const d = stageRef.current;
    if (!d) return;
    download(new Blob([toCsv(d)], { type: "text/csv;charset=utf-8" }), `${fileName(d.title)}.csv`);
  };

  /** The Stage as one object, read through refs, so a command right after another sees what it did (not a stale render). */
  const stageViewsRef = useRef(stageViews);
  stageViewsRef.current = stageViews;
  const stageFilterRef = useRef(stageFilter);
  stageFilterRef.current = stageFilter;
  const stageBackRef = useRef(stageBack);
  stageBackRef.current = stageBack;
  const stageModel = (): StageModel => ({ doc: stageRef.current, back: stageBackRef.current, views: stageViewsRef.current, filter: stageFilterRef.current, narr: narrIndex.current });
  /** Commit a model to the screen and to the refs at once; the digest of what is now true comes back. */
  const commit = (m: StageModel): string | null => {
    stageRef.current = m.doc; stageBackRef.current = m.back; stageViewsRef.current = m.views as Record<string, BlockView>; stageFilterRef.current = m.filter; narrIndex.current = m.narr;
    setStage(m.doc); setStageBack(m.back); setStageViews(m.views as Record<string, BlockView>); setStageFilter(m.filter);
    return stageDigest(m, stageFocus.current);
  };
  /** Carry out what a command asked for. Speech and network live here, not in the reducer. */
  const runEffect = async (e: StageEffect, lang: Lang, doc: StageDocT) => {
    switch (e.fx) {
      case "stopVoice": stopNarration(); return;
      case "closed": setStageBusy(null); setSaveAsk(null); setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); return;
      case "say": if (e.speak) out(e[lang], lang); else setReply(e[lang]); return;
      case "readFrom": readFrom(e.i, lang); return;
      case "rebuild":
        if (e.clearConsole) hostRef.current.applyView({ zone: null, dept: null, cat: null, taluk: null });
        await directStage(e.recipe, e.slots, e.label[lang], lang);
        return;
      case "pin": {
        const p: PinnedScreen = { id: Math.random().toString(36).slice(2, 10), title: doc.title.slice(0, 80), recipe: doc.recipe, slots: doc.slots, at: new Date().toISOString() };
        await savePins([...pins.filter((x) => x.title !== p.title), p].slice(-12), { op: "pin", pin: p });
        return;
      }
      case "export":
        if (e.what === "png") { const root = document.querySelector<HTMLElement>(".st-root"); if (root) await exportPng(root, doc, lang); }
        else exportCsv();
        return;
      case "draft": await draftMany(e.ids, lang); return;
      case "mapItem": if (e.id) { hostRef.current.c.setPage("overview"); hostRef.current.c.askOnMap?.({ incidentId: e.id }); } return;
      case "full": document.querySelector<HTMLElement>(".st-frame")?.requestFullscreen?.().catch(() => undefined); return;
      case "scrollMap": document.querySelector(".st-block.k-MapView")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" }); return;
      case "earcon": earcon("done"); return;
    }
  };
  /** Apply one Stage command (from the local parser or the agent's stage op): the reducer, then its effects. Returns the digest. */
  const applyLocal = async (cmd: LocalCmd, lang: Lang): Promise<string | null> => {
    const before = stageModel();
    if (!before.doc) return null;
    const r = stageReducer(before, cmd);
    if (cmd.op === "open") stageFocus.current = cmd.n;
    const digest = commit(r.m);
    for (const e of r.fx) await runEffect(e, lang, before.doc);
    return digest;
  };

  /** Pinning keeps something: one spoken yes or a tap first (level B). */
  const askPin = (lang: Lang) => {
    const q = lang === "ta" ? "இந்தத் திரையைப் பின் செய்யவா?" : "Pin this screen?";
    setPendingB({ text: q, steps: [], heard: "pin this", lang, act: () => void applyLocal({ op: "pin" }, lang) });
    earcon("need");
    out(q, lang, "asking");
  };
  const applyStageOp = async (op: StageOp, lang: Lang) => {
    if (op.op === "save") { askSave(op.text ?? stageRef.current?.title ?? "Jarvis screen", lang); return; }
    if (op.op === "pin") { askPin(lang); return; }
    const sortBy = (["complaints", "time", "value", "name", "severity"].includes(op.text ?? "") ? op.text : "value") as "value";
    const cmd: LocalCmd | null =
      op.op === "open" ? { op: "open", n: op.n ?? 1 }
        : op.op === "draft" ? { op: "draft", n: op.n ?? 1, first: /first|top/i.test(op.text ?? "") }
          : op.op === "filter" ? (op.text ? { op: "filter", text: op.text } : null)
            : op.op === "sort" ? { op: "sort", by: sortBy }
              : op.op === "view" ? { op: "view", view: op.text === "table" ? "table" : op.text === "map" ? "map" : "chart" }
                : op.op === "export" ? { op: "export", what: /png|image|picture/i.test(op.text ?? "") ? "png" : /csv|data/i.test(op.text ?? "") ? "csv" : null }
                  : op.op === "map" ? { op: "map", n: op.n }
                    : op.op === "explain" ? { op: "again" }
                      : ({ op: op.op } as LocalCmd);
    if (cmd) await applyLocal(cmd, lang);
  };

  /** Saving a workspace changes something kept: one tap or "yes" first (level B). */
  const askSave = (name: string, lang: Lang) => {
    const q = line("saveAsk", lang, { name });
    setSaveAsk(q);
    setPendingB({ text: q, steps: [{ a: "workspace", op: "save", name }], heard: `save as ${name}`, lang });
    earcon("need");
    out(q, lang, "asking");
  };

  /** Esc, the HUD's stop, the Stage's stop: the voice and the question stop at once. The frame stays, and so does the screen. */
  // (the turn machine first: it keeps what "continue" needs only if it hears this while the voice is still going)
  const interrupt = () => { conductor.current?.stop(); stopSpeaking(); cancelTurn(); }; // eslint-disable-line @typescript-eslint/no-use-before-define
  const turnActive = () => speaking() || narrating || phase === "thinking" || phase === "acting" || !!stageBusy || !!(conductor.current && conductor.current.state !== "off" && conductor.current.state !== "listening");

  const stageActions = {
    close: () => { if (turnActive()) interrupt(); else closeStage(); },
    back: stageBack.length ? () => void applyLocal({ op: "back" }, listenLang) : null,
    ask: (t: string) => void handleRef.current(t, 0.95), // eslint-disable-line @typescript-eslint/no-use-before-define
    mic: () => setMode(modeRef.current === "on" ? "muted" : "on"), // eslint-disable-line @typescript-eslint/no-use-before-define
    listening: conv,
    direct: (recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string) => void directStage(recipe, slots, label),
    openCase: (id: string) => void directStage("case", { id }, listenLang === "ta" ? "சம்பவத்தைத் திறக்கிறேன்" : "Opening the incident"),
    openInConsole: (id: string) => { closeStage(); hostRef.current.c.openInc(id); },
    takeAction: (id: string) => { closeStage(); hostRef.current.c.openAction(id); audit(`take action ${id}`, [{ a: "draft" }], "opened Take action (nothing sent)"); },
    draft: (ids: string[]) => void draftMany(ids, listenLang),
    showOnMainMap: (q: { incidentId?: string; zone?: number; text?: string }) => {
      closeStage();
      const c = hostRef.current.c;
      c.setPage("overview");
      if (q.incidentId) c.askOnMap?.({ incidentId: q.incidentId }); else if (q.zone) hostRef.current.applyView({ zone: q.zone }); else if (q.text) c.askOnMap?.(q.text);
    },
    zone: (z: number) => void directStage("cases", { zones: [z], period: stageRef.current?.scope.period ?? null, cat: stageRef.current?.scope.cat ?? null, sort: "priority", n: 15 }, `${ZONE_NAMES[z - 1] ?? `Zone ${z}`}`),
    dept: (code: string, name: string) => void directStage("cases", { dept: code, status: "open", period: stageRef.current?.scope.period ?? null, sort: "priority", n: 15 }, name),
    station: (name: string, metric: string) => void directStage("readings", { metric: ["rain", "aqi", "lakes", "temp", "humidity"].includes(metric) ? metric : "rain", name }, name),
    read: () => readFrom(0, listenLang),
    stop: () => interrupt(),
    pin: () => void applyLocal({ op: "pin" }, listenLang),
    openPin: (p: PinnedScreen) => void directStage(p.recipe as StageDocT["recipe"], p.slots, p.title),
    unpin: (id: string) => void savePins(pins.filter((x) => x.id !== id), { op: "unpin", id }),
    exportCsv,
    exportPng: (root: HTMLElement) => { if (stageRef.current) void exportPng(root, stageRef.current, listenLang); },
    save: (name: string) => askSave(name, listenLang),
    setView: (id: string, v: BlockView) => setStageViews((x) => ({ ...x, [id]: v })),
    confirmTray: () => void sendTray(tray.length, listenLang, "tap"),
    discardTray: () => { setTray([]); setTrayShownAt(null); }
  };

  // --------------------------------------------------------------- a sentence --
  /**
   * The brain understands every sentence; only instant controls (stop, undo, confirm 3, click 4 while numbers show) are
   * done on the spot. When the brain cannot be reached, the built-in rules answer instead and the dock says so.
   */
  const handle = async (text: string, conf = 0.95, original?: string, opts: { gate?: Addressed | null; source?: "whisper" | "captions" | "typed" } = {}) => {
    const said = text.trim();
    if (!said) return;
    // a new sentence: the question in flight is aborted, and nothing it comes back with may speak
    const gen = ++turnGen.current;
    const alive = () => gen === turnGen.current;
    turnCtl.current?.abort();
    const ctl = new AbortController();
    turnCtl.current = ctl;
    gateRef.current = opts.gate ?? null;
    sourceRef.current = opts.source ?? "typed";
    forgetBookmark();
    if (!original) lastRequest.current = { text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en" };
    hud.set({ ribbon: said, answer: "" });
    captionRibbon.current = false;
    lastUserSpeech.current = Date.now();
    lastHeardAt.current = Date.now();
    setHeard(original ?? said); setInterim(""); setWrong(null); setReply(""); setAlt(""); altSeq.current++; lastBot.current = "";
    if (!original) pushMsg({ who: "you", text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en", via: via.current });
    via.current = "typed";
    // an answer to the one question
    if (askOnce && !original) {
      const t = said.toLowerCase();
      const pick = /^(1|first|one|முதலாவது|முதல்|onnu|mudhal)$/.test(t) ? 0 : /^(2|second|two|இரண்டாவது|ரெண்டாவது|rendu|second one)$/.test(t) ? 1
        : /^(3|third|three|மூன்றாவது|moonu)$/.test(t) ? 2 : askOnce.choices.findIndex((c) => c.label.toLowerCase() === t || c.en.toLowerCase() === t);
      const card = askOnce;
      setAskOnce(null);
      if (pick >= 0 && card.choices[pick]) { await pickChoice(card, card.choices[pick]); return; }
    }
    // a "yes" to a one-tap (level B) card
    if (pendingB) {
      // a yes from Whisper, typed text or a tap; browser captions can catch Jarvis's own voice, so theirs never counts
      if (/^(yes|ok|okay|save|do it|ஆமா|ஆம்|சரி|aama|sari|seri)[.!]?$/i.test(said) && sourceRef.current !== "captions") { const p = pendingB; setPendingB(null); if (p.act) p.act(); else await run(p.steps, p.lang, p.heard, "rules"); return; }
      if (/^(no|cancel|வேண்டாம்|illa|vendaam)$/i.test(said)) { setPendingB(null); setPhase("ready"); return; }
      setPendingB(null);
    }
    // from tier 3 (no name, not engaged) only level A runs; the rest waits for the name
    const needsName = (risk: "A" | "B" | "C", lang: Lang) => {
      const g = gateRef.current;
      if (!g || levelAllowed(g, risk)) return false;
      earcon("need");
      out(lang === "ta" ? "அதற்கு முதலில் \"ஜார்விஸ்\" என்று சொல்லுங்கள்." : "Say Jarvis first for that.", lang, "ready");
      return true;
    };
    // the open Stage: its own commands ("next", "only the Adyar ones", "open 3", "pin this") need no model
    if (stageRef.current && !original) {
      const lc = localStageCommand(said);
      if (lc) {
        const lg: Lang = /[஀-௿]/.test(said) ? "ta" : listenLang;
        if (needsName(lc.op === "pin" ? "B" : lc.op === "draft" ? "C" : "A", lg)) return;
        setBrain({ by: "instant", model: null, ms: 0 }); remember(said, `on the Stage: ${lc.op}`);
        // pinning keeps something: one spoken yes or a tap first (level B)
        if (lc.op === "pin") { askPin(lg); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
        await applyLocal(lc, lg);
        return;
      }
    }
    const st = buildState();
    const rules = understand(said, st, worldRef.current, { speechConf: conf });
    // instant controls never wait for the network; sending only ever happens here, from the Collector's own words
    if (rules.kind === "do" && isReflex(rules.steps, st)) {
      if (needsName(planRisk(rules.steps), rules.lang)) return;
      setBrain({ by: "instant", model: null, ms: 0 }); await run(rules.steps, rules.lang, said, "rules"); return;
    }
    // a plain move the rules are sure of ("go to trends", "open the map") is done at once, with no model
    if (rules.kind === "do" && rules.confidence >= 0.9 && planRisk(rules.steps) === "A" && isPlainMove(rules.steps)) {
      setBrain({ by: "instant", model: null, ms: 0 });
      await run(rules.steps, rules.lang, said, "rules", rules.note?.[rules.lang]);
      return;
    }

    setPhase("thinking");
    setChips([]);
    const heardAs = original ?? said;
    // "complete this data" with a list on the screen means those rows, not whatever the console's filters hold
    const openRows = (stageRef.current?.blocks ?? []).flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : []));
    if (openRows.length && quickScreen(said, worldRef.current)?.recipe === "complete") { await directStage("complete", { ids: openRows }, ackFor(said, rules.lang), rules.lang); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
    // lane 1: an acknowledgement at once, then lane 2: the screen and the words. The acknowledgement never holds up the
    // answer: when the answer exists it speaks and the acknowledgement is cut. With the mode on the core shows the work,
    // with it off a soft heartbeat does
    const ack = ackTemplated(said, rules.lang, worldRef.current) || ackFor(said, rules.lang);
    ackText.current = ack;
    setReply(ack);
    if (stageRef.current) setStageBusy(ack);
    const ackT = outMode === "voice" && modeRef.current === "on" ? setTimeout(() => { if (alive()) speakAck(ack, rules.lang === "ta" ? "ta-IN" : "en-IN"); }, 150) : null;
    jvMark("ack");
    if (utterEnd.current) hud.strip({ ackMs: Math.round(performance.now() - utterEnd.current) });
    const stopBeat = outMode !== "quiet" && modeRef.current !== "on" ? heartbeat() : () => undefined;
    const ag = await callAgent(said, st, undefined, ctl.signal).finally(() => { stopBeat(); if (ackT) clearTimeout(ackT); });
    if (!alive()) return;
    setStageBusy(null);
    if (ag && ag.kind !== "none") {
      setBrain({ by: "ai", model: ag.model, ms: ag.ms });
      const lang = ag.lang;
      // a line the model wrote can hold no figure at all: the gate on the chunks has none to allow
      if (ag.kind === "chat") { earcon("done"); remember(heardAs, ag.reply ?? ""); out(ag.reply ?? "", lang, "ready", NO_FIGURES); return; }
      if (ag.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, `refused: ${ag.reply}`); out(ag.reply ?? "", lang, "ready", NO_FIGURES); return; }
      if (ag.kind === "clarify") { ask({ question: ag.reply ?? "", lang, heard: heardAs, choices: ag.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }, NO_FIGURES); return; }
      const risk = planRisk(ag.steps);
      const opRisk: "A" | "B" | "C" = ag.stageOp?.op === "save" || ag.stageOp?.op === "pin" ? "B" : ag.stageOp?.op === "draft" ? "C" : "A";
      if (needsName(risk > opRisk ? risk : opRisk, lang)) return;
      if (ag.steps.length && tapRisk(ag.steps) !== "A") { gateB(ag.steps, heardAs, lang); return; }
      if (ag.stage) {
        // the screen is the answer: the dashboard's own filters stay as they were (only a command changes them)
        audit(heardAs, ag.steps, `screen ${ag.stage.recipe} (${ag.calls.length} data calls, ${ag.rounds} model rounds)`);
        // the plan's own console steps run too ("go to trends and show me dengue"); the filters code added to match stay out
        const own = ag.steps.filter((s) => s.a !== "view" && s.a !== "period" && s.a !== "layer" && !(s.a === "page" && s.page === "environment"));
        if (own.length) await run(own, lang, heardAs, "ai", undefined, true);
        if (!alive()) return;
        showStage(ag.stage, ag.say, lang, { model: ag.model, ms: ag.ms, rounds: ag.rounds, calls: ag.calls.length });
        return;
      }
      if (ag.stageOp) {
        if (ag.steps.length) await run(ag.steps, lang, heardAs, "ai", undefined, true);
        if (!alive()) return;
        remember(heardAs, `on the Stage: ${ag.stageOp.op}${ag.stageOp.n ? ` ${ag.stageOp.n}` : ""}`);
        await applyStageOp(ag.stageOp, lang);
        return;
      }
      await run(ag.steps, lang, heardAs, "ai", noFigure(ag.reply));
      return;
    }
    // the agent could not answer: the built-in rules, then the analyst (the v1 planner asked the same busy provider again,
    // which doubled the wait; it is kept only for when the agent itself could not be reached)
    const ai = ag || modeRef.current === "on" ? null : await think(said, st);
    if (!alive()) return;
    if (ai && ai.plan.kind !== "none") {
      setBrain({ by: "ai", model: ai.model, ms: ai.ms });
      const p = ai.plan;
      if (p.kind === "chat") { earcon("done"); remember(heardAs, p.reply); out(p.reply, p.lang, "ready", NO_FIGURES); return; }
      if (p.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, `refused: ${p.reply}`); out(p.reply, p.lang, "ready", NO_FIGURES); return; }
      if (p.kind === "clarify") {
        ask({ question: p.question, lang: p.lang, heard: heardAs, choices: p.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }, NO_FIGURES);
        return;
      }
      if (needsName(planRisk(p.steps), p.lang)) return;
      if (tapRisk(p.steps) !== "A") { gateB(p.steps, heardAs, p.lang); return; }
      await run(p.steps, p.lang, heardAs, "ai", noFigure(p.reply));
      return;
    }
    // the brain was unreachable or found nothing real: the built-in rules answer, and the dock says so
    setBrain({ by: "rules", model: null, ms: 0 });
    if (rules.kind === "unknown") {
      // no model can answer right now: said plainly, inside the 8 s, with what still works
      if (ag?.note === "no-model") { earcon("blocked"); audit(said, [], "no model answered"); out(NO_MODEL_LINE[rules.lang], rules.lang, "ready"); return; }
      // the checker left nothing of the plan: what Jarvis can do, not silence
      if (ag && ag.kind === "none") { earcon("need"); audit(said, [], "cannot do"); out(cannotLine(rules.lang), rules.lang, "ready"); return; }
      // not a console command: a question about the district, answered by the analyst (Ask District IQ's engine)
      audit(said, [], "to the analyst");
      await askAnalyst(said, rules.lang); // eslint-disable-line @typescript-eslint/no-use-before-define
      return;
    }
    if (rules.kind === "refuse") { earcon("blocked"); audit(said, [], "refused"); out(rules.why[rules.lang], rules.lang, "ready"); return; }
    if (rules.kind === "ask" && rules.choices.some((c) => c.steps && planRisk(c.steps) !== "A") && needsName("C", rules.lang)) return;
    if (rules.kind === "ask") { ask(fromRules(rules)); return; }
    if (needsName(planRisk(rules.steps), rules.lang)) return;
    if (tapRisk(rules.steps) !== "A") { gateB(rules.steps, said, rules.lang); return; }
    if (rules.confidence < 0.6) {
      const what = rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ");
      ask({ question: line("lowConfidence", rules.lang, { what }), lang: rules.lang, heard: said,
        choices: [{ label: rules.lang === "ta" ? "ஆம்" : "Yes", en: "Yes", steps: rules.steps }, { label: rules.lang === "ta" ? "இல்லை" : "No", en: "No", steps: [] }] });
      return;
    }
    if (rules.confidence < 0.85) { setWrong(rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ")); setTimeout(() => setWrong(null), 4000); }
    await run(rules.steps, rules.lang, said, rules.by, rules.note?.[rules.lang]);
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // --------------------------------------------------------------- missions --
  const mission = async (name: "brief" | "rain", lang: Lang) => {
    const h = hostRef.current;
    const gen = turnGen.current, stopped = () => abortMission.current || gen !== turnGen.current;
    if (name === "brief") {
      h.c.setPage("briefing");
      let brief = null as null | { points: { text: string; ta: string | null }[] };
      for (let k = 0; k < 40 && !brief; k++) { brief = (hostRef.current.c.dayBrief?.brief as typeof brief) ?? null; if (!brief) await sleep(200); }
      if (!brief?.points?.length) { out(line("briefNone", lang), lang); return; }
      const pts = brief.points.slice(0, 5);
      setChips(pts.map((p, i) => ({ id: ++chipId.current, label: `${i + 1}. ${(lang === "ta" && p.ta ? p.ta : p.text).slice(0, 40)}…`, state: "pending" })));
      for (let i = 0; i < pts.length; i++) {
        if (stopped()) return;
        setChips((cs) => cs.map((c, j) => (j === i ? { ...c, state: "running" } : j < i ? { ...c, state: "done" } : c)));
        const text = line("briefPoint", lang, { text: lang === "ta" && pts[i].ta ? pts[i].ta : pts[i].text });
        setReply(text);
        if (outMode === "voice") await new Promise<void>((res) => { if (!speak(text, lang === "ta" ? "ta-IN" : "en-IN", () => res(), rate, voiceName)) res(); });
        else await sleep(3500);
      }
      setChips((cs) => cs.map((c) => ({ ...c, state: "done" })));
      return;
    }
    // rain readiness: environment readings, the flooding view, the map's hotspots, then drafts into the tray
    const steps = lang === "ta"
      ? ["மழை, ஏரிகள்", "வெள்ள நிகழ்வுகள்", "வரைபட மையங்கள்", "வரைவுகள்", "ஒப்புதல்"]
      : ["Rain and reservoirs", "Flooding view", "Hotspots on the map", "Drafts", "Approval"];
    const ids = steps.map(() => ++chipId.current);
    const mark = (i: number, state: Chip["state"]) => setChips((cs) => cs.map((c) => (c.id === ids[i] ? { ...c, state } : c)));
    setChips(steps.map((label, i) => ({ id: ids[i], label, state: "pending" })));
    mark(0, "running");
    const lakes = await read({ a: "read", what: "reservoir", name: null }, lang);
    setReply(lakes);
    mark(0, "done");
    if (stopped()) return;
    mark(1, "running");
    h.c.setPage("overview");
    h.applyView({ cat: "FLOOD_WATERLOGGING" });
    h.c.setPeriod("daily");
    await hostRef.current.settled?.();
    mark(1, "done");
    if (stopped()) return;
    mark(2, "running");
    h.c.askOnMap?.("hotspots of flooding and waterlogging");
    await hostRef.current.settled?.();
    mark(2, "done");
    if (stopped()) return;
    mark(3, "running");
    const top = buildState().list.slice(0, 3);
    setReply(line("draftsMaking", lang, { n: top.length }));
    const drafts = (await Promise.all(top.map(draftFor))).filter((d): d is Draft => !!d);
    if (stopped()) return;
    if (drafts.length) addToTray(drafts);
    mark(3, drafts.length ? "done" : "failed");
    mark(4, "running");
    setReply(`${lakes} ${drafts.length ? line("sendGate", lang, { n: drafts.length }) : line("noDraft", lang)}`);
    // v2: the mission ends on a screen (the flooding picture today, with the drafts waiting under it)
    await directStage("dashboard", { cat: "FLOOD_WATERLOGGING", period: "daily" }, lang === "ta" ? "வெள்ள நிலவரம்" : "Flooding today", lang, { drafts: true });
    mark(4, "done");
  };

  // --------------------------------------------------------------- the analyst --
  /** A question about the district (not a console command): Ask District IQ's engine answers, as a card in the thread. */
  const analystSession = useRef<string | null>(null);
  const askAnalyst = async (q: string, lang: Lang) => {
    const c = hostRef.current.c;
    const gen = turnGen.current, signal = turnCtl.current?.signal;
    setPhase("thinking");
    setReply(lang === "ta" ? "தரவில் தேடுகிறேன்…" : "Looking it up in the district's data…");
    try {
      const res = await fetch("/api/collector/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ sessionId: analystSession.current, message: q, inputMode: "voice", language: lang === "ta" ? "ta" : "auto",
          consoleScope: { period: c.period, zone: c.zone, dept: c.dept, cat: c.cat, taluk: c.taluk } }) });
      if (!res.ok || !res.body) throw new Error("failed");
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", card: Card | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = chunk.match(/^event: (.+)$/m)?.[1], raw = chunk.match(/^data: (.+)$/m)?.[1];
          if (ev === "answer" && raw) { card = JSON.parse(raw) as Card; analystSession.current = (card as unknown as { sessionId?: string }).sessionId ?? analystSession.current; }
        }
      }
      if (gen !== turnGen.current) return;
      if (!card) throw new Error("no answer");
      const say = card.voiceSummary || card.headline;
      lastBot.current = say;
      pushMsg({ who: "jarvis", text: say, lang: card.voiceLang === "ta-IN" ? "ta" : "en", card });
      earcon("done");
      out(say, card.voiceLang === "ta-IN" ? "ta" : "en", "ready");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      earcon("blocked");
      out(line("notUnderstood", lang, { heard: q, examples: SUGGEST.slice(0, 3).join(", ") }), lang, "ready");
    }
  };
  const cardAction = (a: ConsoleAction) => {
    const c = hostRef.current.c;
    if (a.action === "filter_zone" && a.zone) c.setZone(a.zone);
    else if (a.action === "filter_dept" && a.dept) c.setDept(a.dept);
    else if (a.action === "filter_taluk" && a.taluk) c.setTaluk(a.taluk);
    else if (a.action === "filter_cat" && a.cat) c.setCat(a.cat);
    else if (a.action === "set_period" && a.period) c.setPeriod(a.period);
    else if (a.action === "open_incident" && a.id) c.openInc(a.id);
    else if (a.action === "open_story") c.openStories();
    else if (a.action === "open_briefing") c.setPage("briefing");
    else if (a.action === "show_on_map") { if (a.plan && c.askOnMap) c.askOnMap({ plan: a.plan as never }); else { if (a.zone) c.setZone(a.zone); c.setPage("overview"); } }
  };

  // --------------------------------------------------------------- Jarvis mode --
  /** the ribbon is showing what the browser's captions caught, not a sentence that passed the gate */
  const captionRibbon = useRef(false);
  /** Abort the question in flight: nothing it comes back with may speak or change the screen. The frame stays. */
  const cancelTurn = () => {
    turnGen.current++;
    turnCtl.current?.abort();
    turnCtl.current = null;
    abortMission.current = true;
    setStageBusy(null);
    setNarrating(false); setReading(null);
    setPhase(onRef.current ? "ready" : "off");
  };
  /** A sentence that passed the address gate. */
  const onSentence = (h: HeardLine) => {
    lastHeardAt.current = Date.now();
    via.current = "voice";
    if (!onRef.current) switchOn(true); // eslint-disable-line @typescript-eslint/no-use-before-define
    setMini(true);
    // (an older turn finishing says nothing about the one now running)
    void handleRef.current(h.text, 0.95, h.again ? h.text : undefined, { gate: h.gate, source: h.source }).finally(() => { if (conductor.current?.generation === h.gen) conductor.current.answered(); });
  };
  const onSentenceRef = useRef(onSentence);
  onSentenceRef.current = onSentence;

  const conductorOf = () => {
    if (conductor.current) return conductor.current;
    const c = new Conductor({
      hearUrl: () => hostRef.current.hearUrl ?? "/api/jarvis/hear",
      siteLang: () => listenLangRef.current,
      onSentence: (h) => onSentenceRef.current(h),
      cancelTurn: () => cancelTurn(),
      onReach: (ok) => setOffline(!ok),
      onIgnored: (t) => { hud.set({ faint: t }); setTimeout(() => { if (hud.get().faint === t) hud.set({ faint: "" }); }, 2000); },
      onState: (s) => {
        setTurnState(s); hud.set({ turn: s });
        // back to listening with no request taken: what the captions caught is not left on the screen
        if (s === "listening" && captionRibbon.current) { captionRibbon.current = false; hud.set({ ribbon: "" }); setInterim(""); }
      },
      onLevel: (v) => hud.setLevel(v),
      onHearing: (a) => { setActivity(a); if (a !== "idle") lastHeardAt.current = Date.now(); },
      onBudget: (b) => hud.strip({ ambient: b.ambient, budgetLow: b.low }),
      onFail: (why) => {
        if (why === "gesture") { hud.set({ needsResume: true }); return; }
        if (why === "blocked") { setMicBlocked(true); hud.set({ denied: true }); }
        setMode("off");
      },
      onEndSession: () => { setMode("off"); },
      onHold: () => { setNarrating(false); setReading(null); },
      onNameOnly: () => { const l = listenLangRef.current; captionRibbon.current = false; hud.set({ ribbon: l === "ta" ? "சொல்லுங்கள்…" : "Yes?", faint: "" }); earcon("open"); lastTurnAt.current = Date.now(); },
      rules: (t) => {
        const w = worldRef.current;
        const q = quickScreen(t, w);
        const u = q ? null : understand(t, buildState(), w, { speechConf: 0.95 });
        return { sure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(t, w) };
      },
      lastTurnAt: () => lastTurnAt.current,
      onVoice: (e, p, ack) => {
        if (e === "start") {
          hud.strip({ path: p ?? null });
          jvMark("firstAudio");
          if (!ack) { jvMark("finding"); if (utterEnd2.current) { hud.strip({ findingMs: Math.round(performance.now() - utterEnd2.current) }); utterEnd2.current = null; } }
        }
        lastTurnAt.current = Date.now();
      },
      mark: (name, t) => {
        if (name === "vadEnd") { utterEnd.current = t; utterEnd2.current = t; }
        if (SPEC) (window as unknown as { __jv?: { marks: { name: string; t: number }[] } }).__jv?.marks.push({ name, t });
      }
    });
    onEarcon = () => c.earcon();
    conductor.current = c;
    return c;
  };

  /** Turn Jarvis mode on, off, or mute it. Off and muted stop the microphone's tracks: nothing listens. */
  const setMode = useCallback((next: JarvisMode, why?: "hidden" | "boot") => {
    const prev = modeRef.current;
    if (prev === next) return;
    modeRef.current = next;
    setModeState(next);
    hud.set({ mode: next, notice: null, ...(next === "off" ? { ribbon: "", answer: "", faint: "", panels: [], steps: [], needsResume: false, focus: null, firstUse: false } : {}) });
    if (why !== "hidden") store.set("jarvis-mode", next);
    if (next === "on") {
      if (!onRef.current) switchOn(true); // eslint-disable-line @typescript-eslint/no-use-before-define
      setMini(true);
      setMicBlocked(false);
      hud.set({ denied: false, needsResume: false });
      // the first time, the notice comes before the microphone: it opens when the Collector has read it
      if (!store.get("jarvis-mode-seen")) { hud.set({ firstUse: true }); return; }
      // the power-on's sound: one short synthesised tone, once a session, heard as an earcon so it cannot trigger a barge-in
      try { if (why !== "hidden" && sessionStorage.getItem("jarvis-powered") !== "1") setTimeout(() => earcon("open"), 40); } catch { /* no storage: no tone */ }
      openMic();
    } else {
      conductor.current?.close();
      captions.current?.stop();
      captions.current = null;
      if (next === "off") { stopSpeaking(); cancelTurn(); }
      setActivity("idle");
      setInterim("");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** The microphone opens: the ears and the live captions. */
  const openMic = () => {
      const c = conductorOf();
      void c.open().then(() => {
        hud.strip({ detector: c.detector });
        // the answer can start before the first click after a reload: the browser may need a gesture for audio
        if (c.needsGesture) hud.set({ needsResume: true });
      }).catch(() => undefined);
      if (canCaption() && !captions.current) {
        captions.current = new Captions(listenLangRef.current === "ta" ? "ta-IN" : "en-IN", (t) => { if (modeRef.current === "on" && conductor.current?.state === "hearing") { captionRibbon.current = true; hud.set({ ribbon: t }); setInterim(t); } });
        captions.current.start();
      }
  };
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  /** the Panel's mic, Alt+Space, the Stage's mic: they all mean "listen" */
  const startListening = useCallback(() => setMode("on"), [setMode]);

  // the answer is on screen as soon as it exists; the core and the strip follow the real state
  const busyNow = phase === "thinking" || phase === "acting";
  useEffect(() => {
    hud.set({ core: mode === "on" && (narrating || phase === "speaking") && turnState !== "holding" && turnState !== "interrupted" && turnState !== "hearing" ? "speaking" : coreOf(mode, turnState, busyNow, offline) });
  }, [mode, turnState, busyNow, narrating, phase, offline]);
  useEffect(() => {
    const f = () => setOffline(!navigator.onLine);
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
  }, []);
  // how fresh the data is, as the console says it (real, or nothing)
  useEffect(() => { hud.strip({ freshness: host.ov?.now ? String(host.ov.now).slice(0, 16).replace("T", " ") : null }); }, [host.ov?.now]);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (phase === "thinking" || phase === "acting") { wasBusy.current = true; return; }
    if (reply && reply !== ackText.current) hud.set({ answer: reply });
    // a turn just ended: the 20 s of being engaged run from here (turning the mode on is not a turn)
    if (wasBusy.current && mode === "on") { lastTurnAt.current = Date.now(); wasBusy.current = false; }
  }, [phase, reply, mode]);

  // the mode is remembered in this browser; after a reload the microphone opens again when it was on (permission permitting)
  useEffect(() => {
    if (store.get("jarvis-mode") !== "on") return;
    const P = navigator.permissions as Permissions | undefined;
    const go = () => setModeRef.current("on", "boot");
    P?.query({ name: "microphone" as PermissionName }).then((st) => { if (st.state === "granted") go(); else hud.set({ needsResume: true }); }).catch(() => hud.set({ needsResume: true }));
    return undefined;
  }, []);
  useEffect(() => {
    const click = (e: Event) => {
      if (!hud.get().needsResume) return;
      // the switch and the shortcut turn the mode on themselves: resuming first would make them toggle it off
      const k = e as KeyboardEvent;
      if (e.type === "keydown" && (k.ctrlKey || k.shiftKey || k.altKey || k.metaKey || /^(Control|Shift|Alt|Meta)$/.test(k.key))) return;
      if ((e.target as Element | null)?.closest?.(".jsw-main")) return;
      hud.set({ needsResume: false });
      if (modeRef.current === "on") void conductor.current?.resumeAudio();
      else if (store.get("jarvis-mode") === "on") setModeRef.current("on", "boot");
    };
    window.addEventListener("pointerdown", click, { capture: true });
    window.addEventListener("keydown", click, { capture: true });
    return () => { window.removeEventListener("pointerdown", click, { capture: true }); window.removeEventListener("keydown", click, { capture: true }); };
  }, []);
  // the tab goes out of sight: the microphone closes, and Jarvis says so on return
  useEffect(() => {
    const vis = () => {
      if (document.hidden && modeRef.current === "on") { setModeRef.current("muted", "hidden"); hiddenMuted.current = true; }
      else if (!document.hidden && hiddenMuted.current) {
        hiddenMuted.current = false;
        setModeRef.current("on", "hidden");
        if (!hud.get().firstUse) {
          hud.set({ notice: listenLangRef.current === "ta" ? "இந்தத் தாவல் மறைந்திருந்தபோது கேட்கவில்லை. இப்போது கேட்கிறேன்." : "I stopped listening while this tab was hidden. Listening again." });
          setTimeout(() => hud.set({ notice: null }), 5000);
        }
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);
  useEffect(() => () => { conductor.current?.close(); captions.current?.stop(); }, []);
  // the top bar's switch
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ mode?: JarvisMode; toggle?: boolean; mute?: boolean; keyboard?: boolean }>).detail ?? {};
      if (d.mode) setModeRef.current(d.mode);
      else if (d.toggle) setModeRef.current(modeRef.current === "off" ? "on" : "off");
      else if (d.mute) setModeRef.current(modeRef.current === "muted" ? "on" : modeRef.current === "on" ? "muted" : "off");
      else if (d.keyboard) { if (!onRef.current) switchOn(); setMini(false); setFocusKey((k) => k + 1); }
    };
    window.addEventListener("jarvis:mode", f);
    return () => window.removeEventListener("jarvis:mode", f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // dev only: what the end-to-end specs read
  useEffect(() => {
    if (!SPEC) return;
    (window as unknown as { __jv?: unknown }).__jv = { marks: [], micLive: () => !!conductor.current?.micLive, state: () => conductor.current?.state ?? "off", speaking, nowSaying, canContinue, path: () => voicePath(), gen: () => turnGen.current, hud: () => hud.get(), continueAnswer, setCore: (core: never) => hud.set({ core }), setHud: (p: never) => hud.set(p) };
  }, []);

  const switchOn = useCallback((quiet = false) => {
    setOn(true);
    setPhase("ready");
    lastHeardAt.current = Date.now();
    void loadMemory();
    if (!ref.cats.length) fetch("/api/collector/thunai/world").then((r) => (r.ok ? r.json() : null)).then((j) => j && setRef(j)).catch(() => undefined);
    if (!quiet) setFocusKey((k) => k + 1);
    warmVoices();
  }, [loadMemory, ref.cats.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The panel closes; the ears go back to waiting for the name (when the wake word is on). */
  const switchOff = useCallback(() => {
    stopSpeaking();
    abortMission.current = true;
    setNumbers(null); setAskOnce(null); setPendingB(null); setPanel(null); setChips([]); setInterim("");
    setOn(false); setPhase("off");
    setReply("");
  }, []);

  // Jarvis listens and answers in the site's language (the top bar's English / தமிழ்), changed there or by voice
  useEffect(() => { setListenLang(uiLang === "ta" ? "ta" : "en"); }, [uiLang]);

  useEffect(() => { listenLangRef.current = listenLang; captions.current?.setLang(listenLang === "ta" ? "ta-IN" : "en-IN"); }, [listenLang]);
  useEffect(() => {
    const v = store.get("jarvis-voice") as JarvisVoice | null;
    if (v && (JARVIS_VOICES as readonly string[]).includes(v)) { setJvVoice(v); setJarvisVoice(v); }
  }, []);

  // the panel slides in over the page at the right, as the chat always did (the dashboard keeps its size); Jarvis's
  // screens open beside it
  useEffect(() => {
    // in Jarvis mode there is no side panel: a screen has the whole width, under the core
    const w = !on || mode !== "off" ? 0 : window.innerWidth <= 700 ? 0 : window.innerWidth <= 1100 ? 380 : 480;
    document.documentElement.style.setProperty("--jv-w-open", `${w}px`);
    document.documentElement.classList.toggle("jv-hud", mode !== "off");
    window.dispatchEvent(new CustomEvent("jarvis:state", { detail: { open: on, width: 0, conv, resting: false, hud: mode !== "off", mic: micBlocked ? "blocked" : conv ? "on" : "off" } }));
  }, [on, conv, micBlocked, mode]);
  // the top bar's Jarvis button and Ctrl+K: open (to type), close
  useEffect(() => {
    const t = (e: Event) => {
      const d = (e as CustomEvent<{ focus?: boolean; talk?: boolean } | undefined>).detail ?? {};
      if (onRef.current && !d.focus && !d.talk) { switchOff(); return; }
      if (!onRef.current) switchOn(!d.focus);
      setMini(false);
      if (d.focus) setFocusKey((k) => k + 1);
      if (d.talk) startListening();
    };
    window.addEventListener("jarvis:toggle", t);
    return () => window.removeEventListener("jarvis:toggle", t);
  }, [switchOn, switchOff, startListening]);
  const hiddenMuted = useRef(false);
  const nextVoice = () => {
    const v = JARVIS_VOICES[(JARVIS_VOICES.indexOf(jvVoice) + 1) % JARVIS_VOICES.length];
    setJvVoice(v); setJarvisVoice(v); store.set("jarvis-voice", v);
    const l = listenLangRef.current;
    speak(l === "ta" ? "வணக்கம், நான் ஜார்விஸ். உங்களுக்கு எப்படி உதவலாம்?" : "Hello, I'm Jarvis. How can I help you today?", l === "ta" ? "ta-IN" : "en-IN", undefined, rate, voiceName);
  };

  // the chat (Ask Jarvis) hands a question over to be shown on screen: "Show on screen" on a chat answer
  useEffect(() => {
    const show = (e: Event) => {
      const q = String((e as CustomEvent<string>).detail ?? "").trim();
      if (!q) return;
      if (!onRef.current) switchOn(true);
      void handleRef.current(q, 0.95); // eslint-disable-line @typescript-eslint/no-use-before-define
    };
    window.addEventListener("jarvis:show", show);
    return () => window.removeEventListener("jarvis:show", show);
  }, [switchOn]);

  // preferences remembered for this Collector
  useEffect(() => {
    if (memory?.prefs?.mode) setOutMode(memory.prefs.mode);
    if (memory?.prefs?.rate) setRate(memory.prefs.rate);
  }, [memory?.prefs?.mode, memory?.prefs?.rate]);


  // keyboard: Alt+T on/off; hold Alt+Space to talk; Esc stops; Ctrl+Z undoes
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      // (with the mode on the panel is not there to open or close)
      if (e.altKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); if (modeRef.current !== "off") return; if (onRef.current) switchOff(); else switchOn(); return; }
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        startListening();
        return;
      }
      // Ctrl+Shift+J: Jarvis mode on and off. Ctrl+Shift+M: mute, one keystroke away
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") { e.preventDefault(); setMode(modeRef.current === "off" ? "on" : "off"); return; }
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "m") { e.preventDefault(); if (modeRef.current !== "off") setMode(modeRef.current === "muted" ? "on" : "muted"); return; }
      if (!onRef.current) return;
      // Esc interrupts whatever the voice path: the mouth and the turn know, the browser's speech object does not
      if (e.key === "Escape" && turnActive()) interrupt();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing()) { e.preventDefault(); void run([{ a: "undo", n: 1 }], listenLang, "Ctrl+Z", "rules"); }
    };
    const up = () => undefined;
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [switchOn, switchOff, startListening, phase, listenLang, narrating, stageBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  // the numbered badges follow the page while shown
  useEffect(() => {
    if (!numbers) return;
    const t = setInterval(() => setNumbers((n) => (n ? { ...n, items: clickables() } : n)), 1200);
    return () => clearInterval(t);
  }, [numbers?.names]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------- Watch --
  const seenBell = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const h = hostRef.current;
      const now = Date.now();
      let mem: WatchMemory = { spoken: [], last: {} };
      try { mem = JSON.parse(store.get("thunai-watch") ?? "") as WatchMemory; } catch { /* first run */ }
      const signals: Signal[] = [];
      const bell = (h.ov.bell ?? []) as { id: string; sev?: string; title?: string; type?: string; zone_name?: string | null }[];
      if (!seenBell.current) seenBell.current = new Set(bell.map((b) => String(b.id)));
      for (const b of bell) {
        const isNew = !seenBell.current.has(String(b.id));
        seenBell.current.add(String(b.id));
        if (!isNew || b.sev !== "Severe") continue;
        const where = b.zone_name ?? "Chennai";
        signals.push({ key: `bell:${b.id}`, kind: "severe", lifeSafety: false, impact: 1, urgency: 1, confidence: 0.9, novelty: 1, actionability: 0.8, level: 1,
          text: { en: `New severe incident: ${b.type ?? "incident"}, ${where}.`, ta: `புதிய கடுமையான நிகழ்வு: ${b.type ?? ""}, ${where}.` } }); // never the title: titles can be a citizen's own words
      }
      for (const r of memoryRef.current?.reminders ?? []) {
        if (r.done || Date.parse(r.at) > now) continue;
        signals.push({ key: `rem:${r.id}`, kind: "reminder", lifeSafety: false, impact: 0.8, urgency: 1, confidence: 1, novelty: 1, actionability: 1, level: 1,
          text: { en: line("reminderDue", "en", { text: r.text }), ta: line("reminderDue", "ta", { text: r.text }) } });
        void changeMemory({ op: "reminderDone", id: r.id });
      }
      const today = new Date().toDateString();
      const hr = new Date().getHours();
      if (hr >= 7 && hr < 10 && store.get("thunai-greeted") !== today) {
        store.set("thunai-greeted", today);
        const counts = (h.ov.severity?.counts ?? {}) as Record<string, number>;
        const g = { severe: counts.Severe ?? 0, alerts: bell.length };
        signals.push({ key: `greet:${today}`, kind: "greeting", lifeSafety: false, impact: 0.8, urgency: 0.9, confidence: 1, novelty: 1, actionability: 0.9, level: 1,
          text: { en: line("greet", "en", g), ta: line("greet", "ta", g) } });
      }
      for (const s of signals.sort((a, b) => band(b).localeCompare(band(a)))) {
        if (watchMaySpeak(s, mem, now, { quiet: outMode === "quiet", lastUserSpeech: lastUserSpeech.current }) && phase !== "listening" && phase !== "acting") {
          mem = watchRemember(s, mem, now);
          store.set("thunai-watch", JSON.stringify(mem));
          earcon("need");
          out(s.text[listenLang], listenLang);
          break;
        }
      }
    };
    const first = setTimeout(tick, 1500);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [on, outMode, listenLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTrail = async () => {
    try { const r = await fetch("/api/collector/thunai/audit"); if (r.ok) { setTrail(await r.json()); setPanel("trail"); } } catch { /* offline */ }
  };

  // --------------------------------------------------------------- render --
  if (!mounted) return null;
  const ta = listenLang === "ta";
  const ear: Ear = micBlocked && !conv ? "blocked" : phase === "thinking" || phase === "acting" ? "thinking" : phase === "speaking" || narrating ? "speaking"
    : conv ? (activity === "speech" ? "hearing" : activity === "reading" ? "reading" : "listening") : "off";
  const brainLine = brain && phase !== "thinking" ? (brain.by === "ai" && !brain.model ? `${ta ? "தரவிலிருந்து நேரடியாக" : "Answered straight from the data"}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}`
    : brain.by === "ai" ? `${ta ? "AI புரிந்தது" : "Understood by AI"}${brain.model ? ` · ${brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")}` : ""}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}`
    : brain.by === "instant" ? (ta ? "உடனடி கட்டளை · AI தேவையில்லை" : "Done at once · no AI needed") : (ta ? "AI கிடைக்கவில்லை: உள்ளமைந்த விதிகள்" : "AI unreachable: built-in rules answered")) : null;
  const steps = chips.length > 0 && (phase === "acting" || phase === "thinking") ? (
    <div className="th-chips jv-steps">
      {chips.map((c, i) => <span key={c.id} className={`th-chip ${c.state}`}>{c.state === "done" ? "✓ " : c.state === "failed" ? "✕ " : ""}{c.label}{i < chips.length - 1 ? <i>→</i> : null}</span>)}
    </div>
  ) : null;
  const waiting = askOnce || pendingB || tray.length > 0 || steps ? (
    <>
      {steps}
      {askOnce && (
        <div className="th-card" role="dialog" aria-label={askOnce.question}>
          <p>{askOnce.question}</p>
          <div className="row">
            {askOnce.choices.map((c, i) => (
              <button key={i} onClick={() => void pickChoice(askOnce, c)}>{i + 1}. {c.label}</button>
            ))}
          </div>
        </div>
      )}
      {pendingB && (
        <div className="th-card amber" role="dialog" aria-label={pendingB.text}>
          <p>{pendingB.text}</p>
          <div className="row">
            <button className="primary" onClick={() => { const p = pendingB; setPendingB(null); if (p.act) p.act(); else void run(p.steps, p.lang, p.heard, "rules"); }}>{ta ? "ஆம்" : "Yes"}</button>
            <button onClick={() => { setPendingB(null); setPhase("ready"); }}>{ta ? "வேண்டாம்" : "No"}</button>
          </div>
        </div>
      )}
      {tray.length > 0 && (
        <div className="th-tray" role="region" aria-label="Approval tray">
          <header><b>{ta ? "ஒப்புதலுக்காக" : "Waiting for approval"}</b><span>{tray.length}</span></header>
          <ol>{tray.map((d) => <li key={d.incidentId}><b>{d.title}</b><small>{d.to ?? (ta ? "பெறுநர் இல்லை" : "no recipient")}{d.sandbox ? (ta ? " · சோதனை வழி" : " · sandbox") : (ta ? " · பலகையிலிருந்து அனுப்பவும்" : " · send from the panel")}</small></li>)}</ol>
          <p className="hint">{ta ? `"உறுதி ${tray.length}" என்று சொல்லுங்கள்` : `Say "confirm ${tray.length}"`}</p>
          <div className="row">
            <button className="primary" onClick={() => void sendTray(tray.length, listenLang, "tap")}>{ta ? `${tray.length} அனுப்பு` : `Approve and send ${tray.length}`}</button>
            <button onClick={() => { setTray([]); setTrayShownAt(null); setPhase("ready"); }}>{ta ? "நீக்கு" : "Discard"}</button>
          </div>
        </div>
      )}
    </>
  ) : null;
  const menu = (
    <>
      <button onClick={() => setMode(mode === "off" ? "on" : "off")}>{ta ? "ஜார்விஸ் பயன்முறை" : "Jarvis mode"}<em>{micBlocked ? (ta ? "மைக் தடை" : "mic blocked") : mode === "off" ? (ta ? "அணைப்பு" : "off") : mode === "muted" ? (ta ? "மௌனம்" : "muted") : (ta ? "இயக்கம்" : "on")}</em></button>
      <button onClick={() => setOutMode(outMode === "voice" ? "visual" : outMode === "visual" ? "quiet" : "voice")}>{ta ? "பதில்கள்" : "Replies"}<em>{outMode === "voice" ? (ta ? "குரலில்" : "spoken") : outMode === "visual" ? (ta ? "எழுத்தில்" : "on screen only") : (ta ? "அமைதி" : "quiet")}</em></button>
      {(["ta", "en"] as const).map((lg) => {
        const v = voiceInfo(lg);
        return (
          <button key={lg} onClick={() => speak(lg === "ta" ? "வணக்கம், நான் ஜார்விஸ். உங்களுக்கு எப்படி உதவலாம்?" : "Hello, I'm Jarvis. How can I help you today?", lg === "ta" ? "ta-IN" : "en-IN", undefined, rate, voiceName)}
            title={v.how === "none" ? "This browser has no voice for it: open the console in Microsoft Edge" : "Tap to hear it"}>
            {lg === "ta" ? (ta ? "தமிழ்க் குரல் (தட்டிக் கேளுங்கள்)" : "Tamil voice (tap to hear)") : (ta ? "ஆங்கிலக் குரல் (தட்டிக் கேளுங்கள்)" : "English voice (tap to hear)")}
            <em>{v.how === "none" ? (ta ? "இல்லை · Edge-இல் திறக்கவும்" : "none · open in Edge") : v.how === "server" ? `${v.name} · AI` : `${v.name} · ${/edg\//i.test(navigator.userAgent) ? "Edge" : "browser"}`}</em>
          </button>
        );
      })}
      <button onClick={nextVoice}>{ta ? "AI குரல் (Edge குரல் இல்லாதபோது)" : "AI voice (when the browser has none)"}<em>{jvVoice}</em></button>
      <button onClick={() => { void loadMemory(); setPanel("memory"); }}>{ta ? "நினைவு" : "What Jarvis remembers"}<em>›</em></button>
      <button onClick={() => void openTrail()}>{ta ? "தணிக்கைப் பதிவு" : "Audit trail"}<em>›</em></button>
      <button onClick={() => setPanel("help")}>{ta ? "சொல்லக்கூடியவை" : "Things to say"}<em>›</em></button>
      <button onClick={() => setThread([])}>{ta ? "உரையாடலை அழி" : "Clear the conversation"}<em>›</em></button>
    </>
  );
  return createPortal(
    <div className={`thunai${on ? " on" : ""}${mode !== "off" ? " hud-on" : ""}`} data-thunai-ui data-phase={phase} data-no-i18n>
      {pointer.show && (
        <div className={`th-pointer${pointer.ripple ? " ripple" : ""}`} style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }} aria-hidden="true">
          <span className="ring" />{pointer.label && <b>{pointer.label}</b>}
        </div>
      )}
      {numbers && numbers.items.map((it) => (
        <span key={it.n} className="th-badge" style={{ left: Math.max(0, it.x - 6), top: Math.max(0, it.y - 8) }} aria-hidden="true">
          {it.n}{numbers.names && it.name ? ` ${it.name.slice(0, 18)}` : ""}
        </span>
      ))}

      {/* the page behind the panel dims a little, as behind the chat; a click there closes the panel */}
      {on && mode === "off" && !stage && !mini && <div className="jv-veil" onClick={switchOff} aria-hidden="true" />}
      {mode !== "off" && (
        <Hud lang={listenLang} coreRef={orbRef} stageOpen={!!stage} onSend={(t) => { via.current = "typed"; void handle(t, 0.95); }} onDismissFirstUse={() => { store.set("jarvis-mode-seen", "1"); hud.set({ firstUse: false }); if (modeRef.current === "on") { setTimeout(() => earcon("open"), 40); openMic(); } }}
          onStop={interrupt}>{waiting}</Hud>
      )}
      {on && mode === "off" && (
        <Panel lang={listenLang} ear={ear} mini={mini} onExpand={() => setMini(false)} conv={conv} idleLeft={null} level={0} thread={thread} geo={geo ?? host.c.geo}
          busyLine={phase === "thinking" ? reply || (ta ? "யோசிக்கிறேன்…" : "Thinking…") : null} brain={brainLine} focusKey={focusKey} orbRef={orbRef}
          onSend={(t) => { via.current = "typed"; void handle(t, 0.95); }}
          onMic={() => { if (phase === "speaking" || narrating) { stopNarration(); stopSpeaking(); setPhase("ready"); } else setMode(conv ? "off" : "on"); }}
          onEnd={() => setMode("off")} onClose={switchOff}
          onOpenScreen={(mm) => mm.screen && void directStage(mm.screen.recipe as StageDocT["recipe"], mm.screen.slots, mm.screen.title)}
          onCardAsk={(q) => { via.current = "typed"; void handle(q, 0.95); }} onCardAction={cardAction} menu={menu}>
          {waiting}
        </Panel>
      )}

      {on && panel && (
        <aside className="th-panel" aria-label={panel}>
          <header>
            <b>{panel === "memory" ? (ta ? "ஜார்விஸின் நினைவு" : "What Jarvis remembers") : panel === "trail" ? (ta ? "தணிக்கைப் பதிவு" : "Audit trail") : panel === "voice" ? (ta ? "குரல்" : "Jarvis's voice") : (ta ? "சொல்லக்கூடியவை" : "Things to say")}</b>
            <button aria-label="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          {panel === "memory" && (
            <div className="body">
              {!memory?.notes.length && !memory?.reminders.length && !Object.keys(memory?.habits ?? {}).length && <p className="muted">{ta ? "இன்னும் எதுவும் இல்லை." : "Nothing yet."}</p>}
              {!!memory?.notes.length && <><h4>{ta ? "குறிப்புகள்" : "Notes"}</h4><ul>{memory.notes.map((n) => <li key={n.id}>{n.text}<button onClick={() => void changeMemory({ op: "forget", id: n.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!memory?.reminders.filter((r) => !r.done).length && <><h4>{ta ? "நினைவூட்டல்கள்" : "Reminders"}</h4><ul>{memory.reminders.filter((r) => !r.done).map((r) => <li key={r.id}>{whenOf(r.at)}: {r.text}<button onClick={() => void changeMemory({ op: "forget", id: r.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!Object.keys(memory?.habits ?? {}).length && <><h4>{ta ? "கற்றவை" : "Learned"}</h4><ul>{Object.entries(memory!.habits).map(([k, v]) => <li key={k}>“{k}” → {v} <em>{ta ? "கற்றது" : "learned"}</em><button onClick={() => void changeMemory({ op: "forget", id: k })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              <button className="danger" onClick={() => void changeMemory({ op: "forget", all: true })}>{ta ? "எல்லாம் மற" : "Forget everything"}</button>
            </div>
          )}
          {panel === "trail" && trail && (
            <div className="body">
              <p className={trail.intact ? "ok" : "bad"}>{trail.intact ? (ta ? "சங்கிலி முழுமையாக உள்ளது." : "Chain intact: no line was changed.") : (ta ? "சங்கிலி உடைந்துள்ளது!" : "Chain broken: a line was changed.")}</p>
              <ol className="trail">{[...trail.lines].reverse().slice(0, 60).map((l, i) => <li key={i}><time>{whenOf(l.at)}</time><span className={`risk r${l.risk}`}>{l.risk}</span>{l.heard ?? "—"}<small>{l.outcome}</small></li>)}</ol>
            </div>
          )}
          {panel === "voice" && (
            <div className="body voice">
              <p className="muted">{ta ? "இந்தக் கணினியில் உள்ள குரல்கள், இயல்பானவை முதலில்." : "The voices this device has, the most natural first. Edge and Windows \"Natural\" voices sound best."}</p>
              {(["en-IN", "ta-IN"] as const).map((lg) => (
                <div key={lg}>
                  <h4>{lg === "en-IN" ? "English" : "தமிழ்"}</h4>
                  {!voicesFor(lg).length && <p className="muted">{ta ? "குரல் இல்லை: எழுத்தில் காட்டுகிறேன்." : "No voice for this language on this device: Jarvis shows the words instead."}</p>}
                  <ul>{voicesFor(lg).slice(0, 8).map((v) => (
                    <li key={v.name}>
                      <label><input type="radio" name={`voice-${lg}`} checked={(voiceName ?? voicesFor(lg)[0]?.name) === v.name} onChange={() => { setVoiceName(v.name); store.set("thunai-voice", v.name); }} />{v.name}{v.natural ? <em>{ta ? " இயல்பானது" : " natural"}</em> : null}</label>
                      <button onClick={() => speakText(lg === "ta-IN" ? "வணக்கம், நான் ஜார்விஸ்." : "Good morning. Six severe cases need you today.", lg, { voice: v.name, rate })}>{ta ? "கேள்" : "Try"}</button>
                    </li>))}</ul>
                </div>
              ))}
            </div>
          )}
          {panel === "help" && (
            <div className="body help">
              <p className="muted">{ta ? "ஜார்விஸ் பயன்முறையை இயக்கி சாதாரணமாகப் பேசுங்கள். உதாரணங்கள்:" : "Turn on Jarvis mode and just talk. For example:"}</p>
              {(ta ? ["அம்பத்தூர்ல இந்த வாரம் என்ன நடக்குது காட்டு", "Adyar la police complaints mattum kaatu", "அவசரமானவை மட்டும்", "செம்பரம்பாக்கம் ஏரியில் எவ்வளவு தண்ணீர் இருக்கு", "முதல் சம்பவத்தைத் திற", "நாளைக்கு கனமழை, தயார் பண்ணு", "பழையபடி மாத்து"]
                : ["Show me the severe cases", "Read today's news", "Compare Adyar and Ambattur this week", "Top 3 areas with the most rainfall", "Department-wise performance",
                  "Make me a flooding dashboard for this week", "Schools within 1 km of flooding in Adyar", "How has dengue moved this quarter?",
                  "What's happening in Ambattur this week? Only the serious stuff", "Same for Adyar", "Why is Perungudi looking so bad lately?",
                  "Open the top one and draft something for the department", "How full is Chembarambakkam?", "Explain this chart", "We expect heavy rain tonight, get everything ready",
                  "Remind me at 6 to call the SWD engineer", "Go back"]).map((x) => (
                <button key={x} onClick={() => void handle(x, 0.95)}>{x}</button>
              ))}
            </div>
          )}
        </aside>
      )}

      {on && stage && (
        <Stage doc={stage} lang={listenLang} theme={mode !== "off" ? "dark" : host.theme ?? "dark"} busy={stageBusy} reading={reading} narrating={narrating} views={stageViews} pins={pins} geo={geo ?? host.c.geo}
          tray={tray.map((d) => ({ incidentId: d.incidentId, title: d.title, to: d.to, sandbox: d.sandbox }))} brain={stageBrain} filtered={stageFilter} saveAsk={pendingB ? saveAsk : null}
          caption={{ heard: interim || heard, reply: phase === "listening" ? "" : reply, alt: phase === "listening" ? "" : alt, interim: !!interim,
            by: brain && phase !== "thinking" && phase !== "listening" ? (brain.by === "ai" ? `${ta ? "AI" : "Understood by AI"}${brain.model ? ` · ${brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")}` : ""}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}` : brain.by === "instant" ? (ta ? "உடனடி" : "Instant, no model") : (ta ? "விதிகள்" : "Built-in rules")) : null }}
          a={stageActions} />
      )}

    </div>,
    document.body
  );
}
