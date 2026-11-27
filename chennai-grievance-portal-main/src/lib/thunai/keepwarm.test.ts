/**
 * v12 (21 Nov): Jarvis's keep-warm (keepwarm.ts). The work a first question needs runs on the server's own schedule, one step after another,
 * instead of in a burst when Jarvis opens; a tick runs only while the console is in use; Claude's steps only while Claude leads; the prompt
 * cache last and at most once in 4 minutes. The steps here are test doubles; nothing is read or sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_MS, PROMPT_EVERY_MS, activeWithin, markActive, msToIstHour, planPass, resetKeepWarm, runPass, type StepRunners, type WarmStep } from "./keepwarm";

beforeEach(() => { resetKeepWarm(); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { resetKeepWarm(); vi.restoreAllMocks(); });

describe("v12: which steps a pass runs", () => {
  it("a tick with no one active does nothing; the hour, a build and the start always warm the hourly city parts", () => {
    const idle = { active: false, jarvis: false, claude: true, promptDue: true };
    expect(planPass("tick", idle)).toEqual([]);
    // v14: v13's skip of an idle hour moved the rebuild onto the morning's first question (review finding scenarios 3); with no one on
    // the console the rebuild stalls no one, so it runs then again
    // 27 Nov: the start and a new build make Jarvis's data of the build first (the cases table, the day's names); the hour does not
    for (const why of ["start", "build"] as const) expect(planPass(why, idle)).toEqual(["cases", "lexicon", "city-hourly"]);
    expect(planPass("hour", idle)).toEqual(["city-hourly"]);
  });
  it("v14: the rain rebuild marked due (city-fresh) runs only at a quiet moment while someone is on the console", () => {
    const busy = { active: true, jarvis: true, claude: false, promptDue: false };
    expect(planPass("tick", busy)).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights"]);
    expect(planPass("tick", { ...busy, quiet: true })).toEqual(["cases", "lexicon", "city-hourly", "city-fresh", "city-live", "insights"]);
    expect(planPass("hour", { ...busy, quiet: false })).not.toContain("city-fresh");
  });
  it("in use with Claude leading: every step, the prompt cache last", () => {
    expect(planPass("tick", { active: true, jarvis: true, claude: true, promptDue: true })).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights", "snapshot", "prompt"]);
  });
  it("Claude off (the $5 ceiling, no key): no snapshot and no prompt warm", () => {
    expect(planPass("tick", { active: true, jarvis: true, claude: false, promptDue: true })).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights"]);
  });
  it("27 Nov: no insights while Jarvis was used in the last minute (they held the hosted copy's one core 4-6 s every 75 s)", () => {
    const inUse = { active: true, jarvis: true, claude: true, promptDue: true };
    expect(planPass("tick", { ...inUse, recent: true })).toEqual(["cases", "lexicon", "city-hourly", "city-live", "snapshot", "prompt"]);
    expect(planPass("build", { ...inUse, recent: true })).not.toContain("insights");
    expect(planPass("tick", { ...inUse, recent: false })).toContain("insights");
  });
  it("the prompt only when Jarvis itself was used and the last warm is 4 minutes old", () => {
    expect(planPass("tick", { active: true, jarvis: false, claude: true, promptDue: true })).not.toContain("prompt");
    expect(planPass("tick", { active: true, jarvis: true, claude: true, promptDue: false })).not.toContain("prompt");
  });
});

describe("v12: activity and the clock", () => {
  it("markActive: Jarvis counts as the console in use; it lapses after 15 minutes", () => {
    const t = Date.now();
    expect(activeWithin("collector", ACTIVE_MS, t)).toBe(false);
    markActive("jarvis", t);
    expect(activeWithin("collector", ACTIVE_MS, t + 1000)).toBe(true);
    expect(activeWithin("jarvis", ACTIVE_MS, t + 1000)).toBe(true);
    expect(activeWithin("collector", ACTIVE_MS, t + ACTIVE_MS + 1)).toBe(false);
    markActive("collector", t + 5000);
    expect(activeWithin("jarvis", ACTIVE_MS, t + 6000)).toBe(true);
  });
  it("msToIstHour: the next IST hour (IST hours turn at :30 UTC)", () => {
    expect(msToIstHour(Date.parse("2026-11-21T06:29:00Z"))).toBe(60_000); // 11:59 IST
    expect(msToIstHour(Date.parse("2026-11-21T06:30:00Z"))).toBe(3_600_000); // 12:00 IST
    expect(msToIstHour(Date.parse("2026-11-21T06:31:17Z"))).toBe(3_600_000 - 77_000);
  });
});

describe("v12: a pass", () => {
  /** steps that log when they start and end, each taking a few ms of real time */
  function steps(log: string[]): StepRunners {
    const s = (name: WarmStep) => async () => { log.push(`${name}:start`); await new Promise((r) => setTimeout(r, 5)); log.push(`${name}:end`); };
    return { cases: s("cases"), lexicon: s("lexicon"), "city-hourly": s("city-hourly"), "city-live": s("city-live"), insights: s("insights"), snapshot: s("snapshot"), prompt: s("prompt") };
  }

  it("runs its steps one after another, never two at once", async () => {
    markActive("jarvis", Date.now() - 70_000); // (in use, not in the last minute: the insights run too; not a quiet moment for the rain rebuild)
    const log: string[] = [];
    const ran = await runPass("tick", { steps: steps(log), claude: () => true });
    expect(ran).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights", "snapshot", "prompt"]);
    expect(log.filter((x) => x.endsWith(":start"))).toEqual(ran.map((x) => `${x}:start`));
    for (let i = 0; i < log.length; i += 2) {
      expect(log[i]).toMatch(/:start$/);
      expect(log[i + 1]).toBe(log[i].replace(":start", ":end"));
    }
  });

  it("a failed step is logged and the next one still runs", async () => {
    markActive("collector");
    const log: string[] = [];
    const ran = await runPass("tick", { steps: { ...steps(log), "city-live": async () => { throw new Error("TomTom down"); } }, claude: () => false });
    expect(ran).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights"]);
    expect(log).toContain("insights:end");
  });

  it("27 Nov: a test's steps are the only ones run (a step it leaves out does nothing, never the app's own)", async () => {
    markActive("collector");
    const log: string[] = [];
    const ran = await runPass("tick", { steps: { "city-hourly": async () => { log.push("city-hourly"); } }, claude: () => false });
    expect(ran).toEqual(["cases", "lexicon", "city-hourly", "city-live", "insights"]);
    expect(log).toEqual(["city-hourly"]);
  });

  it("a trigger while a pass runs is not run alongside it: it runs once after", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      let release!: () => void;
      let calls = 0;
      // the first pass's hourly step is slow; the one after it is quick
      const s: StepRunners = { "city-hourly": () => (++calls === 1 ? new Promise<void>((r) => { release = r; }) : Promise.resolve()), "city-live": async () => {}, insights: async () => {} };
      markActive("collector"); // v13: a build pass warms only while someone is on the console
      const first = runPass("start", { steps: s, claude: () => false });
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // (27 Nov: the cases and lexicon steps go first)
      expect(calls).toBe(1);
      expect(await runPass("build", { steps: s, claude: () => false })).toEqual([]); // not started alongside: queued
      expect(calls).toBe(1);
      release();
      await first;
      expect(calls).toBe(1);
      // the queued build pass starts a second after the first ended
      await vi.advanceTimersByTimeAsync(1100);
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      expect(calls).toBe(2);
      expect(globalThis.__jarvisKeepWarm?.last?.why).toBe("build");
    } finally { vi.useRealTimers(); }
  });

  it("startKeepWarm: a start pass, then a tick every 75 s that does nothing while no one is active, once per server; JARVIS_KEEPWARM=0 is off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
    // 12:15 IST: the next IST hour's pass is 45 minutes away, out of this test's 150 s
    vi.setSystemTime(Date.parse("2026-11-21T06:45:00Z"));
    try {
      vi.stubEnv("DATA_BACKEND", "");
      vi.stubEnv("JARVIS_KEEPWARM", "0");
      const { startKeepWarm, keepWarmOn, EVERY_MS } = await import("./keepwarm");
      startKeepWarm();
      expect(keepWarmOn()).toBe(false);
      vi.stubEnv("JARVIS_KEEPWARM", "");
      const ran: string[] = [];
      const s: StepRunners = { "city-hourly": async () => { ran.push("city-hourly"); }, "city-live": async () => { ran.push("city-live"); }, insights: async () => { ran.push("insights"); } };
      startKeepWarm({ steps: s, claude: () => false });
      startKeepWarm({ steps: s, claude: () => false });
      expect(keepWarmOn()).toBe(true);
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      expect(ran).toEqual(["city-hourly"]); // the start pass: the hourly parts only, no one active yet
      await vi.advanceTimersByTimeAsync(EVERY_MS);
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      expect(ran).toEqual(["city-hourly"]); // a tick with no one active: nothing
      markActive("jarvis");
      await vi.advanceTimersByTimeAsync(EVERY_MS);
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
      // (the pass a second after Jarvis opened: 27 Nov, no insights while Jarvis was used in the last minute)
      expect(ran).toEqual(["city-hourly", "city-hourly", "city-live"]);
    } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
  });

  it("the prompt warm is not repeated within 4 minutes", async () => {
    markActive("jarvis");
    let prompts = 0;
    const s: StepRunners = { "city-hourly": async () => {}, "city-live": async () => {}, insights: async () => {}, snapshot: async () => {},
      prompt: async () => { prompts++; globalThis.__jarvisKeepWarm!.promptAt = Date.now(); } };
    await runPass("tick", { steps: s, claude: () => true });
    expect(await runPass("tick", { steps: s, claude: () => true })).not.toContain("prompt");
    expect(prompts).toBe(1);
    globalThis.__jarvisKeepWarm!.promptAt = Date.now() - PROMPT_EVERY_MS - 1;
    expect(await runPass("tick", { steps: s, claude: () => true })).toContain("prompt");
  });
});

describe("v14: quiet moments and the console opened again", () => {
  it("a pass a second after the console is opened again, whose plan has no rebuild while the Collector has just arrived", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    try {
      const ran: WarmStep[] = [];
      const step = (n: WarmStep) => async () => { ran.push(n); };
      const s: StepRunners = { "city-hourly": step("city-hourly"), "city-fresh": step("city-fresh"), "city-live": step("city-live"), insights: step("insights"), snapshot: step("snapshot"), prompt: step("prompt") };
      const { startKeepWarm } = await import("./keepwarm");
      startKeepWarm({ steps: s, claude: () => false });
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      ran.length = 0;
      markActive("collector");
      await vi.advanceTimersByTimeAsync(1100);
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      expect(ran).toEqual(["city-hourly", "city-live", "insights"]); // warm before the first question; no rebuild while they settle in
    } finally { vi.useRealTimers(); }
  });
});
