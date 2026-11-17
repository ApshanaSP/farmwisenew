/**
 * v6: the owner's Claude spend ceiling (claudebudget.ts): costs by model, the shared record, the ceiling with one call's margin, and the
 * client refusing to build a request past it (so every caller goes on to Groq).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { budgetLeft, budgetUsd, CALL_MARGIN_USD, costOf, recordClaude, resetClaudeBudget, spentUsd } from "./claudebudget";

beforeEach(() => { vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jv-budget-")), "b.sqlite")); resetClaudeBudget(); });
afterEach(() => { vi.unstubAllEnvs(); resetClaudeBudget(); });

describe("v6: the Claude spend ceiling", () => {
  it("costs by model: Haiku 5.5 at 0.10 / 0.50 a million, cache reads and writes apart; an unknown model at Opus 5.5's", () => {
    expect(costOf("claude-haiku-5-5", { input_tokens: 2650, output_tokens: 230 })).toBeCloseTo((2650 * 0.1 + 230 * 0.5) / 1e6, 12);
    expect(costOf("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 })).toBeCloseTo(0.135, 9);
    expect(costOf("claude-something-new", { input_tokens: 1e6 })).toBeCloseTo(4, 9);
  });
  it("the default ceiling is $5; the env sets another; 0 means no Claude call at all", () => {
    expect(budgetUsd(undefined)).toBe(5);
    expect(budgetUsd("2.5")).toBe(2.5);
    vi.stubEnv("JARVIS_CLAUDE_BUDGET_USD", "0");
    expect(budgetLeft()).toBe(false);
  });
  it("calls add up in the shared record; the ceiling closes one call's margin before $5", () => {
    expect(spentUsd()).toBe(0);
    expect(budgetLeft()).toBe(true);
    // 4.7 dollars of Opus-priced output: under 5 - margin 0.25 = 4.75, still open
    recordClaude("claude-opus-5-5", { output_tokens: (4.7 / 20) * 1e6 });
    expect(spentUsd()).toBeCloseTo(4.7, 6);
    expect(budgetLeft()).toBe(true);
    recordClaude("claude-haiku-5-5", { output_tokens: (0.06 / 0.5) * 1e6 });
    expect(spentUsd()).toBeGreaterThanOrEqual(5 - CALL_MARGIN_USD);
    expect(budgetLeft()).toBe(false);
    // a second process reading the same file sees the same total
    resetClaudeBudget();
    expect(spentUsd()).toBeCloseTo(4.76, 6);
  });
  it("past the ceiling claudeConfigured() is false, so the ladder and the gateway go on to Groq", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("JARVIS_CLAUDE_OFF", "");
    const claude = await import("./claude");
    expect(claude.claudeConfigured()).toBe(true);
    recordClaude("claude-haiku-5-5", { output_tokens: 10e6 });
    expect(claude.claudeConfigured()).toBe(false);
  });
});
