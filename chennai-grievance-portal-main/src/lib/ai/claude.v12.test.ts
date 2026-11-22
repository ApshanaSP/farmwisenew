/**
 * v12 (21 Nov): the Claude spend leaks the morning's logs showed.
 *   - A warm-up that times out before any response (the SDK's APIConnectionTimeoutError: its timer stops once the headers are in) is not
 *     counted at a worst case: all 7 warms logged had timed out that way at Jarvis's opening, each charged to the $5 ceiling.
 *   - A planner call that times out the same way, or an aborted warm, is still counted, as before.
 *   - The console's fast steps are Haiku by default (claude.test.ts pins claudeModel).
 * The client is a test double; nothing leaves the process.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resetClaudeBudget, spentUsd } from "./claudebudget";

vi.mock("@/lib/thunai/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/ledger")>()), ledger: () => ({ cool: vi.fn(), coolingUntil: () => 0, record: vi.fn(), room: () => ({ ok: true }) }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: vi.fn() }));

const KEY = "sk-ant-test-v12-warm";
const withCreate = (create: () => unknown) => { global.__claude = { key: KEY, client: { beta: { messages: { create: vi.fn(create) } } } as unknown as Anthropic }; };

beforeEach(() => {
  vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jv-budget12-")), "b.sqlite"));
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  vi.stubEnv("JARVIS_CLAUDE_OFF", "");
  vi.stubEnv("JARVIS_CLAUDE_MODEL", "");
  vi.stubEnv("JARVIS_PLAN_COMPACT", "");
  resetClaudeBudget();
});
afterEach(() => { vi.unstubAllEnvs(); resetClaudeBudget(); global.__claude = undefined; });

describe("v12: a warm-up that timed out before any response is not charged", () => {
  it("claudeWarm: an APIConnectionTimeoutError records nothing against the ceiling, and the warm says it failed", async () => {
    const { claudeWarm } = await import("./claude");
    withCreate(() => { throw new Anthropic.APIConnectionTimeoutError(); });
    const w = await claudeWarm({ system: "A long planner system prompt. ".repeat(200), timeoutMs: 20_000 });
    expect(w).toBeNull();
    expect(spentUsd()).toBe(0);
  });

  it("claudeWarm: an abort is still counted at its worst case (it may have been sent and billed)", async () => {
    const { claudeWarm } = await import("./claude");
    withCreate(() => { throw new Anthropic.APIUserAbortError(); });
    await claudeWarm({ system: "A long planner system prompt. ".repeat(200) });
    expect(spentUsd()).toBeGreaterThan(0);
  });

  it("a planner call (claudeJson) that times out is still counted at its worst case, as before", async () => {
    const { claudeJson } = await import("./claude");
    withCreate(() => { throw new Anthropic.APIConnectionTimeoutError(); });
    await claudeJson({ name: "jarvis_screens0", schema: z.object({ ok: z.boolean() }), system: "S", prompt: "P", maxOutputTokens: 200 }).catch(() => undefined);
    expect(spentUsd()).toBeGreaterThan(0);
  });
});
