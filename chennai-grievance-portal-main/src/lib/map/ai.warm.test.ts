/**
 * Ask the Map speed round (23 Nov 2026): the planner's prompt-cache warm-up sends the plan call's own system block, schema and
 * model, at most once in four minutes, only on Claude, and only when MAP_PLAN_WARM=1. Claude is a test double.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ warms: [] as Record<string, unknown>[], providers: ["anthropic"] as string[] }));
vi.mock("@/lib/ai/claude", async (orig) => ({
  ...(await orig<object>()),
  claudeConfigured: () => true,
  claudeWarm: async (w: Record<string, unknown>) => { h.warms.push(w); return { model: String(w.model), ms: 300, maxTokens: 1, inputTokens: 9000, cacheRead: 0, cacheWrite: 9000, path: "format" }; }
}));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<object>()), featureProviders: () => h.providers }));

import { WARM_EVERY_MS, mapSystemPrompt, warmMapPlanner } from "./ai";
import { WirePlan } from "./wire";

const P = { cats: ["SOLID_WASTE", "FLOOD_WATERLOGGING"], depts: ["GCC-SWM"], zones: [{ zone: 1, name: "Northpet", lat: 13.1, lon: 80.2 }], catLabels: new Map([["SOLID_WASTE", "Garbage"]]) };

afterEach(() => { delete process.env.MAP_PLAN_WARM; vi.useRealTimers(); h.warms.length = 0; h.providers = ["anthropic"]; });

describe("the planner's warm-up", () => {
  it("is off unless MAP_PLAN_WARM=1", async () => {
    expect(await warmMapPlanner(P)).toEqual({ warmed: false, why: "off" });
    expect(h.warms).toHaveLength(0);
  });

  it("sends the plan call's own prefix, once in four minutes, and not when the planner is not Claude", async () => {
    process.env.MAP_PLAN_WARM = "1";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T04:00:00Z"));
    const r = await warmMapPlanner(P);
    expect(r).toMatchObject({ warmed: true, cacheWrite: 9000 });
    expect(h.warms).toHaveLength(1);
    expect(h.warms[0]).toMatchObject({ system: mapSystemPrompt(P), schema: WirePlan, model: process.env.AI_MAP_CLAUDE_MODEL || "claude-haiku-5-5", sentinels: true, role: "fast" });
    await warmMapPlanner(P);
    expect(h.warms).toHaveLength(1);
    vi.setSystemTime(Date.now() + WARM_EVERY_MS + 1000);
    h.providers = ["groq"];
    expect(await warmMapPlanner(P)).toEqual({ warmed: false, why: "not-claude" });
    h.providers = ["anthropic"];
    await warmMapPlanner(P);
    expect(h.warms).toHaveLength(2);
  });
});
