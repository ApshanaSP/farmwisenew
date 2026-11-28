/**
 * v20 (28 Nov 2026): the cache rules of the AI panels (analysis.ts: "What happened" / "Why it needs you"; aibrief.ts aiJson: the Briefing's
 * key points, stories, Reports differ). Only an answer that passed the figure check is kept; a miss is remembered for minutes, never hours,
 * and never stands in for the AI's answer; the second ask names the stray figures; the third goes to the next provider. Mocked gateway and store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => ({ fn: null as null | ((c: Record<string, unknown>) => Promise<unknown>), calls: [] as Record<string, unknown>[] }));
vi.mock("@/lib/ai/gateway", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gateway")>()),
  generateJson: async (c: Record<string, unknown>) => { gen.calls.push(c); return gen.fn!(c); }
}));
vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] }, TITLE: "i.title", ops: (t: string) => t }));
vi.mock("@/lib/collector/intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/collector/intel")>()),
  asOfNow: () => "2026-11-28 10:00:00",
  incident: async (id: string) => ({
    incident: { id, title: "Water logging on Anna Salai", type: "Flooding", sev: "High", severity_reasons: "", status: "Open", loc: "Anna Salai", zone_name: "Teynampet",
      dept: "GCC-SWD", dept_name: "Storm Water Drain", t: "2026-11-28 07:42:00", hours_open: 2, sla_due: "2026-11-29 07:42:00", complaints: 14,
      updated: `u-${id}`, why: { facts: [], summary: "", attention: [], needsYou: true, what: [], why: [], next: null, ai: false } },
    reports: [{ t: "2026-11-28 07:42:00", source: "grievance", text: "Knee-deep water near the bus stop" }], deptReports: [], emails: [], group: []
  })
}));

import { AiBusyError } from "@/lib/ai/gateway";
import { NO_AI_WORDS, incidentAnalysis, strayNumbers } from "./analysis";
import { aiJson } from "./aibrief";
import { z } from "zod";

const good = { what_happened: "Citizens reported water logging on Anna Salai in Teynampet zone on 28 Nov at 07:42, with 14 complaints so far.",
  why: [{ title: "Many citizens affected", detail: "14 citizens have complained." }], handled: "", next_step: "Storm Water Drain to clear the drain today." };
const stray = { ...good, what_happened: "Citizens reported water logging on Anna Salai in Teynampet zone on 28 Nov; it has gone on for 48 hours, with 14 complaints." };
const ok = (o: unknown, provider = "anthropic") => ({ object: o, info: { provider, model: provider === "anthropic" ? "claude-haiku-5-5" : "openai/gpt-oss-20b" } });

describe("v20: the incident panel's AI answer and its misses", () => {
  beforeEach(() => { gen.calls = []; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-28T04:30:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("an answer that passes the figure check is kept: the panel opened again asks no model", async () => {
    gen.fn = async () => ok(good);
    const a = await incidentAnalysis("INC-A1", "c@x");
    expect(a.analysis?.model).toBe("claude-haiku-5-5");
    expect(a.noAi).toBeNull();
    expect((await incidentAnalysis("INC-A1", "c@x")).analysis?.what).toBe(good.what_happened);
    expect(gen.calls).toHaveLength(1);
    // Claude has 15 s of its own; on Groq the larger free model writes it
    expect(gen.calls[0]).toMatchObject({ claudeMs: 15_000, first: ["openai/gpt-oss-120b"] });
  });

  it("no provider answers: the panel says AI unavailable, the miss rests 2 minutes (no call meanwhile), then the AI is asked again", async () => {
    gen.fn = async () => { throw new AiBusyError(20); };
    const a = await incidentAnalysis("INC-A2", "c@x");
    expect(a).toEqual({ analysis: null, noAi: "unavailable" });
    expect(NO_AI_WORDS.unavailable).toBe("AI unavailable, showing the rules summary.");
    expect((await incidentAnalysis("INC-A2", "c@x")).noAi).toBe("unavailable");
    expect(gen.calls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-28T04:32:30Z"));
    gen.fn = async () => ok(good);
    const b = await incidentAnalysis("INC-A2", "c@x");
    expect(b.analysis?.what).toBe(good.what_happened);
    expect(gen.calls).toHaveLength(2);
  });

  it("a figure the records do not give: the second ask names it; the same provider wrong twice, the next provider writes the third", async () => {
    let n = 0;
    gen.fn = async (c) => (++n < 3 ? ok(stray) : ok(good, (c.skip as string[] | undefined)?.includes("anthropic") ? "groq" : "anthropic"));
    const a = await incidentAnalysis("INC-A3", "c@x");
    expect(gen.calls).toHaveLength(3);
    expect(String(gen.calls[1].prompt)).toMatch(/used 48, which the facts do not give/);
    expect(gen.calls[2].skip).toEqual(["anthropic"]);
    expect(a.analysis?.model).toBe("openai/gpt-oss-20b");
  });

  it("every answer with a stray figure: the rules' text with its note, remembered 10 minutes, never kept as the answer", async () => {
    gen.fn = async () => ok(stray);
    const a = await incidentAnalysis("INC-A4", "c@x");
    expect(a).toEqual({ analysis: null, noAi: "unchecked" });
    vi.setSystemTime(new Date("2026-11-28T04:39:00Z"));
    expect((await incidentAnalysis("INC-A4", "c@x")).noAi).toBe("unchecked");
    expect(gen.calls).toHaveLength(3);
    vi.setSystemTime(new Date("2026-11-28T04:41:00Z"));
    gen.fn = async () => ok(good);
    expect((await incidentAnalysis("INC-A4", "c@x")).analysis).not.toBeNull();
  });

  it("the Briefing's look (peek) asks no model; its warm-up runs in the background and does not hold the page", async () => {
    gen.fn = async () => ok(good);
    expect(await incidentAnalysis("INC-A5", "briefing", { peek: true })).toEqual({ analysis: null, noAi: null });
    expect(gen.calls).toHaveLength(0);
    let release!: () => void;
    gen.fn = () => new Promise((r) => { release = () => r(ok(good)); });
    const w = await incidentAnalysis("INC-A5", "briefing", { background: true, waitMs: 0 });
    expect(w.pending).toBe(true);
    expect(gen.calls[0].background).toBe(true);
    release();
    await vi.waitFor(async () => expect((await incidentAnalysis("INC-A5", "briefing", { peek: true })).analysis).not.toBeNull());
  });

  it("a background write that failed (its own allowance) does not stop the Collector's own click from asking", async () => {
    gen.fn = async () => { throw new AiBusyError(20); };
    expect((await incidentAnalysis("INC-A6", "briefing", { background: true })).noAi).toBe("unavailable");
    expect((await incidentAnalysis("INC-A6", "briefing", { background: true })).noAi).toBe("unavailable");
    expect(gen.calls).toHaveLength(1);
    gen.fn = async () => ok(good);
    expect((await incidentAnalysis("INC-A6", "c@x")).analysis).not.toBeNull();
    expect(gen.calls).toHaveLength(2);
  });

  it("strayNumbers lists only figures the facts do not give (counts up to 12 and the facts' own numbers pass)", () => {
    expect(strayNumbers("3 people, 14 complaints, 48 hours, 07:42", "14 complaints at 07:42")).toEqual(["48"]);
  });
});

describe("v20: a write-up no model could give rests for minutes (aiJson)", () => {
  beforeEach(() => { gen.calls = []; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-28T04:30:00Z")); });
  afterEach(() => { vi.useRealTimers(); });
  const S = z.object({ text: z.string() });
  const ask = (facts: string) => aiJson({ kind: "test-brief", system: "s", facts, schema: S, user: "c@x", text: (o) => o.text, ok: (o) => o.text.length > 5 });

  it("a failure is not asked again on every poll of the page, and the next try after the rest can succeed", async () => {
    gen.fn = async () => { throw new AiBusyError(20); };
    expect(await ask("Facts: 14 complaints.")).toBeNull();
    expect(await ask("Facts: 14 complaints.")).toBeNull();
    expect(gen.calls).toHaveLength(1);
    expect(gen.calls[0].background).toBe(true);
    vi.setSystemTime(new Date("2026-11-28T04:32:30Z"));
    gen.fn = async () => ({ object: { text: "There were 14 complaints." }, info: { provider: "gemini", model: "gemini-3.5-flash-lite" } });
    expect((await ask("Facts: 14 complaints."))?.model).toBe("gemini-3.5-flash-lite");
  });

  it("the second ask names the stray figure; the third skips the provider that got it wrong twice", async () => {
    let n = 0;
    gen.fn = async () => ({ object: { text: ++n < 3 ? "There were 41 complaints." : "There were 14 complaints." }, info: { provider: "anthropic", model: "claude-haiku-5-5" } });
    expect(await ask("Facts: 14 complaints today.")).not.toBeNull();
    expect(String(gen.calls[1].prompt)).toMatch(/used 41/);
    expect(gen.calls[2].skip).toEqual(["anthropic"]);
  });
});
