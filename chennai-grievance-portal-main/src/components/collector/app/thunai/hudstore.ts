/**
 * What the HUD shows, kept outside React's state so the microphone's level does not re-draw the console twenty times a
 * second. Plain subscribe and snapshot, for useSyncExternalStore; the canvas reads level() directly on each frame.
 */
import type { TurnState } from "@/lib/thunai/turn";

export type JarvisMode = "off" | "on" | "muted";
export type CoreState = "idle" | "listening" | "hearing" | "thinking" | "speaking" | "holding" | "interrupted" | "offline" | "off";

export interface WorkStep { id: string; label: string; state: "running" | "done" | "failed"; ms: number | null; at: number }
export interface HudPanel { id: string; title: string; takeaway: string | null; figures: { label: string; value: number; unit: string | null }[]; source: string | null; recipe: string; at: number; slots?: Record<string, unknown> }
export interface HudState {
  mode: JarvisMode;
  turn: TurnState;
  core: CoreState;
  /** the live transcript under the core */
  ribbon: string;
  /** a sentence the gate turned away: shown faint for two seconds, then gone */
  faint: string;
  /** the answer in words, as soon as it exists, whatever the voice is doing */
  answer: string;
  /** the question that answer belongs to, for the corner card */
  asked: string;
  /** what Jarvis is doing about it now, in a few words ("Putting them side by side") */
  doing: string;
  /** until when it takes a sentence without its name (0: it needs "Hi Jarvis" first) */
  engagedUntil: number;
  /** v11: "Hi Jarvis" opened Jarvis and its microphone is being handed over (the audio after the name is kept: ears.ts parkWake) */
  wakeOpening?: boolean;
  /** the keyboard's box is open */
  typing: boolean;
  steps: WorkStep[];
  /** when the turn now running began (performance.now(): a sentence to Jarvis ended, or a turn started): only its steps show */
  turnAt: number;
  panels: HudPanel[];
  notice: string | null;
  needsResume: boolean;
  denied: boolean;
  firstUse: boolean;
  /** the system strip: real numbers only */
  strip: { lastMs: number | null; ackMs: number | null; findingMs: number | null; provider: string | null; freshness: string | null; ambient: number; budgetLow: boolean; tokens: number | null; path: string | null; detector: string | null;
    /**
     * the echo cancellation the microphone really got (ears.ts echoApplied: "all", "remote-only", "on", "off", "unknown"), once it
     * opened; shown only in the measurement view (measureLines), never in the bottom bar
     */
    echo: string | null };
  /** the place being discussed, for the map's reticle */
  focus: { label: string; lat: number | null; lon: number | null; zone: number | null; pulses?: { lat: number; lon: number }[] } | null;

  // ---- v4, Pillar 6 (lane H2): what the bar shows besides the state. Thunai.tsx writes these, the HUD only reads them.
  /** a plan step runs in the console (the turn's phase is "acting"), not only thinking: the core and the bar's glow say so */
  acting: boolean;
  /** the words being said now and the character the voice is on (the speech engine's word boundary), for the bar's captions */
  caption: HudCaption | null;
  /** where the answer on screen came from, every value from code (evidenceOf in hudview.ts), shown as one chip under it */
  evidence: HudEvidence | null;
  /** a mission's plan (Start / Edit), then its steps ticking with their real times */
  mission: HudMission | null;
  /** a signal Jarvis raises unprompted: one line, after the chime, with Tell me and Later */
  interjection: HudInterjection | null;
  /** the signals waiting in the queue, shown as a badge */
  queue: number;
  /** what the HUD's v4 buttons call: Thunai.tsx sets them (hud.actions) */
  actions: HudActions;
}

const START: HudState = {
  mode: "off", turn: "off", core: "off", ribbon: "", faint: "", answer: "", asked: "", doing: "", engagedUntil: 0, typing: false, steps: [], turnAt: 0, panels: [], notice: null, needsResume: false, denied: false, firstUse: false,
  strip: { lastMs: null, ackMs: null, findingMs: null, provider: null, freshness: null, ambient: 0, budgetLow: false, tokens: null, path: null, detector: null, echo: null }, focus: null,
  // ---- v4, Pillar 6 (lane H2)
  acting: false, caption: null, evidence: null, mission: null, interjection: null, queue: 0, actions: {}
};

let state: HudState = START;
const subs = new Set<() => void>();
let micLevel = 0;

