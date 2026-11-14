/**
 * A mission, run (Pillar 4): the plan card waits for the Collector's Start (a tap, or "start", "தொடங்கு", "start pannu"); then each
 * step runs in order through injected hooks (the browser's hands, or a test's fakes) and is said in one code-templated sentence with
 * its real, measured time. During the run the Collector can stop it ("stop": nothing after it runs, and Jarvis says so), skip the
 * step in hand ("skip that"), or change course ("instead show me Adyar's drains": the steps not yet run are replaced by a new plan,
 * the finished ones stay). Before Start, the card can be edited: the plan's own steps, fewer or reordered, never new ones.
 *
 * Level C is only ever `draft`: drafts into the tray, for the Collector's own tap. Nothing here sends, approves or deletes, and the
 * plan itself is re-checked (checkRunnable) before anything runs. Pure, no React, no timers of its own.
 */
import { allowedSet } from "./numbergate";
import { riskOf } from "./risk";
import { checkEdit, checkRunnable, CONSOLE_MOVES, MAX_STEPS, missionRisk, type Bilingual, type MissionPlaceT, type MissionPlanT, type MissionStepT, type TourNoteT } from "./missions.schema";
import { LINES, stepLine, type Line, type StepOutcome } from "./missions.words";
import type { Recipe } from "./stage";
import type { Lang, Step } from "./types";

export type StepState = "pending" | "running" | "done" | "failed" | "skipped" | "stopped";
export type MissionPhase = "idle" | "card" | "running" | "stopped" | "done" | "cancelled";

/** what a screen step built: whether it stood, and the cases it lists (id, past its deadline), for a draft step after it */
export interface ScreenOutcome { ok?: boolean; cases?: { id: string; overdue: boolean }[] }

type Maybe<T> = T | Promise<T>;
export interface MissionHooks {
  /** build and show one screen, quietly (the step's own sentence is said instead of the screen's) */
  showScreen(recipe: Recipe, slots: Record<string, unknown>, signal: AbortSignal): Maybe<ScreenOutcome | void>;
  /** one Level-A console move (page, period, view, panel, mapMode, layer); false when it failed */
  runStep(step: Step, signal: AbortSignal): Maybe<boolean | void>;
  /** point the map (reticle and shading) at a zone or a place; on a tour, with the stop's code-counted figure */
  focusMap(place: MissionPlaceT, tour: TourNoteT | null, signal: AbortSignal): Maybe<void>;
  /** Level C: drafts for these incidents into the tray, never sent; returns what was drafted (ids, or how many) */
  draft(ids: string[], signal: AbortSignal): Maybe<number | string[]>;
  /** say one line; `allowed` holds every figure in it (all put there by code), for the speech gate */
  say(text: string, lang: Lang, allowed: Set<string>): Maybe<void>;
  progress(stepIndex: number, state: StepState, ms: number | null): void;
  /** the plan card, whenever it changes (for the HUD) */
  card?(card: MissionCard): void;
  /** "instead X": a new plan for the rest (the browser posts to /api/collector/thunai/mission with redirect true) */
  plan?(text: string): Promise<unknown>;
  /** the clock the times are measured on (performance.now in the browser) */
  now?(): number;
}

export interface MissionCard {
  id: string; title: Bilingual; lang: Lang; phase: MissionPhase; risk: "A" | "C";
  steps: { id: string; kind: MissionStepT["kind"]; label: Bilingual; risk: "A" | "C"; state: StepState; ms: number | null }[];
}
export interface MissionOutcome { phase: "done" | "stopped" | "cancelled" | "refused"; steps: MissionCard["steps"]; drafted: string[]; ms: number; why?: string }

export interface MissionControl {
  /** the Collector's Start (a tap or a spoken start): false when there is no card waiting */
  start(): boolean;
  /** ends at once: the step in hand is abandoned, nothing after it runs, and the run says it stopped (before Start: the card is dropped) */
  stop(): void;
  /** skips the step in hand (or, between steps, the next one) */
  skip(): void;
  /** replaces the steps not yet run with a new plan for `text` (before Start: the whole card) */
  instead(text: string): void;
  /** before Start only: the plan's own steps, some left out or reordered */
  edit(steps: unknown): { ok: true } | { ok: false; why: string };
  phase(): MissionPhase;
}

interface Inner {
  phase: MissionPhase;
  plan: MissionPlanT | null;
  steps: MissionStepT[];
  states: Map<string, { state: StepState; ms: number | null }>;
  release: () => void;
  started: Promise<void>;
  stopped: boolean;
  stopCtl: AbortController;
  current: AbortController | null;
  skipNext: boolean;
  pending: { p: Promise<MissionPlanT | null> } | null;
  replan: ((text: string) => Promise<MissionPlanT | null>) | null;
  notify: () => void;
  gen: number;
}
const INNER = new WeakMap<MissionControl, Inner>();
const ABORTED = Symbol("aborted");
const defaultNow = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

