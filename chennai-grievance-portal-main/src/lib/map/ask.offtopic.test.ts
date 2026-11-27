/**
 * 27 Nov, the topic guard (lib/topicguard) in Ask the Map: a question outside District IQ is declined in the one fixed sentence every
 * assistant says, before any model is asked; a question the model calls "not a map question" that the code check also declines gets the same
 * sentence. A match or a place named inside a map question stays a map question. The model calls are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureResolver, fixtureWorld } from "./fixture";
import type { Plan } from "./plan";

const W = { world: fixtureWorld(), resolver: fixtureResolver() };
vi.mock("./world", () => ({ world: async () => W }));
vi.mock("@/lib/assistant/scope", () => ({ refNames: async () => { throw new Error("no store in this test"); } }));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<object>()), aiStatus: () => ({ available: true, problem: null, providers: ["anthropic"], stt: "" }) }));
const h = vi.hoisted(() => ({ plans: [] as string[], answer: null as unknown, turn: null as unknown }));
vi.mock("./ai", async (orig) => ({
  ...(await orig<object>()),
  planOnClaude: () => false,
  aiPlan: vi.fn(async (text: string, _prev: unknown, c: { timing?: { tries: number } }) => { h.plans.push(text); if (c.timing) c.timing.tries = 1; return h.answer; })
}));
vi.mock("./turn", () => ({ readTurn: vi.fn(async () => h.turn) }));
vi.mock("@/lib/city/traffic", () => ({ trafficNow: vi.fn(async () => null) }));
vi.mock("fs", async (orig) => {
  const real = await orig<typeof import("fs")>();
  const appendFile = () => undefined; // the question log: nothing written from a test
  return { ...real, appendFile, default: { ...real, appendFile } };
});

import { askMap, EXAMPLES_EN, EXAMPLES_TA, offMapTopic, offTopicSay } from "./ask";

const F = { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: { kind: "last_days", days: 30, offset: 0 }, text: null };
const garbage: Plan = { language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", filter: { ...F, category: ["SOLID_WASTE"] } as never, where: null }] };
const collector = { email: "collector@test", role: "collector" as const, lockDept: null };
const context = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
const ask = (text: string, o: { user?: typeof collector | { email: string; role: "department_officer"; lockDept: string }; prev?: Plan | null; history?: { q: string; a: string }[] } = {}) =>
  askMap({ text, plan: null, prev: o.prev ?? null, history: o.history ?? null, context, user: o.user ?? collector });

beforeEach(() => { h.plans.length = 0; h.answer = { plan: garbage, intent: "plan" }; h.turn = null; });

describe("Ask the Map declines what is outside District IQ", () => {
  it("before any model: the fixed sentence, with the map's example questions", async () => {
    for (const text of ["When was Dhoni's retirement?", "Virat Kohli innings", "tell me a joke", "explain deep learning"]) {
      const r = await ask(text);
      expect(r.kind, text).toBe("say");
      expect(r.say?.en, text).toMatch(/^Sorry, that is outside what I cover\. I answer about Chennai district/);
      expect(r.say?.ta, text).toMatch(/^மன்னிக்கவும், அது என் பணிக்கு வெளியே உள்ளது\./);
      expect(r.say?.chips).toEqual(EXAMPLES_EN.slice(0, 4));
      expect(r.ai_used).toBe(false);
    }
    expect(h.plans).toEqual([]);
  });
  it("in the language asked: a Tamil question reads Tamil whatever the panel's language, Tanglish reads Tanglish", async () => {
    const ta = await ask("தோனி எப்போது ஓய்வு பெற்றார்?");
    expect(ta.say?.en).toMatch(/^மன்னிக்கவும்/);
    expect(ta.say?.chips).toEqual(EXAMPLES_TA);
    expect(offTopicSay("tanglish").en).toMatch(/velaikku veliya/);
    expect(h.plans).toEqual([]);
  });
  it("an officer hears their department named", async () => {
    const r = await ask("When was Dhoni's retirement?", { user: { email: "o@test", role: "department_officer", lockDept: "GCC-SWM" } });
    expect(r.say?.en).toMatch(/Solid Waste Management's records/);
  });
  it("a place, a layer or an event inside a map question keeps it in: the model plans it", async () => {
    // (a kind of place no layer word reads is the model's too: "cricket grounds" may be the playgrounds layer)
    for (const text of ["cricket grounds near Adyar", "traffic near Chepauk stadium for the IPL match", "open garbage complaints", "cricket grounds", "கிரிக்கெட் மைதானம்", "movie theatres"]) {
      h.plans.length = 0;
      const r = await ask(text);
      expect(h.plans.length, text).toBeGreaterThan(0);
      expect(r.say?.en ?? "", text).not.toMatch(/outside what I cover/);
    }
  });
  it("a follow-up that only leans on the conversation is the model's; its 'not a map question' on off-topic words is the fixed sentence", async () => {
    h.answer = { problems: ["not a map question"] };
    const r = await ask("and who won the match?", { prev: garbage, history: [{ q: "garbage complaints", a: "12 open garbage complaints" }] });
    expect(h.plans).toEqual(["and who won the match?"]);
    expect(r.say?.en).toMatch(/^Sorry, that is outside what I cover\./);
    expect(r.ai_used).toBe(true);
    // a not-map question with no off-topic subject keeps the map's own words
    h.plans.length = 0;
    const g = await ask("asdf qwerty zxcv");
    expect(g.say?.en).toMatch(/does not look like a question about the map/);
    // the model's "not a map question" on words that name a place in Chennai keeps the map's own words: it is no decline
    const p = await ask("cricket grounds near Adyar");
    expect(p.say?.en).toMatch(/does not look like a question about the map/);
  });
  it("the code check itself", () => {
    expect(offMapTopic("When was Dhoni's retirement?", false, () => false)).toBe(true);
    expect(offMapTopic("When was Dhoni's retirement?", false, () => true)).toBe(false);
    expect(offMapTopic("and who won the match?", true, () => false)).toBe(false);
    expect(offMapTopic("schools near flooding", false, () => false)).toBe(false);
    expect(offMapTopic("tell me a joke", false, () => { throw new Error("x"); })).toBe(false);
    expect(offMapTopic("cricket grounds", false, () => false)).toBe(false);
    expect(offMapTopic("Who won the IPL?", false, () => false)).toBe(true);
  });
});
