import { describe, expect, it } from "vitest";
import { insightsFor } from "./insights";
import { runMapPlan, type Ctx } from "./execute";
import { verified } from "./analyst";
import { fixtureResolver, fixtureWorld, INCIDENTS } from "./fixture";
import { makeResolver } from "./resolve";
import { rulesRoute, unreadWords } from "./route";
import { tokens } from "@/lib/assistant/intent";
import type { Plan } from "./plan";

const w = fixtureWorld();
const ctx: Ctx = { lang: "en", place: () => null };
const take = (f: object = {}): Plan => ({ language: "en", show: "a", steps: [{ op: "take", as: "a", layer: "incidents", where: null,
  filter: { category: null, family: null, severity: null, status: "open", dept: null, overdue: null, citizen: null, period: null, text: null, ...f } }] });

describe("insights: computed, each with its rows", () => {
  const r = runMapPlan(take(), w, ctx);
  const ins = insightsFor(take(), r, w, ctx);
  it("past deadline: the count and the ids are exactly the open, breached rows", () => {
    const o = ins.find((i) => i.kind === "overdue")!;
    const want = INCIDENTS.filter((i) => i.open && i.breached).map((i) => i.id).sort();
    expect([...o.ids].sort()).toEqual(want);
    expect(o.en).toContain(`${want.length} of the ${r.hits.length}`);
  });
  it("repeat spots: the garbage on Test Salai (4 within 100 m) is one spot", () => {
    const sp = insightsFor(take({ category: ["SOLID_WASTE"] }), runMapPlan(take({ category: ["SOLID_WASTE"] }), w, ctx), w, ctx).find((i) => i.kind === "repeat")!;
    expect(sp.ids).toEqual(expect.arrayContaining(["I08", "I09", "I10", "I11"]));
  });
  it("severe and still open, only when severity was not asked", () => {
    expect([...ins.find((i) => i.kind === "severe")!.ids].sort()).toEqual(INCIDENTS.filter((i) => i.open && i.sev === "Severe").map((i) => i.id).sort());
    const sev = take({ severity: ["Severe"] });
    expect(insightsFor(sev, runMapPlan(sev, w, ctx), w, ctx).some((i) => i.kind === "severe")).toBe(false);
  });
  it("change on the period before: counts from the same plan one window back", () => {
    const p = take({ period: { kind: "last_days", days: 7, offset: 0 } });
    const c = insightsFor(p, runMapPlan(p, w, ctx), w, ctx).find((i) => i.kind === "change");
    // reported in the window before, whatever their status now
    const before = runMapPlan(take({ status: "any", period: { kind: "last_days", days: 7, offset: 1 } }), w, ctx).hits.length;
    if (c) expect(c.n).toBe(before);
  });
  it("at most five, ranked, deterministic", () => {
    expect(ins.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(insightsFor(take(), r, w, ctx))).toBe(JSON.stringify(ins));
  });
});

describe("the AI is called only for words the rules could not use", () => {
  const resolve = makeResolver(fixtureResolver());
  const env = { resolve, dept: () => null };
  const unread = (q: string) => { const r = rulesRoute(q, null, env); return r?.kind === "plan" ? r.unread ?? [] : null; };
  it.each([["waterlogging within 300 m of schools", []], ["garbage complaints by ward", []], ["open complaints near Adyar", []],
    ["பள்ளிகள் அருகே மழைநீர் தேக்கம்", []], ["school pakkathula water stagnation", []]])("%s: nothing left over", (q, want) => expect(unread(q)).toEqual(want));
  it("spots where kids might be at risk from standing water: kids and risk are left over", () => {
    expect(unread("spots where kids might be at risk from standing water")).toEqual(expect.arrayContaining(["kids", "risk"]));
  });
  it("garbage by the sea: sea is left over", () => expect(unread("which places by the sea have the most garbage problems")).toContain("sea"));
  it("fillers are never a reason", () => expect(unreadWords(tokens("show me all the open cases please"), [])).toEqual([]));
});

describe("the analyst keeps only sentences whose numbers are facts", () => {
  it("drops an invented figure, keeps the rest", () => {
    const v = verified("76 cases are near schools. About 120 people are affected. Send these to SWD.", new Set([76]));
    expect(v.text).toBe("76 cases are near schools. Send these to SWD.");
    expect(v.dropped).toBe(1);
  });
});
