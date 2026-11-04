/**
 * A live check of Jarvis's Claude rung through the real planner, on sentences written for this check: five calls, a few US cents.
 * Then the fallback: with no key, and with a key Anthropic refuses, the same turn is answered by Groq. Run with:
 *   npx vitest run --config vitest.live.config.ts src/lib/ai/claude.live.ts
 */
import { expect, it, vi } from "vitest";
import { WORLD } from "@/lib/thunai/fixture";
import { ZONE_TA_NAME } from "@/lib/thunai/lexicon";
import { clearCaches, planRound, RoundBody } from "@/lib/thunai/round";
import { fakeHands } from "@/lib/thunai/stagefake";
import { referenceWorld } from "@/lib/thunai/world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false };

async function ask(text: string, tag: string) {
  clearCaches();
  const t0 = Date.now();
  const body = RoundBody.parse({ turnId: `live-${tag}-${t0}`, round: 0, text, turns: [], stage: null, direct: null, state: STATE });
  const o = await planRound(body, world, fakeHands(), "live");
  const r = o.result;
  const row = { tag, lane: o.lane, kind: r?.kind, recipe: r?.stage?.recipe ?? null, model: r?.model ?? null, hops: o.hops, tokens: o.tokens, calls: o.calls, ms: Date.now() - t0, note: r?.note ?? null };
  console.log(JSON.stringify(row));
  return row;
}

it.runIf(!!process.env.ANTHROPIC_API_KEY)("Claude answers first", async () => {
  const rows = [
    await ask("How is the storm water department keeping up with its closures this quarter?", "en"),
    await ask("மாதவரம் மண்டலத்துல போன மாசம் கொசு தொல்லை எப்படி கூடி குறைஞ்சு இருக்கு?", "ta"),
    await ask("Tondiarpet kooda Manali la kuppai complaints oppittu paakanum", "tanglish"),
    await ask("Who painted the ceiling of the Sistine Chapel?", "general"),
    await ask("கோடம்பாக்கம் பக்கத்துல ஒரு கிலோமீட்டர்ல இருக்கிற ஆஸ்பத்திரி எல்லாம் காட்டு", "ta2")
  ];
  expect(rows.filter((r) => /^claude-/.test(r.model ?? "") || r.lane === "quick").length).toBeGreaterThan(0);
  await new Promise((r) => setTimeout(r, 1500));
});

it("with no key, Groq answers", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const r = await ask("How is the storm water department keeping up with its closures this quarter?", "no-key");
  vi.unstubAllEnvs();
  expect(r.hops.some((h) => h.startsWith("anthropic"))).toBe(false);
  expect(r.model).toMatch(/qwen|gpt-oss|gemini/);
});

it("with a key Anthropic refuses, the same turn goes on to Groq", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "not-a-real-key");
  const r = await ask("How is the storm water department keeping up with its closures this quarter?", "bad-key");
  vi.unstubAllEnvs();
  expect(r.hops[0]).toMatch(/^anthropic.*:failed$/);
  expect(r.model).toMatch(/qwen|gpt-oss|gemini/);
});
