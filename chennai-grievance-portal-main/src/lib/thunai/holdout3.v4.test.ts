/**
 * The third held-out set's harness (holdout3.ts), on synthetic rows written here (the real set is frozen and never read by a test): the
 * browser's routing before the planner, the reading of a result as the set's intents, a three-turn script played before the sentence that
 * is scored, rules only (what is left to the planner is "defer"), and rows and tallies that hold no sentence.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentResult } from "./agent";
import { WORLD } from "./fixture";
import { browserRoute, hits3, intentOf3, runItem3, summary3, type Item3 } from "./holdout3";
import { Ledger, MemoryStore } from "./ledger";
import { ZONE_TA_NAME } from "./lexicon";
import { clearCaches } from "./round";
import { fakeHands } from "./stagefake";
import { referenceWorld } from "./world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const noModel = { llm: { generate: (async () => { throw new Error("no model"); }) as never, ledger: new Ledger(new MemoryStore()), bedrockOk: () => false } };
const R0: AgentResult = { kind: "do", lang: "en", reply: null, steps: [], stage: null, stageOp: null, say: null, options: [], rounds: 0, calls: [], model: null, ms: 0, note: null };

beforeEach(() => { clearCaches(); vi.stubEnv("THUNAI_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "jv-h3-"))); });
afterEach(() => vi.unstubAllEnvs());

describe("the browser's routing before the planner", () => {
  it.each([["build me a water-crisis board for Velachery", "mission"], ["brief me", "brief"], ["remember that the Adyar review is on Friday", "remember"], ["forget that", "recall"],
    ["what do you remember about me", "recall"], ["show the severe cases in Adyar", null], ["how do you know?", null]])("%s -> %s", (s, want) => expect(browserRoute(s, world)).toBe(want));
});

describe("a result read as the set's intents", () => {
  it("each of the new intents, and the older names otherwise", () => {
    expect(intentOf3({ ...R0, kind: "chat", note: "frame:howknow" })).toBe("howknow");
    expect(intentOf3({ ...R0, stageOp: { op: "explain", n: 2, text: null } })).toBe("explain");
    expect(intentOf3({ ...R0, steps: [{ a: "remember", text: "x" }] })).toBe("remember");
    expect(intentOf3({ ...R0, steps: [{ a: "forget", all: false }] })).toBe("recall");
    expect(intentOf3({ ...R0, steps: [{ a: "mission", name: "brief" }] } as never)).toBe("brief");
    expect(intentOf3({ ...R0, steps: [{ a: "page", page: "trends" }] })).toBe("navigate");
    expect(intentOf3(null)).toBe("error");
    expect(hits3("case", "stage_op")).toBe(true);
    expect(hits3("explain", "case")).toBe(false);
  });
});

describe("the runner, rules only, on synthetic rows", () => {
  const rows: Item3[] = [
    { id: "s001", lang: "en", text: "what changed since yesterday in Adyar", intent: "changed" },
    { id: "s002", lang: "en", text: "how do you know?", intent: "followup", script: ["show the severe cases in Adyar", "only the open ones"], expect: "howknow" },
    { id: "s003", lang: "en", text: "build me a flood board for Velachery", intent: "mission" },
    { id: "s004", lang: "tanglish", text: "konjam yosichu sollu enna pannalam nu", intent: "explain" }
  ];
  it("plays the script first, routes as the browser does, defers what needs the planner, and keeps no sentence", async () => {
    const out = [];
    for (const x of rows) out.push(await runItem3(x, { world, hands: () => fakeHands(), deps: noModel, rulesOnly: true }));
    expect(out.map((r) => [r.id, r.got, r.ok])).toEqual([["s001", "changed", true], ["s002", "howknow", true], ["s003", "mission", true], ["s004", expect.any(String), false]]);
    expect(out[3].deferred || out[3].got !== "explain").toBe(true);
    expect(out.every((r) => !r.capacity)).toBe(true);
    const s = summary3(out);
    expect(s.byLang.all).toMatchObject({ n: 4, right: 3 });
    expect(s.byIntent.followup).toMatchObject({ n: 1, right: 1 });
    expect(s.byLang.all.pct.lo).toBeGreaterThan(0);
    const text = JSON.stringify({ out, s });
    for (const x of rows) { expect(text).not.toContain(x.text); for (const t of x.script ?? []) expect(text).not.toContain(t); }
  });
});
