import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanQuery, daySummary, decisionEvent, logDecision, readToday, todays } from "./decisions";
import { appendAudit, readAudit } from "./store";
import { brokenAt } from "./audit";
import { allowedSet, gateChunk } from "./numbergate";

let d = "";
beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), "dec4-")); vi.stubEnv("THUNAI_DIR", d); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(d, { recursive: true, force: true }); });

const NOW = new Date(Date.UTC(2026, 10, 15, 6, 30)); // noon in Chennai

describe("the decision record", () => {
  it("keeps the question without phone, Aadhaar or quoted citizen words", () => {
    const q = cleanQuery('what about the man at 9876543210 who wrote "the drain near my house overflows", Aadhaar 2345 6789 0123');
    expect(q).not.toMatch(/9876543210|overflows|2345/);
    expect(q).toMatch(/what about the man/);
  });
  it("an answer and a tray approval go on the hash-chained trail with tools, model, latency, snapshot; the approver is the Collector", () => {
    appendAudit({ actor: "c@x", heard: "older line", plan: [], risk: "A", approval: null, outcome: "ok" }, NOW);
    logDecision("c@x", { kind: "answer", query: "drain complaints in Velachery", lang: "en", snapshot: "2026-11-15 11:00:00", tools: ["incidents", "incidents"], model: "claude-opus-5-5", lane: "planner", ms: 2100 }, NOW);
    logDecision("c@x", { kind: "approval", query: "confirm 2", count: 2, how: "spoken" }, NOW);
    const { lines, intact } = readAudit(50);
    expect(intact).toBe(true);
    expect(brokenAt(lines)).toBe(-1);
    const [ans, app] = lines.slice(1).map((l) => l.record!);
    expect(ans).toMatchObject({ kind: "answer", tools: ["incidents"], model: "claude-opus-5-5", ms: 2100, snapshot: "2026-11-15 11:00:00", approver: null });
    expect(app).toMatchObject({ kind: "approval", approver: { by: "c@x", how: "spoken" }, count: 2 });
    expect(lines[2]).toMatchObject({ risk: "C", approval: { how: "spoken", count: 2 } });
    // editing a record breaks the chain
    const edited = lines.map((l, i) => (i === 1 ? { ...l, record: { ...l.record!, model: "rules" } } : l));
    expect(brokenAt(edited)).toBe(1);
  });
  it("an approval's approver comes from the session, never from the body", () => {
    const e = decisionEvent({ kind: "approval", query: "x", count: 1, approver: { by: "someone else" } } as never, "c@x");
    expect(e.record?.approver?.by).toBe("c@x");
  });
  it("today's records are Chennai's day; yesterday's are left out", () => {
    logDecision("c@x", { kind: "answer", query: "yesterday's question", lane: "rules", ms: 400 }, new Date(NOW.getTime() - 86_400_000));
    logDecision("c@x", { kind: "answer", query: "today's question", lane: "rules", ms: 400 }, NOW);
    const all = readAudit(50).lines;
    expect(todays(all, NOW.getTime()).map((r) => r.query)).toEqual(["today's question"]);
    expect(readToday(NOW.getTime()).records).toHaveLength(1);
  });
  it("'what did you do today?' is said by code, every figure from the records, in English and Tamil", () => {
    for (let k = 0; k < 3; k++) logDecision("c@x", { kind: "answer", query: `q${k}`, lane: "rules", tools: ["zones"], ms: 800 }, NOW);
    logDecision("c@x", { kind: "answer", query: "q", lane: "planner", model: "claude-opus-5-5", tools: ["incidents", "environment"], ms: 2600 }, NOW);
    logDecision("c@x", { kind: "approval", query: "confirm 2", count: 2 }, NOW);
    const { records, intact } = readToday(NOW.getTime());
    const s = daySummary(records, intact);
    expect(s.en).toBe("Today I answered 4 questions: 3 from the rules and 1 with the planner. I read 3 kinds of data. A typical answer took about 0.8 seconds. You approved 2 items in the tray; I never approve anything myself. The record's chain is intact.");
    expect(s.ta).toMatch(/இன்னைக்கு 4 கேள்விகளுக்கு/);
    const allowed = allowedSet(Object.values(s.values));
    expect(gateChunk(s.en, allowed).ok).toBe(true);
    expect(gateChunk(s.ta, allowed).ok).toBe(true);
    expect(daySummary([], true).en).toMatch(/haven't answered anything today/);
  });
});
