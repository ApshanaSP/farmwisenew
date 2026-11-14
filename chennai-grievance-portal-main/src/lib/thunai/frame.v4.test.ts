import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { asksHowKnow, resolveFrame, type FrameInput } from "./frame";
import { buildRegister, labelsOf, provenanceOf } from "./register";
import { stageContext, type StageContext } from "./stage";
import { figuresIn } from "./numbergate";
import { ruleIntent } from "./rules";
import { casesDoc, rankDoc } from "./register.v4.fixture";

const f = (text: string, o: Partial<FrameInput> = {}) => resolveFrame({ text, stage: null, turns: [], lastPlace: null, lastText: null, world: WORLD, ...o });
/** the Stage as the browser would send it with this lane's labels (stageContext plus labelsOf per block) */
const labelled = (d: typeof casesDoc) => ({ ...stageContext(d), blocks: d.blocks.map((b, i) => ({ ...stageContext(d).blocks[i], labels: labelsOf(b) })) });
const cases = labelled(casesDoc);
const bare: StageContext = { recipe: "cases", title: "Severe in Royapuram", focus: null, slots: { sev: "Severe", zones: [5], period: "daily" }, blocks: [{ kind: "CaseList", ids: ["INC-1", "INC-2", "INC-3"] }] };

describe("references to what is on screen, resolved in code (EN, Tamil, Tanglish)", () => {
  it("ordinals with the pointing words around them", () => {
    expect(f("andha rendavadhu", { stage: bare })).toMatchObject({ kind: "stageOp", op: "open", n: 2, id: "INC-2" });
    expect(f("that second one", { stage: bare })).toMatchObject({ kind: "stageOp", op: "open", n: 2 });
    expect(f("அந்த இரண்டாவது", { stage: bare })).toMatchObject({ kind: "stageOp", op: "open", n: 2 });
    expect(f("the last one", { stage: bare })).toMatchObject({ kind: "stageOp", op: "open", n: -1, id: "INC-3" });
    expect(f("kadaisi", { stage: bare })).toMatchObject({ kind: "stageOp", op: "open", n: -1 });
    // "this one" is not "the first one"
    expect(f("this one", { stage: bare })).toEqual({ kind: "none" });
  });
  it("explain the Nth one: the item, not the chart", () => {
    expect(f("explain the second one", { stage: bare })).toMatchObject({ kind: "stageOp", op: "explain", n: 2, id: "INC-2" });
    expect(f("rendavadha vilakkunga", { stage: bare })).toMatchObject({ kind: "stageOp", op: "explain", n: 2 });
    expect(f("இரண்டாவதை விளக்குங்க", { stage: bare })).toMatchObject({ kind: "stageOp", op: "explain", n: 2 });
    // a street light is not "explain" (தெரு விளக்கு, theru vilakku)
    expect(f("theru vilakku", { stage: bare })).not.toMatchObject({ kind: "stageOp", op: "explain" });
  });
  it("that one: the item in focus, or the only one; explain this on an open case explains it", () => {
    const focused = { ...bare, focus: 3 };
    expect(f("that one", { stage: focused })).toMatchObject({ kind: "stageOp", op: "open", n: 3, id: "INC-3" });
    expect(f("andha onnu", { stage: focused })).toMatchObject({ kind: "stageOp", op: "open", n: 3 });
    expect(f("open that", { stage: { ...bare, blocks: [{ kind: "CaseList", ids: ["INC-9"] }] } })).toMatchObject({ kind: "stageOp", op: "open", n: 1, id: "INC-9" });
    const open: StageContext = { recipe: "case", title: "One case", focus: null, slots: { id: "INC-7" }, blocks: [{ kind: "CaseDetail", ids: ["INC-7"] }] };
    expect(f("explain this", { stage: open })).toMatchObject({ kind: "stageOp", op: "explain", id: "INC-7" });
    expect(f("that one", { stage: bare })).toEqual({ kind: "none" }); // three items, none in focus: the planner asks
  });
  it("that Velachery one: an item named by its place or kind; several are asked about; a place on no item is not 'and in X?'", () => {
    expect(f("the Besant Nagar one", { stage: cases })).toMatchObject({ kind: "stageOp", op: "open", n: 2, id: "INC-2" });
    expect(f("andha garbage onnu", { stage: cases })).toMatchObject({ kind: "stageOp", op: "open", n: 2, id: "INC-2" });
    expect(f("the one in Thiruvanmiyur", { stage: cases })).toMatchObject({ kind: "stageOp", op: "open", n: 4, id: "INC-4" });
    expect(f("explain that Thiruvanmiyur one", { stage: cases })).toMatchObject({ kind: "stageOp", op: "explain", n: 4 });
    const several = f("that Velachery one", { stage: cases });
    expect(several).toMatchObject({ kind: "reply", why: "pick-several" });
    if (several.kind === "reply") { expect(figuresIn(several.text.en)).toEqual([]); expect(figuresIn(several.text.ta)).toEqual([]); }
    expect(f("the Royapuram one", { stage: cases })).toEqual({ kind: "none" });
    // a word that names no item and no place goes on as before: "the severe one" narrows the screen
    expect(f("the severe one", { stage: bare })).toMatchObject({ kind: "screen", slots: { sev: "Severe" } });
  });
  it("an item that is not a case means its own screen: a zone's cases, a department's backlog, a why when explained", () => {
    const rank = stageContext(rankDoc);
    expect(f("the second one", { stage: rank })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [5] }, why: "pick-zone" });
    expect(f("explain the first one", { stage: rank })).toMatchObject({ kind: "screen", recipe: "why", slots: { zones: [13] } });
    expect(f("moonavadhu", { stage: rank })).toMatchObject({ kind: "screen", recipe: "cases", slots: { dept: "GCC-SWD", status: "open" } });
  });
  it("follow-ups keep working: and in Adyar?, only severe, same for last week", () => {
    expect(f("and in Adyar?", { stage: bare })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [13], sev: "Severe" } });
    expect(f("only severe", { stage: { ...bare, slots: { zones: [13], period: "daily" } } })).toMatchObject({ kind: "screen", slots: { sev: "Severe", zones: [13] } });
    // a week with its own dates, counted over them: never this week's window under last week's name
    expect(f("same for last week", { stage: bare })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [5], period: "weekly", span: { kind: "last", unit: "week" } }, why: "span" });
    expect(f("and yesterday?", { stage: bare })).toMatchObject({ kind: "screen", recipe: "cases", slots: { span: { kind: "day", back: 1 } } });
    expect(f("same for Ambattur last week", { stage: bare })).toMatchObject({ kind: "screen", slots: { zones: [7], span: { kind: "last" } } });
    // a screen that cannot count a span leaves it to the planner
    const trend: StageContext = { ...bare, recipe: "trend", blocks: [{ kind: "Trend", ids: [] }] };
    expect(f("same for last week", { stage: trend })).toEqual({ kind: "none" });
    expect(f("same for two weeks ago", { stage: bare })).toEqual({ kind: "none" });
  });
  it("a turn that kept its recipe and slots is the frame when no Stage is open", () => {
    const turns = [{ heard: "something the rules cannot read", did: "cases", recipe: "cases", slots: { zones: [5], cat: "SOLID_WASTE", period: "weekly" } }];
    expect(f("and in Adyar?", { turns })).toMatchObject({ kind: "screen", recipe: "cases", slots: { zones: [13], cat: "SOLID_WASTE" } });
  });
});

