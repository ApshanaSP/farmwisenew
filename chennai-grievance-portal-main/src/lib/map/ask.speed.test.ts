/**
 * Ask the Map speed round (23 Nov 2026), on the AI path with the model calls replaced: a follow-up's plan starts beside the turn
 * reader and is used only when the reader calls the message a new question that means what it says; live traffic is read while
 * the AI works and waited for only when the answer is about roads; an answer the executor refuses still says the AI read it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureResolver, fixtureWorld } from "./fixture";
import type { Plan } from "./plan";

const W = { world: fixtureWorld(), resolver: fixtureResolver() };
vi.mock("./world", () => ({ world: async () => W }));
vi.mock("@/lib/assistant/scope", () => ({ refNames: async () => { throw new Error("no store in this test"); } }));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<object>()), aiStatus: () => ({ available: true, problem: null, providers: ["anthropic"], stt: "" }) }));
const h = vi.hoisted(() => ({ plans: [] as { text: string; prev: unknown; meant: unknown }[], answer: null as unknown, turn: null as unknown, traffic: [] as unknown[], claude: true }));
vi.mock("./ai", async (orig) => ({
  ...(await orig<object>()),
  planOnClaude: () => h.claude,
  aiPlan: vi.fn(async (text: string, prev: unknown, c: { meant?: unknown; timing?: { tries: number } }) => {
    h.plans.push({ text, prev, meant: c.meant ?? null });
    if (c.timing) c.timing.tries = 1;
    await new Promise((r) => setTimeout(r, 20));
    return h.answer;
  })
}));
vi.mock("./turn", () => ({ readTurn: vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return h.turn; }) }));
// a traffic feed that never answers: only an answer about roads may wait for it (and then 2.5 s at most)
vi.mock("@/lib/city/traffic", () => ({ trafficNow: vi.fn((o: unknown) => { h.traffic.push(o); return new Promise(() => undefined); }) }));

import { askMap } from "./ask";

const F = { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null };
const garbage: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: { ...F, category: ["SOLID_WASTE"] } as never, where: null }] };
const flooding: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: { ...F, category: ["FLOOD_WATERLOGGING"] } as never, where: null }] };
const user = { email: "collector@test", role: "collector" as const, lockDept: null };
const context = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
const followUp = (text: string) => askMap({ text, plan: null, prev: flooding, history: [{ q: "flooding this month", a: "8 open flooding cases" }], context, user });

beforeEach(() => { h.plans.length = 0; h.traffic.length = 0; h.answer = { plan: garbage, intent: "plan" }; h.turn = null; h.claude = true; });
afterEach(() => { delete process.env.MAP_PARALLEL_PLAN; });

describe("a follow-up's plan beside the turn reader", () => {
  it("a new question that means what it says: the plan made beside the reader is the answer's, one call", async () => {
    h.turn = { why: "own subject", relation: "new_question", points_to: 0, standalone: "Garbage complaints this month?" };
    const r = await followUp("garbage complaints this month");
    expect(h.plans).toEqual([{ text: "garbage complaints this month", prev: null, meant: null }]);
    expect(r.turn?.relation).toBe("new_question");
    expect(r.kind).toBe("answer");
    expect(r.ai_used).toBe(true);
  });

  it("a follow-up: the early plan is left unused and the plan edits the conversation's own", async () => {
    h.turn = { why: "edits the time", relation: "follow_up", points_to: 0, standalone: "open flooding complaints last week" };
    await followUp("last week");
    expect(h.plans).toHaveLength(2);
    expect(h.plans[0]).toMatchObject({ text: "last week", prev: null });
    expect(h.plans[1]).toMatchObject({ text: "last week", prev: flooding, meant: "open flooding complaints last week" });
  });

  it("a new question the reader writes out differently, or no reading at all: planned again, as before", async () => {
    h.turn = { why: "points back", relation: "new_question", points_to: 0, standalone: "garbage complaints in Zone 1 this month" };
    await followUp("garbage there this month");
    expect(h.plans.map((p) => p.meant)).toEqual([null, "garbage complaints in Zone 1 this month"]);
    h.plans.length = 0; h.turn = null;
    await followUp("and garbage");
    expect(h.plans.map((p) => p.prev)).toEqual([null, flooding]);
  });

  it("MAP_PARALLEL_PLAN=0, or a planner that is not Claude: one plan after the reader, as before", async () => {
    process.env.MAP_PARALLEL_PLAN = "0";
    h.turn = { why: "edits the time", relation: "follow_up", points_to: 0, standalone: "open flooding complaints this week" };
    await followUp("this week");
    expect(h.plans).toEqual([{ text: "this week", prev: flooding, meant: "open flooding complaints this week" }]);
    delete process.env.MAP_PARALLEL_PLAN;
    h.plans.length = 0; h.claude = false;
    await followUp("this week");
    expect(h.plans).toHaveLength(1);
  });
});

describe("live traffic and the executor's refusals", () => {
  it("an answer not about roads does not wait for live traffic; the read was given the world it already had", async () => {
    const t = Date.now();
    const r = await askMap({ text: "open garbage complaints", plan: null, prev: null, context, user });
    expect(r.kind).toBe("answer");
    expect(Date.now() - t).toBeLessThan(2000);
    expect(h.traffic[0]).toMatchObject({ world: W.world });
  });

  it("a plan the executor refuses is said plainly, and still marked as read by the AI", async () => {
    h.answer = { plan: { language: "en", show: "far", steps: [{ op: "take", as: "f1", layer: "atms", filter: null, where: null }, { op: "farthest", as: "far", areas: "ward", from: "f1", beyond_m: 2000 }] }, intent: "plan" };
    const r = await askMap({ text: "wards with no atm within 2 km", plan: null, prev: null, context, user });
    expect(r.say?.en).toMatch(/no ATMs on the map/i);
    expect(r.ai_used).toBe(true);
  });
});
