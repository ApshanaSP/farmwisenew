/**
 * v7 review (Spend 2): the aide writer's Claude rung (openRung) puts every billed stream in Jarvis's own day ledger, not only the ones that
 * finished: a refused stream (its real usage) and one stopped after it was sent (a barge-in, at its worst case). One the API refused before
 * any text (a 429) bills nothing and is not counted. The Claude client is a test double; nothing leaves the process.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClaudeBudget } from "@/lib/ai/claudebudget";

const rows: { provider: string; model: string; v: { tokens: number; lane?: string } }[] = [];
vi.mock("@/lib/thunai/ledger", async (orig) => ({
  ...(await orig<typeof import("@/lib/thunai/ledger")>()),
  ledger: () => ({ cool: vi.fn(), coolingUntil: () => 0, room: () => ({ ok: true }), record: (provider: string, model: string, v: { tokens: number; lane?: string }) => { rows.push({ provider, model, v }); } })
}));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: vi.fn() }));

const KEY = "sk-ant-test-v7-aide";
const RUNG = { provider: "anthropic", model: "claude-haiku-5-5" } as const;
const stream = (final: () => Promise<unknown>) => ({ on(ev: string, fn: (t: string) => void) { if (ev === "text") fn("Adyar has 38 open cases. "); return this; }, finalMessage: final });
const useStream = (s: unknown) => { global.__claude = { key: KEY, client: { beta: { messages: { stream: vi.fn(() => s) } } } as unknown as Anthropic }; };
const call = (signal: AbortSignal) => ({ name: "jarvis_aide", system: "You write Jarvis's spoken answer.", prompt: "QUESTION: what is happening in Adyar", maxOutputTokens: 320, user: "u", signal, timeoutMs: 5000 });

beforeEach(() => {
  rows.length = 0;
  vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jv-aide-spend-")), "b.sqlite"));
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  vi.stubEnv("JARVIS_CLAUDE_OFF", "");
  resetClaudeBudget();
});
afterEach(() => { vi.unstubAllEnvs(); resetClaudeBudget(); global.__claude = undefined; });

describe("v7 review, Spend 2: the aide's Claude streams that did not finish are in Jarvis's day cap", () => {
  it("a stream stopped by a barge-in after it was sent is recorded at its worst case (its prompt in, its whole max_tokens out)", async () => {
    const { openRung } = await import("./stream");
    const ctl = new AbortController();
    useStream(stream(async () => { ctl.abort(); throw new Anthropic.APIUserAbortError(); }));
    await expect(openRung(RUNG, call(ctl.signal), () => {})).rejects.toThrow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", v: { lane: "aide" } });
    expect(rows[0].v.tokens).toBeGreaterThan(320);
  });
  it("a refused stream is recorded at what it was billed", async () => {
    const { openRung } = await import("./stream");
    useStream(stream(async () => ({ model: "claude-haiku-5-5", stop_reason: "refusal", usage: { input_tokens: 100, output_tokens: 20 }, content: [] })));
    await expect(openRung(RUNG, call(new AbortController().signal), () => {})).rejects.toThrow(/declined/);
    expect(rows).toEqual([{ provider: "anthropic", model: "claude-haiku-5-5", v: { tokens: 120, lane: "aide" } }]);
  });
  it("a 429 before any text bills nothing: not recorded", async () => {
    const { openRung } = await import("./stream");
    useStream(stream(async () => { throw Anthropic.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: "x" } }, "x", new Headers()); }));
    await expect(openRung(RUNG, call(new AbortController().signal), () => {})).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });
});
