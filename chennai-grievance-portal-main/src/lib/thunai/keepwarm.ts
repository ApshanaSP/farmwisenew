/**
 * v12 (21 Nov): Jarvis's keep-warm, on the server. The slow reads a first question needs are worked out here, ahead of it, one after
 * another with the thread let go between them, instead of in a burst when Jarvis opens (the report, first-question-latency RC1: the
 * world route's insights for four periods and the 11-part snapshot held the thread 40-49 s while the Collector said "Okay, how are you?"
 * twice; every Claude warm-up timed out behind it).
 *
 * When a pass runs:
 *   start  once, about 20 s after the server starts, after the store is ready (instrumentation-node.ts)
 *   tick   every 75 s, only while a Collector (or Jarvis) was active in the last 15 minutes (markActive)
 *   hour   about 5 s after each IST hour, when the rain rehearsal's hourly parts are worked out again
 *   build  right after a newer hourly build is swapped in (store.ts onBuildSwap), which starts every store-keyed cache again
 *
 * What a pass does, in this order (each step waits for the one before):
 *   city-hourly  the rain rehearsal's memory and reach, the past rains and the traffic, power and train impacts (one computation an IST
 *                hour, or a build: the first city question of an hour took 7.8 s at 06:37:44). Every pass. v14: while someone is on the
 *                console the engine answers from the last settled base and the last hour's memory and marks the rebuild due
 *                (rehearsal/engine.ts deferRainRebuild), so this step is quick then; with no one on it, it rebuilds at once.
 *   city-fresh   v14: the rebuild marked due (engine.ts refreshRain), then Rain's tabs again, only at a quiet moment: the console open for
 *                SETTLE_MS and Jarvis not used for QUIET_MS (review findings 0-6 and scenarios 3: the 7-17 s rebuild held the one
 *                thread for whoever asked first; on a timer it held it for whoever was speaking then).
 *   city-live    live traffic (TomTom's own 5-minute cache) and the city answers for traffic and rain (lib/city/now.ts), only while active
 *   insights     the whole district's insights and overview, daily and weekly (assistant/tools.ts warmInsights), only while active
 *   snapshot     THE DISTRICT NOW (v11/snapshot.ts), only while active and Claude leads (claudeConfigured: no one else attaches it)
 *   prompt       the Claude planner's prompt cache (claudeWarm with round.ts plannerWarm, 20 s), only while Jarvis was used in the last
 *                15 minutes and Claude leads, at most once in 4 minutes (the cache keeps a prefix 5), and always last
 * A pass already running is not started twice: a trigger meanwhile runs once after it. Nothing here throws. JARVIS_KEEPWARM=0 turns it off.
 * Every import is dynamic: the server's start-up code loads none of it until the first pass. State is on globalThis (the routes that mark
 * activity load their own copy of this module).
 */

import { inBackground } from "@/lib/util/background";

/** a Collector counts as active this long after the last request that said so */
export const ACTIVE_MS = 15 * 60_000;
/** a tick's period while someone is active */
export const EVERY_MS = 75_000;
/** the first pass after the server starts */
export const FIRST_MS = 20_000;
/** after the IST hour, so the hour's own data is what is read */
export const HOUR_LAG_MS = 5_000;
/** the planner's prompt cache keeps a prefix 5 minutes after its last use: one warm in 4 is enough */
export const PROMPT_EVERY_MS = 4 * 60_000;
export const PROMPT_TIMEOUT_MS = 20_000;
/** v14: the hour's rain rebuild waits until Jarvis has not been used for this long ... */
export const QUIET_MS = 90_000;
/** v14: ... and the console has been open this long (a Collector who just opened it is about to ask) */
export const SETTLE_MS = 2 * 60_000;
/** v14: a pass this long after the console is opened again, so the first question finds the reads warm */
export const RESUME_MS = 1_000;

export type WarmWhy = "start" | "tick" | "hour" | "build";
export type WarmStep = "city-hourly" | "city-fresh" | "city-live" | "insights" | "snapshot" | "prompt";
type Who = "collector" | "jarvis";

