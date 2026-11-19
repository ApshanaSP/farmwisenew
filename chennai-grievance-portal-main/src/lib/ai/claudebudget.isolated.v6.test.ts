/**
 * v6 (defect): unit tests that mock the Anthropic SDK go through billed() and recorded their pretend costs in the real spend record
 * (data/thunai/claude-budget.sqlite): by 18:20 on 17 Nov it held 2,199 rows, US$0.25, every one from a test run, while no real call
 * had been billed (the key is refused). The owner's US$5 ceiling must count real calls only, so every config that runs the unit
 * tests points JARVIS_CLAUDE_BUDGET_FILE at a temporary file; the live configs keep the real record (claudebudget.ts's default).
 */
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

describe("v6: the unit tests never write the real Claude spend record", () => {
  it("JARVIS_CLAUDE_BUDGET_FILE is set, under the temp folder, not the app's data folder", () => {
    const f = process.env.JARVIS_CLAUDE_BUDGET_FILE ?? "";
    expect(f).not.toBe("");
    expect(path.resolve(f).toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase())).toBe(true);
    expect(path.resolve(f).toLowerCase()).not.toBe(path.resolve("data/thunai/claude-budget.sqlite").toLowerCase());
  });
});
