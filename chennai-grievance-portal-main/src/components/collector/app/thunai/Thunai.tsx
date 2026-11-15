"use client";
/**
 * Jarvis (ஜார்விஸ், formerly Thunai), the Collector console's voice pilot. Say "Hi Jarvis" or press its button (above the
 * chatbot's, or Ctrl+Shift+J) and there is nothing more to press: it listens, works out whether it was spoken to
 * (lib/thunai/addressed.ts), acts and answers, in English, Tamil or Tanglish; the console moves by itself. Talk over it and it
 * stops. Closed, only the browser's own speech service listens, and only for its name. The understanding is in lib/thunai (rules first, tested);
 * this file is the hands and the face: it presses the console's own controls (Console in CollectorApp), shows a ghost
 * pointer, step chips and subtitles, keeps an undo stack, an approval tray for anything that leaves the console, the
 * Collector's memory, a polite Watch, and two missions. Every number it speaks comes from the console's data through a
 * template (lib/thunai/say.ts); it never sends, approves or deletes: drafts wait in the tray for the Collector's own tap.
 */
import { keepsSomething, workspaceIds } from "./guards";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Overview } from "@/lib/collector/intel";
import { chartFacts, type ChartFacts } from "@/lib/thunai/explain";
import { ZONE_NAMES, ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { isNavCommand, isPlainMove, isReflex, type Checked } from "@/lib/thunai/plan";
import { confirmGate, planRisk, tapRisk } from "@/lib/thunai/risk";
import { say as line } from "@/lib/thunai/say";
import type { Lang, OutMode, PageKey, PeriodKey, ScreenState, Sev, Step, Understood, View, World } from "@/lib/thunai/types";
import { describe as describeStep, PAGE_EN, PAGE_TA, PERIOD_EN, PERIOD_TA, SUGGEST, understand } from "@/lib/thunai/understand";
import { afterPlan } from "@/lib/thunai/afterplan";
import { band, canSpeak as watchMaySpeak, remember as watchRemember, type Signal, type WatchMemory } from "@/lib/thunai/watch";
import type { MapGeo } from "@/lib/collector/geo";
import type { AgentResult, StageOp } from "@/lib/thunai/agent";
import { idsOf, stageContext, type NextStepT, type StageDocT } from "@/lib/thunai/stage";
import { allowedSet, figuresIn } from "@/lib/thunai/numbergate";
import { missionCommand, missionIntent } from "@/lib/thunai/missions.words";
import { missionControl, runMission, type MissionCard, type MissionControl, type ScreenOutcome } from "@/lib/thunai/missions.run";
import { provenanceOf } from "@/lib/thunai/register";
import { nextQuestion } from "@/lib/thunai/next";
import { explainSlots, explainTargetOf } from "@/lib/thunai/recipes/explain";
import type { WatchSignal } from "@/lib/thunai/signals";
import { asksWhatToday, briefCard, editIds, followAsk, heldBack, hudMissionOf, interjectNow, lowFx, missStep, NOT_CAUGHT, OFFER_KEYS, plainYes, signalLine, signalScreen, vocabOf, withLabels, zoneSafe, type BriefCard, type FollowAsk, type Live } from "./aide";
import { evidenceOf, isListenKey } from "./hudview";
import { followLayout, samePlaces } from "./layoutwatch";
import { speakableFigures } from "@/lib/thunai/speakable";
import { spokenPart as spoken } from "@/lib/thunai/chunker";
import { ackFor, ackTemplated, localStageCommand, narrationOf, stageDigest, stageReducer, toCsv, type LocalCmd, type StageEffect, type StageModel } from "@/lib/thunai/stagelocal";
import { cannotLine, NO_MODEL_LINE } from "@/lib/thunai/reach";
import type { Console } from "../CollectorApp";
import { byName, clickables, press, readChart, scroll, spotlight, targetFor, typeInto, type Clickable } from "./dom";
import Stage, { type BlockView, type PinnedScreen } from "./Stage";
import { download, exportPng, fileName } from "./export";
import { canContinue, continueAnswer, earconEnd, forgetBookmark, hasVoice, nowSaying, speakAck, speaking, speakLines, speakText, stopVoice, voicePath, warmVoice, warmVoices } from "./mouth";
import { Conductor, type HeardLine } from "./conductor";
import { Captions, canCaption } from "./captions";
import { budgetOf, COMMAND_MS, readRound, SayQueue, settleStream } from "./turnstream";
import { ackDelay, ackDue, asksFirst, consoleDigest, HearingCaptions, heardOf, keepTurns, LONG_TURN_MS, longTurn, memTurn, resultLine, rulesConf, screenResult, withDigest, type HeardInfo, type MemTurn, type Observation, type ProgressRow } from "./turnstate";
import { coreOf, hud, type JarvisMode } from "./hudstore";
import { levelAllowed, type Addressed } from "@/lib/thunai/addressed";
import { districtNounIn, intentMarker, quickScreen } from "@/lib/thunai/quick";
import type { TurnState } from "@/lib/thunai/turn";
import { jarvisLog, type JLog } from "./jarvislog";
import { canWake, startWake } from "./wake";
import Hud from "./Hud";
import type { AnswerCard as Card, ConsoleAction } from "@/lib/assistant/answer";
import { useLang } from "@/lib/i18n/lang";
import { otherLang } from "@/lib/i18n/line";
import "./thunai.css";
import type { StudioContext } from "../studio/Dataset";
import type { StudioReply } from "./StudioAnswer";
import { istDateTime } from "@/lib/ist-dates";
import { confirmLine } from "@/lib/thunai/say";
import { isDangerButton } from "@/lib/thunai/skeleton";

const speak = (text: string, lang: string, onEnd?: () => void, rate = 1, voice?: string | null, allowed?: Set<string>) => {
  // a Tamil line with no Tamil voice on this device is shown, not read out by an English voice
  if (lang === "ta-IN" && !hasVoice("ta-IN")) { setTimeout(() => onEnd?.(), 900); return true; }
  // the bar's caption (v4, Pillar 6): the piece the voice is saying, exactly as it says it, its word marked as the voice reaches it
  const l = lang.toLowerCase().startsWith("ta") ? "ta" : "en";
  return speakText(text, lang, { onEnd: () => { hud.caption(null); onEnd?.(); }, rate, voice, allowed, onPiece: (t) => hud.caption(t, l), onWord: (_, ch) => hud.captionWord(ch) });
};
/** dev only: a time mark the end-to-end specs read */
const SPEC = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_JARVIS_SPEC === "1";
const jvMark = (name: string) => { if (SPEC) (window as unknown as { __jv?: { marks: { name: string; t: number }[] } }).__jv?.marks.push({ name, t: performance.now() }); };
// What a screen's narration may say is speakableFigures (lib/thunai/speakable.ts): its data and what code wrote, never a figure
// in its spoken line or in a model's free-text slot (Finding 51: the old set took every number in `say`).
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
  recent: { text: string; at: string }[]; prefs: { lang?: Lang; mode?: OutMode; rate?: number };
  /** v4: the standing watches the Collector asked for (Level B), from the memory file */
  follows?: { id: string; kind: "incident" | "zone"; ref: string; at: string }[] }
interface Station { id: string; name: string; zone: number | null; times: string[]; series: number[]; capacity?: number; storage?: number[] }
interface EnvData { rain?: { stations: Station[] }; aqi?: { stations: Station[] }; lakes?: { stations: Station[]; asOn: string | null } }
/** a turn's stream (v4): the screen it put up, the sentences it said, the voice saying them */
interface Streamed { gen: number; lang: Lang; screen: StageDocT | null; said: string[]; queue: SayQueue | null }

const SEVS: Sev[] = ["Severe", "High", "Medium", "Low"];
const NO_FIGURES = new Set<string>();
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

/** the brief has been given on this page (sessionStorage keeps it for the tab; this, where storage is blocked) */
let briefedPage = false;

const pct = (st: Station) => {
  const s = st.storage?.[st.storage.length - 1];
  return st.capacity && s != null ? Math.round((s / st.capacity) * 100) : null;
};
const lastOf = (st: Station) => st.series?.[st.series.length - 1] ?? null;
const whenOf = (iso: string | null | undefined) => (iso ? istDateTime(iso) || "the latest reading" : "the latest reading");

