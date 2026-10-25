/**
 * Ask District IQ's golden questions (npm run eval:golden), on frozen data with no language model: each question's route,
 * scope, language and refusals are checked, and where an answer states a number it is recomputed here with plain SQL on the
 * same data. Every answer is also checked for leaks (raw JSON, "undefined", "NaN") and for wording the product rules forbid.
 * The scorecard is written to eval/store/golden-report.json; the test fails below a 95% pass rate.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnswerCard } from "@/lib/assistant/answer";
import { ALWAYS, CASES, getNow, setNow } from "./cases";
import { STORE, haveStore, holder, loadFrozen } from "./harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("./harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});
vi.mock("@/lib/assistant/lance", () => ({ hybridSearch: async () => null, holdSync: () => () => undefined, lanceWarm: () => undefined,
  currentIncidentIds: async () => [], lanceReady: async () => false, lanceStatus: async () => ({}) }));
vi.mock("@/lib/assistant/embed", () => ({ ModelNotReady: class extends Error {}, warmUp: () => undefined, embed: async () => { throw new Error("no model"); },
  semanticSearch: async () => [], embedStatus: () => ({ ready: false }) }));

const results: { id: string; area: string; q: string; ok: boolean; why: string | null; ms: number; headline: string }[] = [];

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  setNow(await (await import("@/lib/collector/intel")).asOf());
});
afterAll(() => {
  vi.useRealTimers();
  if (!results.length) return;
  const passed = results.filter((r) => r.ok).length;
  const byArea = Object.fromEntries([...new Set(results.map((r) => r.area))].map((a) => {
    const xs = results.filter((r) => r.area === a);
    return [a, `${xs.filter((r) => r.ok).length}/${xs.length}`];
  }));
  fs.writeFileSync(path.join(STORE, "golden-report.json"), JSON.stringify({ at: new Date().toISOString(), now: getNow(), passed, total: results.length,
    rate: Math.round((passed / results.length) * 1000) / 10, byArea, results }, null, 1));
});

describe("Ask District IQ golden questions (frozen data, no AI)", () => {
  it.skipIf(!haveStore())("answers at least 95% correctly", async () => {
    const { ask } = await import("@/lib/assistant/pipeline");
    const id = (holder.db!.prepare("SELECT incident_id AS id FROM incidents WHERE severity_level = 'Severe' AND is_open = 1 ORDER BY priority_score DESC LIMIT 1").get() as { id: string }).id;
    for (const c of CASES) {
      const chain = Array.isArray(c.q) ? c.q : [c.q];
      let sessionId: string | null = null, card: AnswerCard | null = null, why: string | null = null;
      const t0 = performance.now();
      for (const raw of chain) {
        const q = raw.replace("__ID__", id).replace("__LONG__", "Please tell me about flooding in Adyar. ".repeat(130));
        try {
          const out = await ask({ user: "golden@test", sessionId, message: q, inputMode: "text", language: "auto", lockDept: c.lock ?? null,
            scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null }, replyTo: null, stage: () => undefined });
          sessionId = out.sessionId;
          card = out.card;
          why = why ?? ALWAYS(card);
        } catch (e) {
          why = `threw: ${(e as Error).message.slice(0, 200)}`;
          break;
        }
      }
      if (!why && card) why = c.check(card);
      results.push({ id: c.id, area: c.area, q: chain.join(" → "), ok: !why, why, ms: Math.round(performance.now() - t0), headline: card?.headline ?? "" });
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.log(failed.map((r) => `FAIL ${r.id}: ${r.why}`).join("\n"));
    expect(results.filter((r) => r.ok).length / results.length).toBeGreaterThanOrEqual(0.95);
  }, 600_000);
});
