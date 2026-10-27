import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { forward, haveStore, holder, loadFrozen } from "./harness";

// With a model available, questions the store answers exactly must not go to the router (it once read "Ward 120" as a
// place name and answered zero beside 24 incidents recorded in that ward).
const calls: string[] = [];
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: true, problem: null, providers: ["test"], stt: "" }),
    // the writer (9123cf9) only rewords an answer the store already gave; no model may decide it (router, planner)
    generateJson: async (o: { kind?: string; name?: string }) => { if (o?.name !== "writer") calls.push(String(o?.kind ?? o?.name ?? "model")); throw new m.AiUnavailableError(); } };
});
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

let frozenAt = new Date();
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  frozenAt = f.frozenAt;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
});
afterAll(() => vi.useRealTimers());

it("answers a ward-number list or count from the store, without the model", async () => {
  if (!haveStore()) return;
  void forward;
  const { ask } = await import("@/lib/assistant/pipeline");
  // the store's own count (the console's monthly period is the last 30 days), so the test holds on every freeze
  const since = new Date(frozenAt.getTime() + 5.5 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 19).replace("T", " ");
  const n = Number((holder.db!.prepare("SELECT COUNT(*) AS n FROM incidents WHERE ward_no = 120 AND first_reported_at >= ?").get(since) as { n: number }).n);
  expect(n).toBeGreaterThan(0);
  for (const [message, want] of [["incidents in ward 120 this month", new RegExp(`\\b${n} incidents\\b`)],
                                 ["how many incidents in ward 120 this month", new RegExp(`^${n} incidents`)]] as const) {
    calls.length = 0;
    const r = await ask({ user: "golden@test", sessionId: null, message, inputMode: "text", language: "auto",
      scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
    expect(calls, message).toEqual([]);
    expect(r.card.scopeLine).toMatch(/Ward 120/);
    expect(`${r.card.headline} ${r.card.answerMarkdown}`).toMatch(want);
  }
});

// R-13 (27 Oct 2026): "How many open grievances are there in Adyar?" showed "Of them open: 85" beside "Incidents with
// complaints: 85" (true by definition for open complaints), and the answer read it as "all 85 remain open, no closure recorded"
it("an open-complaints count does not show 'Of them open'", async () => {
  if (!haveStore()) return;
  const { ask } = await import("@/lib/assistant/pipeline");
  const r = await ask({ user: "golden@test", sessionId: null, message: "How many open grievances are there in Adyar?", inputMode: "text", language: "auto",
    scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
  const labels = (r.card.kpis ?? []).map((k) => k.label);
  expect(labels).toContain("Open complaints");
  expect(labels).not.toContain("Of them open");
});
