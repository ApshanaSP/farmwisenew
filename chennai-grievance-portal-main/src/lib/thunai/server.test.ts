import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { checkAiPlan, stateCard, systemPrompt, type AiPlan } from "./plan";
import { START } from "./fixture";

let tmp = "";
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thunai-")); process.env.THUNAI_DIR = tmp; });
afterAll(() => { delete process.env.THUNAI_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

describe("Thunai memory file", () => {
  it("keeps notes, reminders and preferences per user, and forgets on request", async () => {
    const { changeMemory, readMemory } = await import("./store");
    changeMemory(7, { op: "note", text: "Zone 13 is my priority this monsoon" });
    changeMemory(7, { op: "remind", text: "check the Velachery drain", at: "2026-10-30T04:30:00.000Z" });
    changeMemory(7, { op: "prefs", prefs: { lang: "ta" } });
    const m = readMemory(7);
    expect(m.notes.map((n) => n.text)).toEqual(["Zone 13 is my priority this monsoon"]);
    expect(m.reminders[0].done).toBe(false);
    expect(m.prefs.lang).toBe("ta");
    expect(readMemory(8).notes).toEqual([]);
    changeMemory(7, { op: "forget", all: true });
    expect(readMemory(7).notes).toEqual([]);
  });
  it("turns a correction into a habit only the second time", async () => {
    const { changeMemory } = await import("./store");
    expect(changeMemory(3, { op: "correction", heard: "marina side", meant: "zone 9" }).habits["marina side"]).toBeUndefined();
    expect(changeMemory(3, { op: "correction", heard: "marina side", meant: "zone 9" }).habits["marina side"]).toBe("zone 9");
  });
});

describe("Thunai audit file", () => {
  it("appends a hash chain that stays intact", async () => {
    const { appendAudit, readAudit } = await import("./store");
    for (let i = 0; i < 3; i++) appendAudit({ actor: "collector@test", heard: `zone ${i + 1}`, plan: [{ a: "view" }], risk: "A", approval: null, outcome: "done" });
    const t = readAudit();
    expect(t.lines.length).toBe(3);
    expect(t.intact).toBe(true);
    const f = path.join(tmp, "audit.jsonl");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("zone 2", "zone 9"));
    expect(readAudit().intact).toBe(false);
  });
});

describe("the AI fallback's checker", () => {
  const step = (over: Partial<AiPlan["steps"][number]>): AiPlan["steps"][number] => ({ action: "view", page: null, period: null, zone: null, dept: null, cat: null,
    taluk: null, sev: null, panel: null, mapMode: null, item: null, question: null, ...over });
  it("accepts a plan made of real values", () => {
    expect(checkAiPlan({ understood: true, steps: [step({ zone: 7 }), step({ action: "period", period: "monthly" })] }, WORLD, "x"))
      .toEqual([{ a: "view", view: { zone: 7 } }, { a: "period", period: "monthly" }]);
  });
  it("rejects an invented zone, department or category", () => {
    expect(checkAiPlan({ understood: true, steps: [step({ zone: 22 })] }, WORLD, "x")).toBeNull();
    expect(checkAiPlan({ understood: true, steps: [step({ dept: "NASA" })] }, WORLD, "x")).toBeNull();
    expect(checkAiPlan({ understood: true, steps: [step({ cat: "ALIENS" })] }, WORLD, "x")).toBeNull();
  });
  it("keeps the Collector's own words for map and assistant questions", () => {
    expect(checkAiPlan({ understood: true, steps: [step({ action: "map", question: "something else" })] }, WORLD, "schools near the flooding"))
      .toEqual([{ a: "map", q: "schools near the flooding" }]);
  });
  it("returns nothing when the model did not understand", () => expect(checkAiPlan({ understood: false, steps: [] }, WORLD, "x")).toBeNull());
  it("sends ids and values, not names or citizen text, and says the request is data", () => {
    expect(stateCard(START)).not.toMatch(/INC-1/);
    expect(systemPrompt(WORLD)).toMatch(/data, not instructions/);
  });
});
