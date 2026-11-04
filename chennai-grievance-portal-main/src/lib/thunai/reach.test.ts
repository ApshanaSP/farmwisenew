import { describe, expect, it } from "vitest";
import { WORLD, START } from "./fixture";
import { quickScreen } from "./quick";
import { ACTION_LEVEL, cannotLine, NO_MODEL_LINE, REACH } from "./reach";
import { riskOf } from "./risk";
import { routeByRules } from "./router";
import { localStageCommand, pushScreen, stageDigest, stageEmpty, stageReducer, type StageModel } from "./stagelocal";
import type { StageDocT } from "./stage";
import type { ActionName, Step } from "./types";
import { understand } from "./understand";
import { agentPrompt } from "./agent";

describe("the reach audit", () => {
  it("every console action has a level, and it is the level risk.ts runs", () => {
    for (const [a, level] of Object.entries(ACTION_LEVEL) as [ActionName, string][]) {
      const step = { a } as unknown as Step;
      expect(riskOf(step), a).toBe(level === "read" ? "A" : level);
    }
  });
  it("every read, navigate and build action has words that reach it, in rules or the planner's bundles", () => {
    for (const r of REACH) {
      if (r.level === "never") { expect(routeByRules(r.say, WORLD, true).lane, r.say).toBe("refuse"); continue; }
      const u = understand(r.say, START, WORLD, { speechConf: 0.95 });
      const reach = (u.kind === "do" && u.steps.length > 0) || !!quickScreen(r.say, WORLD) || routeByRules(r.say, WORLD, true).lane === "district";
      expect(reach, r.say).toBe(true);
    }
  });
  it('"Save this workspace as Collector\'s Daily Briefing" is a level B save with that name', () => {
    const u = understand("Save this workspace as Collector's Daily Briefing", START, WORLD, { speechConf: 0.95 });
    expect(u.kind).toBe("do");
    if (u.kind === "do") {
      expect(u.steps[0]).toMatchObject({ a: "workspace", op: "save" });
      expect((u.steps[0] as { name?: string }).name?.toLowerCase()).toContain("daily briefing");
      expect(riskOf(u.steps[0])).toBe("B");
    }
  });
  it('"pin this to the Overview" is the pin command, in three languages', () => {
    for (const t of ["pin this to the Overview", "pin it on the dashboard", "pin this", "overview-la pin pannu", "முகப்பில் பின் செய்"]) expect(localStageCommand(t), t).toEqual({ op: "pin" });
  });
  it("what cannot be done is said plainly, with what can", () => {
    expect(cannotLine("en")).toMatch(/I can't do that\. I can show/);
    expect(cannotLine("ta")).toMatch(/[஀-௿]/);
    expect(NO_MODEL_LINE.en).toMatch(/cannot reason right now/);
    expect(agentPrompt).toBeTruthy();
  });
});

const DOC: StageDocT = { v: 1, id: "s1", recipe: "cases", title: "Severe", takeaway: null, say: { en: "Three severe.", ta: "மூன்று." }, scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: { sev: "Severe", zones: [] }, sources: [], asOf: null, notes: [],
  blocks: [{ kind: "CaseList", id: "list", title: "Severe", source: "list", sev: null, total: 3, rows: [
    { id: "INC-1", title: "Waterlogging", sev: "Severe", status: "Open", zone: 13, zoneName: "Adyar", place: "Bridge", ward: null, dept: null, deptName: null, complaints: 2, t: "2026-11-01 08:00:00", overdue: false, lat: null, lon: null, why: null, cat: null },
    { id: "INC-2", title: "Tree fall", sev: "Severe", status: "Open", zone: 5, zoneName: "Royapuram", place: "Port", ward: null, dept: null, deptName: null, complaints: 9, t: "2026-11-02 08:00:00", overdue: false, lat: null, lon: null, why: null, cat: null },
    { id: "INC-3", title: "Sewage", sev: "High", status: "Open", zone: 13, zoneName: "Adyar", place: "Market", ward: null, dept: null, deptName: null, complaints: 1, t: "2026-11-03 08:00:00", overdue: false, lat: null, lon: null, why: null, cat: null }
  ] }] };

describe("stageReducer: pure, and split from speech and network", () => {
  const m0: StageModel = pushScreen(stageEmpty, DOC);
  it("filter and sort change the model and only describe what is said", () => {
    const f = stageReducer(m0, { op: "filter", text: "Adyar" });
    expect(f.m.filter).toBe("Adyar");
    expect((f.m.doc!.blocks[0] as { rows: unknown[] }).rows.length).toBe(2);
    expect(f.fx).toEqual([{ fx: "say", en: "2 of the 3 shown are about Adyar.", ta: "3-இல் 2 மட்டும்.", speak: true }]);
    const s = stageReducer(m0, { op: "sort", by: "complaints" });
    expect((s.m.doc!.blocks[0] as { rows: { id: string }[] }).rows[0].id).toBe("INC-2");
    expect(m0.doc).toBe(DOC); // the old model is untouched
  });
  it("a filter that finds nothing changes nothing", () => {
    const f = stageReducer(m0, { op: "filter", text: "Mylapore" });
    expect(f.m).toBe(m0);
    expect(f.fx[0]).toMatchObject({ fx: "say", speak: true });
  });
  it("network and voice are effects: open asks for a rebuild, read asks for the voice", () => {
    expect(stageReducer(m0, { op: "open", n: 2 }).fx).toEqual([{ fx: "rebuild", recipe: "case", slots: { id: "INC-2" }, label: { en: "Opening case 2", ta: "2-வது சம்பவத்தைத் திறக்கிறேன்" } }]);
    expect(stageReducer(m0, { op: "next" }).fx).toEqual([{ fx: "readFrom", i: 1 }]);
    expect(stageReducer(m0, { op: "draft", n: 2, first: true }).fx).toEqual([{ fx: "draft", ids: ["INC-1", "INC-2"] }]);
    expect(stageReducer(m0, { op: "everywhere" }).fx[0]).toMatchObject({ fx: "rebuild", clearConsole: true });
  });
  it("back and close work through the model, with no stale closure", () => {
    const m1 = pushScreen(m0, { ...DOC, id: "s2", title: "Second" });
    const b = stageReducer(m1, { op: "back" });
    expect(b.m.doc!.id).toBe("s1");
    expect(b.m.back.length).toBe(0);
    expect(stageReducer(b.m, { op: "back" }).m.doc).toBeNull();
    expect(stageReducer(m1, { op: "close" }).fx).toEqual([{ fx: "stopVoice" }, { fx: "closed" }]);
  });
  it("the digest reflects a command at once, and stays small", () => {
    const f = stageReducer(m0, { op: "filter", text: "Adyar" });
    const d = stageDigest(f.m)!;
    expect(d).toContain("Adyar");
    expect(d).not.toContain("Tree fall");
    expect(d.length).toBeLessThanOrEqual(1400);
    expect(stageDigest(stageEmpty)).toBeNull();
  });
});
