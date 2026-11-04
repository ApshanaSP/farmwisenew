/**
 * The Gemini fallback, proved live: one call through the planner's schema, on the model the ladder would use. Costs one
 * flash-lite request.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/gemini.live.ts
 * (HOLD_GEMINI=1 skips.)
 */
import { expect, it } from "vitest";
import { generateJson } from "@/lib/ai/gateway";
import { AgentPlanLenient, AgentPlanSchema, agentSystem } from "./agent";
import { WORLD } from "./fixture";

it.skipIf(process.env.HOLD_GEMINI === "1")("flash-lite answers the agent's strict plan schema", async () => {
  const t0 = Date.now();
  const r = await generateJson({
    role: "fast", name: "thunai_agent0", schema: AgentPlanSchema, lenient: AgentPlanLenient, system: agentSystem(WORLD), prompt: 'The Collector said: "compare Adyar and Ambattur this week". Reply language: English (lang en).',
    temperature: 0, maxOutputTokens: 1100, user: "probe", timeoutMs: 12_000, lane: "hedge", only: { provider: "gemini", models: ["gemini-3.5-flash-lite"] }
  });
  console.log(JSON.stringify({ ms: Date.now() - t0, model: r.info.model, tokens: r.info.inputTokens + r.info.outputTokens, kind: r.object.kind, screen: r.object.screen?.recipe ?? null, zones: r.object.screen?.zones ?? null }));
  expect(r.object.kind).toBeTruthy();
}, 60_000);
