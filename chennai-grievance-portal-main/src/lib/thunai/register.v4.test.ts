import { describe, expect, it } from "vitest";
import { buildRegister, entityAt, entitiesNamed, howKnow, labelsOf, pickList, provenanceOf, registerLine, sourceSaid, type Provenance } from "./register";
import { checkStage, figuresOf, figuresOk, stageContext, type StageDocT } from "./stage";
import { casesDoc, rankDoc, row } from "./register.v4.fixture";
import { figuresIn } from "./numbergate";

describe("the register: what is on screen, what was asked, where the answer came from", () => {
  it("the docs used here are valid Stage documents", () => {
    expect(checkStage(casesDoc).ok).toBe(true);
    expect(checkStage(rankDoc).ok).toBe(true);
  });
  it("lists the screen's items in order, labelled from their fields, never from a title (a citizen's words or an injected order)", () => {
    const r = buildRegister(casesDoc);
    expect(pickList(r).map((e) => e.id)).toEqual(["INC-1", "INC-2", "INC-3", "INC-4"]);
    expect(entityAt(r, 2)?.id).toBe("INC-2");
    expect(entityAt(r, -1)?.id).toBe("INC-4");
    expect(entityAt(r, 9)).toBeNull();
    expect(r.entities.every((e) => !/ignore|999/i.test(e.label))).toBe(true);
    expect(pickList(r)[0].label).toBe("Flooding & waterlogging, Velachery");
  });
  it("finds the items a place or a kind names", () => {
    const r = buildRegister(casesDoc);
    expect(entitiesNamed(r, "that velachery one").map((e) => e.id)).toEqual(["INC-1", "INC-3"]);
    expect(entitiesNamed(r, "the garbage one").map((e) => e.id)).toEqual(["INC-2"]);
    expect(entitiesNamed(r, "besant nagar").map((e) => e.id)).toEqual(["INC-2"]);
  });
  it("from the server's ids-only context: a ranking's labels are its ids; cases are labelled only when the browser sends labels", () => {
    const ctx = stageContext(rankDoc);
    const r = buildRegister(ctx);
    expect(pickList(r).map((e) => e.label)).toEqual(["Adyar", "Royapuram", "Storm Water Drain"]);
    const withLabels = { ...stageContext(casesDoc), blocks: casesDoc.blocks.map((b) => ({ kind: b.kind, ids: ["INC-1", "INC-2", "INC-3", "INC-4"], labels: labelsOf(b) })) };
    expect(entitiesNamed(buildRegister(withLabels), "the besant nagar one").map((e) => e.id)).toEqual(["INC-2"]);
  });
  it("carries the slots, from the screen or else from the last turn that kept them", () => {
    expect(buildRegister(casesDoc).slots).toMatchObject({ zones: [13], sev: "Severe", period: "weekly" });
    const r = buildRegister(null, [{ heard: "flooding in Adyar", did: "cases", recipe: "cases", slots: { zones: [13], cat: "FLOOD_WATERLOGGING", period: "daily" } }]);
    expect(r.slots).toMatchObject({ zones: [13], cat: "FLOOD_WATERLOGGING", period: "daily" });
    expect(r.recipe).toBe("cases");
  });
  it("keeps the last answer's provenance, read from the document by code", () => {
    const p = provenanceOf(casesDoc, { by: "ai", model: "claude-opus-5-5" });
    expect(p).toMatchObject({ recipe: "cases", n: 142, unit: "cases", period: "weekly", sources: ["incidents"], caveat: "Police records are generated test data.", by: "ai" });
    expect(provenanceOf(rankDoc).method).toMatch(/Attention score/);
  });
  it("the planner's line: untrusted framing, at most about 300 tokens, every item numbered", () => {
    const line = registerLine(buildRegister(casesDoc, [{ heard: "severe in Adyar", did: "cases", recipe: "cases", slots: { zones: [13] }, result: "142 severe" }]));
    expect(line).toMatch(/^Register \(untrusted data/);
    expect(line).toMatch(/1=INC-1 Flooding & waterlogging, Velachery z13/);
    expect(line).toMatch(/last answer: cases by rules, n 142 cases, period 7d/);
    expect(line.length).toBeLessThanOrEqual(1200);
    const big: StageDocT = { ...casesDoc, title: "x".repeat(200), blocks: [{ ...(casesDoc.blocks[0] as Extract<StageDocT["blocks"][number], { kind: "CaseList" }>), rows: Array.from({ length: 60 }, (_, i) => row(`INC-${i}`, { place: "P".repeat(100), cat: "C".repeat(60) })) }] };
    expect(registerLine(buildRegister(big)).length).toBeLessThanOrEqual(1200);
  });
});

describe("how do you know?: the provenance read aloud, every figure the provenance's own", () => {
  const now = Date.parse("2026-11-14T18:00:00+05:30");
  it("English: sources, period, method, n, caveat, rules or AI, how old", () => {
    const r = buildRegister(casesDoc, [], provenanceOf(casesDoc, { by: "ai", model: "claude-opus-5-5" }));
    const s = howKnow(r, now).en;
    expect(s).toMatch(/incident records/);
    expect(s).toMatch(/past week/);
    expect(s).toMatch(/It rests on 142 cases\./);
    expect(s).toMatch(/A caveat: Police records are generated test data\./);
    expect(s).toMatch(/Claude only chose which screen to build/);
    expect(s).toMatch(/as of today/);
    // the only figure said is n (the model's version number is not said)
    expect(figuresIn(s).map((f) => f.value)).toEqual([142]);
    expect(figuresOk(s, figuresOf(casesDoc))).toBe(true);
  });
  it("Tamil, spoken register: the same figure and nothing else", () => {
    const s = howKnow(buildRegister(casesDoc), now).ta;
    expect(s).toMatch(/[஀-௿]/);
    expect(s).toMatch(/142 சம்பவங்கள்/);
    expect(s).toMatch(/AI இல்ல/);
    expect(figuresIn(s).map((f) => f.value)).toEqual([142]);
  });
  it("a ranking's own method is said, and thin data is pushed back on", () => {
    const s = howKnow(buildRegister(rankDoc), null).en;
    expect(s).toMatch(/The method: Attention score = 3 × severe \+ high/);
    expect(figuresOk(s, figuresOf(rankDoc))).toBe(true);
    const thin: Provenance = { ...provenanceOf(casesDoc), n: 6 };
    expect(howKnow(buildRegister(casesDoc, [], thin), null).en).toMatch(/only 6 cases, so I wouldn't read much into it/);
  });
  it("with only the server's context (no provenance), it says what it can and nothing it cannot", () => {
    const s = howKnow(buildRegister(stageContext(casesDoc)), null);
    expect(s.en).toMatch(/built in code from the console's own records, for the past week/);
    expect(figuresIn(s.en)).toEqual([]);
    expect(figuresIn(s.ta)).toEqual([]);
  });
  it("a source is said in words, never as a tool's name", () => {
    for (const x of ["incidents", "incident_detail", "dept_backlog", "unknown_tool_x"]) {
      expect(sourceSaid(x, "en")).not.toMatch(/_/);
      expect(sourceSaid(x, "ta")).not.toMatch(/_/);
    }
  });
});