/** a promise that gives way to an abort (the work itself is not stopped here: the hook has the signal for that) */
function race<T>(p: Promise<T>, signal: AbortSignal): Promise<T | typeof ABORTED> {
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise((res, rej) => {
    const on = () => res(ABORTED);
    signal.addEventListener("abort", on, { once: true });
    p.then((v) => { signal.removeEventListener("abort", on); res(v); }, (e) => { signal.removeEventListener("abort", on); rej(e); });
  });
}

/** a redirect's steps get ids of their own (and its drafts keep pointing at its own lists) */
function renumber(steps: MissionStepT[], gen: number): MissionStepT[] {
  const id = new Map(steps.map((s) => [s.id, `r${gen}${s.id}`.slice(0, 12)]));
  return steps.map((s) => (s.kind === "draft" ? { ...s, id: id.get(s.id) as string, from: s.from ? id.get(s.from) ?? null : null } : { ...s, id: id.get(s.id) as string }));
}

const checked = (raw: unknown): MissionPlanT | null => { const r = checkRunnable(raw); return r.ok ? r.plan : null; };

export function missionControl(): MissionControl {
  let release = () => undefined as void;
  const started = new Promise<void>((res) => { release = res; });
  const inner: Inner = {
    phase: "idle", plan: null, steps: [], states: new Map(), release, started, stopped: false, stopCtl: new AbortController(), current: null, skipNext: false,
    pending: null, replan: null, notify: () => undefined, gen: 0
  };
  const control: MissionControl = {
    start: () => {
      if (inner.phase !== "card" || inner.stopped) return false;
      // the card is no longer editable from this moment, not from when the runner next wakes
      inner.phase = "running";
      inner.release();
      return true;
    },
    stop: () => {
      if (inner.phase === "done" || inner.phase === "stopped" || inner.phase === "cancelled" || inner.stopped) return;
      inner.stopped = true;
      inner.stopCtl.abort();
      inner.current?.abort();
      inner.release();
    },
    skip: () => {
      if (inner.phase !== "running" || inner.stopped) return;
      if (inner.current) inner.current.abort();
      else inner.skipNext = true;
    },
    instead: (text: string) => {
      const t = text.trim();
      if (!t || inner.stopped || !(inner.phase === "card" || inner.phase === "running")) return;
      const p = inner.replan ? inner.replan(t).catch(() => null) : Promise.resolve(null);
      if (inner.phase === "card") {
        void p.then((next) => {
          if (!next || inner.phase !== "card") return;
          inner.steps = renumber(next.steps, ++inner.gen);
          inner.states = new Map(inner.steps.map((s) => [s.id, { state: "pending", ms: null }]));
          inner.notify();
        });
        return;
      }
      inner.pending = { p };
    },
    edit: (steps: unknown) => {
      if (inner.phase !== "card") return { ok: false, why: "the mission has started" };
      const r = checkEdit(inner.steps, steps);
      if (!r.ok) return r;
      inner.steps = r.steps;
      inner.notify();
      return { ok: true };
    },
    phase: () => inner.phase
  };
  INNER.set(control, inner);
  return control;
}

function cardOf(inner: Inner): MissionCard {
  const p = inner.plan as MissionPlanT;
  return {
    id: p.id, title: p.title, lang: p.lang, phase: inner.phase, risk: missionRisk(inner.steps),
    steps: inner.steps.map((s) => ({ id: s.id, kind: s.kind, label: s.label, risk: s.risk, state: inner.states.get(s.id)?.state ?? "pending", ms: inner.states.get(s.id)?.ms ?? null }))
  };
}

