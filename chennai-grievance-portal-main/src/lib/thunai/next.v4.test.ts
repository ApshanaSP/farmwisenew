import { describe, expect, it } from "vitest";
import { nextQuestion, nextSteps } from "./next";
import { casesDoc, rankDoc, row } from "./register.v4.fixture";
import { figuresIn } from "./numbergate";
import type { StageDocT } from "./stage";

const late = (d: StageDocT): StageDocT => ({ ...d, blocks: d.blocks.map((b) => (b.kind === "CaseList" ? { ...b, rows: b.rows.map((r, i) => ({ ...r, overdue: i < 2, lat: 13, lon: 80 })) } : b)) });

describe("one next question after every answer, from the screen's own next steps", () => {
  it("a case list: never the draft (a tray action), the first direct step said as an offer", () => {
    const d = late(casesDoc);
    expect(nextSteps(d)[0].kind).toBe("draft");
    const q = nextQuestion(d);
    expect(q?.step.kind).toBe("direct");
    expect(q?.say).toEqual({ en: "Shall I put these on the map?", ta: "இதை வரைபடத்துல காட்டட்டுமா?" });
  });
  it("a ranking of zones: the top zone's cases, by name", () => {
    expect(nextQuestion(rankDoc)?.say.en).toBe("Shall I open Adyar's cases?");
    expect(nextQuestion(rankDoc)?.say.ta).toBe("Adyar சம்பவங்களைத் திறக்கட்டுமா?");
    expect(nextQuestion(rankDoc)?.step).toMatchObject({ recipe: "cases", slots: { zones: [13] } });
  });
  it("a why screen offers the other window, in words: no figure for the number gate to refuse", () => {
    const why: StageDocT = { ...casesDoc, recipe: "why", blocks: [{ kind: "Note", id: "n", text: "x" }] };
    const q = nextQuestion(why);
    expect(q?.say.en).toBe("Shall I do the same for the past month?");
    expect(figuresIn(q?.say.en ?? "")).toEqual([]);
  });
  it("every offer of every recipe carries no figure", () => {
    for (const recipe of ["cases", "map", "compare", "ranking", "performance", "trend", "why", "dashboard", "nearby", "readings", "brief", "news", "case"] as const) {
      const d: StageDocT = { ...late(casesDoc), recipe, blocks: [...late(casesDoc).blocks, rankDoc.blocks[0]] };
      const q = nextQuestion(d);
      if (q) { expect(figuresIn(q.say.en), recipe).toEqual([]); expect(figuresIn(q.say.ta), recipe).toEqual([]); expect(q.step.kind).toBe("direct"); }
    }
  });
  it("nothing to offer: null", () => {
    const d: StageDocT = { ...casesDoc, recipe: "nearby", blocks: [{ kind: "CaseList", id: "l", title: "x", source: "list", sev: null, total: 1, rows: [row("INC-1")] }] };
    expect(nextQuestion(d)).toBeNull();
  });
});
