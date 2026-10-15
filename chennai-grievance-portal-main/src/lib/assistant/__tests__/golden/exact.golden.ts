import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { forward, haveStore, loadFrozen } from "./harness";

// With a model available, questions the store answers exactly must not go to the router (it once read "Ward 120" as a
// place name and answered zero beside 24 incidents recorded in that ward).
const calls: string[] = [];
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: true, problem: null, providers: ["test"], stt: "" }),
    generateJson: async (o: { kind?: string }) => { calls.push(String(o?.kind ?? "model")); throw new m.AiUnavailableError(); } };
});
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
});
afterAll(() => vi.useRealTimers());

it("answers a ward-number list or count from the store, without the model", async () => {
  if (!haveStore()) return;
  void forward;
  const { ask } = await import("@/lib/assistant/pipeline");
  for (const [message, want] of [["incidents in ward 120 this month", /\b24 incidents\b/], ["how many incidents in ward 120 this month", /^24 incidents/]] as const) {
    calls.length = 0;
    const r = await ask({ user: "golden@test", sessionId: null, message, inputMode: "text", language: "auto",
      scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
    expect(calls, message).toEqual([]);
    expect(r.card.scopeLine).toMatch(/Ward 120/);
    expect(`${r.card.headline} ${r.card.answerMarkdown}`).toMatch(want);
  }
});
