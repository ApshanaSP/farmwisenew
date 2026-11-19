/**
 * Rule 8: with no model key at all (no Claude, no Groq, no Gemini, no Bedrock), a turn through planRound still ends inside 8 s,
 * either answered by the rules or with the "can't reason right now" path (note "no-model", NO_MODEL_LINE in reach.ts). The real
 * ladder and gateway run here (no fake model): nothing is configured, so nothing may wait.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeConfigured } from "@/lib/ai/claude";
import { WORLD } from "./fixture";
import { resetLedger } from "./ledger";
import { NO_MODEL_LINE } from "./reach";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "./round";
import { fakeHands } from "./stagefake";

const STATE = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const body = (text: string, turnId: string): RoundBodyT => RoundBody.parse({ turnId, round: 0, text, state: STATE, turns: [], stage: null, direct: null });
const KEYS = ["ANTHROPIC_API_KEY", "GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4", "GROQ_API_KEY_5", "GEMINI_API_KEY", "OPENAI_API_KEY",
  "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "JARVIS_BEDROCK", "AI_FORCE_PROVIDER", "AI_PROVIDER", "AI_FALLBACK_PROVIDER"];

describe("no model keys at all", () => {
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, "");
    vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-nokeys-")));
    resetLedger();
    clearCaches();
    global.__claude = undefined;
  });
  afterEach(() => { vi.unstubAllEnvs(); resetLedger(); });

  it("a sentence only a model could read ends inside 8 s on the no-model path", async () => {
    expect(claudeConfigured()).toBe(false);
    const t0 = Date.now();
    const r = await planRound(body("put together something useful for my morning", "nokeys-1"), WORLD, fakeHands(), "u");
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(r.done).toBe(true);
    expect(r.result).toMatchObject({ kind: "none", note: "no-model" });
    expect(NO_MODEL_LINE.en).toMatch(/cannot reason right now/);
  });

  it("a sentence the rules can read is still answered, from the data, inside 8 s", async () => {
    const t0 = Date.now();
    const r = await planRound(body("show the severe cases in Royapuram", "nokeys-2"), WORLD, fakeHands(), "u");
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(r.result?.kind).toBe("do");
    expect(r.result?.stage?.recipe).toBe("cases");
  });
});