interface State {
  started: boolean; running: boolean; again: WarmWhy | null; promptAt: number; /** v14: the options startKeepWarm was given (the resume pass) */ opts?: Parameters<typeof runPass>[1];
  timers: ReturnType<typeof setTimeout>[]; last: { why: WarmWhy; at: number; ms: number; steps: Partial<Record<WarmStep, number>> } | null;
  stop?: () => void;
}
declare global {
  // eslint-disable-next-line no-var
  var __jarvisSeen: { collector: number; jarvis: number; /** v14: when the current spell of use began */ since?: number } | undefined;
  // eslint-disable-next-line no-var
  var __jarvisKeepWarm: State | undefined;
}
const seen = () => (globalThis.__jarvisSeen ??= { collector: 0, jarvis: 0 });
const K = (): State => (globalThis.__jarvisKeepWarm ??= { started: false, running: false, again: null, promptAt: 0, timers: [], last: null });
const breathe = () => new Promise<void>((r) => setImmediate(r));
/** v13: a step's store reads queue behind every request's own (util/background.ts: node:async_hooks only, so loaded at once) */
const asBackground = <T,>(fn: () => Promise<T>): Promise<T> => inBackground(fn);
const unref = <T>(t: T): T => { (t as { unref?: () => void }).unref?.(); return t; };
/** a one-shot timer, kept in the state until it fires (resetKeepWarm can stop it; the list does not grow over the days) */
function later(ms: number, fn: () => void): void {
  const k = K();
  const t: ReturnType<typeof setTimeout> = unref(setTimeout(() => { const i = k.timers.indexOf(t); if (i >= 0) k.timers.splice(i, 1); fn(); }, ms));
  k.timers.push(t);
}

/**
 * A request that shows someone is using the console now: "jarvis" for Jarvis's own routes (it counts as the Collector too). Cheap: one
 * time stamp. Called by the Jarvis routes (world, the round, warm); any Collector route may call it with "collector".
 */
export function markActive(who: Who = "collector", at: number = Date.now()): void {
  const s = seen();
  // v14 (review finding scenarios 3): the console opened again after a quiet spell: a pass a second later warms what the first question
  // reads (live traffic, the insights, the snapshot, the prompt cache) while the Collector is still looking at the screen
  const resumed = at - s.collector >= ACTIVE_MS;
  if (resumed) s.since = at;
  s[who] = Math.max(s[who], at);
  if (who === "jarvis") s.collector = Math.max(s.collector, at);
  const k = K();
  if (resumed && k.started) later(RESUME_MS, () => { void runPass("tick", k.opts); });
}
/** Was `who` active within `ms`? */
export function activeWithin(who: Who = "collector", ms: number = ACTIVE_MS, now: number = Date.now()): boolean {
  return now - seen()[who] < ms;
}
/** Is the keep-warm running in this server (the warm route then leaves the prompt cache to it)? */
export const keepWarmOn = (): boolean => K().started;
/** When the keep-warm last warmed the planner's prompt (0: never) */
export const promptWarmedAt = (): number => K().promptAt;

/** ms from `now` to the next IST hour (IST is UTC+5:30, so its hours turn at :30 UTC) */
export function msToIstHour(now: number = Date.now()): number {
  return 3_600_000 - ((now + 330 * 60_000) % 3_600_000);
}

/**
 * The steps of one pass, in order. Pure: what runs for this trigger, given who is active, whether Claude leads and (v14) whether it is a
 * quiet moment for the hour's rain rebuild.
 */
export function planPass(why: WarmWhy, o: { active: boolean; jarvis: boolean; claude: boolean; promptDue: boolean; quiet?: boolean }): WarmStep[] {
  // a tick is only for a console in use; the other triggers always warm the hourly parts, which hold for the hour (v14: with no one on
  // the console that is the rebuild itself, which then stalls no one; v13's skip moved it onto the morning's first question)
  if (why === "tick" && !o.active) return [];
  const out: WarmStep[] = ["city-hourly"];
  if (o.active && o.quiet) out.push("city-fresh");
  if (o.active) out.push("city-live", "insights");
  if (o.active && o.claude) out.push("snapshot");
  if (o.jarvis && o.claude && o.promptDue) out.push("prompt");
  return out;
}

/** each step, for tests: what runs; the app's own steps when not given */
export type StepRunners = Partial<Record<WarmStep, () => Promise<unknown>>>;

const STEPS: Record<WarmStep, () => Promise<unknown>> = {
  "city-hourly": async () => {
    const eng = await import("@/lib/rehearsal/engine");
    await eng.rehearsalState();
    await breathe();
    await eng.pastRains();
    await breathe();
    const imp = await import("@/lib/rehearsal/impacts");
    for (const lens of ["traffic", "power", "metro"] as const) { await imp.impacts(lens); await breathe(); }
  },
  "city-fresh": async () => {
    const eng = await import("@/lib/rehearsal/engine");
    if (!(await eng.refreshRain())) return;
    await breathe();
    const imp = await import("@/lib/rehearsal/impacts");
    for (const lens of ["traffic", "power", "metro"] as const) { await imp.impacts(lens); await breathe(); }
  },
  "city-live": async () => {
    const traffic = await import("@/lib/city/traffic");
    await traffic.trafficNow({ lockDept: null });
    await breathe();
    const city = await import("@/lib/city/now");
    for (const topic of ["traffic", "rain"] as const) { await city.cityNow(topic); await breathe(); }
  },
  insights: async () => {
    const tools = await import("@/lib/assistant/tools");
    await tools.warmInsights(["daily", "weekly"]);
  },
  snapshot: async () => {
    const snap = await import("@/lib/thunai/v11/snapshot");
    await snap.warmSnapshot();
  },
  prompt: async () => {
    const claude = await import("@/lib/ai/claude");
    if (!claude.claudeConfigured()) return null;
    const [round, world] = await Promise.all([import("@/lib/thunai/round"), import("@/lib/thunai/world")]);
    const w = await world.serverWorld();
    K().promptAt = Date.now();
    return claude.claudeWarm({ ...round.plannerWarm(w), timeoutMs: PROMPT_TIMEOUT_MS });
  }
};

