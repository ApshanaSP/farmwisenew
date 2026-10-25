/**
 * Agent mode through the whole pipeline on the frozen store, with the language model replaced by a script (no Groq):
 * the model leaves the category out of change_drivers for "why is flooding high in Adyar", and the composer's first draft
 * corrects itself. The code must narrow the call to flooding, ask for a second draft, and show only the clean one.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "./harness";

const calls: { name: string; prompt: string }[] = [];

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  const info = (step: string) => ({ step, provider: "groq" as const, model: "script", ms: 1, inputTokens: 0, outputTokens: 0, attempts: 1 });
  const draft = (md: string) => ({ display: "text", headline: "Flooding rose to {{reported.now}} in Adyar", answerMarkdown: md, chart: null,
    voiceSummary: "Flooding rose to {{reported.now}}.", followUps: [], consoleActions: [], caveats: [], chartReason: null, usedFactIds: [] });
  return {
    ...m,
    aiStatus: () => ({ available: true, problem: null, providers: [{ name: "groq", fast: "script", reasoning: "script" }], stt: "" }),
    generateJson: async (c: { name: string; prompt: string }) => {
      calls.push({ name: c.name, prompt: c.prompt });
      if (c.name === "agent0") return { info: info(c.name), object: {
        action: "tools", language: "en", question: "Why is flooding high in Adyar this month?", done: true, brief: null, show: null, clarify: null,
        refusal: null, visual: false, chartType: null,
        // the category is left out, as the model did in the live run
        calls: [{ tool: "change_drivers", period: "monthly", zone: 13, dept: null, cat: null, taluk: null, id: null, text: null, q: null, place: null,
          metric: null, above: null, below: null, commodity: null, market: null, sev: null, status: null, allTime: null }] } };
      if (c.name === "composer") {
        const first = calls.filter((x) => x.name === "composer").length === 1;
        return { info: info(c.name), object: first
          ? draft("Reported incidents rose to {{reported.now}} from {{reported.prev}}. Saying {{reported.prev}} is incorrect, it is {{reported.now}}.")
          : draft("Reported incidents rose to {{reported.now}} from {{reported.prev}} in the period before.") };
      }
      throw new m.AiUnavailableError();
    }
  };
});

beforeAll(async () => {
  process.env.AI_CHAT_MODE = "agent";
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
});
afterAll(() => { vi.useRealTimers(); delete process.env.AI_CHAT_MODE; });

describe("agent mode fixes (scripted model, frozen store)", () => {
  it.skipIf(!haveStore())("narrows change_drivers to the named category and drops a self-correcting draft", async () => {
    const { ask } = await import("@/lib/assistant/pipeline");
    const out = await ask({ user: "agentfix@test", sessionId: null, message: "why is flooding high in Adyar this month", inputMode: "text", language: "auto",
      scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
    const c = out.card;
    const tool = c.sources.tools.find((t) => t.name === "change_drivers");
    expect((tool?.args.scope as { cat?: string } | undefined)?.cat).toBe("FLOOD_WATERLOGGING");
    expect(c.sources.assumptions.some((a) => /Narrowed to Flooding/.test(a))).toBe(true);
    // the first draft corrected itself: a second was asked for, and only it is shown
    expect(calls.filter((x) => x.name === "composer")).toHaveLength(2);
    expect(calls.filter((x) => x.name === "composer")[1].prompt).toMatch(/corrects itself/);
    expect(`${c.headline} ${c.answerMarkdown}`).not.toMatch(/incorrect/i);
    expect(c.answerMarkdown).toMatch(/^Reported incidents rose to \d/);
    expect(c.sources.verifier).toMatchObject({ template: false, regenerated: true });
  }, 120_000);
});