export const hud = {
  get: () => state,
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  set: (p: Partial<HudState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); },
  strip: (p: Partial<HudState["strip"]>) => hud.set({ strip: { ...state.strip, ...p } }),
  step: (s: Pick<WorkStep, "id" | "label"> & Partial<WorkStep>) => {
    const now = performance.now();
    const old = state.steps.find((x) => x.id === s.id);
    const next: WorkStep = old
      ? { ...old, ...s, ms: s.state && s.state !== "running" ? Math.round(now - old.at) : old.ms }
      : { state: "running", ms: null, at: now, ...s };
    hud.set({ steps: old ? state.steps.map((x) => (x.id === s.id ? next : x)) : [...state.steps, next].slice(-7) });
  },
  clearSteps: () => hud.set({ steps: [] }),
  // one answer at a time: earlier ones go to the chatbot's Jarvis tab, they never stack over the dashboard
  panel: (p: HudPanel) => hud.set({ panels: [p] }),
  level: () => micLevel,
  setLevel: (v: number) => { micLevel = v; },

  // ---- v4, Pillar 6 (lane H2): setters for the bar's captions, the cards and their buttons
  /** a new piece of speech starts (the exact text the voice says): its word comes with captionWord; null clears the line */
  caption: (text: string | null, lang: "en" | "ta" = "en") => hud.set({ caption: text ? { text, char: null, lang } : null }),
  /** the voice reached this character of the caption's text (SpeechSynthesisUtterance's boundary charIndex) */
  captionWord: (char: number) => { if (state.caption && state.caption.char !== char) hud.set({ caption: { ...state.caption, char } }); },
  /** the callbacks the cards and the evidence chip call; merged, so each can be set on its own */
  actions: (p: Partial<HudActions>) => hud.set({ actions: { ...state.actions, ...p } }),
  /** one mission step moves on (by index), with the time code measured */
  missionStep: (i: number, p: Partial<HudMissionStep>) => {
    const m = state.mission;
    if (!m || !m.steps[i]) return;
    hud.set({ mission: { ...m, steps: m.steps.map((x, k) => (k === i ? { ...x, ...p } : x)) } });
  }
};

/** the core's shape, from the mode and whose turn it is */
export function coreOf(mode: JarvisMode, turn: TurnState, busy: boolean, offline: boolean): CoreState {
  if (offline) return "offline";
  if (mode !== "on") return mode === "muted" ? "idle" : "off";
  if (turn === "interrupted") return "interrupted";
  if (turn === "holding") return "holding";
  if (turn === "speaking" || turn === "paused") return "speaking";
  if (turn === "hearing") return "hearing";
  if (turn === "thinking" || busy) return "thinking";
  return turn === "off" ? "idle" : "listening";
}

/** the microphone is open: the conductor leaves "off" only once the tracks are live, and goes back when they stop */
export const micOpen = (s: Pick<HudState, "mode" | "turn">) => s.mode === "on" && s.turn !== "off";

/** What Jarvis is doing, and what the Collector can do now, in words: nobody should have to guess whether to say its name. */
export function statusOf(s: Pick<HudState, "mode" | "core" | "firstUse" | "doing" | "engagedUntil"> & { denied?: boolean; wakeOpening?: boolean }, ta: boolean, now: number): { word: string; hint: string } {
  const t = (en: string, tamil: string) => (ta ? tamil : en);
  if (s.mode === "muted" && s.denied) return { word: t("Microphone blocked", "மைக் தடுக்கப்பட்டுள்ளது"), hint: "" };
  if (s.mode === "muted") return { word: t("Muted", "மௌனம்"), hint: t("I can't hear you. Press Unmute to talk.", "எனக்குக் கேட்காது. பேச \"மைக்கைத் திற\" அழுத்துங்கள்.") };
  switch (s.core) {
    case "listening": return now < s.engagedUntil
      ? { word: t("Listening", "கேட்கிறேன்"), hint: t("Go ahead, no need to say my name.", "சொல்லுங்கள், பெயர் சொல்ல வேண்டாம்.") }
      : { word: t("Listening", "கேட்கிறேன்"), hint: t("Say \"Hi Jarvis\", then your question.", "\"ஹாய் ஜார்விஸ்\" என்று சொல்லி கேளுங்கள்.") };
    case "hearing": return { word: t("Hearing you", "நீங்கள் பேசுவதைக் கேட்கிறேன்"), hint: "" };
    case "thinking": return { word: t("Working on it", "பார்க்கிறேன்"), hint: s.doing };
    case "speaking": return { word: t("Answering", "பதில் சொல்கிறேன்"), hint: t("Talk any time to stop me.", "எப்போது வேண்டுமானாலும் பேசி நிறுத்தலாம்.") };
    case "holding": return { word: t("Waiting", "காத்திருக்கிறேன்"), hint: t("Say \"continue\" to hear the rest.", "மீதியைக் கேட்க \"தொடர்\" என்று சொல்லுங்கள்.") };
    case "interrupted": return { word: t("Stopped", "நிறுத்தினேன்"), hint: "" };
    case "offline": return { word: t("Offline", "இணைப்பு இல்லை"), hint: t("I can't hear right now. You can still type.", "இப்போது கேட்க முடியவில்லை. தட்டச்சு செய்யலாம்.") };
    // v11: after "Hi Jarvis" the microphone is handed over with the audio after the name kept (ears.ts parkWake): the Collector is told to talk,
    // not to wait. Opened any other way, it is not live yet (a permission prompt may be up), and says so
    default: return s.firstUse ? { word: t("Mic closed", "மைக் மூடியது"), hint: "" }
      : s.wakeOpening && s.mode === "on" ? { word: t("Listening", "கேட்கிறேன்"), hint: t("Go ahead.", "சொல்லுங்கள்.") } : { word: t("Opening the microphone", "மைக்கைத் திறக்கிறேன்"), hint: "" };
  }
}