/**
 * One pass for `why`, its steps one after another, the thread let go between them. Never throws; a failed step is logged and the next one
 * runs. A pass already running: this trigger runs once after it (the latest trigger wins; a tick never replaces a build or an hour).
 */
export async function runPass(why: WarmWhy, o: { steps?: StepRunners; claude?: () => boolean; now?: () => number } = {}): Promise<WarmStep[]> {
  const k = K();
  if (k.running) {
    if (why !== "tick" || !k.again) k.again = why;
    return [];
  }
  k.running = true;
  const now = o.now ?? Date.now;
  const t0 = now();
  const times: Partial<Record<WarmStep, number>> = {};
  let plan: WarmStep[] = [];
  try {
    let claude = false;
    try { claude = o.claude ? o.claude() : (await import("@/lib/ai/claude")).claudeConfigured(); } catch { claude = false; }
    const active = activeWithin("collector", ACTIVE_MS, t0);
    const quiet = active && !activeWithin("jarvis", QUIET_MS, t0) && t0 - (seen().since ?? 0) >= SETTLE_MS;
    plan = planPass(why, { active, jarvis: activeWithin("jarvis", ACTIVE_MS, t0), claude, promptDue: t0 - k.promptAt >= PROMPT_EVERY_MS, quiet });
    for (const step of plan) {
      const ts = now();
      try { await asBackground(o.steps?.[step] ?? STEPS[step]); } catch (e) { console.warn(`[jarvis warm] ${step} failed: ${(e as Error)?.message?.slice(0, 160)}`); }
      times[step] = now() - ts;
      await breathe();
    }
  } finally {
    const ms = now() - t0;
    k.last = { why, at: t0, ms, steps: times };
    k.running = false;
    if (plan.length && (why !== "tick" || ms > 3000)) {
      console.info(`[jarvis warm] ${why}: ${plan.map((s) => `${s} ${((times[s] ?? 0) / 1000).toFixed(1)} s`).join(", ")} (${(ms / 1000).toFixed(1)} s)`);
    }
    const next = k.again;
    k.again = null;
    if (next) later(1000, () => { void runPass(next, o); });
  }
  return plan;
}

/**
 * Starts the keep-warm (once per server): the first pass now, a tick every EVERY_MS, a pass after each IST hour and after each build swap.
 * Call it after the store is ready (instrumentation-node.ts, about 20 s after the start). Off with JARVIS_KEEPWARM=0. `o`: tests only.
 */
export function startKeepWarm(o: Parameters<typeof runPass>[1] = {}): void {
  const k = K();
  if (k.started || (process.env.JARVIS_KEEPWARM ?? "").trim() === "0") return;
  k.started = true;
  k.opts = o;
  // v14: while someone is on the console, the rain engine answers from its last build and hour and leaves the rebuild to city-fresh
  void import("@/lib/rehearsal/engine").then((m) => m.deferRainRebuild(() => activeWithin("collector"))).catch(() => undefined);
  void runPass("start", o);
  k.timers.push(unref(setInterval(() => { void runPass("tick", o); }, EVERY_MS)));
  const hour = (): void => later(msToIstHour() + HOUR_LAG_MS, () => { void runPass("hour", o); hour(); });
  hour();
  if (process.env.DATA_BACKEND === "aws") {
    void import("@/lib/aws/store").then((m) => {
      k.stop = m.onBuildSwap(() => later(1000, () => { void runPass("build", o); }));
    }).catch((e) => console.warn(`[jarvis warm] no build-swap hook: ${(e as Error).message}`));
  }
  console.info(`[jarvis warm] keep-warm on: every ${EVERY_MS / 1000} s while the console is in use, after each IST hour and each new build`);
}

/** tests only: stop every timer and forget the state */
export function resetKeepWarm(): void {
  const k = globalThis.__jarvisKeepWarm;
  if (k) { for (const t of k.timers) clearTimeout(t); k.stop?.(); }
  globalThis.__jarvisKeepWarm = undefined;
  globalThis.__jarvisSeen = undefined;
  globalThis.__rehearsalDefer = undefined;
}
