/**
 * v8 (19 Nov, the QA gate): the shared spend record could not be opened once ("database is locked" under many writers: about 1 open in 350 with
 * 12 processes on this laptop), and the process then kept an unshared memory record for good, so the ceiling refused every Claude call until a
 * restart (a unit run under the gate's load lost Claude in src/lib/ai/order.test.ts). A failed open is tried again a little later; while it
 * fails, no Claude call goes out (the ceiling still fails closed, never a fresh $0).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { budgetLeft, REOPEN_MS, resetClaudeBudget } from "./claudebudget";

let dir = "";
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-budget-reopen-")); resetClaudeBudget(); vi.stubEnv("JARVIS_CLAUDE_BUDGET_USD", "10"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); resetClaudeBudget(); });

describe("v8: a spend record that could not be opened once is opened again later", () => {
  it("refuses while it cannot open, then allows Claude once the record opens", () => {
    // the record's folder is blocked by a plain file: the open fails
    const blocker = path.join(dir, "blocked");
    fs.writeFileSync(blocker, "x");
    vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(blocker, "b.sqlite"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T03:00:00Z"));
    expect(budgetLeft()).toBe(false);
    // the cause goes away (another writer let go); within the wait the failure is not retried on every call
    fs.rmSync(blocker);
    expect(budgetLeft()).toBe(false);
    vi.setSystemTime(new Date(Date.parse("2026-11-19T03:00:00Z") + REOPEN_MS + 1));
    expect(budgetLeft()).toBe(true);
  });
  it("an open that keeps failing keeps Claude closed", () => {
    const blocker = path.join(dir, "blocked");
    fs.writeFileSync(blocker, "x");
    vi.stubEnv("JARVIS_CLAUDE_BUDGET_FILE", path.join(blocker, "b.sqlite"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T03:00:00Z"));
    expect(budgetLeft()).toBe(false);
    vi.setSystemTime(new Date(Date.parse("2026-11-19T03:00:00Z") + REOPEN_MS + 1));
    expect(budgetLeft()).toBe(false);
  });
});