describe("how do you know?: a frame of its own, distinct from why", () => {
  const EN = ["how do you know?", "How do you know that", "where's that from?", "what is this based on?", "how sure are you?", "source?", "what's your source", "how did you get those numbers"];
  const TA = ["எப்படித் தெரியும்?", "இது எங்கிருந்து?", "ஆதாரம் என்ன?", "எதை வச்சு சொல்றீங்க"];
  const TG = ["epdi theriyum", "idhu enga irundhu", "source enna", "idhu enga irundhu vandhuchu", "edha vechu solreenga"];
  it.each([...EN, ...TA, ...TG])("%s asks where the answer came from", (s) => expect(asksHowKnow(s)).toBe(true));
  it.each(["how do you know him", "how do you know Ravi from the office", "where is that file from yesterday's meeting", "why?", "show the data sources panel", "source", "what is the source of the Adyar river"])("%s does not", (s) => expect(asksHowKnow(s)).toBe(false));
  it("answers from the screen's provenance, in code; why? still asks for the reasons", () => {
    const reg = buildRegister(cases, [], provenanceOf(casesDoc, { by: "rules" }));
    const r = f("how do you know?", { stage: cases, register: reg });
    expect(r).toMatchObject({ kind: "reply", why: "howknow" });
    if (r.kind === "reply") {
      expect(r.text.en).toMatch(/It rests on 142 cases/);
      expect(r.text.ta).toMatch(/142/);
    }
    expect(f("epdi theriyum", { stage: cases, register: reg })).toMatchObject({ kind: "reply", why: "howknow" });
    expect(f("why?", { stage: cases, register: reg })).toMatchObject({ kind: "screen", recipe: "why" });
    expect(ruleIntent("how do you know?", WORLD, { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, list: [], numbers: false, lastPlace: null, lastFilter: null, now: 0 } as never, { stage: cases }).intent).toBe("howknow");
  });
  it("with nothing shown and no answer kept it is not a follow-up", () => {
    expect(f("how do you know?")).toEqual({ kind: "none" });
  });
});
