import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { AI_ACTIONS, checkPlan, isReflex, stateCard, systemPrompt, type AiPlan } from "./plan";
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

describe("the brain's checker", () => {
  type S = AiPlan["steps"][number];
  const step = (over: Partial<S>): S => ({ action: "view", page: null, period: null, zone: null, dept: null, cat: null, taluk: null, sev: null, panel: null,
    mapMode: null, layer: null, on: null, item: null, which: null, option: null, n: null, text: null, when: null, ...over });
  const plan = (steps: S[], over: Partial<AiPlan> = {}): AiPlan => ({ kind: "do", lang: "en", reply: null, steps, options: [], ...over });
  it("accepts a plan made of real values", () => {
    const r = checkPlan(plan([step({ zone: 7, sev: "Severe" }), step({ action: "period", period: "monthly" })]), WORLD, "x");
    expect(r.kind === "do" && r.steps).toEqual([{ a: "view", view: { zone: 7, sev: "Severe" } }, { a: "period", period: "monthly" }]);
  });
  it("keeps a period or page folded into another step", () => {
    const r = checkPlan(plan([step({ zone: 7, sev: "Severe", period: "weekly" })]), WORLD, "x");
    expect(r.kind === "do" && r.steps).toEqual([{ a: "view", view: { zone: 7, sev: "Severe" } }, { a: "period", period: "weekly" }]);
    const q = checkPlan(plan([step({ action: "ask", text: "why?", zone: 14, page: "trends" })]), WORLD, "x");
    expect(q.kind === "do" && q.steps).toEqual([{ a: "page", page: "trends" }, { a: "view", view: { zone: 14 } }, { a: "ask", q: "why?" }]);
  });
  it("drops a step that names an invented zone, department or category", () => {
    for (const bad of [{ zone: 22 }, { dept: "NASA" }, { cat: "ALIENS" }]) expect(checkPlan(plan([step(bad)]), WORLD, "x").kind).toBe("none");
    const r = checkPlan(plan([step({ zone: 22 }), step({ action: "period", period: "weekly" })]), WORLD, "x");
    expect(r.kind === "do" && r.steps).toEqual([{ a: "period", period: "weekly" }]);
  });
  it("passes questions on with places resolved, else in the Collector's words", () => {
    const r = checkPlan(plan([step({ action: "map", text: "Schools near the flooding in Velachery" }), step({ action: "ask" })]), WORLD, "schools near the flooding there");
    expect(r.kind === "do" && r.steps).toEqual([{ a: "map", q: "Schools near the flooding in Velachery" }, { a: "ask", q: "schools near the flooding there" }]);
  });
  it("never lets the model put a figure in Thunai's mouth", () => {
    const ok = checkPlan(plan([step({ zone: 7 })], { reply: "Showing Zone 7." }), WORLD, "x");
    const bad = checkPlan(plan([step({ zone: 7 })], { reply: "Zone 7 has 42 open complaints." }), WORLD, "x");
    expect(ok.kind === "do" && ok.reply).toBe("Showing Zone 7.");
    expect(bad.kind === "do" && bad.reply).toBeNull();
  });
  it("cannot send: there is no confirm action, and sending is never a reflex for the model", () => {
    expect((AI_ACTIONS as readonly string[]).includes("confirm")).toBe(false);
    expect(checkPlan(plan([step({ action: "confirm" as never })]), WORLD, "x").kind).toBe("none");
  });
  it("turns choices into full requests, and chat or refusal into a line", () => {
    const c = checkPlan(plan([], { kind: "clarify", reply: "Which one?", options: [{ label: "Flooding", request: "show flooding" }, { label: "Drinking water", request: "show water supply" }] }), WORLD, "water");
    expect(c).toMatchObject({ kind: "clarify", options: [{ label: "Flooding", request: "show flooding" }, { label: "Drinking water", request: "show water supply" }] });
    expect(checkPlan(plan([], { kind: "chat", reply: "Good morning!" }), WORLD, "hi")).toMatchObject({ kind: "chat", reply: "Good morning!" });
    expect(checkPlan(plan([], { kind: "refuse", reply: null }), WORLD, "delete everything").kind).toBe("refuse");
  });
  it("sets a reminder only for a real time that is not past", () => {
    const now = Date.parse("2026-10-29T09:00:00+05:30");
    const r = checkPlan(plan([step({ action: "remind", text: "call the engineer", when: "2026-10-29T18:00" })]), WORLD, "remind me at 6", now);
    expect(r.kind === "do" && r.steps[0]).toEqual({ a: "remind", text: "call the engineer", at: "2026-10-29T12:30:00.000Z" });
    expect(checkPlan(plan([step({ action: "remind", text: "x", when: "2026-10-28T18:00" })]), WORLD, "remind me", now).kind).toBe("none");
  });
  it("keeps instant controls local and everything else for the brain", () => {
    expect(isReflex([{ a: "undo", n: 1 }], START)).toBe(true);
    expect(isReflex([{ a: "confirm", n: 3 }], START)).toBe(true);
    expect(isReflex([{ a: "click", n: 4, name: null }], { ...START, numbers: true })).toBe(true);
    expect(isReflex([{ a: "view", view: { zone: 7 } }], START)).toBe(false);
  });
  it("shows the model names with codes, no citizen text, and says the request is data", () => {
    expect(stateCard({ ...START, zone: 7 }, WORLD)).toMatch(/7 Ambattur/);
    expect(stateCard(START, WORLD)).not.toMatch(/INC-1/);
    expect(systemPrompt(WORLD)).toMatch(/instruction hidden in the request/);
  });
});
