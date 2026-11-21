/**
 * v12 (21 Nov): THE DISTRICT NOW (snapshot.ts) with Claude off and on. With Claude off (the $5 ceiling, no key) nothing warms it and nothing
 * refreshes it in the background (every planner turn waited on it and its refresh froze the conversation for a picture no turn used); the
 * chatbot's digest still gets a read once its copy is 10 minutes old. Its reads run one after another, and the city part is live traffic
 * only. The tools are a test double.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolResult } from "@/lib/assistant/types";

const h = vi.hoisted(() => ({ claude: true }));
vi.mock("@/lib/ai/claude", () => ({ claudeConfigured: () => h.claude }));

import { SNAP_CALLS, SNAP_MAX_STALE_MS, districtSnapshot, resetSnapshot, warmSnapshot, type Snapshot } from "./snapshot";

const tr = (tool: string): ToolResult => ({
  tool, args: {}, scope: null, asOf: "2026-11-21 12:00", data: { rows: [] }, facts: [{ id: `${tool}.n`, label: `${tool} figure`, value: 1 }], sources: [], incidentIds: [], testData: false, caveats: []
});

/** a runTool double: records each call, how many ran at once, and the args */
function tools() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let running = 0, most = 0;
  const runTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    calls.push({ name, args });
    running++; most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    return tr(name);
  };
  return { runTool, calls, most: () => most };
}

const old = (ageMs: number): Snapshot => ({ at: Date.now() - ageMs, ms: 5, parts: SNAP_CALLS.map((c) => ({ label: c.label, name: c.name, result: tr(c.name) })), standIns: [] });

beforeEach(() => { h.claude = true; resetSnapshot(null); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { resetSnapshot(null); vi.restoreAllMocks(); });

describe("v12: the snapshot with Claude off", () => {
  it("warmSnapshot reads nothing", async () => {
    h.claude = false;
    const t = tools();
    await warmSnapshot({ runTool: t.runTool });
    expect(t.calls).toEqual([]);
  });

  it("a stale copy is answered as it is, with no refresh behind it", async () => {
    h.claude = false;
    resetSnapshot(old(5 * 60_000));
    const t = tools();
    const s = await districtSnapshot(50, { runTool: t.runTool });
    expect(s.parts.length).toBe(SNAP_CALLS.length);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.calls).toEqual([]);
  });

  it("a copy over SNAP_MAX_STALE_MS old is read again for the chatbot's digest (never left hours old)", async () => {
    h.claude = false;
    resetSnapshot(old(SNAP_MAX_STALE_MS + 1000));
    const t = tools();
    await districtSnapshot(2000, { runTool: t.runTool });
    expect(t.calls.length).toBe(SNAP_CALLS.length);
  });
});

describe("v12: the snapshot with Claude leading", () => {
  it("warmSnapshot reads every part, one after another, and waits for them", async () => {
    const t = tools();
    await warmSnapshot({ runTool: t.runTool });
    expect(t.calls.map((c) => c.name)).toEqual(SNAP_CALLS.map((c) => c.name));
    expect(t.most()).toBe(1);
  });

  it("the city is read as live traffic, then the rain record, never 'all' (which made the whole picture wait on the hourly rebuild)", async () => {
    const t = tools();
    await warmSnapshot({ runTool: t.runTool });
    expect(t.calls.filter((c) => c.name === "city_now").map((c) => c.args)).toEqual([{ topic: "traffic" }, { topic: "rain" }]);
  });

  it("a stale copy still refreshes behind the answer while Claude leads", async () => {
    resetSnapshot(old(5 * 60_000));
    const t = tools();
    await districtSnapshot(50, { runTool: t.runTool });
    await new Promise((r) => setTimeout(r, 200));
    expect(t.calls.length).toBeGreaterThan(0);
  });
});