export default function Thunai({ host }: { host: ThunaiHost }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const [mounted, setMounted] = useState(false);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("off");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
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
  /** the browser's live captions, only while a sentence to Jarvis is being heard (turnstate.ts HearingCaptions) */
  const captions = useRef<HearingCaptions | null>(null);
  /** whether the speech now being heard is engaged (the conductor's speech start says), for the end-of-speech earcon */
  const speechEngaged = useRef<boolean | null>(null);
  const [turnState, setTurnState] = useState<TurnState>("off");
  const [offline, setOffline] = useState(false);
  const conv = mode === "on";
  const [activity, setActivity] = useState<"speech" | "reading" | "idle">("idle");
  const [micBlocked, setMicBlocked] = useState(false);
  /** when Jarvis last finished a turn (the gate's 20 s of being engaged) */
  const lastTurnAt = useRef<number | null>(null);
  /** the question in flight: a new sentence, a barge-in or Esc aborts it; the generation stops any late answer speaking */
  const turnGen = useRef(0);
  /** this turn moves around the dashboard: no answer card covers it */
  const navTurn = useRef(false);
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
    hud.panel({ id: doc.id, title: doc.title.slice(0, 90), takeaway: doc.takeaway?.[lang] ?? null, figures: figures.filter((f) => Number.isFinite(f.value)).slice(0, 3), source: doc.sources[0] ?? null, recipe: doc.recipe, at: Date.now(), slots: doc.slots });
    hud.set({ focus });
  };
  /** when the last answer appeared, and when the last answer's voice (not an acknowledgement) began: the spoken ack waits on both */
  const answerAt = useRef(0);
  const findingAt = useRef(0);
  /** the answer exists: it is on screen now, whatever the voice is doing */
  const markAnswer = () => {
    answerAt.current = performance.now();
    jvMark("answer");
    if (utterEnd.current) { hud.strip({ lastMs: Math.round(performance.now() - utterEnd.current) }); utterEnd.current = null; }
  };
  /** how the sentence being handled came: said (the ears) or typed */
  const via = useRef<"voice" | "typed">("typed");
  /** the insight screen the next reply belongs to (its card in the thread) */
  const pendingScreen = useRef<JLog["screen"] | null>(null);
  const lastBot = useRef("");
  // the dataset open in the Data Studio (Dataset.tsx tells us): questions about it are answered from its own engine
  const [studio, setStudio] = useState<StudioContext | null>(null);
  const studioRef = useRef<StudioContext | null>(null);
  studioRef.current = studio;
  const studioPlan = useRef<{ id: string; plan: NonNullable<StudioReply["plan"]> } | null>(null);
  useEffect(() => {
    const f = () => setStudio((window as Window & { __diqStudio?: StudioContext | null }).__diqStudio ?? null);
    f();
    window.addEventListener("diq:studio", f);
    return () => window.removeEventListener("diq:studio", f);
  }, []);
  const ackText = useRef("");
  const listenLangRef = useRef<Lang>("en");
  /** what was asked and answered goes to the chatbot's Jarvis tab: nothing stacks over the dashboard */
  const pushMsg = (m: Omit<JLog, "id" | "at">) => jarvisLog.add(m);
  /** it takes the next sentence without its name for 20 s from now (the address gate's rule), and the bar says so */
  const engagedNow = () => { lastTurnAt.current = Date.now(); hud.set({ engagedUntil: Date.now() + 20_000 }); };
  const [chips, setChips] = useState<Chip[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [askOnce, setAskOnce] = useState<AskCard | null>(null);
  const askOnceRef = useRef(askOnce);
  askOnceRef.current = askOnce;
  /** who understood the last sentence: the model (and how fast), the built-in rules, or an instant control */
  const [brain, setBrain] = useState<{ by: "ai" | "rules" | "instant"; model: string | null; ms: number } | null>(null);
  /** the same, readable at once by the code that runs next in this turn (the decision record's lane) */
  const brainRef = useRef(brain);
  const setBrainNow = (b: NonNullable<typeof brain>) => { brainRef.current = b; setBrain(b); };
  const [pendingB, setPendingB] = useState<{ text: string; steps: Step[]; heard: string; lang: Lang; act?: () => void } | null>(null);
  const pendingBRef = useRef(pendingB);
  pendingBRef.current = pendingB;
  const [tray, setTray] = useState<Draft[]>([]);
  const [trayShownAt, setTrayShownAt] = useState<number | null>(null);
  const [panel, setPanel] = useState<"memory" | "trail" | "help" | null>(null);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [trail, setTrail] = useState<{ lines: { at: string; heard: string | null; outcome: string; risk: string }[]; intact: boolean } | null>(null);
  const [numbers, setNumbers] = useState<{ names: boolean; items: Clickable[] } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; label: string; show: boolean; ripple: boolean }>({ x: 0, y: 0, label: "", show: false, ripple: false });
  const [outMode, setOutMode] = useState<OutMode>("voice");
  const outModeRef = useRef(outMode);
  outModeRef.current = outMode;
  const [listenLang, setListenLang] = useState<Lang>("en");
  const [rate, setRate] = useState(1);
  const [typed, setTyped] = useState("");
  const [ref, setRef] = useState<Pick<World, "cats" | "taluks" | "places">>({ cats: [], taluks: [], places: [] });
  // ---- the Stage (v2)
  const [stage, setStage] = useState<StageDocT | null>(null);
  const [stageBack, setStageBack] = useState<StageDocT[]>([]);
  const [stageViews, setStageViews] = useState<Record<string, BlockView>>({});
  const [stageBusy, setStageBusy] = useState<string | null>(null);
  const stageBusyRef = useRef(stageBusy);
  stageBusyRef.current = stageBusy;
  const [stageBrain, setStageBrain] = useState<{ model: string | null; ms: number; rounds: number; calls: number } | null>(null);
  /** who built the screen on show, for its provenance (register.ts provenanceOf) sent with each round */
  const stageBrainRef = useRef(stageBrain);
  stageBrainRef.current = stageBrain;
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [reading, setReading] = useState<{ key: string; char: number | null; lead?: string } | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [pins, setPins] = useState<PinnedScreen[]>([]);
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [saveAsk, setSaveAsk] = useState<string | null>(null);
  /** one voice for each language, always the same one (mouth.ts locks it): no choosing per answer */
  const voiceName: string | null = null;
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
  /** the last four turns, so "same for Adyar" and "open that" make sense to the brain: what was heard and done, the screen's recipe
   * and slots, and a one-line result (turnstate.ts memTurn: no citizen's words, no figure a model wrote); all four go to the round */
  const turns = useRef<MemTurn[]>([]);
  const remember = (heardText: string, did: string, o: { doc?: StageDocT | null; result?: string | null } = {}) => { turns.current = keepTurns(turns.current, memTurn(heardText, did, o)); };
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
  // ---- v4 (the client's integration of the lanes)
  /** the mission in hand (missions.run.ts): its control, its latest card, and how it ends (said, or dropped quietly) */
  const missionRef = useRef<{ ctl: MissionControl; card: MissionCard | null; mute: boolean; drop: boolean; lang: Lang; told: boolean } | null>(null);
  const [missionRunning, setMissionRunning] = useState(false);
  /** a barge-in cancelled the turn while a mission runs: its words (skip that, instead X, stop) decide what happens to it */
  const missionBarged = useRef(false);
  /** one question offered after a screen (next.ts nextQuestion): a tap or a plain yes builds it */
  const [offer, setOffer] = useState<{ say: { en: string; ta: string }; step: NextStepT; lang: Lang } | null>(null);
  const offerRef = useRef(offer);
  offerRef.current = offer;
  /** the brief (GET /brief): its card, and whether it is being fetched or said (it always comes before any interjection) */
  const [briefShown, setBriefShown] = useState<BriefCard | null>(null);
  const briefState = useRef<{ fetching: boolean; saying: boolean }>({ fetching: false, saying: false });
  /** misunderstandings in a row (PERSONA.md rule 8), and whether the last turn was one */
  const misses = useRef(0);
  const lastMiss = useRef(false);
  /** what the watch's queue holds (the badge), and the signal on the interjection card */
  const queued = useRef<WatchSignal[]>([]);
  const interjected = useRef<WatchSignal | null>(null);
  /** "what do you remember about me?": the list the server reads out (store.ts rememberList) */
  const [memList, setMemList] = useState<{ kind: string; id: string; text: string }[]>([]);

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
  /** the district's zone numbers: "Zone 13" names a zone, it is not a figure (numbergate.ts zoneLabelsOut) */
  const zoneNos = () => worldRef.current.zones.map((z) => z.n);

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
      // a real zone's label ("Zone 13") is its name, not a figure, before the voice's gate (L1: numbergate.ts zoneLabelsOut)
      const z = allowed ? zoneSafe([spoken(text)], allowed, zoneNos()) : null;
      const ok = speak(z?.lines[0] || spoken(text), lang === "ta" ? "ta-IN" : "en-IN", () => {
        setPhase(onRef.current ? ph : "off");
      }, rate, voiceName, z?.lines[0] ? z.allowed : allowed);
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
  /**
   * The decision record (v4, Pillar 4) for what the browser answered on its own (the rules, an instant control, a v4 flow) and for the
   * Collector's tray approvals; the round route records the planner's answers. No citizen text: the question is the Collector's own,
   * cleaned again on the server (decisions.ts cleanQuery), and the approver is the signed-in Collector, set by the server.
   */
  const decide = (d: { kind: "answer" | "approval"; query: string; lang: Lang | null; lane?: "rules" | "instant" | null; ms?: number | null; how?: "tap" | "spoken" | null; count?: number | null }) => {
    const snap = String(hostRef.current.ov?.now ?? "").slice(0, 40) || null;
    post("/api/collector/thunai/audit", { decision: { kind: d.kind, query: d.query.slice(0, 400), lang: d.lang, snapshot: snap, tools: [], model: d.kind === "answer" ? "rules" : null,
      lane: d.lane ?? null, ms: d.ms != null && Number.isFinite(d.ms) ? Math.max(0, Math.min(600_000, Math.round(d.ms))) : null, how: d.how ?? null, count: d.count ?? null } }).catch(() => undefined);
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

  // --------------------------------------------------------------- memory --
  const loadMemory = useCallback(async () => {
    try { const r = await fetch("/api/collector/thunai/memory"); if (r.ok) setMemory(await r.json()); } catch { /* offline */ }
  }, []);
  /** true when the server saved the change (a failure is never reported as "remembered") */
  const changeMemory = async (op: Record<string, unknown>): Promise<boolean> => {
    try { setMemory(await post("/api/collector/thunai/memory", op)); return true; } catch { return false; }
  };
  /**
   * A Level-B change to the memory (v4: remember, forgetLast, reset), sent with the yes the Collector already gave (yes: true). The line
   * to say: `ok` when it was kept; the server's own reason when it refused (422: a note that would hold a citizen's details; 403), never a
   * figure; else that nothing changed.
   */
  const memoryOp = async (op: Record<string, unknown>, lang: Lang, ok: string): Promise<string> => {
    try {
      const r = await fetch("/api/collector/thunai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
      const j = await r.json().catch(() => ({})) as { reply?: { en?: string; ta?: string } } & MemoryView;
      if (r.ok) { setMemory(j); return ok; }
      const why = j?.reply?.[lang];
      return typeof why === "string" && why.trim() && !figuresIn(why).length ? why : line("memoryFail", lang);
    } catch { return line("memoryFail", lang); }
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
      await sleep(16);
      setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, label, show: true, ripple: false });
      await sleep(230);
      setPointer((p) => ({ ...p, ripple: true }));
      await sleep(80);
    }
    setTimeout(() => setPointer((p) => ({ ...p, show: false, ripple: false })), 600);
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
    let sent = 0, opened = 0;
    const kept: typeof tray = [];
    for (const d of tray) {
      if (!d.sandbox) {
        // a live draft is sent from the incident panel, which holds one incident at a time: the first is opened and the rest wait in the tray,
        // never dropped (audit-client_browser-7: Approve on two drafts emptied the tray and sent nothing)
        if (opened === 0) { hostRef.current.c.openAction(d.incidentId); opened++; } else kept.push(d);
        continue;
      }
      // a draft whose send fails (or whose "Confirm it's you" was cancelled) stays in the tray, and is said to have stayed (BUG-012)
      try { await post(`/api/collector/incidents/${encodeURIComponent(d.incidentId)}/action`, { subject: d.subject, body: d.body }); sent++; } catch { kept.push(d); }
    }
    audit(null, [{ a: "confirm", n }], `sent ${sent} of ${tray.length} (sandbox only); ${kept.length} kept; ${opened} opened in the incident panel`, { how, count: n ?? undefined });
    // the decision record: the Collector's own approval (the server sets who approved, from the session)
    decide({ kind: "approval", query: `approve the tray (${tray.length})`, lang, how, count: tray.length });
    setTray(kept); setTrayShownAt(kept.length ? Date.now() : null);
    earcon(kept.length ? "blocked" : "done");
    out(kept.length ? (opened ? line("openedOne", lang, { n: kept.length }) : line("sendKept", lang, { n: kept.length, sent })) : sent === tray.length ? line("sent", lang, { n: sent }) : line("approvedOnly", lang), lang, kept.length ? "waiting" : "ready");
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
        // a number past the end of the list is said plainly, never clamped to the last one (RC-42)
        if (idx >= st.list.length) return lang === "ta" ? `பட்டியலில் ${st.list.length} மட்டுமே உள்ளன.` : `There ${st.list.length === 1 ? "is only 1 item" : `are only ${st.list.length} items`} in the list.`;
        idx = Math.max(0, idx);
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
          // GET /api/collector/workspaces gives name groups with their versions, newest first (lib/collector/workspaces.ts) (BUG-013)
          const list = workspaceIds(j.workspaces ?? j.items ?? j);
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
      case "stop": stopSpeaking(); abortMission.current = true; stopMission({ say: true, drop: false }); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "off": setModeRef.current("off"); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
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
      // "explain this" with a screen of Jarvis's open: the case or the change on it, told by the explain recipe; else the console's chart
      case "explain": return (await explainOnStage(null, lang)) ? null : explain(lang); // eslint-disable-line @typescript-eslint/no-use-before-define
      case "numbers": if (step.show) setNumbers({ names: step.names, items: clickables() }); else setNumbers(null); return null;
      case "click": {
        const list = numbersRef.current?.items ?? clickables();
        const t = step.n != null ? list.find((x) => x.n === step.n) ?? null : byName(list, step.name ?? "");
        setNumbers(null);
        if (!t) return line("notUnderstood", lang, { heard: heardText, examples: "show numbers, click 3" });
        // Jarvis never presses send, approve or delete, by number or by name
        // (a button's name can hide what it does, and no pattern can catch a bare "Yes": those carry data-jarvis-never)
        if (t.el.closest("[data-jarvis-never]") || isDangerButton(`${t.name ?? ""} ${t.el.textContent ?? ""}`)) return lang === "ta" ? "அனுப்புவதும் ஒப்புதலும் நீக்குவதும் உங்கள் கையால் மட்டுமே." : "Sending, approving and deleting are yours to tap. I won't press those.";
        // saving, pinning or a bare "Yes" keeps something (level B): a spoken click never presses it, the Collector's tap does (BUG-014)
        if (keepsSomething(t.name, t.el.textContent)) return lang === "ta" ? "சேமிப்பதும் பின் செய்வதும் உங்கள் தட்டலில் மட்டுமே. \"இதைச் சேமி\" என்று சொன்னால் கேட்டுவிட்டுச் செய்கிறேன்." : "Saving and pinning need your tap. Say \"save this\" and I'll ask first.";
        press(t.el);
        return null;
      }
      case "scroll": scroll(step.dir); return null;
      case "type": typeInto(step.text); return null;
      case "clearText": typeInto("", true); return null;
      // Level B (v4, Pillar 4): these steps run only after the Collector's yes (gateB), so the server is told yes; only the Collector's own
      // sentence is kept, and the server refuses a note holding a citizen's details (said back in its own words)
      case "remember": return memoryOp({ op: "remember", text: step.text, said: heardText.slice(0, 600), yes: true }, lang, line("remembered", lang));
      case "recall": return (await recallMemory(lang)).text; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "forget": return memoryOp(step.all ? { op: "reset", yes: true } : { op: "forgetLast", yes: true }, lang, line(step.all ? "forgottenAll" : "forgotten", lang));
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
      // the old two missions: the brief is the Collector's brief ("brief me"), rain readiness is the monsoon mission's plan card
      case "mission": if (step.name === "brief") await briefMe(lang, true); else await startMission(lang === "ta" ? "மழைக்குத் தயார் செய்" : "monsoon readiness", lang); return null; // eslint-disable-line @typescript-eslint/no-use-before-define
      case "read": return read(step, lang);
      case "help": setPanel("help"); return line("help", lang);
      default: return null;
    }
  };

  // --------------------------------------------------------------- a plan --
  const ACTS_ON_PAGE = new Set(["page", "period", "view", "mapMode", "layer", "panel", "item", "draft", "zoom", "map", "workspace", "theme", "read"]);
  /** the steps that move around the dashboard: while they run, nothing of Jarvis's covers it (a reading is an answer, not a move) */
  const NAVIGATES = new Set(["page", "period", "view", "clearFilters", "mapMode", "layer", "panel", "item", "zoom", "map", "workspace", "theme", "close"]);
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
    // a command on the dashboard (a page, a filter, a panel, the map): the insight screen and the answer's card close BEFORE
    // anything moves, so the Collector sees where Jarvis goes and what it presses; no card comes back for it afterwards
    if (!quiet && steps.some((s) => NAVIGATES.has(s.a))) {
      navTurn.current = true;
      if (stageRef.current) closeStage(); // eslint-disable-line @typescript-eslint/no-use-before-define
      hud.set({ answer: "", panels: [], asked: "", focus: null });
    }
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
        if (!quiet) await glide(steps[i]);
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
    // the decision record of an answer the browser gave on its own (the planner's are recorded by the round route); not for Ctrl+Z
    if (by === "rules" && heardText !== "Ctrl+Z") decide({ kind: "answer", query: heardText, lang, lane: brainRef.current?.by === "instant" ? "instant" : "rules", ms });
    // what is said now (lib/thunai/afterplan.ts): the steps' own lines; nothing over a step that answered for itself (Ask District IQ's card: P6-024,
    // "Asked District IQ" once replaced the answer); a description only for moves that said nothing
    const after = afterPlan(steps, said, note, (s) => describeStep(s, worldRef.current, lang));
    // the turn's result is the line code said for it (a model's note is kept only with no figure in it: noFigure)
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat")) remember(heardText, steps.map((s) => describeStep(s, worldRef.current, "en")).join("; "), { result: after.kind === "answered" ? null : resultLine(after.text, "code") });
    changeMemory({ op: "recent", text: heardText });
    if (!alive()) return;
    if (steps.some((s) => s.a === "off")) return;
    // a command on the dashboard (a page, a filter, a panel, the map): the insight screen closes and Jarvis becomes a
    // small card, so what it did is in plain view; the conversation goes on
    if (!quiet && steps.some((s) => ACTS_ON_PAGE.has(s.a))) {
      if (stageRef.current) closeStage(); // eslint-disable-line @typescript-eslint/no-use-before-define
    }
    // the Stage speaks for itself: the steps only made the console agree with it
    if (quiet) { setPhase(tray.length ? "waiting" : "ready"); return; }
    if (after.kind === "say") out(after.text, lang, tray.length ? "waiting" : "ready");
    else if (after.kind === "describe") { earcon("done"); setReply(after.text); showAlt(after.text, lang); setPhase(tray.length ? "waiting" : "ready"); }
    // the analyst has said its answer (or that it could not): its line and phase stand
    else setPhase(tray.length ? "waiting" : "ready");
  };

  /**
   * A misunderstanding (a clarifying question, nothing usable, a sentence not heard): the second in a row offers the screen and the
   * keyboard in one line (PERSONA.md rule 8) and opens the typing box. True when that offer is due: the caller says it instead.
   */
  const missed = (): boolean => {
    const r = missStep(misses.current, "miss");
    misses.current = r.n;
    lastMiss.current = true;
    if (r.offer) hud.set({ typing: true });
    return r.offer;
  };
  /** the offer itself; with no ask card up, "the options on the screen" are the things to say (the help panel) */
  const offerKeys = (lang: Lang, ph: Phase = "ready") => {
    if (!askOnceRef.current) setPanel("help");
    out(OFFER_KEYS[lang], lang, ph, NO_FIGURES);
  };
  const ask = (card: AskCard, allowed?: Set<string>, misunderstood = false) => {
    setAskOnce(card);
    askOnceRef.current = card;
    setPhase("asking");
    earcon("need");
    if (misunderstood && missed()) { out(OFFER_KEYS[card.lang], card.lang, "asking", NO_FIGURES); return; }
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
    const q = confirmLine(s as Parameters<typeof confirmLine>[0], lang) ?? ""; // one builder with the test copy of this code (say.ts), the reminder's time in Chennai time
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
    const f = (e: Event) => { const p = (e as CustomEvent<PinnedScreen>).detail; openQuiet(); void directStage(p.recipe as StageDocT["recipe"], p.slots, p.title); }; // eslint-disable-line @typescript-eslint/no-use-before-define
    window.addEventListener("jarvis:open-pin", f);
    return () => window.removeEventListener("jarvis:open-pin", f);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the streamed turn (v4): the round's events are rendered and spoken as they arrive (turnstream.ts)
  /** what the stream has already shown and said for the turn in flight: the round's whole answer must not show or say it twice */
  const streamed = useRef<Streamed | null>(null);
  const streamOf = (gen: number) => (streamed.current && streamed.current.gen === gen ? streamed.current : null);
  /** A step of the work timeline, with the time the server measured (the HUD's own clock would add the network's). */
  const timeline = (id: string, label: string, state: "running" | "done" | "failed", ms: number | null) => {
    if (state === "running" || !hud.get().steps.some((x) => x.id === id)) { hud.step({ id, label, state, ...(ms != null ? { ms } : {}) }); return; }
    hud.set({ steps: hud.get().steps.map((x) => (x.id === id ? { ...x, label, state, ms: ms ?? x.ms } : x)) });
  };
  /** The screen arrived: it goes up at once, by the same path as showStage; its words come as they stream, its card with them. */
  const streamScreen = (gen: number, doc: StageDocT) => {
    const sx = streamOf(gen);
    if (!sx || gen !== turnGen.current) return;
    setStageBusy(null);
    sx.screen = putStage(doc, sx.lang, null); // eslint-disable-line @typescript-eslint/no-use-before-define
    pendingScreen.current = { title: doc.title, recipe: doc.recipe, slots: doc.slots };
  };
  /**
   * A sentence arrived: with the screen up, the first is spoken at once and the rest queue (each chunk through the number gate,
   * with the screen's speakable figures). Words with no screen wait for the round's whole answer, which says them as before.
   */
  const streamSay = (gen: number, text: string, lang: Lang) => {
    const sx = streamOf(gen);
    if (!sx || gen !== turnGen.current || !sx.screen) return;
    sx.said.push(text);
    // the words show as they come; the turn's card in the conversation is written once, when the whole answer is in
    setReply(sx.said.join(" "));
    if (outMode !== "voice") return;
    if (!sx.queue) {
      const allowed = speakableFigures(sx.screen, lang), voiceLang = lang === "ta" ? "ta-IN" : "en-IN";
      sx.queue = new SayQueue((t, end) => {
        // a real zone's label is its name, not a figure (zoneSafe, before the voice's own gate)
        const z = zoneSafe([spoken(t)], allowed, zoneNos());
        return speak(z.lines[0] || spoken(t), voiceLang, end, rate, voiceName, z.lines[0] ? z.allowed : allowed);
      }, () => gen === turnGen.current);
    }
    sx.queue.push(text);
  };

  /** Ask the agent: a sentence (with the screen, the turns and the open Stage), or a Stage control's direct screen. */
  const callAgent = async (said: string, st: ScreenState, direct?: { recipe: StageDocT["recipe"]; slots: Record<string, unknown>; lang: Lang }, signal?: AbortSignal, heard: HeardInfo | null = null): Promise<AgentResult | null> => {
    const turnId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const url = `${hostRef.current.agentUrl ?? "/api/collector/thunai/agent"}/round`;
    const t0 = performance.now();
    const stepId = `think-${turnId}`;
    // the turn this call answers: a newer sentence, a barge-in or Esc moves the generation on, and nothing of this one shows or speaks after
    const gen = turnGen.current;
    const live = () => gen === turnGen.current && !signal?.aborted;
    if (!direct) {
      streamed.current = { gen, lang: heard?.lang ?? listenLangRef.current, screen: null, said: [], queue: null };
      hud.clearSteps(); hud.step({ id: stepId, label: listenLangRef.current === "ta" ? "புரிந்துகொள்கிறேன்" : "Understanding" });
    }
    const finishStep = (state: "done" | "failed") => { if (!direct) hud.step({ id: stepId, label: listenLangRef.current === "ta" ? "புரிந்துகொள்கிறேன்" : "Understanding", state }); };
    // what is on screen now, for the model: the Stage's digest, or the console's when no screen of Jarvis's is open
    const digestNow = () => (stageRef.current ? stageDigest(stageModel(), stageFocus.current) : consoleDigest(buildState())); // eslint-disable-line @typescript-eslint/no-use-before-define
    let observations: Observation[] = [];
    // 8 s for a command; the server may give an analysis question or a mission up to 25 s (its heard event says so)
    let budget = COMMAND_MS;
    try {
      // the browser drives the rounds: it applies what comes back, makes the digest, and asks again (at most 3, within the budget)
      for (let round = 0; round < 3; round++) {
        if (performance.now() - t0 > budget) break;
        const doc = stageRef.current;
        // after a round's console steps the console has moved: the next round sees it as it is now
        const s = round === 0 ? st : buildState();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({
          turnId, round, text: said.slice(0, 300), turns: turns.current.slice(-4), lastText: lastRequest.current && lastRequest.current.text !== said ? lastRequest.current.text.slice(0, 300) : null,
          state: { page: s.page, period: s.period, zone: s.zone, dept: s.dept, cat: s.cat, taluk: s.taluk, sev: s.sev, mapMode: s.mapMode,
            panel: s.panel, incident: s.incident, listLength: s.list.length, lastPlace: s.lastPlace, numbers: !!s.numbers },
          // the open Stage with a short label per id (register.ts labelsOf: place, kind, zone; never a title), so "that Velachery one" resolves
          stage: doc ? withLabels(stageContext(doc, stageFocus.current), doc) : null,
          stageDigest: doc ? stageDigest(stageModel(), stageFocus.current) : null, // eslint-disable-line @typescript-eslint/no-use-before-define
          // where the answer on screen came from, every value code's (D2: "how do you know?" reads it)
          provenance: doc ? provenanceOf(doc, { by: stageBrainRef.current?.model ? "ai" : "rules", model: stageBrainRef.current?.model ?? null }) : null,
          observations, direct: direct ?? null,
          // v4: the round as events (an older server ignores this and answers in JSON), and how the sentence was heard
          stream: !direct, heard
        }) });
        // console steps the plan runs before it looks again, in order, as they arrive; how they went goes back with the next round
        const ran: Observation[] = [];
        let stepRun: Promise<void> = Promise.resolve();
        const runSteps = (list: Step[]) => {
          stepRun = stepRun.then(async () => {
            for (const x of list) {
              if (!live()) return;
              try { await runStep(x, listenLangRef.current, said); await hostRef.current.settled?.(); ran.push({ step: x.a, ok: true }); }
              catch (e) { ran.push({ step: x.a, ok: false, error: String((e as Error).message).slice(0, 150) }); }
            }
          });
        };
        const r = await readRound(res, { turnId, live, hooks: direct ? {} : {
          // the work timeline: only what really ran, with the time it took
          step: (x) => timeline(`${turnId}-${x.id}`, x.label, x.state, x.ms),
          steps: runSteps,
          heard: (h) => { budget = budgetOf(h.budgetMs); const sx = streamOf(gen); if (sx) sx.lang = h.lang; },
          screen: (d) => streamScreen(gen, d),
          sentence: (t, l) => streamSay(gen, t, l)
        } });
        const j = r.out;
        if (!direct && !r.timeline) for (const [i, x] of (j.trace ?? []).entries()) hud.step({ id: `${turnId}-${round}-${i}`, label: x.label, state: x.ok ? "done" : "failed", ms: x.ms });
        hud.strip({ tokens: j.tokens ?? null });
        // steps that came as an event already ran (or are running): never twice
        if (!r.stepsSent) runSteps(j.steps ?? []);
        await stepRun;
        if (!live()) return null;
        // the model sees what its steps did: each step's outcome, the last with the digest of the screen now showing
        observations = withDigest(ran, ran.length ? digestNow() : null);
        if (j.done) { finishStep("done"); if (j.result?.model) hud.strip({ provider: j.result.model.replace(/#\d+$/, "") }); return j.result ?? null; }
      }
      finishStep("failed");
      return null;
    } catch { finishStep("failed"); return null; }
  };

  const stopNarration = () => { stopVoice(); hud.caption(null); setNarrating(false); setReading(null); };

  /**
   * Read the summary, then (for news and the brief) every item, the one being read highlighted; then listen again. `then`: one more
   * line said after them, numberless (the offered next question).
   */
  const narrate = (doc: StageDocT, say: string | null, lang: Lang, items: boolean, then: string | null = null) => {
    const list = items ? narrationOf(doc, lang) : [];
    narration.current = list;
    narrIndex.current = 0;
    const lines = [...(say ? [spoken(say)] : []), ...list.map((x) => x.text), ...(then && !figuresIn(then).length ? [then] : [])];
    const offset = say ? 1 : 0;
    if (say) { setReply(say); showAlt(say, lang); lastSpoken.current = { text: say, lang }; }
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    if (outMode !== "voice" || !lines.length || (lang === "ta" && voiceLang !== "ta-IN")) { setPhase(tray.length ? "waiting" : "ready"); return; }
    setNarrating(true);
    setPhase("speaking");
    // a real zone's label is its name, not a figure (zoneSafe keeps the lines' numbering for the highlight)
    const z = zoneSafe(lines, speakableFigures(doc, lang), zoneNos());
    speakLines(z.lines, voiceLang, {
      rate, voice: voiceName, allowed: z.allowed,
      onLine: (i) => { const it = list[i - offset]; if (it) narrIndex.current = i - offset; setReading(it ? { key: it.key, char: null, lead: it.lead } : null); },
      onWord: (i, ch) => { const it = list[i - offset]; if (it) setReading({ key: it.key, char: ch, lead: it.lead }); hud.captionWord(ch); },
      onPiece: (t) => hud.caption(t, lang),
      onEnd: () => {
        hud.caption(null);
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
    const z = zoneSafe(list.slice(k).map((x) => x.text), speakableFigures(doc, lang), zoneNos());
    speakLines(z.lines, voiceLang, {
      rate, voice: voiceName, allowed: z.allowed,
      onLine: (j) => { narrIndex.current = k + j; setReading({ key: list[k + j].key, char: null, lead: list[k + j].lead }); },
      onWord: (j, ch) => { setReading({ key: list[k + j].key, char: ch, lead: list[k + j].lead }); hud.captionWord(ch); },
      onPiece: (t) => hud.caption(t, lang),
      onEnd: () => { hud.caption(null); setNarrating(false); setReading(null); setPhase("ready"); }
    });
  };

  const ensureGeo = () => {
    if (geo) return;
    const h = hostRef.current;
    (h.loadGeo ? h.loadGeo() : fetch("/api/collector/geo").then((r) => (r.ok ? r.json() : null))).then((g) => g && setGeo(g as MapGeo)).catch(() => undefined);
  };

  type BrainInfo = { model: string | null; ms: number; rounds: number; calls: number } | null;
  /** Put a screen up: the HUD's panel, the Stage, the back stack. Its words are said by showStage (or, streamed, as they come). */
  const putStage = (doc: StageDocT, lang: Lang, brainInfo: BrainInfo, opts: { push?: boolean; drafts?: boolean } = {}): StageDocT => {
    stopNarration();
    markAnswer(); // eslint-disable-line @typescript-eslint/no-use-before-define
    toHud(doc, lang);
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
    return withDrafts;
  };

  /**
   * A screen and its words. `stream`: the turn's stream, when it already put a screen up and said some of the words: the round's
   * whole answer then shows and says only what is left (turnstream.ts settleStream), never the same screen or sentence twice.
   */
  const showStage = (doc: StageDocT, say: string | null, lang: Lang, brainInfo: BrainInfo, opts: { push?: boolean; drafts?: boolean; heard?: string; stream?: Streamed | null } = {}) => {
    const sx = opts.stream?.screen ? opts.stream : null;
    const plan = settleStream({ screenId: sx?.screen?.id ?? null, said: sx?.said ?? [] }, { stage: doc, say });
    // the conversation keeps a card of this screen (a click opens it again)
    const scr = { title: doc.title, recipe: doc.recipe, slots: doc.slots };
    // the screen carries its words in both languages, every figure from the data: no translation needed
    if (say) givenAlt.current = { text: say, alt: doc.say[lang === "ta" ? "en" : "ta"] ?? "" };
    // the turn's memory: its recipe and slots, and a line of what it showed (never an incident's own words, only code's figures)
    remember(opts.heard ?? doc.title, `showed a ${doc.recipe} screen`, { doc, result: screenResult(doc, speakableFigures(doc, lang)) });
    // after the answer, one next step offered (D2, next.ts): shown as a tap-able card, and said only after a short answer that reads no
    // list of items; a tap or a plain yes builds it directly (no model). Numberless by construction (nextQuestion skips any figure)
    const nq = nextQuestion(doc);
    setOffer(nq ? { say: nq.say, step: nq.step, lang } : null);
    const offerLine = (auto: boolean) => (nq && !auto && outMode === "voice" && (say ?? "").length <= 220 ? nq.say[lang] : null);
    if (sx && plan.show === "none") {
      const shown = sx.screen as StageDocT;
      setStageBrain(brainInfo);
      // the streamed words already show (its card is written now, once); with no words at all, the card is the screen's title
      if (say || sx.said.length) pendingScreen.current = scr; else { pendingScreen.current = null; pushMsg({ who: "jarvis", text: doc.title, lang, screen: scr }); }
      const auto = shown.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief");
      if (plan.speak === "all") { narrate(shown, say, lang, auto, offerLine(auto)); return; }
      if (say) { setReply(say); showAlt(say, lang); lastSpoken.current = { text: say, lang }; }
      if (plan.speak === "rest" && outMode === "voice") sx.queue?.push(plan.rest);
      const then = offerLine(auto);
      if (then && sx.queue) sx.queue.push(then);
      const items = () => { if (auto) narrate(shown, null, lang, true); else setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); };
      // a news reading or a brief goes on to its items once the streamed words are said
      if (sx.queue?.speaking) { setPhase("speaking"); sx.queue.then(items); } else items();
      return;
    }
    // a different screen than the one that streamed takes its place (its words cut, it is not kept on the back stack)
    const shown = putStage(doc, lang, brainInfo, plan.show === "replace" ? { ...opts, push: false } : opts);
    if (say) pendingScreen.current = scr; else pushMsg({ who: "jarvis", text: doc.title, lang, screen: scr });
    const auto = shown.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief");
    narrate(shown, say, lang, auto, offerLine(auto));
  };
  /** The offered next step, taken (a tap, or a plain yes): its screen built directly from the data. */
  const takeOffer = () => {
    const o = offerRef.current;
    setOffer(null);
    if (!o?.step.recipe) return;
    setBrainNow({ by: "instant", model: null, ms: 0 });
    void directStage(o.step.recipe, o.step.slots ?? {}, o.step.label[o.lang] || o.say[o.lang], o.lang); // eslint-disable-line @typescript-eslint/no-use-before-define
  };

  const closeStage = () => { stopNarration(); setOffer(null); setStage(null); stageRef.current = null; setStageBack([]); setStageBusy(null); setSaveAsk(null); setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); };

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
  /**
   * "Explain" on an open Stage (A2, recipes/explain.ts): the case a CaseDetail shows, the nth mover of a "what changed" screen, or the nth
   * case of the list, told by the explain recipe through the round's direct path (code, no model), in the screen's own scope. False when
   * the screen holds nothing to explain (the caller then repeats it, as before).
   */
  const explainOnStage = async (n: number | null, lang: Lang, id: string | null = null): Promise<boolean> => {
    const doc = stageRef.current;
    if (!doc) return false;
    const named = id && doc.blocks.some((b) => (b.kind === "CaseList" && b.rows.some((r) => r.id === id)) || (b.kind === "CaseDetail" && b.incident.id === id));
    const t = named ? { kind: "case" as const, id: id as string } : explainTargetOf(doc, n);
    if (!t) return false;
    const sl = (doc.slots ?? {}) as Record<string, unknown>;
    const zones = Array.isArray(sl.zones) ? sl.zones : doc.scope.zone ? [doc.scope.zone] : [];
    await directStage("explain", { ...explainSlots(t), period: sl.period ?? doc.scope.period ?? null, zones, dept: sl.dept ?? doc.scope.dept ?? null, cat: sl.cat ?? doc.scope.cat ?? null, fresh: true }, // eslint-disable-line @typescript-eslint/no-use-before-define
      lang === "ta" ? "விளக்குகிறேன்" : "Explaining it", lang);
    return true;
  };
  const applyStageOp = async (op: StageOp, lang: Lang) => {
    if (op.op === "save") { askSave(op.text ?? stageRef.current?.title ?? "Jarvis screen", lang); return; }
    if (op.op === "pin") { askPin(lang); return; }
    // explain the item, not the screen again: "again" only when there is nothing on it to explain
    if (op.op === "explain" && (await explainOnStage(op.n ?? null, lang, op.id ?? null))) return;
    // the item the register named, by its id: its place in the list it is in (the round's n when it has none)
    if (op.id && op.n == null && stageRef.current) {
      for (const b of stageRef.current.blocks) { const k = idsOf(b).indexOf(op.id); if (k >= 0) { op = { ...op, n: k + 1 }; break; } }
    }
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
  // a mission running stops too, quietly (the card stays, showing what ran)
  const interrupt = () => { conductor.current?.stop(); stopSpeaking(); hud.caption(null); stopMission({ say: false, drop: false }); cancelTurn(); }; // eslint-disable-line @typescript-eslint/no-use-before-define
  const turnActive = () => speaking() || narrating || phase === "thinking" || phase === "acting" || !!stageBusy || missionRunning || !!(conductor.current && conductor.current.state !== "off" && conductor.current.state !== "listening");

  const stageActions = {
    close: () => { interrupt(); closeStage(); },
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
  const handle = async (text: string, conf = 0.95, original?: string, opts: { gate?: Addressed | null; source?: "whisper" | "captions" | "typed"; lang?: Lang } = {}) => {
    const said = text.trim();
    if (!said) return;
    // a mission's own words while its card waits or it runs (missions.words.ts): start (or a plain yes to the card), stop, skip that,
    // instead X, or an edit of the card before Start ("without 3"). They steer the mission and start no new turn: a new turn would
    // cancel the screen its step is building. Anything else means the Collector has moved on, and the mission gives way quietly.
    const ms = missionRef.current;
    missionBarged.current = false;
    if (ms && !original && (ms.ctl.phase() === "card" || ms.ctl.phase() === "running")) {
      const onCard = ms.ctl.phase() === "card";
      const ids = onCard && ms.card ? editIds(ms.card.steps, said) : null;
      const cmd = ids ? null : missionCommand(said) ?? (onCard && plainYes(said) ? { kind: "start" as const } : null);
      const notNow = onCard && /^(?:no|nope|not now|later|vendaam|venaam|வேண்டாம்|இப்போ வேண்டாம்)[.!]?$/iu.test(said);
      if (ids || cmd || notNow) {
        lastUserSpeech.current = Date.now();
        pushMsg({ who: "you", text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en", via: via.current });
        via.current = "typed";
        hud.set({ ribbon: said });
        // starting runs its drafts into the tray (Level C at most): from a sentence with no name and no engagement, only stop and skip
        const g = opts.gate ?? null;
        const risk = cmd?.kind === "start" ? ms.card?.risk ?? "A" : "A";
        if (g && !levelAllowed(g, risk)) { earcon("need"); out(ms.lang === "ta" ? "அதற்கு முதலில் \"ஜார்விஸ்\" என்று சொல்லுங்கள்." : "Say Jarvis first for that.", ms.lang, "ready"); return; }
        if (notNow) { stopMission({ say: false, drop: true }); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
        if (ids) { earcon(ms.ctl.edit(ids).ok ? "done" : "blocked"); return; }
        if (cmd?.kind === "start") { if (ms.ctl.start()) earcon("done"); return; }
        if (cmd?.kind === "stop") { stopMission({ say: true, drop: false }); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
        if (cmd?.kind === "skip") { stopSpeaking(); ms.ctl.skip(); return; }
        if (cmd?.kind === "instead") { stopSpeaking(); ms.ctl.instead(cmd.text); return; }
      }
      stopMission({ say: false, drop: true }); // eslint-disable-line @typescript-eslint/no-use-before-define
    }
    // a new sentence: the question in flight is aborted, and nothing it comes back with may speak
    const gen = ++turnGen.current;
    const alive = () => gen === turnGen.current;
    turnCtl.current?.abort();
    const ctl = new AbortController();
    turnCtl.current = ctl;
    gateRef.current = opts.gate ?? null;
    sourceRef.current = opts.source ?? "typed";
    // how the sentence came, for the planner (v4, defect 6): the ears' language and confidence, or typed (sure)
    const heardInfo = heardOf(sourceRef.current, opts.lang ?? (/[஀-௿]/.test(said) ? "ta" : listenLangRef.current), conf);
    forgetBookmark();
    if (!original) lastRequest.current = { text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en" };
    // a new question replaces the last answer's card: earlier ones are in the chatbot's Jarvis tab
    hud.set({ ribbon: said, answer: "", panels: [], asked: original ?? said, doing: "", focus: null });
    navTurn.current = false;
    captionRibbon.current = false;
    lastUserSpeech.current = Date.now();
    lastHeardAt.current = Date.now();
    setHeard(original ?? said); setInterim(""); setWrong(null); setReply(""); setAlt(""); altSeq.current++; lastBot.current = "";
    if (!original) pushMsg({ who: "you", text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en", via: via.current });
    via.current = "typed";
    // misunderstandings count only in a row (PERSONA.md rule 8): after a turn that went through, the count starts again
    if (!lastMiss.current) misses.current = 0;
    lastMiss.current = false;
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
      const yes = /^(yes|ok|okay|save|do it|yes do it|ஆமாம்|ஆமா|ஆம்|ஆமாங்க|சரி|சரிங்க|aama|aamam|aamanga|sari|seri|seringa)(?:[,\s]+(?:please|pls|sir|sure|thanks|சார்|தயவுசெய்து))*[.!]?$/i.test(said);
      if (yes && sourceRef.current !== "captions") { const p = pendingB; setPendingB(null); if (p.act) p.act(); else await run(p.steps, p.lang, p.heard, "rules"); return; }
      // the captions may have heard Jarvis's own voice: the card stays and waits for a yes it can trust (BUG-016)
      if (yes) { out(line("yesNotTrusted", pendingB.lang), pendingB.lang, "waiting"); return; }
      if (/^(no|cancel|வேண்டாம்|illa|vendaam)$/i.test(said)) { setPendingB(null); setPhase("ready"); return; }
      setPendingB(null);
    }
    // the next step offered after a screen (Level A): a plain yes, or "show me", builds it; anything else puts the offer away
    if (offerRef.current && !original) {
      if (plainYes(said)) { takeOffer(); return; }
      setOffer(null);
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
        setBrainNow({ by: "instant", model: null, ms: 0 }); remember(said, `on the Stage: ${lc.op}`, { doc: stageRef.current });
        // pinning keeps something: one spoken yes or a tap first (level B)
        if (lc.op === "pin") { askPin(lg); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
        await applyLocal(lc, lg);
        return;
      }
    }
    // the v4 flows, before the planner (D2 intentMarker): what Jarvis remembers (remember and forget are Level B: the name or the
    // engagement, then a yes), the brief, "what did you do today?", follow and unfollow (Level B), and a mission's plan card
    if (!original) {
      const lg: Lang = opts.lang ?? (/[஀-௿]/.test(said) ? "ta" : listenLang);
      const instant = () => setBrainNow({ by: "instant", model: null, ms: 0 });
      const t0 = performance.now();
      const im = intentMarker(said);
      if (im?.intent === "remember" && im.rest) { if (needsName("B", lg)) return; instant(); gateB([{ a: "remember", text: im.rest }], said, lg); return; }
      if (im?.intent === "forget") { if (needsName("B", lg)) return; instant(); gateB([{ a: "forget", all: im.rest === "all" }], said, lg); return; }
      if (im?.intent === "recall") {
        instant();
        const r = await recallMemory(lg); // eslint-disable-line @typescript-eslint/no-use-before-define
        if (!alive()) return;
        earcon("done"); out(r.text, lg, "ready", r.allowed);
        decide({ kind: "answer", query: said, lang: lg, lane: "instant", ms: performance.now() - t0 });
        return;
      }
      if (asksWhatToday(said)) { instant(); await whatToday(lg); decide({ kind: "answer", query: said, lang: lg, lane: "instant", ms: performance.now() - t0 }); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
      // a mission's templates know the brief too: without a place it is the Collector's brief; "brief me on TANGEDCO" is the planner's
      const mi = im?.intent === "brief" ? null : missionIntent(said, worldRef.current);
      if ((im?.intent === "brief" && !im.rest) || (mi?.template === "brief" && !mi.place)) {
        instant(); await briefMe(lg, true); // eslint-disable-line @typescript-eslint/no-use-before-define
        decide({ kind: "answer", query: said, lang: lg, lane: "instant", ms: performance.now() - t0 });
        return;
      }
      const doc = stageRef.current, cs = buildState();
      const onScreen = doc ? doc.blocks.find((b) => b.kind === "CaseDetail") : null;
      const fa = followAsk(said, { incident: onScreen?.kind === "CaseDetail" ? onScreen.incident.id : doc ? null : cs.incident, zone: doc ? doc.scope.zone : cs.zone, world: worldRef.current });
      if (fa) { if (needsName("B", lg)) return; instant(); askFollow(fa, said, lg); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
      if (mi || im?.intent === "mission") { instant(); await startMission(said, lg); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
    }
    const st = buildState();
    // the ears' confidence on the scale understand() was tuned on: a clean decode reads as before, an unsure one asks first (turnstate.ts)
    const rules = understand(said, st, worldRef.current, { speechConf: rulesConf(conf) });
    // a question while a dataset is open in the Data Studio: the dataset answers (its engine counts the rows), as the
    // Studio's own analyst did. Going to another page ("go to trends") and the instant controls (stop, quieter) still work
    const sd = studioRef.current;
    const pageMove = rules.kind === "do" && rules.steps.length > 0 && rules.steps.every((x) => x.a === "page");
    if (sd && hostRef.current.c.page === "studio" && !pageMove && !(rules.kind === "do" && isReflex(rules.steps, st))) {
      audit(said, [], `to the dataset ${sd.name}`);
      await askDataset(sd, said, rules.lang); // eslint-disable-line @typescript-eslint/no-use-before-define
      return;
    }
    // instant controls never wait for the network; sending only ever happens here, from the Collector's own words
    if (rules.kind === "do" && isReflex(rules.steps, st)) {
      if (needsName(planRisk(rules.steps), rules.lang)) return;
      setBrainNow({ by: "instant", model: null, ms: 0 }); await run(rules.steps, rules.lang, said, "rules"); return;
    }
    // a plain move the rules are sure of ("go to trends", "open the map") is done at once, with no model
    // and so is a command to move around the dashboard ("go to trends and show only Adyar", "switch to weekly", "open the news")
    if (rules.kind === "do" && rules.confidence >= 0.9 && planRisk(rules.steps) === "A" && (isPlainMove(rules.steps) || isNavCommand(said, rules.steps))) {
      setBrainNow({ by: "instant", model: null, ms: 0 });
      await run(rules.steps, rules.lang, said, "rules", rules.note?.[rules.lang]);
      return;
    }


    setPhase("thinking");
    setChips([]);
    const heardAs = original ?? said;
    // "complete this data" with a list on the screen means those rows, not whatever the console's filters hold
    const openRows = (stageRef.current?.blocks ?? []).flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : []));
    if (openRows.length && quickScreen(said, worldRef.current)?.recipe === "complete") { await directStage("complete", { ids: openRows }, ackFor(said, rules.lang), rules.lang); return; } // eslint-disable-line @typescript-eslint/no-use-before-define
    // what it is doing shows in the bar at once; it is not said aloud (a spoken "one moment" was cut off mid-word whenever the
    // answer came quickly). With the mode on the core shows the work, with it off a soft heartbeat does
    const ack = ackTemplated(said, rules.lang, worldRef.current) || ackFor(said, rules.lang);
    ackText.current = ack;
    setReply(ack);
    hud.set({ doing: ack });
    if (stageRef.current) setStageBusy(ack);
    jvMark("ack");
    if (utterEnd.current) hud.strip({ ackMs: Math.round(performance.now() - utterEnd.current) });
    // said aloud only when it is honest (turnstate.ts ackDue): a spoken sentence whose answer has not started, on screen or in the
    // voice, 1.2 s after the end of speech, and never over a voice; the earcon at the end of speech already said "heard you"
    const endAt = sourceRef.current !== "typed" ? utterEnd.current : null;
    const ackIn = outMode === "voice" ? ackDelay(endAt, performance.now()) : null;
    if (ackIn != null) setTimeout(() => {
      if (alive() && ackDue({ endAt, now: performance.now(), answeredAt: answerAt.current, findingAt: findingAt.current, speaking: speaking(), waiting: conductor.current?.state === "thinking" })) speakAck(ack, rules.lang);
    }, ackIn);
    const stopBeat = outMode !== "quiet" && modeRef.current !== "on" ? heartbeat() : () => undefined;
    const ag = await callAgent(said, st, undefined, ctl.signal, heardInfo).finally(() => { stopBeat(); });
    if (!alive()) return;
    setStageBusy(null);
    if (ag && ag.kind !== "none") {
      setBrainNow({ by: "ai", model: ag.model, ms: ag.ms });
      const lang = ag.lang;
      // a line the model wrote can hold no figure at all: the gate on the chunks has none to allow (nor does the turn's memory)
      // (a frame's reply, "how do you know?", reads the open screen's own provenance: it may say the screen's figures, nothing else)
      if (ag.kind === "chat") { earcon("done"); remember(heardAs, "answered in words", { result: noFigure(ag.reply) }); out(ag.reply ?? "", lang, "ready", ag.note?.startsWith("frame:") && stageRef.current ? speakableFigures(stageRef.current, lang) : NO_FIGURES); return; }
      if (ag.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, "refused", { result: noFigure(ag.reply) }); out(ag.reply ?? "", lang, "ready", NO_FIGURES); return; }
      if (ag.kind === "clarify") { ask({ question: ag.reply ?? "", lang, heard: heardAs, choices: ag.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }, NO_FIGURES, true); return; }
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
        // a screen that streamed is up already, and some of its words said: only what is left is shown or said
        showStage(ag.stage, ag.say, lang, { model: ag.model, ms: ag.ms, rounds: ag.rounds, calls: ag.calls.length }, { heard: heardAs, stream: streamOf(gen) });
        return;
      }
      if (ag.stageOp) {
        if (ag.steps.length) await run(ag.steps, lang, heardAs, "ai", undefined, true);
        if (!alive()) return;
        remember(heardAs, `on the Stage: ${ag.stageOp.op}${ag.stageOp.n ? ` ${ag.stageOp.n}` : ""}`, { doc: stageRef.current });
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
      setBrainNow({ by: "ai", model: ai.model, ms: ai.ms });
      const p = ai.plan;
      if (p.kind === "chat") { earcon("done"); remember(heardAs, "answered in words", { result: noFigure(p.reply) }); out(p.reply, p.lang, "ready", NO_FIGURES); return; }
      if (p.kind === "refuse") { earcon("blocked"); audit(heardAs, [], "refused"); remember(heardAs, "refused", { result: noFigure(p.reply) }); out(p.reply, p.lang, "ready", NO_FIGURES); return; }
      if (p.kind === "clarify") {
        ask({ question: p.question, lang: p.lang, heard: heardAs, choices: p.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }, NO_FIGURES, true);
        return;
      }
      if (needsName(planRisk(p.steps), p.lang)) return;
      if (tapRisk(p.steps) !== "A") { gateB(p.steps, heardAs, p.lang); return; }
      await run(p.steps, p.lang, heardAs, "ai", noFigure(p.reply));
      return;
    }
    // the brain was unreachable or found nothing real: the built-in rules answer, and the dock says so
    setBrainNow({ by: "rules", model: null, ms: 0 });
    if (rules.kind === "unknown") {
      // no model can answer right now: said plainly, inside the 8 s, with what still works
      if (ag?.note === "no-model") { earcon("blocked"); audit(said, [], "no model answered"); out(NO_MODEL_LINE[rules.lang], rules.lang, "ready"); return; }
      // the checker left nothing of the plan: what Jarvis can do, not silence
      if (ag && ag.kind === "none") { earcon("need"); audit(said, [], "cannot do"); if (missed()) offerKeys(rules.lang); else out(cannotLine(rules.lang), rules.lang, "ready"); return; }
      // not a console command: a question about the district, answered by the analyst (Ask District IQ's engine)
      audit(said, [], "to the analyst");
      await askAnalyst(said, rules.lang); // eslint-disable-line @typescript-eslint/no-use-before-define
      return;
    }
    if (rules.kind === "refuse") { earcon("blocked"); audit(said, [], "refused"); out(rules.why[rules.lang], rules.lang, "ready"); return; }
    if (rules.kind === "ask" && rules.choices.some((c) => c.steps && planRisk(c.steps) !== "A") && needsName("C", rules.lang)) return;
    if (rules.kind === "ask") { ask(fromRules(rules), undefined, true); return; }
    if (needsName(planRisk(rules.steps), rules.lang)) return;
    if (tapRisk(rules.steps) !== "A") { gateB(rules.steps, said, rules.lang); return; }
    // an unsure reading is put as a question: below 0.6 always, and below 0.85 when the ears themselves were unsure (defect 6)
    if (asksFirst(rules.confidence, heardInfo.conf)) {
      const what = rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ");
      ask({ question: line("lowConfidence", rules.lang, { what }), lang: rules.lang, heard: said,
        choices: [{ label: rules.lang === "ta" ? "ஆம்" : "Yes", en: "Yes", steps: rules.steps }, { label: rules.lang === "ta" ? "இல்லை" : "No", en: "No", steps: [] }] }, undefined, true);
      return;
    }
    if (rules.confidence < 0.85) { setWrong(rules.steps.map((x) => describeStep(x, worldRef.current, rules.lang)).join(", ")); setTimeout(() => setWrong(null), 4000); }
    await run(rules.steps, rules.lang, said, rules.by, rules.note?.[rules.lang]);
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // --------------------------------------------------------------- missions (v4, lane M2) --
  /**
   * A mission (missions.run.ts): one sentence to a plan of 3 to 6 steps (POST /api/collector/thunai/mission: the templates in code, else
   * the planner's plan as data, checked), shown as the bar's plan card with Start and Edit. After the Collector's Start each step runs
   * through the hands below and is said in one code-templated line with its real time; "stop", "skip that" and "instead X" steer it
   * (handle()). A draft step only ever puts drafts in the tray. Nothing here sends, approves or deletes.
   */
  const missionState = () => { const st = buildState(); return { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk }; };
  /** End the mission in hand: `say` its stopped line (a spoken or tapped stop) or not (Esc, a newer request); `drop` its card too. */
  const stopMission = (o: { say: boolean; drop: boolean }) => {
    const m = missionRef.current;
    if (o.drop) hud.set({ mission: null });
    if (!m) return;
    if (!o.say) m.mute = true;
    if (o.drop) m.drop = true;
    m.ctl.stop();
  };
  /** One line of the mission, said; resolves when it has been said, or cut short and the Collector is not mid-sentence. */
  const missionSay = (m: NonNullable<typeof missionRef.current>, t: string, l: Lang, allowed: Set<string>) => new Promise<void>((res) => {
    if (m.mute || missionRef.current !== m) { res(); return; }
    setReply(t);
    if (outModeRef.current !== "voice") { setTimeout(res, Math.min(3500, 700 + t.length * 35)); return; }
    let iv: ReturnType<typeof setInterval> | null = null, done = false;
    const fin = () => { if (done) return; done = true; if (iv) clearInterval(iv); res(); };
    const z = zoneSafe([t], allowed, zoneNos());
    if (!speak(z.lines[0] || t, l === "ta" ? "ta-IN" : "en-IN", fin, rate, voiceName, z.lines[0] ? z.allowed : allowed)) { fin(); return; }
    // a voice cut short (a barge-in, a newer answer) never calls its end: the line counts as said once the voice is quiet and the
    // Collector is not mid-sentence, so their "skip that" or "instead …" reaches the mission before its next step
    let quiet = 0;
    iv = setInterval(() => {
      const s = conductor.current?.state;
      if (speaking() || missionBarged.current || s === "hearing" || s === "paused" || s === "interrupted") { quiet = 0; return; }
      if (++quiet >= 3) fin();
    }, 150);
  });
  const startMission = async (text: string, lang: Lang) => {
    stopMission({ say: false, drop: true });
    const gen = turnGen.current, signal = turnCtl.current?.signal;
    setPhase("thinking");
    hud.set({ doing: lang === "ta" ? "திட்டம் போடுகிறேன்" : "Planning it" });
    let j: { plan?: unknown; reply?: { en?: string; ta?: string } | null } | null = null;
    try { j = await post("/api/collector/thunai/mission", { text: text.slice(0, 300), lang, state: missionState() }, signal); } catch { j = null; }
    if (gen !== turnGen.current) return;
    if (!j?.plan) {
      const r = j?.reply?.[lang];
      earcon("blocked");
      audit(text, [], "no mission plan");
      out(typeof r === "string" && r.trim() && !figuresIn(r).length ? r : lang === "ta" ? "அதற்குத் திட்டம் போட முடியவில்லை." : "I couldn't make a plan of that.", lang, "ready", NO_FIGURES);
      return;
    }
    const m = { ctl: missionControl(), card: null as MissionCard | null, mute: false, drop: false, lang, told: false };
    missionRef.current = m;
    setPhase(tray.length ? "waiting" : "ready");
    audit(text, [], "mission plan card shown (waits for Start)");
    const live = () => missionRef.current === m && !m.drop;
    const outcome = await runMission(j.plan, {
      showScreen: async (recipe, slots, sig): Promise<ScreenOutcome> => {
        if (!live()) return { ok: false };
        const r = await callAgent(String(recipe), buildState(), { recipe, slots, lang }, sig);
        if (!live() || sig.aborted || !r?.stage) return { ok: false };
        // the step's own line is said instead of the screen's: the screen goes up quietly, with its panel
        putStage(r.stage, lang, { model: null, ms: 0, rounds: 0, calls: r.calls.length });
        remember(text, `mission step: a ${r.stage.recipe} screen`, { doc: r.stage, result: screenResult(r.stage, speakableFigures(r.stage, lang)) });
        return { ok: true, cases: r.stage.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((x) => ({ id: x.id, overdue: x.overdue })) : [])) };
      },
      runStep: async (step, sig) => {
        if (!live() || sig.aborted) return false;
        // a console move is shown, not done behind a screen
        if (stageRef.current) closeStage();
        try { await runStep(step, lang, text); await hostRef.current.settled?.(); return true; } catch { return false; }
      },
      focusMap: async (p, _tour, sig) => {
        if (!live() || sig.aborted) return;
        if (stageRef.current) closeStage();
        const h = hostRef.current;
        h.c.setPage("overview");
        if (p.zone) h.applyView({ zone: p.zone }); else if (p.taluk) h.applyView({ taluk: p.taluk }); else h.c.askOnMap?.(p.name);
        hud.set({ focus: { label: (lang === "ta" && p.ta) || p.name, lat: null, lon: null, zone: p.zone } });
        await h.settled?.();
      },
      // Level C: drafts into the tray, for the Collector's own tap; never sent
      draft: async (ids, sig) => {
        const ds = (await Promise.all(ids.map(draftFor))).filter((d): d is Draft => !!d);
        if (!live() || sig.aborted || !ds.length) return [];
        addToTray(ds);
        audit(text, [{ a: "draft" }], `mission drafted ${ds.length} into the tray (nothing sent)`);
        return ds.map((d) => d.incidentId);
      },
      say: (t, l, allowed) => missionSay(m, t, l, allowed),
      progress: () => undefined,
      card: (c) => {
        m.card = c;
        if (m.drop || missionRef.current !== m) return;
        hud.set({ mission: hudMissionOf(c, lang) });
        setMissionRunning(c.phase === "running");
        // the plan is put once, in a line: what it is and how to begin
        if (c.phase === "card" && !m.told) {
          m.told = true;
          const title = (lang === "ta" ? c.title.ta : c.title.en) || c.title.en;
          earcon("need");
          out(lang === "ta" ? `${title}: திட்டம் தயார். "தொடங்கு" என்று சொல்லுங்கள், அல்லது தட்டுங்கள்.` : `Here's the plan: ${title}. Say start, or tap Start.`, lang, "ready", NO_FIGURES);
        }
      },
      plan: async (t) => (await post("/api/collector/thunai/mission", { text: t.slice(0, 300), lang, state: missionState(), redirect: true }).catch(() => null))?.plan ?? null,
      now: () => performance.now()
    }, m.ctl).catch(() => null);
    if (missionRef.current === m) { missionRef.current = null; setMissionRunning(false); }
    if (!outcome) return;
    if (outcome.phase === "refused") {
      if (!m.drop) hud.set({ mission: null });
      out(lang === "ta" ? "அந்தத் திட்டத்தை ஓட்ட முடியாது." : "I can't run that plan.", lang, "ready", NO_FIGURES);
      return;
    }
    const ran = outcome.steps.filter((s) => s.state === "done").length;
    audit(text, [], `mission ${outcome.phase}: ${ran} of ${outcome.steps.length} steps; ${outcome.drafted.length} drafted into the tray (nothing sent)`);
    if (outcome.phase !== "cancelled") decide({ kind: "answer", query: text, lang, lane: "rules", ms: outcome.ms });
  };

  // --------------------------------------------------------------- the brief, memory, follows (v4, lane P2) --
  /**
   * The Collector's brief (GET /api/collector/thunai/brief): its card (the bottom line, three to five items with their source chips) and
   * its lines said in order with the figures they may use, the end line last. Finite: it ends. `asked`: said for "brief me" (a brief that
   * cannot be read is said so); on power-on a missing brief is silent.
   */
  const briefMe = async (lang: Lang, asked: boolean) => {
    const bs = briefState.current;
    if (bs.fetching) return;
    bs.fetching = true;
    let card: BriefCard | null = null;
    try { const r = await fetch("/api/collector/thunai/brief"); card = r.ok ? briefCard(await r.json(), lang, worldRef.current) : null; } catch { card = null; } finally { bs.fetching = false; }
    if (!card) { if (asked) { earcon("blocked"); out(line("briefNone", lang), lang, "ready"); } return; }
    briefedPage = true;
    setBriefShown(card);
    markAnswer();
    const text = card.lines.join(" ");
    setReply(text); lastSpoken.current = { text, lang };
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    if (outModeRef.current !== "voice" || (lang === "ta" && voiceLang !== "ta-IN")) { setPhase(tray.length ? "waiting" : "ready"); return; }
    const z = zoneSafe(card.lines, card.allowed, zoneNos());
    bs.saying = true;
    setPhase("speaking");
    const ok = speakLines(z.lines, voiceLang, {
      rate, voice: voiceName, allowed: z.allowed, onPiece: (t) => hud.caption(t, lang), onWord: (_, ch) => hud.captionWord(ch),
      onEnd: () => { bs.saying = false; hud.caption(null); setPhase(onRef.current ? (tray.length ? "waiting" : "ready") : "off"); }
    });
    if (!ok) { bs.saying = false; setPhase("ready"); }
  };
  const briefRef = useRef(briefMe);
  briefRef.current = briefMe;
  /** What the moment is, for anything Jarvis would say unprompted (aide.ts heldBack, interjectNow). */
  const liveNow = (): Live => {
    const s = conductor.current?.state, bs = briefState.current, ph = phaseRef.current;
    return {
      mode: modeRef.current, collectorSpeaking: s === "hearing" || s === "paused",
      busy: ph === "thinking" || ph === "acting" || !!stageBusyRef.current || s === "thinking",
      speaking: speaking(), briefing: bs.fetching || (bs.saying && speaking()),
      waiting: !!askOnceRef.current || !!pendingBRef.current || !!missionRef.current,
      lastUserSpeech: lastUserSpeech.current, quiet: outModeRef.current === "quiet"
    };
  };
  /** The brief on power-on: once a session, after the power-on (1.2 s), and only into a quiet moment (a question asked with the name comes first). */
  const powerOnBrief = () => {
    let seen = briefedPage;
    try { seen = seen || sessionStorage.getItem("jarvis-briefed") === "1"; } catch { /* no storage: this page's own flag */ }
    if (seen) return;
    const gen = turnGen.current;
    setTimeout(() => {
      if (modeRef.current !== "on" || gen !== turnGen.current || heldBack({ ...liveNow(), briefing: false })) return;
      briefedPage = true;
      try { sessionStorage.setItem("jarvis-briefed", "1"); } catch { /* the page's flag holds */ }
      void briefRef.current(listenLangRef.current, false);
    }, 1400);
  };

  /** "What do you remember about me?": the list (store.ts rememberList) on the memory panel, and its one line with its counts. */
  const recallMemory = async (lang: Lang): Promise<{ text: string; allowed: Set<string> }> => {
    try {
      const r = await fetch("/api/collector/thunai/memory?view=list");
      const j = await r.json() as { items?: { kind: string; id: string; text: string }[]; spoken?: { en?: string; ta?: string }; values?: Record<string, number> };
      if (!r.ok || !j?.spoken) throw new Error("no list");
      setMemList(Array.isArray(j.items) ? j.items.slice(0, 60) : []);
      void loadMemory();
      setPanel("memory");
      return { text: String(j.spoken[lang] ?? j.spoken.en ?? ""), allowed: allowedSet(Object.values(j.values ?? {}).filter((v) => typeof v === "number" && Number.isFinite(v))) };
    } catch {
      await loadMemory(); setPanel("memory");
      return { text: lang === "ta" ? "என் குறிப்புகளை இப்போ படிக்க முடியல. இருக்கறது திரையில இருக்கு." : "I can't read my notes just now. What I have is on the screen.", allowed: NO_FIGURES };
    }
  };
  /** "What did you do today?": today's decision records said by code (GET /api/collector/thunai/audit?today=1), with their counts. */
  const whatToday = async (lang: Lang) => {
    try {
      const r = await fetch("/api/collector/thunai/audit?today=1");
      const j = await r.json() as { summary?: { en?: string; ta?: string; values?: Record<string, number> } };
      const t = j?.summary?.[lang];
      if (!r.ok || typeof t !== "string" || !t.trim()) throw new Error("no summary");
      earcon("done");
      out(t, lang, "ready", allowedSet(Object.values(j.summary?.values ?? {}).filter((v) => typeof v === "number" && Number.isFinite(v))));
    } catch { earcon("blocked"); out(lang === "ta" ? "இன்றைய பதிவை இப்போ படிக்க முடியல." : "I can't read today's record just now.", lang, "ready", NO_FIGURES); }
  };
  /** Follow or unfollow (Level B): asked first; the Collector's yes (spoken or a tap) sends it with yes: true. */
  const askFollow = (fa: FollowAsk, said: string, lang: Lang) => {
    const name = fa.name[lang];
    const q = fa.op === "follow"
      ? (lang === "ta" ? `${name} கவனிச்சுக்கட்டுமா? மாறினா சொல்றேன்.` : `Follow ${name}? I'll tell you when it changes.`)
      : (lang === "ta" ? `${name} கவனிக்கிறதை நிறுத்தட்டுமா?` : `Stop following ${name}?`);
    setPendingB({ text: q, steps: [], heard: said, lang, act: () => void doFollow(fa, said, lang) });
    earcon("need");
    out(q, lang, "asking", NO_FIGURES);
  };
  const doFollow = async (fa: FollowAsk, said: string, lang: Lang) => {
    let body: Record<string, unknown>;
    if (fa.op === "follow") body = { op: "follow", kind: fa.kind, id: fa.ref, yes: true };
    else {
      const f = (memoryRef.current?.follows ?? []).find((x) => x.kind === fa.kind && String(x.ref) === String(fa.ref));
      if (!f) { out(lang === "ta" ? "அதை நான் கவனிக்கல." : "I'm not following that.", lang, "ready", NO_FIGURES); return; }
      body = { op: "unfollow", id: f.id, yes: true };
    }
    const failed = lang === "ta" ? "அது நடக்கல." : "That didn't go through.";
    try {
      const r = await fetch("/api/collector/thunai/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})) as { reply?: { en?: string; ta?: string } };
      const t = j?.reply?.[lang];
      earcon(r.ok ? "done" : "blocked");
      audit(said, [], r.ok ? `${fa.op} ${fa.kind} (Level B, the Collector's yes)` : `${fa.op} not done`);
      if (r.ok) void loadMemory();
      out(typeof t === "string" && t.trim() && !figuresIn(t).length ? t : r.ok ? (lang === "ta" ? "சரி." : "Done.") : failed, lang, "ready", NO_FIGURES);
    } catch { earcon("blocked"); out(failed, lang, "ready", NO_FIGURES); }
  };

  // --------------------------------------------------------------- speaking unprompted (v4, lane P2) --
  /**
   * The watch's candidate, re-checked here with the live state (aide.ts interjectNow: never in the brief, a card, the Collector's speech,
   * a turn or Jarvis's own voice; then mayInterject): the card comes up with the chime (HudCards plays it once), the one gated line
   * follows, and the server is told it was said.
   */
  const interject = (sig: WatchSignal | null) => {
    if (!sig || hud.get().interjection) return;
    const lang = listenLangRef.current;
    if (!interjectNow(sig, liveNow(), Date.now()).ok) return;
    const l = signalLine(sig, lang, worldRef.current);
    if (!l) return;
    interjected.current = sig;
    hud.set({ interjection: { id: sig.key, text: l.text, severity: sig.severity } });
    post("/api/collector/thunai/watch", { op: "spoken", key: sig.key, level: sig.level }).catch(() => undefined);
    if (sig.kind === "followed" && sig.topic.startsWith("followed:")) post("/api/collector/thunai/watch", { op: "followSeen", id: sig.topic.slice(9) }).catch(() => undefined);
    if (outModeRef.current !== "voice") return;
    setTimeout(() => {
      if (hud.get().interjection?.id !== sig.key || heldBack(liveNow())) return;
      const z = zoneSafe([l.text], l.allowed, zoneNos());
      speak(z.lines[0] || l.text, lang === "ta" ? "ta-IN" : "en-IN", undefined, rate, voiceName, z.lines[0] ? z.allowed : l.allowed);
    }, 400);
  };
  const interjectRef = useRef(interject);
  interjectRef.current = interject;
  const flash = (en: string, ta: string) => { hud.set({ notice: listenLangRef.current === "ta" ? ta : en }); setTimeout(() => hud.set({ notice: null }), 4000); };
  /** "Later" and "not about this" are the Collector's choices (Level B): the tap is the yes. */
  const watchPref = async (pref: "later" | "mute", target: string) => {
    try { await post("/api/collector/thunai/watch", { op: "pref", pref, target, yes: true }); return true; } catch { return false; }
  };
  /** The queue's badge: what is waiting, the first three, said in order and told to the server. */
  const hearQueue = () => {
    const lang = listenLangRef.current;
    const items = queued.current.slice(0, 3).map((s) => ({ s, l: signalLine(s, lang, worldRef.current) })).filter((x): x is { s: WatchSignal; l: NonNullable<ReturnType<typeof signalLine>> } => !!x.l);
    queued.current = [];
    hud.set({ queue: 0 });
    if (!items.length) return;
    post("/api/collector/thunai/watch", { op: "seen", items: items.map((x) => ({ key: x.s.key, level: x.s.level })), told: true }).catch(() => undefined);
    for (const x of items) if (x.s.kind === "followed" && x.s.topic.startsWith("followed:")) post("/api/collector/thunai/watch", { op: "followSeen", id: x.s.topic.slice(9) }).catch(() => undefined);
    const lines = items.map((x) => x.l.text), allowed = new Set(items.flatMap((x) => [...x.l.allowed]));
    markAnswer(); setReply(lines.join(" "));
    const voiceLang = lang === "ta" && hasVoice("ta-IN") ? "ta-IN" : "en-IN";
    if (outModeRef.current !== "voice" || (lang === "ta" && voiceLang !== "ta-IN")) return;
    const z = zoneSafe(lines, allowed, zoneNos());
    setPhase("speaking");
    if (!speakLines(z.lines, voiceLang, { rate, voice: voiceName, allowed: z.allowed, onPiece: (t) => hud.caption(t, lang), onWord: (_, ch) => hud.captionWord(ch), onEnd: () => { hud.caption(null); setPhase("ready"); } })) setPhase("ready");
  };
  /** The evidence chip: the rows the answer rests on (the open screen's first list or chart as a table), or that screen again. */
  const openEvidence = () => {
    const doc = stageRef.current;
    if (doc) {
      const b = doc.blocks.find((x) => x.kind === "CaseList" || x.kind === "Ranking" || x.kind === "Chart" || x.kind === "Trend" || x.kind === "Compare");
      if (b) setStageViews((v) => ({ ...v, [b.id]: "table" }));
      return;
    }
    const p = hud.get().panels[0];
    if (p?.slots) window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail: { id: p.id, title: p.title, recipe: p.recipe, slots: p.slots, at: new Date(p.at || Date.now()).toISOString() } }));
  };
  /** what the HUD's v4 buttons do (hud.actions is set once; these are read through a ref, so they are never stale) */
  const hudActs = {
    evidence: openEvidence,
    missionStart: () => { const m = missionRef.current; if (m?.ctl.start()) earcon("done"); },
    missionEdit: () => {
      const m = missionRef.current;
      if (!m || m.ctl.phase() !== "card") return;
      hud.set({ typing: true });
      flash("Type a step to leave out (\"without 3\"), or \"instead …\" for another plan.", "வேண்டாத படியைத் தட்டச்சு செய்யுங்கள் (\"3 வேண்டாம்\"), அல்லது \"அதுக்கு பதிலா …\".");
    },
    // a tapped stop is said ("Stopped."); a plan not started, or one that has ended, is put away
    missionStop: () => { const m = missionRef.current; if (m && m.ctl.phase() === "running") stopMission({ say: true, drop: false }); else stopMission({ say: false, drop: true }); },
    tellMe: (id: string) => {
      const s = interjected.current;
      hud.set({ interjection: null }); interjected.current = null;
      const sc = s && s.key === id ? signalScreen(s) : null;
      if (sc) { setBrainNow({ by: "instant", model: null, ms: 0 }); void directStage(sc.recipe, sc.slots, sc.label[listenLangRef.current], listenLangRef.current); }
    },
    later: (id: string) => {
      hud.set({ interjection: null }); interjected.current = null;
      void watchPref("later", id).then((ok) => (ok ? flash("I'll bring it up later.", "அப்புறம் சொல்றேன்.") : flash("That choice wasn't saved.", "அந்த விருப்பம் சேமிக்கப்படல.")));
    },
    notAbout: (id: string) => {
      const s = interjected.current;
      hud.set({ interjection: null }); interjected.current = null;
      if (!s || s.key !== id) return;
      void watchPref("mute", s.topic).then((ok) => (ok ? flash("I won't raise that again.", "இதைப் பத்தி இனி சொல்ல மாட்டேன்.") : flash("That choice wasn't saved.", "அந்த விருப்பம் சேமிக்கப்படல.")));
    },
    queue: hearQueue
  };
  const hudActsRef = useRef(hudActs);
  hudActsRef.current = hudActs;
  useEffect(() => {
    const a = () => hudActsRef.current;
    hud.actions({
      onEvidence: () => a().evidence(), onMissionStart: () => a().missionStart(), onMissionEdit: () => a().missionEdit(), onMissionStop: () => a().missionStop(),
      onTellMe: (id) => a().tellMe(id), onLater: (id) => a().later(id), onNotAbout: (id) => a().notAbout(id), onQueue: () => a().queue(), chime: () => earcon("need")
    });
  }, []);
  // the evidence chip under the answer: who understood it, how long it took, and the screen's method, n, period and sources (all code's)
  useEffect(() => {
    const s = hud.get().strip;
    hud.set({ evidence: evidenceOf(brain, stage, s.findingMs ?? s.lastMs) });
  }, [brain, stage]);

  // --------------------------------------------------------------- the analyst --
  /** A question about the district (not a console command): Ask District IQ's engine answers, as a card in the thread. */
  const analystSession = useRef<string | null>(null);
  const askAnalyst = async (q: string, lang: Lang) => {
    const c = hostRef.current.c;
    const gen = turnGen.current, signal = turnCtl.current?.signal;
    setPhase("thinking");
    setReply(lang === "ta" ? "தரவில் தேடுகிறேன்…" : "Looking it up in the district's data…");
    // the analyst's own stages (its "status" events) are the work timeline, so a long analysis shows what it is doing
    const ANALYST: Record<string, [string, string]> = { understanding: ["Understanding the question", "கேள்வியைப் புரிந்துகொள்கிறேன்"], fetching: ["Reading the data", "தரவைப் படிக்கிறேன்"], drawing: ["Drawing the answer", "பதிலை வரைகிறேன்"] };
    let atStage: string | null = null;
    const stageTo = (next: string | null, state: "done" | "failed" = "done") => {
      if (gen !== turnGen.current || next === atStage) return;
      if (atStage) hud.step({ id: `analyst-${gen}-${atStage}`, label: ANALYST[atStage][lang === "ta" ? 1 : 0], state });
      atStage = next && ANALYST[next] ? next : null;
      if (atStage) hud.step({ id: `analyst-${gen}-${atStage}`, label: ANALYST[atStage][lang === "ta" ? 1 : 0] });
    };
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
          if (ev === "status" && raw) { try { stageTo(String((JSON.parse(raw) as { stage?: string }).stage ?? "")); } catch { /* not a stage */ } }
          if (ev === "answer" && raw) { card = JSON.parse(raw) as Card; analystSession.current = (card as unknown as { sessionId?: string }).sessionId ?? analystSession.current; }
        }
      }
      if (gen !== turnGen.current) return;
      if (!card) throw new Error("no answer");
      stageTo(null);
      const say = card.voiceSummary || card.headline;
      lastBot.current = say;
      pushMsg({ who: "jarvis", text: say, lang: card.voiceLang === "ta-IN" ? "ta" : "en", card });
      earcon("done");
      out(say, card.voiceLang === "ta-IN" ? "ta" : "en", "ready");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      stageTo(null, "failed");
      earcon("blocked");
      if (missed()) offerKeys(lang); else out(line("notUnderstood", lang, { heard: q, examples: SUGGEST.slice(0, 3).join(", ") }), lang, "ready");
    }
  };
  /** a question about the open dataset: the Studio's engine plans it (AI, else rules) and counts it from the rows */
  const askDataset = async (sd: StudioContext, q: string, lang: Lang) => {
    // like askAnalyst: an answer that comes back after a newer turn or a stop is dropped (BUG-015)
    const gen = turnGen.current, signal = turnCtl.current?.signal;
    const stale = () => gen !== turnGen.current || !!signal?.aborted;
    setPhase("thinking");
    setReply(lang === "ta" ? `${sd.name} தரவில் கணக்கிடுகிறேன்…` : `Counting it in ${sd.name}…`);
    try {
      const last = studioPlan.current?.id === sd.id ? studioPlan.current.plan : null;
      const res = await fetch(`/api/collector/studio/${sd.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", question: q, context: last ? { filters: (last as { filters?: unknown[] }).filters ?? [] } : null }), signal });
      const a = await res.json() as StudioReply & { error?: string };
      if (stale()) return;
      if (!res.ok) throw new Error(a.error ?? "failed");
      if (a.plan) studioPlan.current = { id: sd.id, plan: a.plan };
      const say = a.kind === "unsupported" ? (a.note ?? (lang === "ta" ? "இந்தத் தரவில் அதற்குப் பதில் இல்லை." : "This data cannot answer that.")) : (a.answer ?? "");
      lastBot.current = say;
      pushMsg({ who: "jarvis", text: say, lang, studio: { id: sd.id, name: sd.name, q, a } });
      earcon("done");
      out(say, lang, "ready");
    } catch {
      if (stale()) return;
      earcon("blocked");
      out(lang === "ta" ? "இந்தத் தரவிடம் இப்போது கேட்க முடியவில்லை. மீண்டும் முயலுங்கள்." : "The dataset could not be asked just now. Please try again.", lang, "ready");
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
    setReply(""); // the "Counting it" line the turn put up goes with it (audit-client_browser-8)
    turnGen.current++;
    turnCtl.current?.abort();
    turnCtl.current = null;
    abortMission.current = true;
    setStageBusy(null);
    setNarrating(false); setReading(null);
    hud.caption(null);
    // a barge-in over a running mission: its words decide (skip that, instead X, stop) before anything is stopped (handle(), onState)
    const ms = missionRef.current;
    if (ms && !ms.mute && (ms.ctl.phase() === "card" || ms.ctl.phase() === "running")) missionBarged.current = true;
    setPhase(onRef.current ? "ready" : "off");
  };
  /** A sentence the transcriber did not answer in time (the conductor's onMissed): calm, numberless; two misses in a row offer the keyboard. */
  const notHeard = () => {
    const lang = listenLangRef.current;
    if (missed()) offerKeys(lang); else out(NOT_CAUGHT[lang], lang, "ready", NO_FIGURES);
  };
  const notHeardRef = useRef(notHeard);
  notHeardRef.current = notHeard;
  /** A sentence that passed the address gate. */
  const onSentence = (h: HeardLine) => {
    lastHeardAt.current = Date.now();
    via.current = "voice";
    if (!onRef.current) switchOn(true); // eslint-disable-line @typescript-eslint/no-use-before-define
    // the ears' own confidence and language go to the rules and the planner (v4, defect 6: it was a fixed 0.95 and the language was dropped)
    // (an older turn finishing says nothing about the one now running)
    void handleRef.current(h.text, Number.isFinite(h.conf) ? h.conf : 0.95, h.again ? h.text : undefined, { gate: h.gate, source: h.source, lang: h.lang }).finally(() => { if (conductor.current?.generation === h.gen) conductor.current.answered(); });
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
        // a barge-in over a mission that ended in a hold word ("stop", "wait": they never reach handle()) stops it, and says so;
        // one that came to nothing (a cough, an empty transcript) lets it go on
        if (missionBarged.current && s === "holding") { missionBarged.current = false; stopMission({ say: true, drop: false }); }
        else if (missionBarged.current && (s === "listening" || s === "off")) missionBarged.current = false;
      },
      onLevel: (v) => hud.setLevel(v),
      onHearing: (a) => { setActivity(a); if (a !== "idle") lastHeardAt.current = Date.now(); },
      onBudget: (b) => hud.strip({ ambient: b.ambient, budgetLow: b.low }),
      onFail: (why) => {
        if (why === "gesture") { hud.set({ needsResume: true }); return; }
        // no microphone: Jarvis stays open with it off and says why, so a question can still be typed
        if (why === "blocked") setMicBlocked(true);
        setMode("muted");
        const ta = listenLangRef.current === "ta";
        hud.set({ denied: why === "blocked", typing: true, notice: why === "blocked"
          ? (ta ? "இந்தத் தளத்திற்கு மைக் தடுக்கப்பட்டுள்ளது: முகவரிப் பட்டியில் அனுமதியுங்கள். அதுவரை தட்டச்சு செய்யுங்கள்." : "The microphone is blocked for this site: allow it in the address bar. Until then, type your question.")
          : (ta ? "மைக்கைத் திறக்க முடியவில்லை. தட்டச்சு செய்யுங்கள்." : "The microphone could not be opened. Type your question.") });
      },
      onEndSession: () => { setMode("off"); },
      onHold: () => { setNarrating(false); setReading(null); },
      onNameOnly: () => { const l = listenLangRef.current; captionRibbon.current = false; hud.set({ ribbon: l === "ta" ? "சொல்லுங்கள்…" : "Yes?", faint: "" }); earcon("open"); engagedNow(); },
      rules: (t) => {
        const w = worldRef.current;
        const q = quickScreen(t, w);
        const u = q ? null : understand(t, buildState(), w, { speechConf: 0.95 });
        return { sure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(t, w) };
      },
      lastTurnAt: () => lastTurnAt.current,
      // v4 ears (lane L4): the open Stage's names go with the audio; a yes awaited makes "yes" over the voice an answer; a sentence not
      // transcribed in time is said calmly to be missed
      vocab: () => vocabOf(stageRef.current),
      wantsYes: () => !!pendingBRef.current,
      onMissed: () => notHeardRef.current(),
      // the live captions run only while an addressed sentence is being heard (v4, defect 10): they start with the speech when the
      // conductor says it is engaged, or while a spoken yes is awaited, and stop at its end (they send room audio to the browser's service)
      onSpeechStart: (o: { engaged: boolean }) => {
        speechEngaged.current = o.engaged;
        captions.current?.speechStart({ on: modeRef.current === "on", engaged: o.engaged, awaitingYes: !!pendingBRef.current });
      },
      onSpeechEnd: () => { captions.current?.speechEnd(); },
      onVoice: (e, p, ack) => {
        if (e === "start") {
          hud.strip({ path: p ?? null });
          jvMark("firstAudio");
          if (!ack) { findingAt.current = performance.now(); jvMark("finding"); if (utterEnd2.current) { hud.strip({ findingMs: Math.round(performance.now() - utterEnd2.current) }); utterEnd2.current = null; } }
        }
        engagedNow();
      },
      mark: (name, t) => {
        if (name === "vadEnd") {
          utterEnd.current = t; utterEnd2.current = t;
          // the end of a sentence said to Jarvis is heard at once: a short earcon (the ears are told first, so it never counts as
          // speech: mouth.ts earconEnd), not a word it has not earned. Never for side talk
          const engaged = speechEngaged.current ?? (lastTurnAt.current != null && Date.now() - lastTurnAt.current <= 20_000);
          speechEngaged.current = null;
          if (engaged || pendingBRef.current) earconEnd();
        }
        if (SPEC) (window as unknown as { __jv?: { marks: { name: string; t: number }[] } }).__jv?.marks.push({ name, t });
      }
    });
    onEarcon = () => c.earcon();
    conductor.current = c;
    return c;
  };

  /**
   * Mode on warms the voice for the language and the planner's prompt cache (v4), once: fire and forget, an error or an older
   * server with no /warm changes nothing. Not again within a minute (a mute and unmute is not a new session). The dev test
   * console has its own agent, so the real planner is not warmed from it.
   */
  const warmedAt = useRef(0);
  const warmUp = (lang: Lang) => {
    if (Date.now() - warmedAt.current < 60_000) return;
    warmedAt.current = Date.now();
    try { warmVoice(lang); } catch { /* no voice to warm */ }
    const agent = hostRef.current.agentUrl;
    if (!agent || agent === "/api/collector/thunai/agent") fetch("/api/jarvis/warm", { method: "POST" }).catch(() => undefined);
  };

  /** Turn Jarvis mode on, off, or mute it. Off and muted stop the microphone's tracks: nothing listens. */
  const setMode = useCallback((next: JarvisMode, why?: "hidden" | "boot") => {
    const prev = modeRef.current;
    if (prev === next) return;
    modeRef.current = next;
    setModeState(next);
    hud.set({ mode: next, notice: null, ...(next === "off" ? { ribbon: "", answer: "", asked: "", doing: "", faint: "", panels: [], steps: [], needsResume: false, focus: null, firstUse: false, typing: false, engagedUntil: 0,
      acting: false, caption: null, evidence: null, mission: null, interjection: null, queue: 0 } : {}) });
    if (next !== "off" && !onRef.current) switchOn(true); // eslint-disable-line @typescript-eslint/no-use-before-define
    if (next === "on") {
      setMicBlocked(false);
      hud.set({ denied: false, needsResume: false });
      warmUp(listenLangRef.current);
      // the first time, the notice comes before the microphone: it opens when the Collector has read it
      if (!store.get("jarvis-mode-seen")) { hud.set({ firstUse: true }); return; }
      // the power-on's sound: one short synthesised tone, once a session, heard as an earcon so it cannot trigger a barge-in
      try { if (why !== "hidden" && sessionStorage.getItem("jarvis-powered") !== "1") setTimeout(() => earcon("open"), 40); } catch { /* no storage: no tone */ }
      openMic();
    } else {
      conductor.current?.close();
      captions.current?.stop();
      captions.current = null;
      // closed means closed: the voice stops, any screen goes, and the dashboard is as it was
      if (next === "off") { stopMission({ say: false, drop: true }); stopSpeaking(); cancelTurn(); closeStageRef.current(); setAskOnce(null); setPendingB(null); setPanel(null); setChips([]); setOffer(null); setBriefShown(null); interjected.current = null; queued.current = []; setOn(false); setPhase("off"); setReply(""); }
      setActivity("idle");
      setInterim("");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** The microphone opens: the ears. The live captions are made ready here and run only while a sentence to Jarvis is heard. */
  const openMic = () => {
      const c = conductorOf();
      void c.open().then(() => {
        hud.strip({ detector: c.detector, echo: c.echoCancel });
        // the brief, once a session, after the power-on
        powerOnBrief();
        // the answer can start before the first click after a reload: the browser may need a gesture for audio
        if (c.needsGesture) hud.set({ needsResume: true });
      }).catch(() => undefined);
      if (!captions.current) {
        captions.current = new HearingCaptions(() => (canCaption() ? new Captions(listenLangRef.current === "ta" ? "ta-IN" : "en-IN", (t) => {
          if (modeRef.current !== "on") return;
          // the partials help the conductor tell a finished command from a pause (its end of utterance); the ribbon shows them
          conductor.current?.partial(t);
          if (conductor.current?.state === "hearing") { captionRibbon.current = true; hud.set({ ribbon: t }); setInterim(t); }
        }) : null));
      }
  };
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const closeStageRef = useRef(closeStage);
  closeStageRef.current = closeStage;
  /** something asks Jarvis to show an answer (a chat answer, a pinned screen): its bar comes up with the microphone off */
  const openQuiet = () => { if (modeRef.current === "off") setModeRef.current("muted"); };
  /** the Panel's mic, Ctrl+Shift+Space (hudview.ts isListenKey), the Stage's mic: they all mean "listen" */
  const startListening = useCallback(() => setMode("on"), [setMode]);

  // the answer is on screen as soon as it exists; the core and the strip follow the real state
  const busyNow = phase === "thinking" || phase === "acting";
  useEffect(() => {
    hud.set({ core: mode === "on" && (narrating || phase === "speaking") && turnState !== "holding" && turnState !== "interrupted" && turnState !== "hearing" ? "speaking" : coreOf(mode, turnState, busyNow, offline),
      // a plan step (or a mission's step) runs in the console, not only thinking: the core and the bar's glow say so
      acting: phase === "acting" || missionRunning });
  }, [mode, turnState, busyNow, narrating, phase, offline, missionRunning]);
  // two speeds (v4): a turn still working after 10 s shows its running steps and a Stop (turnstate.ts longTurn). Nothing ticks
  // before then, so a quick answer re-draws nothing and shows no "thinking"
  const longBusy = busyNow || !!stageBusy;
  const [longMs, setLongMs] = useState(0);
  useEffect(() => {
    if (!longBusy) { setLongMs(0); return; }
    const t0 = performance.now();
    let tick: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => {
      setLongMs(performance.now() - t0);
      tick = setInterval(() => setLongMs(performance.now() - t0), 1000);
      // said once, numberless, only while the ears wait for this answer and nothing else is being said (mouth.ts speakAck refuses otherwise)
      if (modeRef.current === "on" && outMode === "voice" && conductor.current?.state === "thinking") speakAck(listenLangRef.current === "ta" ? "இன்னும் பார்க்கிறேன்." : "Still working on it.", listenLangRef.current);
    }, LONG_TURN_MS);
    return () => { clearTimeout(first); if (tick) clearInterval(tick); };
  }, [longBusy]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // a dashboard command's short line ("Opened Trends") is said and kept in the list, but it opens no card over the dashboard
    if (reply && reply !== ackText.current) hud.set(navTurn.current ? { doing: "" } : { answer: reply, doing: "" });
    // a turn just ended: the 20 s of being engaged run from here (turning the mode on is not a turn)
    if (wasBusy.current && mode === "on") { engagedNow(); wasBusy.current = false; }
  }, [phase, reply, mode]);

  // "Hi Jarvis": closed, the browser's own speech service listens for the name and nothing else (wake.ts). It starts once the first-use
  // notice has been read and the microphone is allowed (a page cannot ask for it unprompted); never while the tab is hidden
  useEffect(() => {
    if (mode !== "off" || !canWake() || store.get("jarvis-mode-seen") !== "1") return;
    let stop: (() => void) | null = null, allowed = false, dead = false;
    const begin = () => {
      if (dead || !allowed || document.hidden || stop) return;
      stop = startWake({
        onWake: (rest) => {
          stop = null;
          setModeRef.current("on");
          engagedNow();
          earcon("open");
          // the question said in the same breath ("Hi Jarvis, show the severe cases")
          if (rest) { via.current = "voice"; setTimeout(() => void handleRef.current(rest, 0.95), 60); }
        },
        onFail: () => { stop = null; }
      });
    };
    const vis = () => { if (document.hidden) { stop?.(); stop = null; } else begin(); };
    (navigator.permissions as Permissions | undefined)?.query({ name: "microphone" as PermissionName }).then((st) => { if (st.state === "granted") { allowed = true; begin(); } }).catch(() => undefined);
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; stop?.(); document.removeEventListener("visibilitychange", vis); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const click = (e: Event) => {
      if (!hud.get().needsResume) return;
      // the button and the shortcut turn the mode on themselves: resuming first would make them toggle it off
      const k = e as KeyboardEvent;
      if (e.type === "keydown" && (k.ctrlKey || k.shiftKey || k.altKey || k.metaKey || /^(Control|Shift|Alt|Meta)$/.test(k.key))) return;
      if ((e.target as Element | null)?.closest?.(".jvf")) return;
      hud.set({ needsResume: false });
      if (modeRef.current === "on") void conductor.current?.resumeAudio();
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
      const d = (e as CustomEvent<{ mode?: JarvisMode; toggle?: boolean; mute?: boolean }>).detail ?? {};
      if (d.mode) setModeRef.current(d.mode);
      else if (d.toggle) setModeRef.current(modeRef.current === "off" ? "on" : "off");
      else if (d.mute) setModeRef.current(modeRef.current === "muted" ? "on" : modeRef.current === "on" ? "muted" : "off");
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
    // asked each time Jarvis opens: the server also works out the district's overviews then, ahead of the first question
    fetch("/api/collector/thunai/world").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !ref.cats.length) setRef(j); }).catch(() => undefined);
    warmVoices();
  }, [loadMemory, ref.cats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jarvis listens and answers in the site's language (the top bar's English / தமிழ்), changed there or by voice
  useEffect(() => { setListenLang(uiLang === "ta" ? "ta" : "en"); }, [uiLang]);

  useEffect(() => { listenLangRef.current = listenLang; captions.current?.setLang(listenLang === "ta" ? "ta-IN" : "en-IN"); }, [listenLang]);

  // the panel slides in over the page at the right, as the chat always did (the dashboard keeps its size); Jarvis's
  // screens open beside it
  useEffect(() => {
    // there is no side panel: a screen has the whole width
    document.documentElement.style.setProperty("--jv-w-open", "0px");
    document.documentElement.classList.toggle("jv-hud", mode !== "off");
    window.dispatchEvent(new CustomEvent("jarvis:state", { detail: { open: on, width: 0, conv, resting: false, hud: mode !== "off", mic: micBlocked ? "blocked" : conv ? "on" : "off" } }));
  }, [on, conv, micBlocked, mode]);
  // other parts of the console open Jarvis: to talk, or with the keyboard's box open
  useEffect(() => {
    const t = (e: Event) => {
      const d = (e as CustomEvent<{ focus?: boolean; talk?: boolean } | undefined>).detail ?? {};
      if (d.talk) startListening(); else openQuiet();
      if (d.focus) hud.set({ typing: true });
    };
    window.addEventListener("jarvis:toggle", t);
    return () => window.removeEventListener("jarvis:toggle", t);
  }, [startListening]); // eslint-disable-line react-hooks/exhaustive-deps
  // an answer's chart in the chatbot's Jarvis tab presses the console's controls, here
  useEffect(() => {
    const f = (e: Event) => cardAction((e as CustomEvent<ConsoleAction>).detail);
    window.addEventListener("jarvis:card-action", f);
    return () => window.removeEventListener("jarvis:card-action", f);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenMuted = useRef(false);

  // the chatbot (Ask District IQ) hands a question over to be shown on screen: "Show on screen" on a chat answer
  useEffect(() => {
    const show = (e: Event) => {
      const q = String((e as CustomEvent<string>).detail ?? "").trim();
      if (!q) return;
      openQuiet();
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


  // keyboard: Ctrl+Shift+J turns Jarvis mode on and off; Ctrl+Shift+M mutes; Ctrl+Shift+Space turns it on to listen (Alt+Space opens
  // the window's menu on Windows); Esc stops; Ctrl+Z undoes
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      if (isListenKey(e)) {
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
  }, [switchOn, startListening, phase, listenLang, narrating, stageBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  // the numbered badges follow the page while shown: re-read when the page changes outside Jarvis's own layer, a resize or a scroll
  // (layoutwatch.ts), at most once a frame, and re-drawn only when a badge moved
  const showingNumbers = !!numbers;
  useEffect(() => {
    if (!showingNumbers) return;
    return followLayout(() => setNumbers((n) => { if (!n) return n; const items = clickables(); return samePlaces(n.items, items) ? n : { ...n, items }; }), { ignore: "[data-thunai-ui]" });
  }, [showingNumbers]);

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
      if (hr >= 7 && hr < 10 && store.get("thunai-greeted") !== today && !briefedPage) {
        store.set("thunai-greeted", today);
        const counts = (h.ov.severity?.counts ?? {}) as Record<string, number>;
        const g = { severe: counts.Severe ?? 0, alerts: bell.length };
        signals.push({ key: `greet:${today}`, kind: "greeting", lifeSafety: false, impact: 0.8, urgency: 0.9, confidence: 1, novelty: 1, actionability: 0.9, level: 1,
          text: { en: line("greet", "en", g), ta: line("greet", "ta", g) } });
      }
      for (const s of signals.sort((a, b) => band(b).localeCompare(band(a)))) {
        if (watchMaySpeak(s, mem, now, { quiet: outMode === "quiet", lastUserSpeech: lastUserSpeech.current }) && phase !== "listening" && phase !== "acting" && !heldBack(liveNow())) {
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

  // the server's watch (v4, lane P2): every two minutes the signals, the queue's badge and the one candidate; the candidate is said only
  // when the live state allows it (interject). Nothing is fetched while Jarvis is off
  useEffect(() => {
    if (mode === "off") return;
    let dead = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/collector/thunai/watch?quiet=${outModeRef.current === "quiet" ? 1 : 0}`);
        if (!r.ok || dead) return;
        const j = await r.json() as { signals?: WatchSignal[]; queue?: string[]; badge?: number; candidate?: WatchSignal | null };
        const inQueue = new Set(Array.isArray(j.queue) ? j.queue : []);
        queued.current = (Array.isArray(j.signals) ? j.signals : []).filter((x) => inQueue.has(x.key));
        hud.set({ queue: Number.isFinite(j.badge) ? Number(j.badge) : queued.current.length });
        interjectRef.current(j.candidate ?? null);
      } catch { /* offline: the badge stays as it was */ }
    };
    const first = setTimeout(() => void tick(), 20_000);
    const t = setInterval(() => void tick(), 120_000);
    return () => { dead = true; clearTimeout(first); clearInterval(t); };
  }, [mode === "off"]); // eslint-disable-line react-hooks/exhaustive-deps
  // performance (v4): no 22 px viewport blur behind the Stage on four cores or fewer, or under reduced motion (stage.css .jv-lowfx), set once
  useEffect(() => {
    try { document.documentElement.classList.toggle("jv-lowfx", lowFx(navigator.hardwareConcurrency, !!reduced())); } catch { /* no document */ }
  }, []);

  const openTrail = async () => {
    try { const r = await fetch("/api/collector/thunai/audit"); if (r.ok) { setTrail(await r.json()); setPanel("trail"); } } catch { /* offline */ }
  };

  // --------------------------------------------------------------- render --
  if (!mounted) return null;
  const ta = listenLang === "ta";
  const steps = chips.length > 0 && (phase === "acting" || phase === "thinking") ? (
    <div className="th-chips jv-steps">
      {chips.map((c, i) => <span key={c.id} className={`th-chip ${c.state}`}>{c.state === "done" ? "✓ " : c.state === "failed" ? "✕ " : ""}{c.label}{i < chips.length - 1 ? <i>→</i> : null}</span>)}
    </div>
  ) : null;
  // past 10 s: the turn's real steps (the plan's while it acts, else the work timeline) and a Stop that cancels it, as Esc does
  const progress: ProgressRow[] = phase === "acting" && chips.length
    ? chips.map((c) => ({ id: String(c.id), label: c.label, state: c.state, ms: null }))
    : hud.get().steps.map((s) => ({ id: s.id, label: s.label, state: s.state, ms: s.ms }));
  const long = longTurn(longBusy ? longMs : 0, progress);
  const longCard = long.show ? (
    <div className="th-card" role="status" aria-live="polite" data-testid="long-turn" lang={listenLang}>
      <p>{ta ? `இன்னும் வேலை செய்கிறேன் · ${long.seconds} வி` : `Still working · ${long.seconds} s`}</p>
      {long.rows.length > 0 && (
        <ol style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 13 }}>
          {long.rows.map((r) => <li key={r.id}>{r.state === "done" ? "✓ " : r.state === "failed" ? "✕ " : r.state === "running" ? "… " : ""}{r.label}{r.ms != null ? ` (${(r.ms / 1000).toFixed(1)} s)` : ""}</li>)}
        </ol>
      )}
      <div className="row"><button className="primary" onClick={interrupt}>{ta ? "நிறுத்து" : "Stop"}</button></div>
    </div>
  ) : null;
  const waiting = longCard || askOnce || pendingB || tray.length > 0 || steps || offer || briefShown ? (
    <>
      {longCard}
      {steps}
      {briefShown && (
        <section className="th-card" role="group" aria-label={ta ? "சுருக்கம்" : "The brief"} data-testid="brief" lang={listenLang}>
          {briefShown.bottom && <p><b>{briefShown.bottom}</b></p>}
          {briefShown.items.length > 0 && (
            <ol style={{ margin: "4px 0 8px", paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
              {briefShown.items.map((x) => <li key={x.id} data-sev={x.severity}>{x.text}{x.source && <small style={{ display: "block", opacity: 0.75 }}>{x.source}{x.fresh ? ` · ${x.fresh}` : ""}</small>}</li>)}
            </ol>
          )}
          <p style={{ opacity: 0.8 }}>{briefShown.end}</p>
          <div className="row"><button onClick={() => setBriefShown(null)}>{ta ? "மூடு" : "Close"}</button></div>
        </section>
      )}
      {offer && !askOnce && !pendingB && (
        <div className="th-card" role="group" aria-label={offer.say[offer.lang]} data-testid="next-step" lang={offer.lang}>
          <p>{offer.say[offer.lang]}</p>
          <div className="row">
            <button className="primary" onClick={takeOffer}>{offer.lang === "ta" ? "சரி" : "Yes"}</button>
            <button onClick={() => setOffer(null)}>{offer.lang === "ta" ? "வேண்டாம்" : "No thanks"}</button>
          </div>
        </div>
      )}
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
          <p className="hint">{ta ? "அனுப்ப கீழே தட்டுங்கள். குரலால் அனுப்ப முடியாது." : "Tap Approve to send. Jarvis cannot send by voice."}</p>
          <div className="row">
            <button className="primary" onClick={() => void sendTray(tray.length, listenLang, "tap")}>{ta ? `${tray.length} அனுப்பு` : `Approve and send ${tray.length}`}</button>
            <button onClick={() => { setTray([]); setTrayShownAt(null); setPhase("ready"); }}>{ta ? "நீக்கு" : "Discard"}</button>
          </div>
        </div>
      )}
    </>
  ) : null;
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

      {mode !== "off" && (
        <Hud lang={listenLang} coreRef={orbRef} stageOpen={!!stage} onSend={(t) => { via.current = "typed"; void handle(t, 0.95); }} onDismissFirstUse={() => { store.set("jarvis-mode-seen", "1"); hud.set({ firstUse: false }); if (modeRef.current === "on") { setTimeout(() => earcon("open"), 40); openMic(); } }}
          onStop={interrupt} onMute={() => setMode(mode === "muted" ? "on" : "muted")} onClose={() => setMode("off")}>{waiting}</Hud>
      )}

      {on && panel && (
        <aside className="th-panel" aria-label={panel}>
          <header>
            <b>{panel === "memory" ? (ta ? "ஜார்விஸின் நினைவு" : "What Jarvis remembers") : panel === "trail" ? (ta ? "தணிக்கைப் பதிவு" : "Audit trail") : (ta ? "சொல்லக்கூடியவை" : "Things to say")}</b>
            <button aria-label="Close" onClick={() => setPanel(null)}>×</button>
          </header>
          {panel === "memory" && (
            <div className="body">
              {!memory?.notes.length && !memory?.reminders.length && !Object.keys(memory?.habits ?? {}).length && <p className="muted">{ta ? "இன்னும் எதுவும் இல்லை." : "Nothing yet."}</p>}
              {!!memory?.notes.length && <><h4>{ta ? "குறிப்புகள்" : "Notes"}</h4><ul>{memory.notes.map((n) => <li key={n.id}>{n.text}<button onClick={() => void changeMemory({ op: "forget", id: n.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!memory?.reminders.filter((r) => !r.done).length && <><h4>{ta ? "நினைவூட்டல்கள்" : "Reminders"}</h4><ul>{memory.reminders.filter((r) => !r.done).map((r) => <li key={r.id}>{whenOf(r.at)}: {r.text}<button onClick={() => void changeMemory({ op: "forget", id: r.id })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!Object.keys(memory?.habits ?? {}).length && <><h4>{ta ? "கற்றவை" : "Learned"}</h4><ul>{Object.entries(memory!.habits).map(([k, v]) => <li key={k}>“{k}” → {v} <em>{ta ? "கற்றது" : "learned"}</em><button onClick={() => void changeMemory({ op: "forget", id: k })}>{ta ? "மற" : "Forget"}</button></li>)}</ul></>}
              {!!memory?.follows?.length && <><h4>{ta ? "கவனிப்பவை" : "Following"}</h4><ul>{memory.follows.map((x) => <li key={x.id}>{x.kind === "zone" ? (worldRef.current.zones.find((z) => String(z.n) === String(x.ref))?.[ta ? "ta" : "name"] ?? x.ref) : (ta ? "ஒரு கேஸ்" : "A case")}<button onClick={() => void post("/api/collector/thunai/follow", { op: "unfollow", id: x.id, yes: true }).then(() => loadMemory()).catch(() => undefined)}>{ta ? "நிறுத்து" : "Unfollow"}</button></li>)}</ul></>}
              {memList.some((x) => x.kind === "mute" || x.kind === "tell") && <><h4>{ta ? "அறிவிப்பு விருப்பங்கள்" : "Alert choices"}</h4><ul>{memList.filter((x) => x.kind === "mute" || x.kind === "tell").map((x) => <li key={x.id}>{x.text}<button onClick={() => void post("/api/collector/thunai/watch", { op: "pref", pref: "unmute", target: x.id, yes: true }).then(() => setMemList((l) => l.filter((y) => y.id !== x.id))).catch(() => undefined)}>{ta ? "நீக்கு" : "Undo"}</button></li>)}</ul></>}
              <button className="danger" onClick={() => void changeMemory({ op: "reset", yes: true })}>{ta ? "எல்லாம் மற" : "Forget everything"}</button>
            </div>
          )}
          {panel === "trail" && trail && (
            <div className="body">
              <p className={trail.intact ? "ok" : "bad"}>{trail.intact ? (ta ? "சங்கிலி முழுமையாக உள்ளது." : "Chain intact: no line was changed.") : (ta ? "சங்கிலி உடைந்துள்ளது!" : "Chain broken: a line was changed.")}</p>
              <ol className="trail">{[...trail.lines].reverse().slice(0, 60).map((l, i) => <li key={i}><time>{whenOf(l.at)}</time><span className={`risk r${l.risk}`}>{l.risk}</span>{l.heard ?? "—"}<small>{l.outcome}</small></li>)}</ol>
            </div>
          )}
          {panel === "help" && (
            <div className="body help">
              <p className="muted">{ta ? "\"ஹாய் ஜார்விஸ்\" என்று சொல்லி சாதாரணமாகப் பேசுங்கள். உதாரணங்கள்:" : "Say \"Hi Jarvis\" and just talk. For example:"}</p>
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
        <Stage doc={stage} lang={listenLang} theme={host.theme ?? "light"} busy={stageBusy} reading={reading} narrating={narrating} views={stageViews} pins={pins} geo={geo ?? host.c.geo}
          tray={tray.map((d) => ({ incidentId: d.incidentId, title: d.title, to: d.to, sandbox: d.sandbox }))} brain={stageBrain} filtered={stageFilter} saveAsk={pendingB ? saveAsk : null}
          caption={{ heard: interim || heard, reply: phase === "listening" ? "" : reply, alt: phase === "listening" ? "" : alt, interim: !!interim,
            by: brain && phase !== "thinking" && phase !== "listening" ? (brain.by === "ai" ? `${ta ? "AI" : "Understood by AI"}${brain.model ? ` · ${brain.model.replace(/^.*\//, "").replace(/#\d+$/, "")}` : ""}${brain.ms ? ` · ${(brain.ms / 1000).toFixed(1)} s` : ""}` : brain.by === "instant" ? (ta ? "உடனடி" : "Instant, no model") : (ta ? "விதிகள்" : "Built-in rules")) : null }}
          a={stageActions} />
      )}

    </div>,
    document.body
  );
}
