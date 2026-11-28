/**
 * 28 Nov: a dashboard asked for in so many words is built by code before the model's first round (index.ts boardInput, loop.ts `pre`), and the
 * model writes its summary from the dashboard's own figures in one round; any other question carries the form its answer should take. Claude,
 * the store, the spend ledger and the telemetry are stand-ins here: no model is called and nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORLD } from "@/lib/thunai/fixture";
import { fakeHands } from "@/lib/thunai/stagefake";
import type { WinHands, WinIncidents, WinScope } from "@/lib/thunai/v18/window";

const h = vi.hoisted(() => ({ calls: [] as { messages: unknown[]; tools: { name: string }[] }[], answer: {} as Record<string, unknown> }));
vi.mock("@/lib/ai/claude", () => ({
  claudeConfigured: () => true,
  claudeTools: async (a: { messages: unknown[]; tools: { name: string }[] }) => {
    h.calls.push(a);
    return { message: { content: [{ type: "tool_use", id: `t${h.calls.length}`, name: "answer", input: h.answer }], stop_reason: "tool_use" }, model: "claude-haiku-5-5", ms: 5, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
  }
}));
vi.mock("@/lib/thunai/ledger", () => ({ ledger: () => ({ room: () => ({ ok: true }), record: () => undefined, spent: () => ({ requests: 0, tokens: 0 }) }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: () => undefined }));

const inc = (n: number, severe: number): WinIncidents => ({ n, prev: n - 4, severe, prevSevere: 1, open: Math.ceil(n / 2), overdue: 2, resolved: 3, dead: 0, injured: 0, complaints: 4, rain: 0,
  kinds: [{ cat: "FLOOD_WATERLOGGING", label: "Flooding & waterlogging", n, prev: 1, severe, open: 2 }], zones: [], depts: [], places: [], buckets: [{ at: "2026-11-27", n, severe }], byHour: false, top: [], points: [] });
const asked: WinScope[] = [];
const win: WinHands = {
  now: async () => "2026-11-28 10:00:00",
  incidents: async (_w, s) => { asked.push(s); return s.zone === 13 ? inc(34, 5) : inc(20, 2); },
  news: async () => ({ rows: [], total: 0 }), readings: async () => ({ rows: [], nearest: null }), warning: async () => null,
  prices: async () => ({ market: null, rows: [], latest: null, inWindow: false, held: null, fetched: false, keyed: true }), traffic: async () => null
};
vi.mock("@/lib/thunai/data", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/data")>()), serverHands: () => ({ ...fakeHands(), win }) }));

import { think } from "./loop";
import { boardInput } from "./index";
import { answerForm, boardAsk, formLine } from "@/lib/thunai/board";

const collector = { email: "c@test", role: "collector" as const, lockDept: null };
const base = { channel: "voice" as const, user: collector, world: WORLD, now: "2026-11-28 10:00:00", console: { page: "overview", period: "weekly" }, history: [], past: [] };
const textOf = (m: unknown): string => JSON.stringify(m);

beforeEach(() => { h.calls.length = 0; asked.length = 0; });

describe("a comparison asked for is a dashboard before the model reads a word", () => {
  it("runs the dashboard first, and the model answers from its figures in one round", async () => {
    const q = "Create a comparative dashboard of Anna Nagar and Adyar for severe incidents";
    const say = "Adyar had 34 severe incidents against 20 in Anna Nagar over the last 7 days.";
    h.answer = { kind: "answer", scope: "records", lang: "en", say, title: "Anna Nagar vs Adyar, severe", points: ["Adyar: 34 severe, 17 still open.", "Anna Nagar: 20 severe, 10 still open."], show: [] };
    const out = await think({ ...base, text: q, until: Date.now() + 20_000, pre: [{ tool: "board", input: boardInput(boardAsk(q, WORLD)!, WORLD) }] });
    expect(out).not.toBeNull();
    // code read both sides, severe only, before the model was asked
    expect(asked.map((s) => [s.zone, s.sev])).toEqual([[8, "Severe"], [13, "Severe"]]);
    expect(h.calls).toHaveLength(1);
    expect(textOf(h.calls[0].messages)).toContain("READ ALREADY for this request");
    expect(h.calls[0].tools.map((t) => t.name)).toContain("board");
    expect(out!.rounds).toBe(1);
    expect(out!.evidence[0]).toMatchObject({ id: "r1", tool: "board" });
    // the answer passed the check against the dashboard's own figures, and the dashboard goes with it
    expect(out!.answer.say).toBe(say);
    expect(out!.repaired).toEqual([]);
    expect(out!.screen?.recipe).toBe("compare");
    expect(out!.screen?.doc?.blocks[0].kind).toBe("Compare");
  });
  it("a figure the dashboard does not hold is sent back to the model", async () => {
    const q = "compare Anna Nagar and Adyar";
    h.answer = { kind: "answer", scope: "records", lang: "en", say: "Adyar had 99 incidents, far more than Anna Nagar.", title: "x", points: [], show: [] };
    const out = await think({ ...base, text: q, until: Date.now() + 20_000, pre: [{ tool: "board", input: boardInput(boardAsk(q, WORLD)!, WORLD) }] });
    expect(h.calls.length).toBeGreaterThan(1);
    expect(out!.answer.say).not.toMatch(/99/);
  });
});

describe("any other question carries the form its answer should take", () => {
  it("how many: one sentence with the figure", async () => {
    const q = "how many severe incidents this week";
    h.answer = { kind: "chat", scope: "console", lang: "en", say: "Ask me about the district.", title: "", points: [], show: [] };
    await think({ ...base, text: q, until: Date.now() + 20_000, form: formLine(answerForm(q, WORLD)) });
    expect(textOf(h.calls[0].messages)).toContain("ASKED: how many. say is ONE sentence");
    expect(formLine(answerForm("Which college has the highest complaints?", WORLD))).toMatch(/^ASKED: which or where/);
    expect(formLine(answerForm("Give me a summary of Royapuram today.", WORLD))).toBeNull();
  });
});
