/**
 * Phase 7 review, lane F1: the decisions Thunai.tsx makes for the fixes, as pure helpers (aide.ts, turnstate.ts, turnstream.ts,
 * hudview.ts), each checked here. They did not exist before the fix, so every check here failed on the old code.
 */
import { describe, expect, it } from "vitest";
import { WORLD } from "@/lib/thunai/fixture";
import { gateChunk } from "@/lib/thunai/numbergate";
import { confirmLine } from "@/lib/thunai/say";
import type { WatchSignal } from "@/lib/thunai/signals";
import type { StageDocT } from "@/lib/thunai/stage";
import type { Signal } from "@/lib/thunai/watch";
import { briefGo, briefStale, clientSignal, confirmAsk, greetingOk, interjectNow, withinHour, type Live } from "./aide";
import { currentSteps, SETTLE_MS, turnMs } from "./hudview";
import type { WorkStep } from "./hudstore";
import { screenLabel } from "./turnstate";
import { queuesSentences } from "./turnstream";

const quiet: Live = { mode: "on", collectorSpeaking: false, busy: false, speaking: false, briefing: false, waiting: false, lastUserSpeech: null, quiet: false };
// 11:00 in Chennai: outside quiet hours
const DAY = Date.UTC(2026, 10, 16, 5, 30);
const zones = WORLD.zones.map((z) => z.n);

describe("the brief after its fetch (Proactive 1)", () => {
  const base = { gen0: 4, gen: 4, mode0: "on" as const, mode: "on" as const, asked: true, live: quiet };
  it("speaks when nothing moved", () => expect(briefStale(base)).toBeNull());
  it("is dropped when a newer turn began while it was fetched (it would cut that answer)", () => expect(briefStale({ ...base, gen: 5 })).not.toBeNull());
  it("is dropped when Jarvis was closed or muted meanwhile", () => {
    expect(briefStale({ ...base, mode: "off" })).not.toBeNull();
    expect(briefStale({ ...base, mode: "muted" })).not.toBeNull();
  });
  it("a brief asked for by typing with the mode muted still comes", () => expect(briefStale({ ...base, mode0: "muted", mode: "muted" })).toBeNull());
  it("the power-on brief also waits for a quiet moment: never over the Collector, a turn, a card or Jarvis's voice", () => {
    const on = { ...base, asked: false };
    expect(briefStale(on)).toBeNull();
    for (const p of [{ collectorSpeaking: true }, { busy: true }, { waiting: true }, { speaking: true }]) expect(briefStale({ ...on, live: { ...quiet, ...p } }), JSON.stringify(p)).not.toBeNull();
    // its own fetch is not a reason to wait
    expect(briefStale({ ...on, live: { ...quiet, briefing: true } })).toBeNull();
  });
});

describe("the power-on brief and the morning greeting (Proactive 2)", () => {
  it("the brief replaces the greeting: no greeting while the brief is due or once it was given on this page", () => {
    expect(greetingOk({ briefedPage: false, sessionBriefed: false })).toBe(false);
    expect(greetingOk({ briefedPage: true, sessionBriefed: true })).toBe(false);
    // given earlier in this tab's session (a reload): the brief is not due again, so the day's greeting may come
    expect(greetingOk({ briefedPage: false, sessionBriefed: true })).toBe(true);
  });
  it("waits and tries again when the only reason is Jarvis speaking; anything else drops it", () => {
    expect(briefGo(quiet)).toBe("go");
    expect(briefGo({ ...quiet, speaking: true })).toBe("retry");
    expect(briefGo({ ...quiet, speaking: true, collectorSpeaking: true })).toBe("drop");
    expect(briefGo({ ...quiet, busy: true })).toBe("drop");
    expect(briefGo({ ...quiet, waiting: true })).toBe("drop");
    expect(briefGo({ ...quiet, mode: "muted" })).toBe("drop");
    expect(briefGo({ ...quiet, briefing: true })).toBe("go");
  });
});

describe("one budget for everything said unprompted (the old watch and the server's)", () => {
  const HIGH = { key: "rise:zone:13::", topic: "rise:zone:13::", severity: "high", level: 3, lifeSafety: false } as Pick<WatchSignal, "key" | "topic" | "severity" | "level" | "lifeSafety">;
  it("three said in the hour, from either channel, spend it; ten minutes apart", () => {
    expect(interjectNow(HIGH, quiet, DAY).ok).toBe(true);
    expect(interjectNow(HIGH, quiet, DAY, [DAY - 50 * 60_000, DAY - 40 * 60_000, DAY - 30 * 60_000])).toEqual({ ok: false, why: "hourly budget spent" });
    expect(interjectNow(HIGH, quiet, DAY, [DAY - 5 * 60_000]).ok).toBe(false);
    expect(interjectNow(HIGH, quiet, DAY, [DAY - 70 * 60_000, DAY - 11 * 60_000]).ok).toBe(true);
  });
  it("the old watch's lines go through the same gate: a severe bell, a reminder, the greeting", () => {
    const sig = (kind: Signal["kind"], key: string, life = false): Signal => ({ key, kind, lifeSafety: life, impact: 1, urgency: 1, confidence: 0.9, novelty: 1, actionability: 0.8, level: 1, text: { en: "x", ta: "x" } });
    const bell = clientSignal(sig("severe", "bell:9"));
    expect(bell).toMatchObject({ key: "bell:9", severity: "high", level: 1, lifeSafety: false });
    expect(interjectNow(bell, quiet, DAY).ok).toBe(true);
    expect(interjectNow(bell, quiet, DAY, [DAY - 50 * 60_000, DAY - 40 * 60_000, DAY - 30 * 60_000]).ok).toBe(false);
    expect(interjectNow(bell, { ...quiet, lastUserSpeech: DAY - 4000 }, DAY).ok).toBe(false);
    // life safety is never held by the budget
    const life = clientSignal({ ...sig("warning", "w:1", true), confidence: 1, actionability: 1 });
    expect(life.lifeSafety).toBe(true);
    expect(interjectNow(life, quiet, DAY, [DAY - 50 * 60_000, DAY - 40 * 60_000, DAY - 30 * 60_000]).ok).toBe(true);
  });
  it("the ledger keeps the last hour", () => expect(withinHour([DAY - 2 * 3_600_000, DAY - 30 * 60_000, Number.NaN], DAY)).toEqual([DAY - 30 * 60_000]));
});

