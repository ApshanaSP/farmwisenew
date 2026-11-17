/**
 * v7 review (Spend 1): claudeStreamText, the aide writer's Claude call, counts a stream that broke after it was sent. The SDK turns an SSE
 * error after message_start (overloaded_error) into an APIError with no status, and a dropped connection into APIConnectionError: neither is
 * an abort nor a time-out, but the tokens were billed. The client is a test double; nothing leaves the process.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateUsd, resetClaudeBudget, spentUsd } from "./claudebudget";

vi.mock("@/lib/thunai/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/thunai/ledger")>()), ledger: () => ({ cool: vi.fn(), coolingUntil: () => 0, record: vi.fn(), room: () => ({ ok: true }) }) }));
vi.mock("@/lib/thunai/telemetry", () => ({ telemetry: vi.fn() }));

const KEY = "sk-ant-test-v7-stream";
/** a stream that sends some text and then fails as `fail` says */
const failing = (fail: () => unknown) => ({
  on(ev: string, fn: (t: string) => void) { if (ev === "text") fn("Adyar has 38 open cases. "); return this; },
  finalMessage: () => Promise.reject(fail())
});
const useStream = (s: unknown) => { global.__claude = { key: KEY, client: { beta: { messages: { stream: vi.fn(() => s) } } } as unknown as Anthropic }; };
const ARGS = { name: "jarvis_aide", system: "You write Jarvis's spoken answer.", prompt: "QUESTION: what is happening in Adyar", maxOutputTokens: 320, model: "claude-haiku-5-5", timeoutMs: 5000 };

beforeEach(() => {
  vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jv-budget7-")), "b.sqlite"));
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  vi.stubEnv("JARVIS_CLAUDE_OFF", "");
  resetClaudeBudget();
});
afterEach(() => { vi.unstubAllEnvs(); resetClaudeBudget(); global.__claude = undefined; });

describe("v7 review, Spend 1: a Claude stream that broke after it was sent is counted at its worst case", () => {
  it("an overloaded_error mid-stream (an APIError with no status) is counted, and the error carries the estimate for the day cap", async () => {
    const { billedOf, claudeStreamText } = await import("./claude");
    useStream(failing(() => new Anthropic.APIError(undefined, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", undefined)));
    const err = await claudeStreamText(ARGS, () => {}).then(() => null, (e: unknown) => e);
    expect(err).toBeTruthy();
    expect(spentUsd()).toBeGreaterThan(0);
    expect(spentUsd()).toBeCloseTo(estimateUsd("claude-haiku-5-5", spentChars(), ARGS.maxOutputTokens), 9);
    expect(billedOf(err)).toMatchObject({ model: "claude-haiku-5-5", outputTokens: ARGS.maxOutputTokens });
  });
  it("a connection reset is counted (it still goes on to the next rung as busy)", async () => {
    const { billedOf, ClaudeBusyError, claudeStreamText } = await import("./claude");
    useStream(failing(() => new Anthropic.APIConnectionError({ message: "Connection error.", cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) })));
    const err = await claudeStreamText(ARGS, () => {}).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ClaudeBusyError);
    expect(spentUsd()).toBeGreaterThan(0);
    expect(billedOf(err)?.inputTokens).toBeGreaterThan(0);
  });
  it("an HTTP error the API answered before any text (a 529 or a 429) bills nothing: nothing is counted", async () => {
    const { billedOf, claudeStreamText } = await import("./claude");
    for (const status of [529, 429]) {
      useStream(failing(() => Anthropic.APIError.generate(status, { type: "error", error: { type: status === 429 ? "rate_limit_error" : "overloaded_error", message: "x" } }, "x", new Headers())));
      const err = await claudeStreamText(ARGS, () => {}).then(() => null, (e: unknown) => e);
      expect(err).toBeTruthy();
      expect(billedOf(err)).toBeNull();
    }
    expect(spentUsd()).toBe(0);
  });
});

/** the request's size as claudeStreamText measures it (its JSON body), recovered from the one call the stream double saw */
function spentChars(): number {
  const stream = (global.__claude!.client as unknown as { beta: { messages: { stream: ReturnType<typeof vi.fn> } } }).beta.messages.stream;
  return JSON.stringify(stream.mock.calls[0][0]).length;
}