/** Runs a mission plan through the hooks once the control's start() is called. */
export async function runMission(plan: unknown, hooks: MissionHooks, control: MissionControl): Promise<MissionOutcome> {
  const inner = INNER.get(control);
  if (!inner || inner.phase !== "idle") throw new Error("a mission control runs one mission");
  const now = hooks.now ?? defaultNow;
  const ok = checkRunnable(plan);
  if (!ok.ok) { inner.phase = "cancelled"; return { phase: "refused", steps: [], drafted: [], ms: 0, why: ok.why }; }
  const p = ok.plan, lang = p.lang;
  inner.plan = p;
  inner.steps = [...p.steps];
  inner.states = new Map(p.steps.map((s) => [s.id, { state: "pending", ms: null }]));
  inner.replan = hooks.plan ? async (text) => checked(await hooks.plan!(text)) : null;
  inner.notify = () => { try { hooks.card?.(cardOf(inner)); } catch { /* the card is only a view */ } };
  inner.phase = "card";
  inner.notify();

  await inner.started;
  const drafted: string[] = [];
  const outcome = (phase: MissionOutcome["phase"], ms: number): MissionOutcome => ({ phase, steps: cardOf(inner).steps, drafted, ms });
  if (inner.stopped) { inner.phase = "cancelled"; inner.notify(); return outcome("cancelled", 0); }
  inner.phase = "running";
  inner.notify();

  const say = async (l: Line, always = false) => {
    if (inner.stopped && !always) return;
    const said = Promise.resolve().then(() => hooks.say(l.text, lang, allowedSet(l.figures))).catch(() => undefined);
    await (always ? said : race(said, inner.stopCtl.signal));
  };
  const mark = (i: number, state: StepState, ms: number | null) => {
    inner.states.set(inner.steps[i].id, { state, ms });
    try { hooks.progress(i, state, ms); } catch { /* a view */ }
    inner.notify();
  };
  const screens = new Map<string, ScreenOutcome>();

  const exec = async (step: MissionStepT, signal: AbortSignal): Promise<StepOutcome> => {
    switch (step.kind) {
      case "screen": {
        const r = ((await hooks.showScreen(step.recipe, step.slots, signal)) ?? {}) as ScreenOutcome;
        screens.set(step.id, r);
        return r.ok === false ? { state: "failed" } : { state: "done" };
      }
      case "console": {
        for (const m of step.moves) {
          if (signal.aborted) break;
          // Level A only, and only the moves a mission may make (checked again here: the plan came over the wire)
          if (!(CONSOLE_MOVES as readonly string[]).includes(m.a) || riskOf(m as Step) !== "A") continue;
          if ((await hooks.runStep(m as Step, signal)) === false) return { state: "failed" };
        }
        return { state: "done" };
      }
      case "focus":
        await hooks.focusMap(step.place, step.tour, signal);
        return { state: "done" };
      case "draft": {
        const src = step.from ? screens.get(step.from) : undefined;
        // the list it drafts from was skipped or did not stand: saying "nothing is overdue" would be a claim about data never read
        if (!step.ids.length && (!src || src.ok === false)) return { state: "failed" };
        const pool = step.ids.length ? step.ids : (src?.cases ?? []).filter((c) => step.only === "all" || c.overdue).map((c) => c.id);
        const ids = [...new Set(pool)].filter((x) => /^INC-[A-Za-z0-9_-]{1,60}$/.test(x)).slice(0, step.n);
        if (!ids.length) return { state: "done", drafted: 0, none: true };
        const r = await hooks.draft(ids, signal);
        const got = Array.isArray(r) ? r.filter((x) => ids.includes(x)) : ids.slice(0, Math.max(0, Math.min(ids.length, Math.floor(Number(r) || 0))));
        if (!got.length) return { state: "failed" };
        drafted.push(...got);
        return { state: "done", drafted: got.length };
      }
    }
  };

  const t0 = now();
  let toured = false;
  let i = 0;
  while (i < inner.steps.length && !inner.stopped) {
    // "instead X": the steps not yet run give way to the new plan (the one in hand has finished; the finished ones stay)
    if (inner.pending) {
      const pd = inner.pending;
      const next = await race(pd.p, inner.stopCtl.signal);
      if (inner.pending === pd) inner.pending = null;
      if (inner.stopped || next === ABORTED) break;
      if (next) {
        const tail = renumber(next.steps, ++inner.gen);
        inner.steps = [...inner.steps.slice(0, i), ...tail].slice(0, i + MAX_STEPS);
        for (const s of tail) inner.states.set(s.id, { state: "pending", ms: null });
        inner.notify();
        await say(LINES.redirect(tail[0], lang));
      } else await say(LINES.noRedirect(lang));
      continue;
    }
    const step = inner.steps[i];
    if (inner.skipNext) {
      inner.skipNext = false;
      mark(i, "skipped", null);
      await say(stepLine(step, { state: "skipped" }, 0, lang, false));
      i++;
      continue;
    }
    mark(i, "running", null);
    const ctl = new AbortController();
    inner.current = ctl;
    const s0 = now();
    let out: StepOutcome | typeof ABORTED;
    try { out = await race(exec(step, ctl.signal), ctl.signal); } catch { out = { state: "failed" }; }
    const ms = Math.round(now() - s0);
    inner.current = null;
    if (inner.stopped) { mark(i, "stopped", ms); break; }
    if (out === ABORTED) out = { state: "skipped" };
    mark(i, out.state, ms);
    const firstStop = step.kind === "focus" && !!step.tour && !toured;
    if (firstStop) toured = true;
    await say(stepLine(step, out, ms, lang, firstStop));
    i++;
  }
  const total = Math.round(now() - t0);
  if (inner.stopped) {
    inner.phase = "stopped";
    inner.notify();
    await say(LINES.stopped(lang), true);
    return outcome("stopped", total);
  }
  inner.phase = "done";
  inner.notify();
  await say(LINES.done(total, lang));
  return outcome("done", total);
}