describe("the Level-B confirm speaks and shows only the Collector's own figures (Numbers 3)", () => {
  // the one builder (say.ts confirmLine) writes the line; confirmAsk gates what it wrote
  type S = Parameters<typeof confirmLine>[0];
  const ask = (s: S, said: string, lang: "en" | "ta" = "en") => confirmAsk(confirmLine(s, lang), s, said, lang, zones);
  it("a note the model wrote with a figure the Collector never said is not offered", () => {
    expect(ask({ a: "remember", text: "flood deaths 300 in Adyar" }, "remember the Adyar drains")).toBeNull();
    expect(ask({ a: "workspace", name: "Daily 300" }, "save this view as daily")).toBeNull();
  });
  it("the Collector's own figures pass, and the line passes the voice's gate with them (digits or words)", () => {
    const r = ask({ a: "remember", text: "call the engineer at 6" }, "remember to call the engineer at 6")!;
    expect(r.text).toContain("6");
    expect(gateChunk(r.text, r.allowed).ok).toBe(true);
    expect(ask({ a: "remember", text: "call the engineer at 6" }, "remember to call the engineer at six")).not.toBeNull();
  });
  it("a reminder's time, written by code from its date, may be said with it, in Tamil too", () => {
    const at = "2026-11-15T12:30:00.000Z";
    const r = ask({ a: "remind", text: "call the SWD engineer", at }, "remind me at 6 to call the SWD engineer")!;
    expect(r).not.toBeNull();
    expect(gateChunk(r.text, r.allowed).ok).toBe(true);
    const t = ask({ a: "remind", text: "call the SWD engineer", at }, "ஆறு மணிக்கு நினைவூட்டு", "ta")!;
    expect(t).not.toBeNull();
    expect(gateChunk(t.text, t.allowed).ok).toBe(true);
  });
  it("forget has no model text at all; nothing built, nothing offered", () => {
    expect(ask({ a: "forget", all: false }, "forget that")?.text).toBeTruthy();
    expect(confirmAsk(null, { a: "remember" }, "x", "en", zones)).toBeNull();
  });
});

describe("a screen's line in the turn's memory is code's, never a record's title (Numbers 2)", () => {
  const doc = (o: Partial<StageDocT>): StageDocT => ({ recipe: "cases", title: "Ravi Kumar of 4th street: drain overflowing for 3 days", slots: {}, scope: { period: "weekly", zone: 13, dept: null, cat: null, taluk: null, sev: null }, ...o } as unknown as StageDocT);
  it("a case screen: its id", () => {
    const l = screenLabel(doc({ recipe: "case", slots: { id: "INC-2026-0042" } }));
    expect(l).toContain("INC-2026-0042");
    expect(l).not.toMatch(/Ravi|street|drain/);
  });
  it("any other screen: its recipe and scope", () => {
    const l = screenLabel(doc({}));
    expect(l).toMatch(/cases/);
    expect(l).not.toMatch(/Ravi|street|drain/);
  });
});

describe("the progress line and the evidence chip belong to this turn (UI 1, UI 2)", () => {
  const st = (id: string, at: number): WorkStep => ({ id, label: id, state: "done", ms: 100, at });
  it("steps from before the turn began are not shown", () => {
    expect(currentSteps([st("old", 100), st("new", 900)], 500).map((s) => s.id)).toEqual(["new"]);
    expect(currentSteps([st("a", 100)], 0).map((s) => s.id)).toEqual(["a"]);
  });
  it("a time is shown only when it was measured for this turn", () => {
    expect(turnMs({ gen: 3, findingMs: 1800, lastMs: 900 }, 3)).toBe(1800);
    expect(turnMs({ gen: 3, findingMs: null, lastMs: 900 }, 3)).toBe(900);
    expect(turnMs({ gen: 3, findingMs: 1800, lastMs: 900 }, 4)).toBeNull();
    expect(turnMs(null, 4)).toBeNull();
  });
  it("live regions settle for half a second", () => expect(SETTLE_MS).toBe(500));
});

describe("a streamed answer on the server's voice is asked for once (Planner 3)", () => {
  it("sentences queue only on the browser's own voice", () => {
    expect(queuesSentences("browser")).toBe(true);
    expect(queuesSentences("pcm")).toBe(false);
    expect(queuesSentences("text")).toBe(false);
  });
});
