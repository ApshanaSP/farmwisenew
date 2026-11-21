// v4, Pillar 1 and 2 on the browser's side: memory turns (defect 5), observations with the screen's digest (defect 4), the
// ears' confidence and language (defect 6), captions only while an addressed sentence is heard (defect 10), the honest ack and
// the two speeds.
import { describe, expect, it, vi } from "vitest";
import type { StageDocT } from "@/lib/thunai/stage";
import type { ScreenState } from "@/lib/thunai/types";
import { ackDelay, ackDue, asksFirst, compactSlots, consoleDigest, HearingCaptions, heardOf, keepTurns, longTurn, memTurn, OBS_DIGEST_MAX, resultLine, screenResult, withDigest } from "./turnstate";

const doc = (o: Partial<StageDocT> = {}) => ({ recipe: "cases", title: "Severe cases in Adyar this week", slots: { zones: [13], period: "weekly", sev: "Severe", q: "flood deaths 300 in Adyar", n: 15, empty: [], none: null }, blocks: [{ kind: "CaseList", id: "c", total: 12, rows: [] }], ...o }) as unknown as StageDocT;

describe("memory turns: recipe, slots and a one-line result (defect 5)", () => {
  it("a screen's turn carries its recipe and slots; the model's free text keeps no figure", () => {
    const t = memTurn("show the severe cases in Adyar", "showed a cases screen", { doc: doc(), result: "Severe cases in Adyar this week (12 cases)" });
    expect(t).toEqual({ heard: "show the severe cases in Adyar", did: "showed a cases screen", recipe: "cases", slots: { zones: [13], period: "weekly", sev: "Severe", q: "flood deaths in Adyar", n: 15 }, result: "Severe cases in Adyar this week (12 cases)" });
  });
  it("a free-text slot that still says a number in words is dropped", () => {
    expect(compactSlots({ q: "three hundred deaths", zone: 4 })).toEqual({ zone: 4 });
  });
  it("slots stay small", () => {
    const big = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, "x".repeat(50)]));
    expect(JSON.stringify(compactSlots(big)).length).toBeLessThanOrEqual(400);
  });
  it("the result is one line of at most 120 characters", () => {
    const t = memTurn("x", "y", { result: `${"word ".repeat(60)}\n second line` });
    expect(t.result!.length).toBeLessThanOrEqual(120);
    expect(t.result).not.toMatch(/\n/);
  });
  it("a model's line holding a figure code did not supply is not kept", () => {
    expect(resultLine("Flood deaths 300 reported", new Set(["12"]))).toBeUndefined();
    expect(resultLine("Three hundred died", new Set(["12"]))).toBeUndefined();
    expect(resultLine("12 need you", new Set(["12"]))).toBe("12 need you");
    expect(resultLine("Zone 4 has 9 severe cases", "code")).toBe("Zone 4 has 9 severe cases");
  });
  it("a screen's result never holds an incident's own title (a citizen's words), and only code's figures", () => {
    expect(screenResult(doc({ recipe: "case", title: "My street is flooded since 3 days please help", slots: { id: "INC-77" } } as never), new Set())).toBe("incident INC-77");
    expect(screenResult(doc(), new Set(["12"]))).toBe("Severe cases in Adyar this week (12 cases)");
    expect(screenResult(doc({ recipe: "answer", title: "About flood deaths 300" } as never), new Set(["12"]))).toBe("answer screen (12 cases)");
  });
  it("six turns are kept, the newest last (v11; four before)", () => {
    let list = [] as ReturnType<typeof memTurn>[];
    for (let i = 1; i <= 8; i++) list = keepTurns(list, memTurn(`s${i}`, "d"));
    expect(list.map((t) => t.heard)).toEqual(["s3", "s4", "s5", "s6", "s7", "s8"]);
  });
});

describe("observations carry the digest of the screen now showing (defect 4)", () => {
  const st = { page: "trends", period: "weekly", zone: 13, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, list: ["a", "b"] } as unknown as ScreenState;
  it("the last observation has the digest, clipped; at most 8 go back", () => {
    const obs = Array.from({ length: 10 }, (_, i) => ({ step: `s${i}`, ok: i !== 9, error: i === 9 ? "x".repeat(300) : null }));
    const out = withDigest(obs, "d".repeat(2000));
    expect(out.length).toBe(8);
    expect(out[7].digest!.length).toBe(OBS_DIGEST_MAX);
    expect(out[7].error!.length).toBe(150);
    expect(out.slice(0, 7).every((o) => o.digest === undefined && o.error === undefined)).toBe(true);
  });
  it("with no screen of Jarvis's open, the digest is the console's: codes and counts only", () => {
    expect(JSON.parse(consoleDigest(st))).toEqual({ console: { page: "trends", period: "weekly", zone: 13, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, list: 2 } });
    expect(withDigest([{ step: "page", ok: true }], consoleDigest(st))[0].digest).toContain("\"page\":\"trends\"");
  });
  it("no steps, no observation", () => expect(withDigest([], "d")).toEqual([]));
});

