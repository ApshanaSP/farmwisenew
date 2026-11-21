/**
 * v12 (21 Nov, stale-and-double RC7): a round the browser gave up on ends as an abort, whatever lane answered it. The fast lane and the rules
 * never wait on a signal of their own, so a turn cancelled while its screen was built still went out as RUN_FINISHED and onto the decision
 * record (the 06:42:15 "answered (rules)" for the flooded roads, never shown). Here the turn is cancelled while city_now is read.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonCall, JsonResult } from "@/lib/ai/gateway";
import type { ToolResult } from "@/lib/assistant/types";
import type { TurnEvent } from "./events";
import { WORLD } from "./fixture";
import { Ledger, MemoryStore } from "./ledger";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string): RoundBodyT => RoundBody.parse({ turnId: `t-${Math.random().toString(36).slice(2, 8)}`, round: 0, text, state: STATE, turns: [], stage: null, direct: null });
const llm = () => {
  const generate = async <U,>(c: JsonCall<U>): Promise<JsonResult<U>> => {
    if (c.name !== "jarvis_router") throw new Error("the planner was asked");
    return { object: { lane: "district" } as U, info: { step: c.name, provider: "groq", model: "fake", ms: 1, inputTokens: 1, outputTokens: 1, attempts: 1 } };
  };
  return { generate: generate as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false, claudeOk: () => false };
};
const cityNow = (args: Record<string, unknown>): ToolResult => ({ scope: null, asOf: "2026-11-21 12:00:00", tool: "city_now", args,
  data: { topic: args.topic, headline: { en: "Live traffic now", ta: "நேரடி போக்குவரத்து" }, say: { en: "Live traffic across the district: 3 very congested stretches.", ta: "நேரடி போக்குவரத்து." }, rows: [], view: { kind: "traffic" }, missing: [] },
  facts: [{ id: "city.traffic.very", label: "Very congested stretches now", value: 3 }], sources: [], incidentIds: [], testData: true, caveats: [], untrusted: ["place", "detail"] } as unknown as ToolResult);

describe("v12: a cancelled round is never finished", () => {
  beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-abort12-"))); vi.stubEnv("JARVIS_AIDE", "0"); });
  afterEach(() => vi.unstubAllEnvs());

  it("a live round of the fast lane answers as before", async () => {
    const r = await planRound(body("Show me live traffic."), WORLD, fakeHands({ city_now: cityNow }), "u", undefined, new AbortController().signal, { llm: llm() });
    expect(r.result?.stage?.recipe).toBe("city");
  });

  it("cancelled while its screen was built: an AbortError, no RUN_FINISHED and no screen sent", async () => {
    const ac = new AbortController();
    const events: TurnEvent[] = [];
    const hands = fakeHands({ city_now: (a: Record<string, unknown>) => { ac.abort(); return cityNow(a); } });
    const e = await planRound(body("Show me live traffic."), WORLD, hands, "u", undefined, ac.signal, { llm: llm(), emit: (x) => events.push(x) }).catch((x: unknown) => x);
    expect((e as Error)?.name).toBe("AbortError");
    expect(events.some((x) => x.type === "RUN_FINISHED")).toBe(false);
    expect(events.some((x) => x.type === "STATE_SNAPSHOT")).toBe(false);
  });

  it("the same with no stream (the JSON reply): an AbortError, never a result", async () => {
    const ac = new AbortController();
    const hands = fakeHands({ city_now: (a: Record<string, unknown>) => { ac.abort(); return cityNow(a); } });
    const e = await planRound(body("Show me live traffic."), WORLD, hands, "u", undefined, ac.signal, { llm: llm() }).catch((x: unknown) => x);
    expect((e as Error)?.name).toBe("AbortError");
  });
});
