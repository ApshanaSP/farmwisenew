import { describe, expect, it } from "vitest";
import { schemaText } from "@/lib/ai/gateway";
import { WORLD } from "../fixture";
import { ZONE_TA_NAME } from "../lexicon";
import { firstPrompt, SCHEMAS, systemFor } from "../round";
import { Shortlister } from "../shortlist";
import { referenceWorld } from "../world";
import { balancedOrder, bodyOf, cellCall, FILLER, pairable, scorePlan, type TuningItem } from "./cells";
import { SCHEMAS_V3, systemV3 } from "./v3";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
// invented sentences, none from any eval set
const EN = "show me the severe drainage cases in Adyar";
const sl = new Shortlister([{ recipe: "cases", lang: "en", text: "list severe cases in Adyar", slots: { zones: [13], sev: "Severe" } }, { recipe: "readings", lang: "en", text: "how full is Poondi lake", slots: { metric: "lakes" } }]);

describe("the grid's cells (7.3)", () => {
  it("cell B is today's first planner call byte for byte", () => {
    const c = cellCall("B", EN, world);
    expect(c.bundle).toBe("screens");
    expect(c.system).toBe(systemFor("screens", world));
    expect(c.prompt).toBe(firstPrompt(bodyOf(EN), world, "en", { notes: [], habits: {} }, c.system.length, { reg: null, bundle: "screens", marker: null }));
    expect(c.schema).toBe(SCHEMAS.screens);
  });
  it("cell A is v3's prose and schema: no calls or done, 19 recipes", () => {
    const c = cellCall("A", EN, world);
    expect(c.system).toBe(systemV3("screens", world));
    const js = schemaText(c.schema);
    expect(js).not.toContain("\"calls\"");
    expect(js).not.toContain("\"changed\"");
    expect(schemaText(SCHEMAS.screens as never)).toContain("\"calls\"");
  });
  it("C adds only the filler; D and E swap the schema; F puts why first", () => {
    expect(cellCall("C", EN, world).system).toBe(`${systemV3("screens", world)}\n${FILLER}`);
    expect(Math.round(FILLER.length / 4)).toBeGreaterThan(800);
    expect(Math.round(FILLER.length / 4)).toBeLessThan(1000);
    expect(cellCall("D", EN, world).schema).toBe(SCHEMAS_V3.screens);
    expect(cellCall("E", EN, world).schema).toBe(SCHEMAS.screens);
    const f = cellCall("F", EN, world);
    expect(Object.keys((f.schema as unknown as { shape: Record<string, unknown> }).shape)[0]).toBe("why");
  });
  it("G sends the shortlist and examples for a screens sentence, and the v4 call for a console one", () => {
    const g = cellCall("G", EN, world, sl);
    expect(g.via).toBe("cell");
    expect(g.schema).toBe(SCHEMAS.screens);
    expect(g.prompt).toContain("Screens that may fit:");
    expect(g.prompt.trim().endsWith(`Said: ${JSON.stringify(EN)}`)).toBe(true);
    const c = cellCall("G", "go to the trends page", world, sl);
    expect(c.via).toBe("v4-path");
    expect(c.system).toBe(systemFor(c.bundle, world));
  });
  it("scores kind and recipe; a step gold needs the step", () => {
    const x: TuningItem = { id: "x", lang: "en", text: EN, gold: { kind: "do", recipe: "cases", slots: { zones: [13] } }, src: "" };
    expect(scorePlan(x, { kind: "do", screen: { recipe: "cases", zones: [13] } })).toMatchObject({ ok: true, slotsOk: true });
    expect(scorePlan(x, { kind: "do", screen: { recipe: "cases", zones: [7] } })).toMatchObject({ ok: true, slotsOk: false });
    expect(scorePlan(x, { kind: "do", screen: { recipe: "readings" } }).ok).toBe(false);
    const st: TuningItem = { ...x, gold: { kind: "do", recipe: null, step: "remember", slots: {} } };
    expect(scorePlan(st, { kind: "do", steps: [{ action: "remember" }] }).ok).toBe(true);
    expect(scorePlan(st, { kind: "do", steps: [] }).ok).toBe(false);
    expect(pairable(st, ["A", "B"])).toBe(false);
    expect(pairable({ ...x, gold: { ...x.gold, recipe: "changed" } }, ["A", "B"])).toBe(false);
    expect(pairable({ ...x, gold: { ...x.gold, recipe: "changed" } }, ["B", "F"])).toBe(true);
  });
  it("the seeded order keeps the three language forms balanced and is the same every time", () => {
    const xs = ["en", "ta", "tanglish"].flatMap((l) => Array.from({ length: 8 }, (_, i) => ({ lang: l, id: `${l}${i}` })));
    const a = balancedOrder(xs, 20261115), b = balancedOrder(xs, 20261115);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    const first = a.slice(0, 15);
    for (const l of ["en", "ta", "tanglish"]) expect(first.filter((x) => x.lang === l)).toHaveLength(5);
  });
});