/**
 * v5 (D2): the measurement view's lines (JarvisLogView; never the bottom bar, rule 6): the echo canceller the microphone really got
 * (strip.echo, from the track's settings) and the last turn's trace, ms from its last voiced sample (trace.ts traceRows). Timings and
 * the setting only, no words; nothing when nothing was measured.
 */
export function measureLines(echo: string | null, last: { rows: { stage: string; ms: number }[]; lane: string | null } | null, ta: boolean): string[] {
  const out: string[] = [];
  if (echo) out.push(`${ta ? "எதிரொலி நீக்கம்" : "Echo cancellation"}: ${echo}`);
  const rows = (last?.rows ?? []).filter((r) => r.stage !== "voicedEnd");
  if (last && rows.length) out.push(`${ta ? "கடைசி முறை" : "Last turn"}${last.lane ? ` (${last.lane})` : ""}: ${rows.map((r) => `${r.stage} ${r.ms} ms`).join(" · ")}`);
  return out;
}

/** the power-on plays once a session, never with reduced motion */
export const powerOnDue = (reduced: boolean, seen: string | null) => !reduced && seen !== "1";

/**
 * Where Tab goes with a screen open: the Stage's controls, then the HUD's own, then round again. Null leaves it to the browser.
 * Focus outside both (`inside` false) comes back to the Stage; focus in the HUD stays there.
 */
export function tabStop<T>(stage: T[], hudControls: T[], at: T | null, back: boolean, inside: boolean): T | null {
  if (!inside) return stage[0] ?? hudControls[0] ?? null;
  const [stageFirst, stageLast] = [stage[0], stage[stage.length - 1]], [hudFirst, hudLast] = [hudControls[0], hudControls[hudControls.length - 1]];
  if (back) return at === stageFirst ? hudLast ?? stageLast : at === hudFirst ? stageLast ?? hudLast : null;
  return at === stageLast ? hudFirst ?? stageFirst : at === hudLast ? stageFirst ?? hudFirst : null;
}

/** the saved theme, what html goes back to when Jarvis mode ends: it may have changed while the mode was on */
export const savedTheme = (saved: string | null): "dark" | "light" => (saved === "dark" ? "dark" : "light");

// ---- v4, Pillar 6 (lane H2): the shapes of the bar's captions, the evidence chip, the mission and interjection cards

/** the piece of speech being said, exactly as the voice says it, and the character the voice is on (null: no word boundaries) */
export interface HudCaption { text: string; char: number | null; lang: "en" | "ta" }
/** where an answer came from: every value is set by code (hudview.ts evidenceOf), never from a model's words */
export interface HudEvidence {
  /** who understood the question: the built-in rules, an instant local command, or a model */
  by: "rules" | "ai" | "instant";
  /** the model's short id, for "ai" only */
  model: string | null;
  /** end of the question to the answer, measured */
  ms: number | null;
  /** how the figure was found (the screen's method, from screens.ts or stats.ts) */
  method: string | null;
  /** how many records it rests on */
  n: number | null;
  period: "daily" | "weekly" | "monthly" | "quarterly" | null;
  sources: string[];
  asOf: string | null;
}
export type HudMissionStepState = "pending" | "running" | "done" | "skipped" | "failed";
export interface HudMissionStep { label: string; state: HudMissionStepState; ms: number | null }
export interface HudMission { id: string; title: string; steps: HudMissionStep[]; running: boolean }
export interface HudInterjection { id: string; text: string; severity: "high" | "medium" | "low" }
export interface HudActions {
  /** the evidence chip: open the rows or the visual the answer rests on */
  onEvidence?: () => void;
  onMissionStart?: () => void;
  onMissionEdit?: () => void;
  /** stop a running mission, or put away a plan or a finished one */
  onMissionStop?: () => void;
  onTellMe?: (id: string) => void;
  onLater?: (id: string) => void;
  /** "not about this": shown only when set */
  onNotAbout?: (id: string) => void;
  /** the queue's badge: hear what is waiting */
  onQueue?: () => void;
  /** the existing earcon, played once when an interjection card comes up */
  chime?: () => void;
}
