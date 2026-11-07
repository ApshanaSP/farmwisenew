// RC-13 through the real round (planRound on the pinned snapshot): a model's chat line that holds a figure in any digit script
// or any number word, in English, Tamil script or Tanglish, is never said. A fake model at the boundary gives the line.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/rc13-gate-real-path.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { serverHands } from "@/lib/thunai/data";
import { serverWorld } from "@/lib/thunai/world";
import { clearCaches, planRound, RoundBody } from "@/lib/thunai/round";
import { Ledger, MemoryStore } from "@/lib/thunai/ledger";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";

const USER = "qa.rc13@example.test";
let turn = 0;
const state = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false };
const fake = (reply: string) => {
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => ({
    object: (c.name === "jarvis_router" ? { lane: "district" } : { kind: "chat", lang: "en", reply, options: [] }) as U,
    info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 1, outputTokens: 1 } } as never);
  return { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } as never;
};
async function said(text: string, reply: string) {
  const body = RoundBody.parse({ turnId: `rc13-${++turn}`, round: 0, text, turns: [], lastText: null, stage: null, direct: null, state });
  const r = await planRound(body, await serverWorld(), serverHands({ email: USER, role: "collector", lockDept: null }), USER, { notes: [], habits: {} }, undefined, { llm: fake(reply) });
  return r.result?.reply ?? "";
}

beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); clearCaches(); await asOf(); });
afterAll(() => { vi.useRealTimers(); });

const LINES: [string, string][] = [
  ["en fullwidth digits", "There are ４７ open cases in Adyar right now."],
  ["en Arabic-Indic digits", "There are ٤٧ open cases in Adyar right now."],
  ["en Devanagari digits", "There are ४७ open cases in Adyar right now."],
  ["en word, compound", "There are forty-seven open cases in Adyar right now."],
  ["en one, no noun", "Only one is open in Adyar right now."],
  ["en single", "There is a single severe case open in Adyar."],
  ["ta digits, Bengali", "அடையாறில் ৪৭ சம்பவங்கள் திறந்துள்ளன."],
  ["ta word", "அடையாறில் நாற்பத்தேழு சம்பவங்கள் திறந்துள்ளன."],
  ["ta one", "அடையாறில் ஒரே ஒரு கடுமையான சம்பவம் மட்டுமே உள்ளது."],
  ["tanglish word", "Adyar la muppadhu complaints irukku."],
  ["tanglish one", "Adyar la onnu dhaan open la irukku."],
  ["tanglish digits", "Adyar la ４７ complaints irukku."]
];
describe("RC-13: the number gate through the real round", () => {
  it.each(LINES)("%s: the line is not said", async (_name, reply) => {
    const out = await said("is Adyar ok right now tell me plainly", reply);
    expect(out).not.toBe(reply);
    expect(out).not.toMatch(/\p{Nd}/u);
  });
  it("a line with no figure in it is still said (control)", async () => {
    const reply = "Adyar looks calm; ask me for the list if you want to see it.";
    expect(await said("is Adyar ok right now tell me plainly", reply)).toBe(reply);
  });
});