describe("the ears' confidence and language reach the planner (defect 6)", () => {
  it("speech sends what the ears said; typed text is sure", () => {
    expect(heardOf("whisper", "ta", 0.42)).toEqual({ lang: "ta", conf: 0.42, source: "whisper" });
    expect(heardOf("typed", "en", 0.95)).toEqual({ lang: "en", conf: 1, source: "typed" });
    expect(heardOf("captions", "en", undefined).conf).toBe(0.95);
    expect(heardOf("whisper", "en", 7).conf).toBe(1);
  });
  it("an unsure sentence is put as a question before the rules act on it", () => {
    expect(asksFirst(0.8, 0.95)).toBe(false);
    expect(asksFirst(0.8, 0.4)).toBe(true);
    expect(asksFirst(0.55, 0.95)).toBe(true);
    expect(asksFirst(0.9, 0.4)).toBe(false);
  });
});

describe("captions only while an addressed sentence is heard (defect 10)", () => {
  const rec = () => ({ start: vi.fn(), stop: vi.fn(), setLang: vi.fn() });
  it("nothing runs until speech starts; side talk never starts it; it stops at the end of speech", () => {
    const made: ReturnType<typeof rec>[] = [];
    const c = new HearingCaptions(() => { const r = rec(); made.push(r); return r; });
    expect(c.running).toBe(false);
    c.speechStart({ on: true, engaged: false, awaitingYes: false });
    expect(made.length).toBe(0);
    c.speechStart({ on: true, engaged: true, awaitingYes: false });
    expect(made.length).toBe(1);
    expect(made[0].start).toHaveBeenCalledTimes(1);
    c.speechStart({ on: true, engaged: true, awaitingYes: false });
    expect(made.length).toBe(1);
    c.speechEnd();
    expect(made[0].stop).toHaveBeenCalledTimes(1);
    expect(c.running).toBe(false);
  });
  it("a spoken yes being awaited starts it; a closed mode never does; no recogniser, nothing", () => {
    const c = new HearingCaptions(rec);
    c.speechStart({ on: false, engaged: true, awaitingYes: true });
    expect(c.running).toBe(false);
    c.speechStart({ on: true, engaged: false, awaitingYes: true });
    expect(c.running).toBe(true);
    const none = new HearingCaptions(() => null);
    none.speechStart({ on: true, engaged: true, awaitingYes: false });
    expect(none.running).toBe(false);
  });
});

describe("two speeds: past 10 s a turn shows its steps and a Stop; never before", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, label: `step ${i}`, state: "done" as const, ms: 10 }));
  it("a quick answer shows nothing", () => expect(longTurn(9_999, rows)).toEqual({ show: false, seconds: 0, rows: [] }));
  it("a long one shows its newest five real steps and the seconds", () => {
    const l = longTurn(12_400, rows);
    expect(l.show).toBe(true);
    expect(l.seconds).toBe(12);
    expect(l.rows.map((r) => r.id)).toEqual(["r2", "r3", "r4", "r5", "r6"]);
  });
});

describe("the honest ack: spoken only when nothing of the answer has started 1.2 s after the end of speech", () => {
  const base = { endAt: 1000, now: 2300, answeredAt: 0, findingAt: 0, speaking: false, waiting: true };
  it("due when nothing started", () => expect(ackDue(base)).toBe(true));
  it("not before 1.2 s", () => expect(ackDue({ ...base, now: 2100 })).toBe(false));
  it("not when the answer is on screen or its voice began", () => {
    expect(ackDue({ ...base, answeredAt: 1500 })).toBe(false);
    expect(ackDue({ ...base, findingAt: 1500 })).toBe(false);
  });
  it("never over a voice, never for typed text, never once the turn stopped waiting", () => {
    expect(ackDue({ ...base, speaking: true })).toBe(false);
    expect(ackDue({ ...base, endAt: null })).toBe(false);
    expect(ackDue({ ...base, waiting: false })).toBe(false);
  });
  it("the timer waits what is left of the 1.2 s", () => {
    expect(ackDelay(1000, 1500)).toBe(700);
    expect(ackDelay(1000, 3000)).toBe(0);
    expect(ackDelay(null, 3000)).toBeNull();
  });
});
