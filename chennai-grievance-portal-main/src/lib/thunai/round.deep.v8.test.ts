import { beforeEach, describe, expect, it } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";

// v8 (deep8.ts, the review 18 Nov): one deep call a turn at most; "other" is not re-asked of the same narrow bundle.
const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, o: Partial<RoundBodyT> = {}): RoundBodyT => RoundBody.parse({ turnId: `t${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null, ...o });
function model(answer: (c: JsonCall<unknown>, n: number) => unknown) {
  const asked: { model: string; provider: string }[] = [];
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    asked.push({ model: c.only?.models[0] ?? "", provider: c.only?.provider ?? "" });
    const object = answer(c as JsonCall<unknown>, asked.length) as U;
    return { object, info: { step: c.name, provider: c.only?.provider ?? "groq", model: c.only?.models[0] ?? "m", ms: 3, inputTokens: 100, outputTokens: 60, attempts: 1 } };
  };
  return { generate: generate as never, asked };
}
// the owner's key works (claudeOk), so the deep model can be reached
const deps = (m: ReturnType<typeof model>) => ({ llm: { generate: m.generate, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => true } });
const clarify = { kind: "clarify", lang: "en", reply: "Which one?", options: [{ label: "a", request: "a" }, { label: "b", request: "b" }], screen: null };
const other = { kind: "other", lang: "en", reply: "", options: [], screen: null };

beforeEach(() => clearCaches());

describe("v8: one deep call a turn", () => {
  it("a fast plan asking back is asked once more of the deep model; its 'other' then goes wider on the fast ladder, not the deep model again", async () => {
    const m = model((_c, n) => (n === 1 ? clarify : n === 2 ? other : clarify));
    await planRound(body("quxly frobnicate the wibble for tomorrow"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    expect(m.asked.filter((x) => x.model === "claude-sonnet-5-5").length).toBe(1);
  });
  it("a fast plan of 'other' is not re-asked of the same bundle by the deep model first", async () => {
    const m = model((_c, n) => (n === 1 ? other : clarify));
    await planRound(body("quxly frobnicate the wibble for tomorrow"), WORLD, fakeHands(), "u", undefined, undefined, deps(m));
    // the second call is the wider bundle's (with the deep model, as none was used yet), and there is no third
    expect(m.asked.length).toBe(2);
    expect(m.asked[1].model).toBe("claude-sonnet-5-5");
  });
});
